"""Shared manifest, materialization, and validation logic for semantic OKF bundles."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sys
import tempfile
import unicodedata
from dataclasses import asdict, dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import quote, unquote, urlsplit

import yaml
from pyshacl import validate as shacl_validate
from pyshacl.errors import ValidationFailure
from rdflib import BNode, Graph, Literal, Namespace, URIRef
from rdflib.compare import isomorphic, to_canonical_graph
from rdflib.namespace import DCTERMS, OWL, PROV, RDF, RDFS, SH, XSD


SCHEMA_VERSION = "1.0"
OKF_VERSION = "0.1"
SOURCE_KINDS = frozenset({"markdown", "csv", "json", "rdf"})
RDF_FORMATS = frozenset({"turtle", "nt", "n3"})
RESERVED_LOCAL_NAMES = frozenset(
    {
        "okfConceptId",
        "sourceId",
        "sourceContentSha256",
        "recordSha256",
        "ruleBasis",
        "SemanticMappingShape",
    }
)
PROPERTY_KINDS = frozenset({"datatype", "object", "annotation"})
OWL_PROFILES = frozenset({"el", "ql", "rl", "dl"})
SCHEMA_TYPES = frozenset({"string", "integer", "long", "double", "boolean", "date", "timestamp"})
STRUCTURED_INTERNAL_COLUMNS = frozenset(
    {"__semantic_okf_source_path__", "__semantic_okf_normalization_error__"}
)
CSV_READER_OPTIONS = frozenset(
    {
        "header",
        "sep",
        "quote",
        "escape",
        "encoding",
        "mode",
        "multiLine",
        "enforceSchema",
        "nullValue",
        "emptyValue",
    }
)
JSON_READER_OPTIONS = frozenset(
    {
        "multiLine",
        "encoding",
        "mode",
    }
)
LOCAL_NAME_RE = re.compile(r"^[A-Za-z_](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?$")
SOURCE_ID_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
WINDOWS_RESERVED_SEGMENTS = frozenset(
    {"con", "prn", "aux", "nul", *(f"com{index}" for index in range(1, 10)), *(f"lpt{index}" for index in range(1, 10))}
)
HEX_RE = re.compile(r"^[0-9a-f]{64}$")
INDEX_ENTRY_RE = re.compile(r"^\*\s+\[[^\]]+\]\(([^)]+)\)(?:\s+-\s+.+)?\s*$")
XSD_TERMS = {
    "xsd:string": XSD.string,
    "xsd:integer": XSD.integer,
    "xsd:long": XSD.long,
    "xsd:double": XSD.double,
    "xsd:boolean": XSD.boolean,
    "xsd:date": XSD.date,
    "xsd:dateTime": XSD.dateTime,
    "xsd:decimal": XSD.decimal,
}
NODE_KINDS = {
    "IRI": SH.IRI,
    "Literal": SH.Literal,
    "BlankNode": SH.BlankNode,
    "BlankNodeOrIRI": SH.BlankNodeOrIRI,
    "BlankNodeOrLiteral": SH.BlankNodeOrLiteral,
    "IRIOrLiteral": SH.IRIOrLiteral,
}


def configure_utf8_output() -> None:
    """Emit source knowledge losslessly even when Windows defaults to cp1252."""

    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            try:
                reconfigure(encoding="utf-8")
            except (AttributeError, OSError, ValueError):
                pass


class ManifestError(ValueError):
    """Describe an invalid semantic pipeline manifest."""


class BundleError(RuntimeError):
    """Describe a build or semantic bundle failure."""


@dataclass(frozen=True)
class NormalizedRecord:
    """One normalized knowledge concept shared by OKF and RDF layers."""

    concept_id: str
    concept_path: str
    source_id: str
    source_kind: str
    source_path: str
    record_id: str
    subject_iri: str
    ontology_class_iri: str
    concept_type: str
    title: str
    body: str
    attributes: dict[str, Any]
    source_content_sha256: str
    record_sha256: str
    origin_iri: str

    @property
    def source_refs(self) -> list[str]:
        """Return the PROV record entities supporting this concept."""

        return [self.origin_iri]


@dataclass(frozen=True)
class ValidationResult:
    """Machine-readable semantic bundle validation outcome."""

    valid: bool
    status: str
    errors: list[dict[str, str]]
    warnings: list[str]
    summary: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        """Return a JSON-serializable result."""

        return {
            "schema_version": SCHEMA_VERSION,
            "valid": self.valid,
            "status": self.status,
            "errors": self.errors,
            "warnings": self.warnings,
            "summary": self.summary,
        }


def canonical_json(value: Any) -> str:
    """Serialize normalized JSON deterministically for hashing and ledgers."""

    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def sha256_bytes(value: bytes) -> str:
    """Return a lower-case SHA-256 digest."""

    return hashlib.sha256(value).hexdigest()


def sha256_json(value: Any) -> str:
    """Hash canonical UTF-8 JSON."""

    return sha256_bytes(canonical_json(value).encode("utf-8"))


def normalize_text(value: str) -> str:
    """Normalize Unicode and line endings without changing semantic whitespace."""

    return unicodedata.normalize("NFC", value.replace("\r\n", "\n").replace("\r", "\n"))


def absolute_iri(value: Any) -> bool:
    """Return whether *value* is a conservative absolute HTTP(S) or URN IRI."""

    if (
        not isinstance(value, str)
        or not value
        or any(char.isspace() or ord(char) < 0x20 or ord(char) == 0x7F for char in value)
        or any(char in '<>"{}|\\^`' for char in value)
    ):
        return False
    parsed = urlsplit(value)
    return bool(
        (parsed.scheme in {"http", "https"} and parsed.netloc)
        or (parsed.scheme == "urn" and parsed.path)
    )


def ontology_namespace(manifest: Mapping[str, Any]) -> str:
    """Return the local ontology term namespace."""

    ontology_iri = manifest["bundle"]["ontology_iri"]
    return ontology_iri if ontology_iri.endswith(("#", "/")) else f"{ontology_iri}#"


def expand_term(value: str, manifest: Mapping[str, Any]) -> URIRef:
    """Expand an XSD term, absolute IRI, or local ontology name."""

    if value in XSD_TERMS:
        return URIRef(XSD_TERMS[value])
    if absolute_iri(value):
        return URIRef(value)
    return URIRef(f"{ontology_namespace(manifest)}{value}")


def load_manifest(path: Path) -> dict[str, Any]:
    """Load and validate a semantic OKF JSON manifest."""

    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        raise ManifestError(f"cannot read manifest {path}: {exc}") from exc
    errors = validate_manifest(manifest)
    if errors:
        raise ManifestError("; ".join(errors))
    return manifest


def validate_manifest(manifest: Any) -> list[str]:
    """Return all structural and semantic-plan errors in *manifest*."""

    errors: list[str] = []
    if not isinstance(manifest, dict):
        return ["manifest root must be a JSON object"]

    def reject_unknown(value: Mapping[str, Any], allowed: set[str] | frozenset[str], path: str) -> None:
        unknown = sorted((str(key) for key in value if key not in allowed))
        if unknown:
            errors.append(f"{path} contains unsupported fields: {', '.join(unknown)}")

    reject_unknown(manifest, {"schema_version", "bundle", "ontology", "rules", "sources"}, "manifest")
    if manifest.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"schema_version must be {SCHEMA_VERSION!r}")
    bundle = manifest.get("bundle")
    ontology = manifest.get("ontology")
    rules = manifest.get("rules")
    sources = manifest.get("sources")
    if not isinstance(bundle, dict):
        errors.append("bundle must be an object")
        bundle = {}
    else:
        reject_unknown(
            bundle,
            {"title", "description", "base_iri", "ontology_iri", "version_iri", "prefix", "owl_profile"},
            "bundle",
        )
    if not isinstance(ontology, dict):
        errors.append("ontology must be an object")
        ontology = {}
    else:
        reject_unknown(ontology, {"classes", "properties"}, "ontology")
    if not isinstance(rules, list):
        errors.append("rules must be a list")
        rules = []
    if not isinstance(sources, list) or not sources:
        errors.append("sources must be a non-empty list")
        sources = []

    for field in ("title", "description", "base_iri", "ontology_iri", "version_iri", "prefix", "owl_profile"):
        if not isinstance(bundle.get(field), str) or not bundle[field].strip():
            errors.append(f"bundle.{field} must be a non-empty string")
    for field in ("base_iri", "ontology_iri", "version_iri"):
        if field in bundle and not absolute_iri(bundle[field]):
            errors.append(f"bundle.{field} must be an absolute http, https, or urn IRI")
    for field in ("base_iri", "ontology_iri"):
        value = bundle.get(field)
        if isinstance(value, str):
            parsed = urlsplit(value)
            if parsed.query or "?" in value or (parsed.fragment and not value.endswith("#")):
                errors.append(f"bundle.{field} must be a query-free namespace IRI")
    if bundle.get("ontology_iri") == bundle.get("version_iri"):
        errors.append("bundle.version_iri must be distinct from bundle.ontology_iri")
    if isinstance(bundle.get("base_iri"), str) and not bundle["base_iri"].endswith(("/", "#")):
        errors.append("bundle.base_iri must end with '/' or '#'")
    if isinstance(bundle.get("prefix"), str) and not LOCAL_NAME_RE.fullmatch(bundle["prefix"]):
        errors.append("bundle.prefix must be a conservative ASCII Turtle prefix")
    if isinstance(bundle.get("owl_profile"), str) and bundle["owl_profile"].lower() not in OWL_PROFILES:
        errors.append("bundle.owl_profile must be el, ql, rl, or dl")

    classes = ontology.get("classes", [])
    properties = ontology.get("properties", [])
    if not isinstance(classes, list) or not classes:
        errors.append("ontology.classes must be a non-empty list")
        classes = []
    if not isinstance(properties, list):
        errors.append("ontology.properties must be a list")
        properties = []

    class_names: set[str] = set()
    for index, item in enumerate(classes):
        if not isinstance(item, dict):
            errors.append(f"ontology.classes[{index}] must be an object")
            continue
        reject_unknown(item, {"name", "label", "description"}, f"ontology.classes[{index}]")
        name = item.get("name")
        if not isinstance(name, str) or not LOCAL_NAME_RE.fullmatch(name):
            errors.append(f"ontology.classes[{index}].name is invalid")
        elif name in RESERVED_LOCAL_NAMES:
            errors.append(f"ontology class name is reserved: {name}")
        elif name in class_names:
            errors.append(f"duplicate class name: {name}")
        else:
            class_names.add(name)
        if not isinstance(item.get("label"), str) or not item["label"].strip():
            errors.append(f"ontology.classes[{index}].label must be non-empty")
        if "description" in item and (
            not isinstance(item["description"], str) or not item["description"].strip()
        ):
            errors.append(f"ontology.classes[{index}].description must be a non-empty string")

    property_names: set[str] = set()
    property_kinds: dict[str, str] = {}
    property_domains: dict[str, Any] = {}
    property_ranges: dict[str, Any] = {}
    for index, item in enumerate(properties):
        if not isinstance(item, dict):
            errors.append(f"ontology.properties[{index}] must be an object")
            continue
        reject_unknown(item, {"name", "kind", "domain", "range", "label"}, f"ontology.properties[{index}]")
        name = item.get("name")
        kind = item.get("kind")
        if not isinstance(name, str) or not LOCAL_NAME_RE.fullmatch(name):
            errors.append(f"ontology.properties[{index}].name is invalid")
            continue
        if name in RESERVED_LOCAL_NAMES:
            errors.append(f"ontology property name is reserved: {name}")
        if name in class_names:
            errors.append(f"ontology property name overlaps a class: {name}")
        if name in property_names:
            errors.append(f"duplicate property name: {name}")
        property_names.add(name)
        if "label" in item and (not isinstance(item["label"], str) or not item["label"].strip()):
            errors.append(f"ontology.properties[{index}].label must be a non-empty string")
        if not isinstance(kind, str) or kind not in PROPERTY_KINDS:
            errors.append(f"ontology.properties[{index}].kind is invalid")
        else:
            property_kinds[name] = kind
            property_domains[name] = item.get("domain")
            property_ranges[name] = item.get("range")
        if kind in ("datatype", "object") and (
            not isinstance(item.get("domain"), str) or item.get("domain") not in class_names
        ):
            errors.append(f"property {name} has undeclared domain {item.get('domain')!r}")
        range_value = item.get("range")
        if kind == "datatype" and (not isinstance(range_value, str) or range_value not in XSD_TERMS):
            errors.append(f"datatype property {name} must use a supported xsd range")
        if kind == "object" and (
            not isinstance(range_value, str)
            or (range_value not in class_names and not absolute_iri(range_value))
        ):
            errors.append(f"object property {name} has undeclared range {range_value!r}")

    rule_names: set[str] = set()
    for index, rule in enumerate(rules):
        if not isinstance(rule, dict):
            errors.append(f"rules[{index}] must be an object")
            continue
        reject_unknown(
            rule,
            {
                "name",
                "target_class",
                "path",
                "min_count",
                "max_count",
                "datatype",
                "class",
                "node_kind",
                "pattern",
                "message",
                "basis",
            },
            f"rules[{index}]",
        )
        name = rule.get("name")
        if not isinstance(name, str) or not LOCAL_NAME_RE.fullmatch(name):
            errors.append(f"rules[{index}].name is invalid")
        elif name in rule_names:
            errors.append(f"duplicate rule name: {name}")
        else:
            rule_names.add(name)
            shape_name = f"{name}Shape"
            if shape_name in RESERVED_LOCAL_NAMES or shape_name in class_names or shape_name in property_names:
                errors.append(f"rule {name!r} produces a colliding shape name")
        target_class = rule.get("target_class")
        if not isinstance(target_class, str) or target_class not in class_names:
            errors.append(f"rule {name!r} has undeclared target_class")
        path_name = rule.get("path")
        if not isinstance(path_name, str) or path_name not in property_names:
            errors.append(f"rule {name!r} has undeclared path property")
        for count_field in ("min_count", "max_count"):
            count = rule.get(count_field)
            if count is not None and (not isinstance(count, int) or isinstance(count, bool) or count < 0):
                errors.append(f"rule {name!r} {count_field} must be a non-negative integer")
        min_count = rule.get("min_count")
        max_count = rule.get("max_count")
        valid_min = isinstance(min_count, int) and not isinstance(min_count, bool) and min_count >= 0
        valid_max = isinstance(max_count, int) and not isinstance(max_count, bool) and max_count >= 0
        if "min_count" in rule and "max_count" in rule and valid_min and valid_max and min_count > max_count:
            errors.append(f"rule {name!r} min_count exceeds max_count")
        if "datatype" in rule and (
            not isinstance(rule["datatype"], str) or rule["datatype"] not in XSD_TERMS
        ):
            errors.append(f"rule {name!r} uses an unsupported datatype")
        if "class" in rule and (
            not isinstance(rule["class"], str)
            or (rule["class"] not in class_names and not absolute_iri(rule["class"]))
        ):
            errors.append(f"rule {name!r} uses an undeclared class")
        if isinstance(path_name, str) and path_name in property_kinds and property_kinds[path_name] == "annotation":
            errors.append(f"rule {name!r} path must be a datatype or object property")
        if isinstance(path_name, str) and path_name in property_domains and property_domains[path_name] != target_class:
            errors.append(f"rule {name!r} target_class differs from the path property domain")
        path_kind = property_kinds.get(path_name) if isinstance(path_name, str) else None
        path_range = property_ranges.get(path_name) if isinstance(path_name, str) else None
        if "datatype" in rule and path_kind != "datatype":
            errors.append(f"rule {name!r} datatype constraint requires a datatype property")
        elif "datatype" in rule and path_range != rule["datatype"]:
            errors.append(f"rule {name!r} datatype differs from the path property range")
        if "class" in rule and path_kind != "object":
            errors.append(f"rule {name!r} class constraint requires an object property")
        elif "class" in rule and path_range != rule["class"]:
            errors.append(f"rule {name!r} class differs from the path property range")
        if "node_kind" in rule and (
            not isinstance(rule["node_kind"], str) or rule["node_kind"] not in NODE_KINDS
        ):
            errors.append(f"rule {name!r} uses an unsupported node_kind")
        node_kind = rule.get("node_kind")
        if isinstance(node_kind, str) and path_kind == "datatype" and node_kind not in {
            "Literal",
            "BlankNodeOrLiteral",
            "IRIOrLiteral",
        }:
            errors.append(f"rule {name!r} node_kind is incompatible with a datatype property")
        if isinstance(node_kind, str) and path_kind == "object" and node_kind not in {
            "IRI",
            "BlankNodeOrIRI",
            "IRIOrLiteral",
        }:
            errors.append(f"rule {name!r} node_kind is incompatible with an object property")
        if "pattern" in rule and (not isinstance(rule["pattern"], str) or not rule["pattern"]):
            errors.append(f"rule {name!r} pattern must be a non-empty string")
        if "pattern" in rule and path_kind != "datatype":
            errors.append(f"rule {name!r} pattern constraint requires a datatype property")
        if not any(
            field in rule for field in ("min_count", "max_count", "datatype", "class", "node_kind", "pattern")
        ):
            errors.append(f"rule {name!r} must declare at least one SHACL constraint")
        if not isinstance(rule.get("message"), str) or not rule["message"].strip():
            errors.append(f"rule {name!r} requires a non-empty message")
        basis = rule.get("basis")
        if (
            not isinstance(basis, dict)
            or not isinstance(basis.get("kind"), str)
            or basis.get("kind") not in {"evidence", "operational-policy"}
        ):
            errors.append(f"rule {name!r} requires an evidence or operational-policy basis")
        elif not isinstance(basis.get("references"), list) or not basis["references"] or not all(
            isinstance(ref, str) and ref.strip() for ref in basis["references"]
        ):
            errors.append(f"rule {name!r} basis.references must contain non-empty strings")
        else:
            reject_unknown(basis, {"kind", "references"}, f"rules[{index}].basis")

    source_ids: set[str] = set()
    for index, source in enumerate(sources):
        if not isinstance(source, dict):
            errors.append(f"sources[{index}] must be an object")
            continue
        source_id = source.get("id")
        kind = source.get("kind")
        source_fields = {"id", "kind", "path", "concept_type", "ontology_class", "fields", "allow_empty"}
        if kind in ("csv", "json"):
            source_fields.update({"id_field", "title_field", "schema", "options"})
        elif kind == "rdf":
            source_fields.update({"format", "title_predicate"})
        reject_unknown(source, source_fields, f"sources[{index}]")
        if not isinstance(source_id, str) or not SOURCE_ID_RE.fullmatch(source_id):
            errors.append(f"sources[{index}].id is invalid")
        elif source_id in source_ids:
            errors.append(f"duplicate source id: {source_id}")
        elif source_id in WINDOWS_RESERVED_SEGMENTS:
            errors.append(f"source id is reserved on Windows: {source_id}")
        else:
            source_ids.add(source_id)
        if not isinstance(kind, str) or kind not in SOURCE_KINDS:
            errors.append(f"source {source_id!r} has unsupported kind {kind!r}")
        raw_path = source.get("path")
        if not isinstance(raw_path, str) or not raw_path.strip():
            errors.append(f"source {source_id!r} requires a path")
        elif "://" in raw_path or raw_path.startswith(("\\\\", "//")):
            errors.append(f"source {source_id!r} path must be local")
        elif (
            "\\" in raw_path
            or Path(raw_path).is_absolute()
            or Path(raw_path).drive
            or ".." in PurePosixPath(raw_path).parts
        ):
            errors.append(f"source {source_id!r} path must be a portable manifest-relative path")
        if not isinstance(source.get("concept_type"), str) or not source["concept_type"].strip():
            errors.append(f"source {source_id!r} requires concept_type")
        if not isinstance(source.get("ontology_class"), str) or source.get("ontology_class") not in class_names:
            errors.append(f"source {source_id!r} uses an undeclared ontology_class")
        if "allow_empty" in source and not isinstance(source["allow_empty"], bool):
            errors.append(f"source {source_id!r} allow_empty must be boolean")
        options = source.get("options", {})
        if not isinstance(options, dict):
            errors.append(f"source {source_id!r} options must be an object")
        elif "mode" in options and str(options["mode"]).upper() != "FAILFAST":
            errors.append(f"source {source_id!r} must use mode FAILFAST")
        elif kind in ("csv", "json"):
            allowed_options = CSV_READER_OPTIONS if kind == "csv" else JSON_READER_OPTIONS
            reject_unknown(options, allowed_options, f"source {source_id!r}.options")
        if kind in ("csv", "json"):
            for field in ("id_field", "title_field"):
                if not isinstance(source.get(field), str) or not LOCAL_NAME_RE.fullmatch(source[field]):
                    errors.append(f"source {source_id!r} requires a valid {field}")
            schema = source.get("schema")
            if not isinstance(schema, dict) or not schema:
                errors.append(f"source {source_id!r} requires an explicit schema")
                schema = {}
            else:
                for field_name, type_name in schema.items():
                    if not isinstance(field_name, str) or not LOCAL_NAME_RE.fullmatch(field_name):
                        errors.append(f"source {source_id!r} has invalid schema field {field_name!r}")
                    elif field_name in STRUCTURED_INTERNAL_COLUMNS:
                        errors.append(
                            f"source {source_id!r} schema field {field_name!r} is reserved"
                        )
                    if not isinstance(type_name, str) or type_name not in SCHEMA_TYPES:
                        errors.append(f"source {source_id!r} schema field {field_name!r} has unsupported type")
                required_fields = {
                    str(source.get("id_field", "")),
                    str(source.get("title_field", "")),
                    *(
                        source.get("fields", {}).keys()
                        if isinstance(source.get("fields", {}), dict)
                        else ()
                    ),
                }
                missing_schema_fields = {field for field in required_fields if field and field not in schema}
                if missing_schema_fields:
                    errors.append(
                        f"source {source_id!r} schema omits mapped fields: "
                        f"{', '.join(sorted(missing_schema_fields))}"
                    )
        fields = source.get("fields", {})
        if not isinstance(fields, dict):
            errors.append(f"source {source_id!r} fields must be an object")
        else:
            for input_field, property_name in fields.items():
                if kind != "rdf" and (not isinstance(input_field, str) or not LOCAL_NAME_RE.fullmatch(input_field)):
                    errors.append(f"source {source_id!r} has invalid input field {input_field!r}")
                if kind == "rdf" and not absolute_iri(input_field):
                    errors.append(f"RDF source {source_id!r} field keys must be predicate IRIs")
                if not isinstance(property_name, str) or property_name not in property_names:
                    errors.append(f"source {source_id!r} maps to undeclared property {property_name!r}")
                elif (
                    property_kinds.get(property_name) in {"datatype", "object"}
                    and property_domains.get(property_name) != source.get("ontology_class")
                ):
                    errors.append(
                        f"source {source_id!r} maps field {input_field!r} to property {property_name!r} "
                        "with a different domain"
                    )
                if property_kinds.get(property_name) == "object" and kind != "rdf":
                    # Structured values are permitted only when they are already absolute IRIs.
                    pass
        if kind == "rdf" and source.get("title_predicate") is not None and not absolute_iri(source["title_predicate"]):
            errors.append(f"RDF source {source_id!r} title_predicate must be an absolute IRI")
        if kind == "rdf" and source.get("format") not in RDF_FORMATS:
            errors.append(f"RDF source {source_id!r} format must be turtle, nt, or n3")
    return errors


def source_by_id(manifest: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    """Index source specifications by ID."""

    return {source["id"]: source for source in manifest["sources"]}


def property_by_name(manifest: Mapping[str, Any]) -> dict[str, dict[str, Any]]:
    """Index ontology property declarations by local name."""

    return {item["name"]: item for item in manifest["ontology"]["properties"]}


def _safe_file_segment(record_id: str) -> str:
    normalized = unicodedata.normalize("NFKD", record_id)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", ascii_value).strip(".-_").lower()
    slug = slug[:64] or "record"
    return f"{slug}-{sha256_bytes(record_id.encode('utf-8'))[:10]}"


def _relative_source_path(raw: str, manifest_root: Path) -> str:
    parsed = urlsplit(raw)
    if parsed.scheme == "file":
        local = Path(unquote(parsed.path.lstrip("/") if re.match(r"^/[A-Za-z]:", parsed.path) else parsed.path))
    else:
        local = Path(raw)
    try:
        return local.resolve().relative_to(manifest_root.resolve()).as_posix()
    except (OSError, ValueError):
        return local.as_posix()


def _normalized_record_digest(values: Mapping[str, Any]) -> str:
    """Hash exactly the source-derived fields that define one normalized record."""

    fields = (
        "source_id",
        "source_kind",
        "source_path",
        "record_id",
        "subject_iri",
        "ontology_class_iri",
        "concept_type",
        "title",
        "body",
        "attributes",
    )
    return sha256_json({field: values[field] for field in fields})


def finalize_record(
    raw: Mapping[str, Any],
    source: Mapping[str, Any],
    source_summary: Mapping[str, Any],
    manifest: Mapping[str, Any],
    manifest_root: Path,
) -> NormalizedRecord:
    """Validate and finalize one adapter-normalized row."""

    record_id = normalize_text(str(raw.get("record_id") or "").strip())
    title = normalize_text(str(raw.get("title") or "").strip())
    body = normalize_text(str(raw.get("body") or "").strip())
    if not record_id:
        raise BundleError(f"source {source['id']!r} produced an empty record_id")
    if not title:
        raise BundleError(f"source {source['id']!r} record {record_id!r} has no title")
    body = body or f"# {title}"
    attributes_raw = raw.get("attributes", {})
    if isinstance(attributes_raw, str):
        try:
            attributes_raw = json.loads(attributes_raw)
        except json.JSONDecodeError as exc:
            raise BundleError(f"record {record_id!r} has invalid attributes JSON: {exc}") from exc
    if not isinstance(attributes_raw, dict):
        raise BundleError(f"record {record_id!r} attributes must be an object")
    attributes = json.loads(canonical_json(attributes_raw))
    source_path = _relative_source_path(str(raw.get("source_path") or source["path"]), manifest_root)
    subject_iri = str(raw.get("subject_iri") or "").strip()
    if not subject_iri:
        subject_iri = (
            f"{manifest['bundle']['base_iri']}resource/{quote(source['id'], safe='')}/"
            f"{quote(record_id, safe='')}"
        )
    if not absolute_iri(subject_iri):
        raise BundleError(f"record {record_id!r} produced a non-absolute subject IRI")
    class_iri = str(expand_term(source["ontology_class"], manifest))
    segment = _safe_file_segment(record_id)
    concept_id = f"concepts/{source['id']}/{segment}"
    concept_path = f"{concept_id}.md"
    origin_hash = sha256_json({"source_id": source["id"], "path": source_path, "record_id": record_id})[:24]
    origin_iri = f"{manifest['bundle']['base_iri']}provenance/record/{source['id']}/{origin_hash}"
    digest_payload = {
        "source_id": source["id"],
        "source_kind": source["kind"],
        "source_path": source_path,
        "record_id": record_id,
        "subject_iri": subject_iri,
        "ontology_class_iri": class_iri,
        "concept_type": source["concept_type"],
        "title": title,
        "body": body,
        "attributes": attributes,
    }
    return NormalizedRecord(
        concept_id=concept_id,
        concept_path=concept_path,
        source_id=source["id"],
        source_kind=source["kind"],
        source_path=source_path,
        record_id=record_id,
        subject_iri=subject_iri,
        ontology_class_iri=class_iri,
        concept_type=source["concept_type"],
        title=title,
        body=body,
        attributes=attributes,
        source_content_sha256=str(source_summary["content_sha256"]),
        record_sha256=_normalized_record_digest(digest_payload),
        origin_iri=origin_iri,
    )


def _validate_xsd_lexical(value: Any, datatype: str, property_name: str) -> Any:
    """Reject values that are not valid lexical forms for supported XSD datatypes."""

    if datatype == "xsd:string":
        return str(value)
    if datatype == "xsd:boolean":
        if isinstance(value, bool):
            return value
        if str(value) not in {"true", "false", "1", "0"}:
            raise BundleError(f"datatype property {property_name} contains an invalid xsd:boolean")
        return str(value)
    lexical = str(value)
    if datatype in {"xsd:integer", "xsd:long"}:
        if not re.fullmatch(r"[+-]?\d+", lexical):
            raise BundleError(f"datatype property {property_name} contains an invalid {datatype}")
        number = int(lexical)
        if datatype == "xsd:long" and not -(2**63) <= number < 2**63:
            raise BundleError(f"datatype property {property_name} exceeds the xsd:long range")
    elif datatype == "xsd:decimal":
        if not re.fullmatch(r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)", lexical):
            raise BundleError(f"datatype property {property_name} contains an invalid xsd:decimal")
        try:
            Decimal(lexical)
        except InvalidOperation as exc:
            raise BundleError(f"datatype property {property_name} contains an invalid xsd:decimal") from exc
    elif datatype == "xsd:double":
        if not re.fullmatch(r"[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)", lexical):
            raise BundleError(f"datatype property {property_name} contains an invalid xsd:double")
        number = float(lexical)
        if number != number or number in {float("inf"), float("-inf")}:
            raise BundleError(f"datatype property {property_name} requires a finite xsd:double")
    elif datatype == "xsd:date":
        match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?", lexical)
        if not match:
            raise BundleError(f"datatype property {property_name} contains an invalid xsd:date")
        try:
            date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError as exc:
            raise BundleError(f"datatype property {property_name} contains an invalid xsd:date") from exc
        _validate_timezone(match.group(4), property_name, datatype)
    elif datatype == "xsd:dateTime":
        match = re.fullmatch(
            r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})?",
            lexical,
        )
        if not match:
            raise BundleError(f"datatype property {property_name} contains an invalid xsd:dateTime")
        try:
            datetime(*(int(match.group(index)) for index in range(1, 7)))
        except ValueError as exc:
            raise BundleError(f"datatype property {property_name} contains an invalid xsd:dateTime") from exc
        _validate_timezone(match.group(7), property_name, datatype)
    return lexical


def _validate_timezone(value: str | None, property_name: str, datatype: str) -> None:
    """Validate the optional XSD timezone suffix used by date and dateTime."""

    if value in {None, "Z"}:
        return
    hours, minutes = (int(part) for part in value[1:].split(":"))
    if hours > 14 or minutes > 59 or (hours == 14 and minutes != 0):
        raise BundleError(f"datatype property {property_name} contains an invalid {datatype} timezone")


def _rdf_literal(value: Any, declaration: Mapping[str, Any], manifest: Mapping[str, Any]) -> URIRef | Literal:
    kind = declaration["kind"]
    if kind == "object":
        if not absolute_iri(value):
            raise BundleError(f"object property {declaration['name']} requires an absolute IRI value")
        return URIRef(str(value))
    if kind == "annotation":
        return Literal(value)
    if value is None:
        raise BundleError(f"datatype property {declaration['name']} cannot encode null")
    lexical = _validate_xsd_lexical(value, declaration["range"], declaration["name"])
    datatype = expand_term(declaration["range"], manifest)
    return Literal(lexical, datatype=datatype)


def _add_attribute_values(
    graph: Graph,
    subject: URIRef,
    record: NormalizedRecord,
    source: Mapping[str, Any],
    manifest: Mapping[str, Any],
) -> None:
    declarations = property_by_name(manifest)
    for input_name, property_name in sorted(source.get("fields", {}).items()):
        value = record.attributes.get(input_name)
        if value is None:
            continue
        values = value if isinstance(value, list) else [value]
        predicate = expand_term(property_name, manifest)
        for item in values:
            if isinstance(item, (dict, list)):
                raise BundleError(
                    f"record {record.record_id!r} field {input_name!r} must contain scalar values"
                )
            graph.add((subject, predicate, _rdf_literal(item, declarations[property_name], manifest)))


def _graphs_for_bundle(
    manifest: Mapping[str, Any],
    records: Sequence[NormalizedRecord],
    source_summaries: Sequence[Mapping[str, Any]],
) -> tuple[Graph, Graph, Graph, Graph]:
    ns = Namespace(ontology_namespace(manifest))
    ontology = Graph()
    data = Graph()
    shapes = Graph()
    provenance = Graph()
    ontology_iri = URIRef(manifest["bundle"]["ontology_iri"])
    ontology.add((ontology_iri, RDF.type, OWL.Ontology))
    ontology.add((ontology_iri, OWL.versionIRI, URIRef(manifest["bundle"]["version_iri"])))
    ontology.add((ontology_iri, DCTERMS.title, Literal(manifest["bundle"]["title"])))
    ontology.add((ontology_iri, DCTERMS.description, Literal(manifest["bundle"]["description"])))

    internal_properties = {
        "okfConceptId": "OKF concept ID",
        "sourceId": "source ID",
        "sourceContentSha256": "source content SHA-256",
        "recordSha256": "normalized record SHA-256",
    }
    for name, label in internal_properties.items():
        ontology.add((ns[name], RDF.type, OWL.DatatypeProperty))
        ontology.add((ns[name], RDFS.label, Literal(label, lang="en")))
        ontology.add((ns[name], RDFS.range, XSD.string))
    ontology.add((ns.ruleBasis, RDF.type, OWL.AnnotationProperty))

    for item in manifest["ontology"]["classes"]:
        class_iri = ns[item["name"]]
        ontology.add((class_iri, RDF.type, OWL.Class))
        ontology.add((class_iri, RDFS.label, Literal(item["label"])))
        if item.get("description"):
            ontology.add((class_iri, RDFS.comment, Literal(item["description"])))

    for item in manifest["ontology"]["properties"]:
        property_iri = ns[item["name"]]
        kind_iri = {
            "datatype": OWL.DatatypeProperty,
            "object": OWL.ObjectProperty,
            "annotation": OWL.AnnotationProperty,
        }[item["kind"]]
        ontology.add((property_iri, RDF.type, kind_iri))
        ontology.add((property_iri, RDFS.label, Literal(item.get("label", item["name"]))))
        if item["kind"] in {"datatype", "object"}:
            ontology.add((property_iri, RDFS.domain, ns[item["domain"]]))
            ontology.add((property_iri, RDFS.range, expand_term(item["range"], manifest)))

    mapping_shape = ns.SemanticMappingShape
    shapes.add((mapping_shape, RDF.type, SH.NodeShape))
    shapes.add((mapping_shape, SH.targetSubjectsOf, ns.okfConceptId))
    for path in (ns.okfConceptId, ns.sourceId, ns.sourceContentSha256, ns.recordSha256):
        property_shape = BNode()
        shapes.add((mapping_shape, SH.property, property_shape))
        shapes.add((property_shape, SH.path, path))
        shapes.add((property_shape, SH.minCount, Literal(1)))
        shapes.add((property_shape, SH.maxCount, Literal(1)))
        shapes.add((property_shape, SH.datatype, XSD.string))

    for rule in manifest["rules"]:
        shape = ns[f"{rule['name']}Shape"]
        property_shape = BNode()
        shapes.add((shape, RDF.type, SH.NodeShape))
        shapes.add((shape, SH.targetClass, ns[rule["target_class"]]))
        shapes.add((shape, SH.property, property_shape))
        shapes.add((shape, ns.ruleBasis, Literal(canonical_json(rule["basis"]))))
        shapes.add((property_shape, SH.path, ns[rule["path"]]))
        shapes.add((property_shape, SH.message, Literal(rule["message"])))
        if "min_count" in rule:
            shapes.add((property_shape, SH.minCount, Literal(rule["min_count"])))
        if "max_count" in rule:
            shapes.add((property_shape, SH.maxCount, Literal(rule["max_count"])))
        if "datatype" in rule:
            shapes.add((property_shape, SH.datatype, expand_term(rule["datatype"], manifest)))
        if "class" in rule:
            shapes.add((property_shape, SH["class"], expand_term(rule["class"], manifest)))
        if "node_kind" in rule:
            shapes.add((property_shape, SH.nodeKind, NODE_KINDS[rule["node_kind"]]))
        if "pattern" in rule:
            shapes.add((property_shape, SH.pattern, Literal(rule["pattern"])))

    sources = source_by_id(manifest)
    summaries = {item["id"]: item for item in source_summaries}
    for source_id, summary in sorted(summaries.items()):
        source_entity = URIRef(f"{manifest['bundle']['base_iri']}provenance/source/{quote(source_id, safe='')}")
        provenance.add((source_entity, RDF.type, PROV.Entity))
        provenance.add((source_entity, ns.sourceId, Literal(source_id)))
        provenance.add((source_entity, ns.sourceContentSha256, Literal(summary["content_sha256"])))
        provenance.add((source_entity, PROV.atLocation, Literal(sources[source_id]["path"])))

    for record in records:
        subject = URIRef(record.subject_iri)
        class_iri = URIRef(record.ontology_class_iri)
        source = sources[record.source_id]
        source_entity = URIRef(
            f"{manifest['bundle']['base_iri']}provenance/source/{quote(record.source_id, safe='')}"
        )
        origin = URIRef(record.origin_iri)
        data.add((subject, RDF.type, class_iri))
        data.add((subject, DCTERMS.title, Literal(record.title)))
        data.add((subject, ns.okfConceptId, Literal(record.concept_id)))
        data.add((subject, ns.sourceId, Literal(record.source_id)))
        data.add((subject, ns.sourceContentSha256, Literal(record.source_content_sha256)))
        data.add((subject, ns.recordSha256, Literal(record.record_sha256)))
        _add_attribute_values(data, subject, record, source, manifest)

        provenance.add((origin, RDF.type, PROV.Entity))
        provenance.add((origin, PROV.specializationOf, source_entity))
        provenance.add((origin, PROV.atLocation, Literal(record.source_path)))
        provenance.add((origin, ns.recordSha256, Literal(record.record_sha256)))
        provenance.add((subject, PROV.wasDerivedFrom, origin))
    return ontology, data, shapes, provenance


def _write_canonical_graph(path: Path, graph: Graph) -> None:
    canonical = to_canonical_graph(graph)
    serialized = canonical.serialize(format="nt")
    lines = sorted(line for line in serialized.splitlines() if line.strip())
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8", newline="\n")


def _short_term(value: Any) -> str:
    text = str(value) if value is not None else "unknown"
    return text.rsplit("#", 1)[-1].rsplit("/", 1)[-1]


def _shacl_failure_summary(report_graph: Graph, shapes: Graph, limit: int = 5) -> str:
    """Return deterministic, actionable details from a SHACL validation report."""

    failures: list[str] = []
    for result in report_graph.subjects(RDF.type, SH.ValidationResult):
        source_shape = report_graph.value(result, SH.sourceShape)
        owner = next(iter(shapes.subjects(SH.property, source_shape)), source_shape)
        constraint = report_graph.value(result, SH.sourceConstraintComponent)
        focus = report_graph.value(result, SH.focusNode)
        path = report_graph.value(result, SH.resultPath)
        message = report_graph.value(result, SH.resultMessage)
        failures.append(
            f"shape={_short_term(owner)}; constraint={_short_term(constraint)}; "
            f"focus={focus or 'unknown'}; path={_short_term(path)}; "
            f"message={normalize_text(str(message)) if message is not None else 'unknown'}"
        )
    failures.sort()
    shown = failures[:limit]
    suffix = f"; and {len(failures) - limit} more" if len(failures) > limit else ""
    return f"{len(failures)} violation(s): " + " | ".join(shown) + suffix


def _concept_frontmatter(record: NormalizedRecord, manifest: Mapping[str, Any]) -> dict[str, Any]:
    description = next(
        (line.strip() for line in record.body.splitlines() if line.strip() and not line.startswith("#")),
        record.title,
    )
    return {
        "type": record.concept_type,
        "title": record.title,
        "description": description[:240],
        "resource": record.subject_iri,
        "tags": [record.source_id, record.source_kind, manifest["bundle"]["owl_profile"].lower()],
        "concept_id": record.concept_id,
        "concept_path": record.concept_path,
        "subject_iri": record.subject_iri,
        "ontology_class_iri": record.ontology_class_iri,
        "ontology_version_iri": manifest["bundle"]["version_iri"],
        "source_id": record.source_id,
        "source_kind": record.source_kind,
        "source_path": record.source_path,
        "source_content_sha256": record.source_content_sha256,
        "record_sha256": record.record_sha256,
        "source_refs": record.source_refs,
        "record_id": record.record_id,
    }


def _write_concepts(root: Path, records: Sequence[NormalizedRecord], manifest: Mapping[str, Any]) -> None:
    for record in records:
        target = root / record.concept_path
        target.parent.mkdir(parents=True, exist_ok=True)
        frontmatter = yaml.safe_dump(
            _concept_frontmatter(record, manifest),
            allow_unicode=True,
            sort_keys=False,
            default_flow_style=False,
        ).rstrip()
        body = record.body.rstrip() or f"# {record.title}"
        target.write_text(f"---\n{frontmatter}\n---\n\n{body}\n", encoding="utf-8", newline="\n")


def _root_index_text(records: Sequence[NormalizedRecord], manifest: Mapping[str, Any]) -> str:
    """Render the deterministic root OKF index."""

    lines = [
        "---",
        f'okf_version: "{OKF_VERSION}"',
        "---",
        "",
        f"# {manifest['bundle']['title']}",
        "",
    ]
    for record in records:
        lines.append(f"* [{record.title}]({record.concept_path}) - {record.concept_type} from {record.source_id}.")
    return "\n".join(lines) + "\n"


def _write_root_index(root: Path, records: Sequence[NormalizedRecord], manifest: Mapping[str, Any]) -> None:
    (root / "index.md").write_text(
        _root_index_text(records, manifest), encoding="utf-8", newline="\n"
    )


def _record_ledger_entry(record: NormalizedRecord) -> dict[str, Any]:
    payload = asdict(record)
    payload["source_refs"] = record.source_refs
    payload["origins"] = [
        {
            "source_id": record.source_id,
            "locator": record.source_path,
            "prov_entity": record.origin_iri,
        }
    ]
    return payload


def _aggregate_record_digest(records: Iterable[NormalizedRecord]) -> str:
    return sha256_json(sorted(record.record_sha256 for record in records))


def file_sha256(path: Path) -> str:
    """Hash one file as raw bytes."""

    return sha256_bytes(path.read_bytes())


def _artifact_entry(root: Path, relative: str) -> dict[str, str]:
    return {"path": relative, "sha256": file_sha256(root / relative)}


def _duplicate_identity_summary(
    records: Sequence[NormalizedRecord],
    field: str,
    *,
    group_limit: int = 5,
    origin_limit: int = 5,
) -> str:
    """Summarize duplicate normalized identities with their source origins."""

    grouped: dict[str, list[NormalizedRecord]] = {}
    for record in records:
        grouped.setdefault(str(getattr(record, field)), []).append(record)
    duplicates = [(value, matches) for value, matches in sorted(grouped.items()) if len(matches) > 1]
    rendered: list[str] = []
    for value, matches in duplicates[:group_limit]:
        origins = sorted(
            {
                f"{record.source_id}:{record.record_id}@{record.source_path}"
                for record in matches
            }
        )
        if len(origins) > origin_limit:
            origins = [*origins[:origin_limit], f"... {len(origins) - origin_limit} more"]
        rendered.append(f"{value!r} from [{', '.join(origins)}]")
    if len(duplicates) > group_limit:
        rendered.append(f"... {len(duplicates) - group_limit} more duplicate identities")
    return "; ".join(rendered)


def materialize_bundle(
    output: Path,
    manifest: Mapping[str, Any],
    records: Sequence[NormalizedRecord],
    source_summaries: Sequence[Mapping[str, Any]],
    processor_info: Mapping[str, Any],
) -> dict[str, Any]:
    """Atomically materialize and validate a semantic OKF bundle."""

    output = output.expanduser().resolve()
    if output.exists():
        raise BundleError(f"output already exists: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=f".{output.name}-", dir=output.parent))
    ordered = sorted(records, key=lambda item: item.concept_id)
    concept_ids = [item.concept_id for item in ordered]
    subjects = [item.subject_iri for item in ordered]
    if not ordered:
        shutil.rmtree(staging, ignore_errors=True)
        raise BundleError("no normalized records were produced")
    if len(concept_ids) != len(set(concept_ids)):
        details = _duplicate_identity_summary(ordered, "concept_id")
        shutil.rmtree(staging, ignore_errors=True)
        raise BundleError(f"duplicate concept IDs were produced: {details}")
    if len(subjects) != len(set(subjects)):
        details = _duplicate_identity_summary(ordered, "subject_iri")
        shutil.rmtree(staging, ignore_errors=True)
        raise BundleError(f"duplicate subject IRIs were produced: {details}")
    try:
        semantic = staging / "semantic"
        semantic.mkdir(parents=True)
        _write_concepts(staging, ordered, manifest)
        _write_root_index(staging, ordered, manifest)
        ontology, data, shapes, provenance = _graphs_for_bundle(manifest, ordered, source_summaries)
        _write_canonical_graph(semantic / "ontology.ttl", ontology)
        _write_canonical_graph(semantic / "data.ttl", data)
        _write_canonical_graph(semantic / "shapes.ttl", shapes)
        _write_canonical_graph(semantic / "provenance.ttl", provenance)

        ledger_path = semantic / "records.jsonl"
        ledger_path.write_text(
            "".join(canonical_json(_record_ledger_entry(record)) + "\n" for record in ordered),
            encoding="utf-8",
            newline="\n",
        )
        (semantic / "semantic-plan.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        conforms, report_graph, _ = shacl_validate(
            data,
            shacl_graph=shapes,
            ont_graph=ontology,
            inference="none",
            meta_shacl=True,
            do_owl_imports=False,
            advanced=False,
            js=False,
        )
        if isinstance(report_graph, ValidationFailure):
            raise BundleError(f"SHACL processor failure: {report_graph}")
        _write_canonical_graph(semantic / "validation-report.ttl", report_graph)
        if not conforms:
            raise BundleError(
                "generated data is SHACL non-conformant: "
                + _shacl_failure_summary(report_graph, shapes)
            )

        source_records = {
            source["id"]: [record for record in ordered if record.source_id == source["id"]]
            for source in source_summaries
        }
        sources_payload: list[dict[str, Any]] = []
        for source in sorted(source_summaries, key=lambda item: item["id"]):
            current = source_records[source["id"]]
            if not current and not source.get("allow_empty", False):
                raise BundleError(f"source {source['id']!r} produced no records")
            sources_payload.append(
                {
                    "id": source["id"],
                    "kind": source["kind"],
                    "path": source["path"],
                    "content_sha256": source["content_sha256"],
                    "records_sha256": _aggregate_record_digest(current),
                    "record_count": len(current),
                }
            )
        manifest_payload = {
            "schema_version": SCHEMA_VERSION,
            "okf_version": OKF_VERSION,
            "base_iri": manifest["bundle"]["base_iri"],
            "ontology_iri": manifest["bundle"]["ontology_iri"],
            "version_iri": manifest["bundle"]["version_iri"],
            "owl_profile": manifest["bundle"]["owl_profile"].upper(),
            "plan_sha256": sha256_json(manifest),
            "artifacts": {
                "ontology": _artifact_entry(staging, "semantic/ontology.ttl"),
                "data": _artifact_entry(staging, "semantic/data.ttl"),
                "shapes": _artifact_entry(staging, "semantic/shapes.ttl"),
                "provenance": _artifact_entry(staging, "semantic/provenance.ttl"),
                "records": _artifact_entry(staging, "semantic/records.jsonl"),
                "semantic_plan": _artifact_entry(staging, "semantic/semantic-plan.json"),
                "validation_report": _artifact_entry(staging, "semantic/validation-report.ttl"),
            },
            "sources": sources_payload,
            "processor": dict(processor_info),
            "validation": {
                "okf": "pass",
                "rdf": "pass",
                "shacl": "conformant",
                "coherence": "pass",
                "owl_profile": "not_checked",
                "owl_consistency": "not_checked",
            },
        }
        (semantic / "source-manifest.json").write_text(
            json.dumps(manifest_payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        validation = validate_semantic_bundle(staging, require_build_report=False)
        if not validation.valid:
            messages = "; ".join(item["message"] for item in validation.errors)
            raise BundleError(f"generated bundle failed coherence validation: {messages}")
        build_report = validation.to_dict()
        build_report["processor"] = dict(processor_info)
        (semantic / "build-report.json").write_text(
            json.dumps(build_report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        final_validation = validate_semantic_bundle(staging)
        if not final_validation.valid:
            messages = "; ".join(item["message"] for item in final_validation.errors)
            raise BundleError(f"generated bundle failed final validation: {messages}")
        staging.replace(output)
        return build_report
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise


def _split_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    normalized = text.removeprefix("\ufeff")
    lines = normalized.splitlines()
    if not lines or lines[0] != "---":
        raise BundleError("concept document must start with YAML frontmatter")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise BundleError("unterminated YAML frontmatter") from exc
    try:
        payload = yaml.safe_load("\n".join(lines[1:end]))
    except yaml.YAMLError as exc:
        raise BundleError(f"invalid YAML frontmatter: {exc}") from exc
    if not isinstance(payload, dict):
        raise BundleError("YAML frontmatter must be an object")
    return payload, "\n".join(lines[end + 1 :]).lstrip("\n")


def _error(errors: list[dict[str, str]], code: str, path: str, message: str) -> None:
    errors.append({"code": code, "path": path, "message": message})


def _load_records(path: Path, errors: list[dict[str, str]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        _error(errors, "semantic-error", str(path), f"cannot read record ledger: {exc}")
        return records
    for index, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            _error(errors, "semantic-error", str(path), f"invalid JSON on line {index}: {exc}")
            continue
        if not isinstance(item, dict):
            _error(errors, "semantic-error", str(path), f"line {index} must be an object")
            continue
        records.append(item)
    return records


def _is_safe_bundle_file(root: Path, path: Path) -> bool:
    """Return whether a bundle file and all of its parents stay local and non-symlinked."""

    try:
        path.resolve().relative_to(root)
        relative = path.relative_to(root)
    except (OSError, ValueError):
        return False
    cursor = root
    for part in relative.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            return False
    return True


def _normalize_ledger_records(
    records: Sequence[Mapping[str, Any]], errors: list[dict[str, str]]
) -> list[NormalizedRecord]:
    """Validate ledger structure and restore records for exact graph reconstruction."""

    field_names = tuple(NormalizedRecord.__dataclass_fields__)
    normalized: list[NormalizedRecord] = []
    for index, record in enumerate(records, start=1):
        path = f"semantic/records.jsonl:{index}"
        missing = [field for field in field_names if field not in record]
        if missing:
            _error(errors, "semantic-error", path, f"record omits fields: {', '.join(missing)}")
            continue
        if not isinstance(record.get("attributes"), dict):
            _error(errors, "semantic-error", path, "attributes must be an object")
            continue
        if not all(isinstance(record.get(field), str) for field in field_names if field != "attributes"):
            _error(errors, "semantic-error", path, "normalized record fields must be strings")
            continue
        if not HEX_RE.fullmatch(str(record.get("source_content_sha256", ""))):
            _error(errors, "semantic-error", path, "source_content_sha256 is invalid")
        if not HEX_RE.fullmatch(str(record.get("record_sha256", ""))):
            _error(errors, "semantic-error", path, "record_sha256 is invalid")
        if not absolute_iri(record.get("subject_iri")) or not absolute_iri(record.get("ontology_class_iri")):
            _error(errors, "semantic-error", path, "subject and ontology class IRIs must be absolute")
        if not absolute_iri(record.get("origin_iri")):
            _error(errors, "semantic-error", path, "origin_iri must be absolute")
        expected_id = str(record.get("concept_path", "")).removesuffix(".md")
        if record.get("concept_id") != expected_id or not str(record.get("concept_path", "")).startswith("concepts/"):
            _error(errors, "coherence-error", path, "ledger concept ID/path is invalid")
        try:
            expected_record_digest = _normalized_record_digest(record)
        except (TypeError, ValueError) as exc:
            _error(errors, "semantic-error", path, f"normalized record is not canonical JSON: {exc}")
            expected_record_digest = None
        if expected_record_digest is not None and record.get("record_sha256") != expected_record_digest:
            _error(errors, "coherence-error", path, "normalized record SHA-256 mismatch")
        expected_refs = [record.get("origin_iri")]
        if record.get("source_refs") != expected_refs:
            _error(errors, "coherence-error", path, "ledger source_refs must contain exactly origin_iri")
        expected_origins = [
            {
                "source_id": record.get("source_id"),
                "locator": record.get("source_path"),
                "prov_entity": record.get("origin_iri"),
            }
        ]
        if record.get("origins") != expected_origins:
            _error(errors, "coherence-error", path, "ledger origins do not match normalized provenance")
        try:
            normalized.append(NormalizedRecord(**{field: record[field] for field in field_names}))
        except (TypeError, ValueError) as exc:
            _error(errors, "semantic-error", path, f"cannot restore normalized record: {exc}")
    return normalized


def validate_semantic_bundle(root: Path, *, require_build_report: bool = True) -> ValidationResult:
    """Validate OKF, RDF/OWL/SHACL, provenance, and cross-layer bijection."""

    root = root.expanduser().resolve()
    errors: list[dict[str, str]] = []
    warnings: list[str] = []
    if not root.is_dir():
        _error(errors, "okf-error", str(root), "bundle root must be an existing directory")
        return ValidationResult(False, "error", errors, warnings, {})
    semantic = root / "semantic"
    required = [
        root / "index.md",
        semantic / "ontology.ttl",
        semantic / "data.ttl",
        semantic / "shapes.ttl",
        semantic / "provenance.ttl",
        semantic / "records.jsonl",
        semantic / "semantic-plan.json",
        semantic / "validation-report.ttl",
        semantic / "source-manifest.json",
    ]
    if require_build_report:
        required.append(semantic / "build-report.json")
    for path in required:
        if not path.is_file():
            _error(errors, "okf-error", str(path), "required artifact is missing")
        elif not _is_safe_bundle_file(root, path):
            _error(errors, "okf-error", str(path), "bundle artifacts cannot use symlinks or escape the root")
    if errors:
        return ValidationResult(False, "error", errors, warnings, {"artifacts": len(required)})

    index_links: list[str] = []
    try:
        index_frontmatter, index_body = _split_frontmatter((root / "index.md").read_text(encoding="utf-8"))
        if set(index_frontmatter) != {"okf_version"} or str(index_frontmatter.get("okf_version")) != OKF_VERSION:
            _error(errors, "okf-error", "index.md", f"root index must declare only okf_version {OKF_VERSION}")
        for line in index_body.splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("# "):
                continue
            match = INDEX_ENTRY_RE.match(stripped)
            if not match:
                _error(errors, "okf-error", "index.md", f"invalid index entry: {stripped}")
                continue
            target = match.group(1)
            if (
                not target.startswith("concepts/")
                or not target.endswith(".md")
                or "\\" in target
                or ".." in Path(target).parts
                or Path(target).is_absolute()
            ):
                _error(errors, "okf-error", "index.md", f"index target must be a bundle concept: {target}")
                continue
            index_links.append(target)
            if not (root / target).is_file():
                _error(errors, "okf-error", "index.md", f"index target does not exist: {target}")
    except (OSError, UnicodeError, BundleError) as exc:
        _error(errors, "okf-error", "index.md", str(exc))

    concept_payloads: dict[str, dict[str, Any]] = {}
    for path in sorted((root / "concepts").rglob("*.md")) if (root / "concepts").exists() else []:
        relative = path.relative_to(root).as_posix()
        if not _is_safe_bundle_file(root, path):
            _error(errors, "okf-error", relative, "concept cannot use symlinks or escape the bundle root")
            continue
        try:
            payload, body = _split_frontmatter(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, BundleError) as exc:
            _error(errors, "okf-error", relative, str(exc))
            continue
        if not isinstance(payload.get("type"), str) or not payload["type"].strip():
            _error(errors, "okf-error", relative, "concept requires a non-empty type")
        expected_id = relative.removesuffix(".md")
        if payload.get("concept_id") != expected_id or payload.get("concept_path") != relative:
            _error(errors, "coherence-error", relative, "concept ID/path does not match bundle path")
        if expected_id in concept_payloads:
            _error(errors, "coherence-error", relative, "duplicate concept ID")
        payload["_body"] = body.rstrip()
        concept_payloads[expected_id] = payload
    if not concept_payloads:
        _error(errors, "okf-error", "concepts", "bundle has no concept documents")
    concept_paths = {f"{concept_id}.md" for concept_id in concept_payloads}
    if len(index_links) != len(set(index_links)):
        _error(errors, "okf-error", "index.md", "root index contains duplicate concept links")
    if set(index_links) != concept_paths:
        _error(errors, "okf-error", "index.md", "root index and concept document sets differ")

    try:
        semantic_plan = json.loads((semantic / "semantic-plan.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        _error(errors, "semantic-error", "semantic/semantic-plan.json", f"cannot parse: {exc}")
        semantic_plan = {}
    plan_errors = validate_manifest(semantic_plan)
    for message in plan_errors:
        _error(errors, "semantic-error", "semantic/semantic-plan.json", message)

    try:
        source_manifest = json.loads((semantic / "source-manifest.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        _error(errors, "semantic-error", "semantic/source-manifest.json", f"cannot parse: {exc}")
        source_manifest = {}
    if not isinstance(source_manifest, dict):
        _error(errors, "semantic-error", "semantic/source-manifest.json", "manifest root must be an object")
        source_manifest = {}
    if source_manifest.get("schema_version") != SCHEMA_VERSION:
        _error(errors, "semantic-error", "semantic/source-manifest.json", "schema_version is invalid")
    if str(source_manifest.get("okf_version")) != OKF_VERSION:
        _error(errors, "semantic-error", "semantic/source-manifest.json", "okf_version is invalid")
    expected_stored_validation = {
        "okf": "pass",
        "rdf": "pass",
        "shacl": "conformant",
        "coherence": "pass",
        "owl_profile": "not_checked",
        "owl_consistency": "not_checked",
    }
    if source_manifest.get("validation") != expected_stored_validation:
        _error(errors, "semantic-error", "semantic/source-manifest.json", "stored validation status is invalid")
    processor_manifest = source_manifest.get("processor")
    if not isinstance(processor_manifest, dict):
        _error(errors, "semantic-error", "semantic/source-manifest.json", "processor metadata must be an object")
        processor_manifest = {}
    if isinstance(source_manifest, dict) and source_manifest.get("plan_sha256") != sha256_json(semantic_plan):
        _error(errors, "semantic-error", "semantic/source-manifest.json", "semantic plan digest mismatch")
    if not plan_errors:
        expected_bundle_fields = {
            "base_iri": semantic_plan["bundle"]["base_iri"],
            "ontology_iri": semantic_plan["bundle"]["ontology_iri"],
            "version_iri": semantic_plan["bundle"]["version_iri"],
            "owl_profile": semantic_plan["bundle"]["owl_profile"].upper(),
        }
        for field, expected_value in expected_bundle_fields.items():
            if source_manifest.get(field) != expected_value:
                _error(
                    errors,
                    "semantic-error",
                    "semantic/source-manifest.json",
                    f"{field} differs from semantic plan",
                )
    artifacts = source_manifest.get("artifacts", {}) if isinstance(source_manifest, dict) else {}
    expected_artifacts = {
        "ontology": "semantic/ontology.ttl",
        "data": "semantic/data.ttl",
        "shapes": "semantic/shapes.ttl",
        "provenance": "semantic/provenance.ttl",
        "records": "semantic/records.jsonl",
        "semantic_plan": "semantic/semantic-plan.json",
        "validation_report": "semantic/validation-report.ttl",
    }
    if not isinstance(artifacts, dict) or set(artifacts) != set(expected_artifacts):
        _error(errors, "semantic-error", "semantic/source-manifest.json", "artifact set is incomplete or unexpected")
    if isinstance(artifacts, dict):
        for name, entry in artifacts.items():
            if not isinstance(entry, dict) or not isinstance(entry.get("path"), str):
                _error(errors, "semantic-error", "semantic/source-manifest.json", f"invalid artifact entry {name}")
                continue
            if entry["path"] != expected_artifacts.get(name):
                _error(errors, "semantic-error", "semantic/source-manifest.json", f"invalid artifact path for {name}")
                continue
            artifact_path = root / entry["path"]
            if not artifact_path.is_file():
                _error(errors, "semantic-error", entry["path"], "manifest artifact is missing")
            elif entry.get("sha256") != file_sha256(artifact_path):
                _error(errors, "semantic-error", entry["path"], "artifact SHA-256 mismatch")

    stored_build_report: dict[str, Any] | None = None
    if require_build_report:
        try:
            stored_build_report = json.loads((semantic / "build-report.json").read_text(encoding="utf-8"))
            if not isinstance(stored_build_report, dict) or stored_build_report.get("valid") is not True:
                _error(errors, "semantic-error", "semantic/build-report.json", "build report is not a passing report")
                stored_build_report = None
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            _error(errors, "semantic-error", "semantic/build-report.json", f"cannot parse: {exc}")

    records = _load_records(semantic / "records.jsonl", errors)
    normalized_records = _normalize_ledger_records(records, errors)
    normalized_by_concept = {record.concept_id: record for record in normalized_records}
    record_by_concept: dict[str, dict[str, Any]] = {}
    record_by_subject: dict[str, dict[str, Any]] = {}
    for record in records:
        concept_id = record.get("concept_id")
        subject_iri = record.get("subject_iri")
        if not isinstance(concept_id, str) or not isinstance(subject_iri, str):
            _error(errors, "semantic-error", "semantic/records.jsonl", "concept_id and subject_iri must be strings")
            continue
        if concept_id in record_by_concept:
            _error(errors, "coherence-error", "semantic/records.jsonl", f"duplicate concept ID {concept_id}")
        if subject_iri in record_by_subject:
            _error(errors, "coherence-error", "semantic/records.jsonl", f"duplicate subject IRI {subject_iri}")
        record_by_concept[str(concept_id)] = record
        record_by_subject[str(subject_iri)] = record
    if set(concept_payloads) != set(record_by_concept):
        _error(errors, "coherence-error", "semantic/records.jsonl", "concept and record-ledger ID sets differ")

    try:
        ontology = Graph().parse(semantic / "ontology.ttl", format="turtle")
        data = Graph().parse(semantic / "data.ttl", format="turtle")
        shapes = Graph().parse(semantic / "shapes.ttl", format="turtle")
        provenance = Graph().parse(semantic / "provenance.ttl", format="turtle")
        stored_validation_report = Graph().parse(semantic / "validation-report.ttl", format="turtle")
    except Exception as exc:
        _error(errors, "semantic-error", "semantic", f"RDF parse failure: {exc}")
        return ValidationResult(False, "error", errors, warnings, {"concepts": len(concept_payloads)})

    ontology_iri = source_manifest.get("ontology_iri")
    version_iri = source_manifest.get("version_iri")
    ns = Namespace(ontology_iri if str(ontology_iri).endswith(("#", "/")) else f"{ontology_iri}#")
    data_subjects = set(data.subjects())
    ledger_subjects = {URIRef(value) for value in record_by_subject if absolute_iri(value)}
    if any(not isinstance(subject, URIRef) for subject in data_subjects):
        _error(errors, "coherence-error", "semantic/data.ttl", "accepted data graph contains a blank-node subject")
    if data_subjects != ledger_subjects:
        _error(errors, "coherence-error", "semantic/data.ttl", "data subject set differs from record ledger")

    source_payload = source_manifest.get("sources", [])
    if not isinstance(source_payload, list):
        _error(errors, "semantic-error", "semantic/source-manifest.json", "sources must be a list")
        source_payload = []
    source_ids_in_order = [item.get("id") for item in source_payload if isinstance(item, dict)]
    if len(source_ids_in_order) != len(set(source_ids_in_order)):
        _error(errors, "semantic-error", "semantic/source-manifest.json", "duplicate source entries")
    source_entries = {
        item.get("id"): item
        for item in source_payload
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    if not plan_errors:
        plan_sources = source_by_id(semantic_plan)
        if set(source_entries) != set(plan_sources):
            _error(errors, "semantic-error", "semantic/source-manifest.json", "source set differs from semantic plan")
        for source_id, source_entry in source_entries.items():
            source_plan = plan_sources.get(source_id, {})
            for field in ("kind", "path"):
                if source_entry.get(field) != source_plan.get(field):
                    _error(
                        errors,
                        "semantic-error",
                        "semantic/source-manifest.json",
                        f"source {source_id} {field} differs from semantic plan",
                    )
            if not HEX_RE.fullmatch(str(source_entry.get("content_sha256", ""))):
                _error(errors, "semantic-error", "semantic/source-manifest.json", f"source {source_id} digest is invalid")
        for record in normalized_records:
            path = record.concept_path
            source_plan = plan_sources.get(record.source_id)
            if source_plan is None:
                _error(errors, "coherence-error", path, "ledger source_id is absent from semantic plan")
                continue
            expected_class = str(expand_term(source_plan["ontology_class"], semantic_plan))
            expected_concept_id = f"concepts/{record.source_id}/{_safe_file_segment(record.record_id)}"
            expected_origin_hash = sha256_json(
                {
                    "source_id": record.source_id,
                    "path": record.source_path,
                    "record_id": record.record_id,
                }
            )[:24]
            expected_origin = (
                f"{semantic_plan['bundle']['base_iri']}provenance/record/"
                f"{record.source_id}/{expected_origin_hash}"
            )
            if record.source_kind != source_plan["kind"]:
                _error(errors, "coherence-error", path, "source_kind differs from semantic plan")
            if record.concept_type != source_plan["concept_type"]:
                _error(errors, "coherence-error", path, "concept_type differs from semantic plan")
            if record.ontology_class_iri != expected_class:
                _error(errors, "coherence-error", path, "ontology class differs from semantic plan")
            if record.concept_id != expected_concept_id or record.concept_path != f"{expected_concept_id}.md":
                _error(errors, "coherence-error", path, "concept ID/path is not derived from record_id")
            if record.origin_iri != expected_origin:
                _error(errors, "coherence-error", path, "origin IRI is not derived from source locator")
            source_path = PurePosixPath(record.source_path)
            if (
                source_path.is_absolute()
                or ".." in source_path.parts
                or not source_path.match(source_plan["path"])
            ):
                _error(errors, "coherence-error", path, "source_path does not match the semantic plan")
            if not set(record.attributes).issubset(set(source_plan.get("fields", {}))):
                _error(errors, "coherence-error", path, "record attributes contain unmapped fields")
            if source_plan["kind"] == "rdf":
                if record.record_id != record.subject_iri:
                    _error(errors, "coherence-error", path, "RDF record_id must equal subject_iri")
            else:
                expected_subject = (
                    f"{semantic_plan['bundle']['base_iri']}resource/{quote(record.source_id, safe='')}/"
                    f"{quote(record.record_id, safe='')}"
                )
                if record.subject_iri != expected_subject:
                    _error(errors, "coherence-error", path, "subject IRI is not derived from the record identity")
                if source_plan["kind"] == "markdown":
                    expected_record_id = record.source_path.removesuffix(source_path.suffix)
                    if record.record_id != expected_record_id:
                        _error(errors, "coherence-error", path, "Markdown record_id must derive from source_path")
        ordered_records = sorted(normalized_records, key=lambda item: item.concept_id)
        if [record.concept_id for record in normalized_records] != [
            record.concept_id for record in ordered_records
        ]:
            _error(errors, "coherence-error", "semantic/records.jsonl", "record ledger is not canonically ordered")
        try:
            actual_index = (root / "index.md").read_text(encoding="utf-8")
            if actual_index != _root_index_text(ordered_records, semantic_plan):
                _error(errors, "coherence-error", "index.md", "root index differs from semantic plan and ledger")
        except (OSError, UnicodeError) as exc:
            _error(errors, "okf-error", "index.md", f"cannot compare root index: {exc}")
    for concept_id, record in record_by_concept.items():
        payload = concept_payloads.get(concept_id, {})
        relative = str(record.get("concept_path"))
        normalized_record = normalized_by_concept.get(concept_id)
        if normalized_record is not None and not plan_errors:
            expected_frontmatter = _concept_frontmatter(normalized_record, semantic_plan)
            actual_frontmatter = {key: value for key, value in payload.items() if key != "_body"}
            if actual_frontmatter != expected_frontmatter:
                _error(errors, "coherence-error", relative, "concept frontmatter differs from normalized record")
            if payload.get("_body") != normalized_record.body.rstrip():
                _error(errors, "coherence-error", relative, "concept body differs from normalized record")
        for field in (
            "concept_id",
            "concept_path",
            "subject_iri",
            "ontology_class_iri",
            "source_id",
            "source_kind",
            "source_path",
            "source_content_sha256",
            "record_sha256",
            "record_id",
        ):
            if payload.get(field) != record.get(field):
                _error(errors, "coherence-error", relative, f"frontmatter/ledger mismatch for {field}")
        if payload.get("resource") != record.get("subject_iri"):
            _error(errors, "coherence-error", relative, "OKF resource must equal subject_iri")
        if payload.get("ontology_version_iri") != version_iri:
            _error(errors, "coherence-error", relative, "ontology version IRI mismatch")
        if payload.get("source_refs") != record.get("source_refs"):
            _error(errors, "coherence-error", relative, "source_refs mismatch")
        subject = URIRef(str(record.get("subject_iri")))
        class_iri = URIRef(str(record.get("ontology_class_iri")))
        if (class_iri, RDF.type, OWL.Class) not in ontology:
            _error(errors, "semantic-error", relative, "ontology class is not declared")
        if (subject, RDF.type, class_iri) not in data:
            _error(errors, "semantic-error", relative, "subject is missing its declared rdf:type")
        expected_values = {
            ns.okfConceptId: concept_id,
            ns.sourceId: str(record.get("source_id")),
            ns.sourceContentSha256: str(record.get("source_content_sha256")),
            ns.recordSha256: str(record.get("record_sha256")),
        }
        for predicate, expected in expected_values.items():
            actual = [str(value) for value in data.objects(subject, predicate)]
            if actual != [expected]:
                _error(errors, "semantic-error", relative, f"invalid {predicate} marker")
        source_refs = record.get("source_refs", [])
        if not isinstance(source_refs, list):
            source_refs = []
        origins = {URIRef(value) for value in source_refs if absolute_iri(value)}
        if set(provenance.objects(subject, PROV.wasDerivedFrom)) != origins:
            _error(errors, "semantic-error", relative, "PROV origins differ from source_refs")
        if normalized_record is not None and not plan_errors:
            source_entity = URIRef(
                f"{semantic_plan['bundle']['base_iri']}provenance/source/"
                f"{quote(normalized_record.source_id, safe='')}"
            )
            origin = URIRef(normalized_record.origin_iri)
            required_provenance = {
                (source_entity, RDF.type, PROV.Entity),
                (source_entity, ns.sourceId, Literal(normalized_record.source_id)),
                (source_entity, ns.sourceContentSha256, Literal(normalized_record.source_content_sha256)),
                (origin, RDF.type, PROV.Entity),
                (origin, PROV.specializationOf, source_entity),
                (origin, PROV.atLocation, Literal(normalized_record.source_path)),
                (origin, ns.recordSha256, Literal(normalized_record.record_sha256)),
            }
            if not required_provenance.issubset(set(provenance)):
                _error(errors, "semantic-error", relative, "PROV source/record lineage is incomplete")
        source_entry = source_entries.get(record.get("source_id"))
        if not source_entry:
            _error(errors, "semantic-error", relative, "record references an unknown source")
        elif source_entry.get("content_sha256") != record.get("source_content_sha256"):
            _error(errors, "semantic-error", relative, "source content digest mismatch")

    records_by_source: dict[str, list[dict[str, Any]]] = {}
    for record in records:
        records_by_source.setdefault(str(record.get("source_id")), []).append(record)
    for source_id, source_entry in source_entries.items():
        current = records_by_source.get(source_id, [])
        digest = sha256_json(sorted(str(item.get("record_sha256")) for item in current))
        if source_entry.get("record_count") != len(current):
            _error(errors, "semantic-error", "semantic/source-manifest.json", f"source {source_id} count mismatch")
        if source_entry.get("records_sha256") != digest:
            _error(errors, "semantic-error", "semantic/source-manifest.json", f"source {source_id} records digest mismatch")
        if not current and not plan_errors and not source_by_id(semantic_plan)[source_id].get("allow_empty", False):
            _error(errors, "semantic-error", "semantic/source-manifest.json", f"source {source_id} cannot be empty")

    expected_processor_fields = {
        "records": len(records),
        "sources": len(source_entries),
    }
    for field, expected_value in expected_processor_fields.items():
        if processor_manifest.get(field) != expected_value:
            _error(errors, "semantic-error", "semantic/source-manifest.json", f"processor {field} metadata mismatch")
    for field in ("name", "contract_version"):
        if not isinstance(processor_manifest.get(field), str) or not processor_manifest[field]:
            _error(errors, "semantic-error", "semantic/source-manifest.json", f"processor {field} metadata is invalid")
    if processor_manifest.get("name") != "semantic-okf-python":
        _error(errors, "semantic-error", "semantic/source-manifest.json", "processor name is invalid")
    if processor_manifest.get("contract_version") != "1.0":
        _error(errors, "semantic-error", "semantic/source-manifest.json", "processor contract_version is invalid")

    if not plan_errors and len(normalized_records) == len(records):
        try:
            expected_graphs = _graphs_for_bundle(semantic_plan, normalized_records, list(source_entries.values()))
            actual_graphs = (ontology, data, shapes, provenance)
            for name, expected_graph, actual_graph in zip(
                ("ontology", "data", "shapes", "provenance"), expected_graphs, actual_graphs, strict=True
            ):
                if not isomorphic(expected_graph, actual_graph):
                    _error(
                        errors,
                        "coherence-error",
                        f"semantic/{name}.ttl",
                        f"{name} graph differs from the semantic plan and record ledger",
                    )
        except (BundleError, KeyError, TypeError, ValueError) as exc:
            _error(errors, "semantic-error", "semantic/semantic-plan.json", f"cannot reconstruct graphs: {exc}")

    declared_classes = set(ontology.subjects(RDF.type, OWL.Class))
    declared_properties = (
        set(ontology.subjects(RDF.type, OWL.DatatypeProperty))
        | set(ontology.subjects(RDF.type, OWL.ObjectProperty))
        | set(ontology.subjects(RDF.type, OWL.AnnotationProperty))
    )
    for shape in shapes.subjects(RDF.type, SH.NodeShape):
        for target_class in shapes.objects(shape, SH.targetClass):
            if target_class not in declared_classes:
                _error(errors, "semantic-error", "semantic/shapes.ttl", "shape targets undeclared class")
        for property_shape in shapes.objects(shape, SH.property):
            path = shapes.value(property_shape, SH.path)
            if path is not None and path not in declared_properties:
                _error(errors, "semantic-error", "semantic/shapes.ttl", "shape uses undeclared property")
        if shape != ns.SemanticMappingShape and not list(shapes.objects(shape, ns.ruleBasis)):
            _error(errors, "semantic-error", "semantic/shapes.ttl", "rule shape is missing its basis")

    shacl_status = "processor_failure"
    try:
        conforms, report_graph, _ = shacl_validate(
            data,
            shacl_graph=shapes,
            ont_graph=ontology,
            inference="none",
            meta_shacl=True,
            do_owl_imports=False,
            advanced=False,
            js=False,
        )
        if isinstance(report_graph, ValidationFailure):
            _error(errors, "processor-failure", "semantic/shapes.ttl", str(report_graph))
        elif not conforms:
            shacl_status = "nonconformant"
            _error(errors, "shacl-nonconformant", "semantic/data.ttl", "accepted data does not conform")
        else:
            shacl_status = "conformant"
        if isinstance(report_graph, Graph) and not isomorphic(report_graph, stored_validation_report):
            _error(
                errors,
                "coherence-error",
                "semantic/validation-report.ttl",
                "stored SHACL report differs from live validation",
            )
    except Exception as exc:
        _error(errors, "processor-failure", "semantic/shapes.ttl", f"SHACL processor failure: {exc}")

    summary = {
        "concepts": len(concept_payloads),
        "records": len(records),
        "data_subjects": len(data_subjects),
        "sources": len(source_entries),
        "ontology_classes": len(declared_classes),
        "owl_profile": "not_checked",
        "owl_consistency": "not_checked",
        "shacl": shacl_status,
    }
    if require_build_report and stored_build_report is not None:
        expected_report = {
            "schema_version": SCHEMA_VERSION,
            "valid": True,
            "status": "pass",
            "errors": [],
            "warnings": warnings,
            "summary": summary,
            "processor": processor_manifest,
        }
        if stored_build_report != expected_report:
            _error(
                errors,
                "coherence-error",
                "semantic/build-report.json",
                "build report differs from live validation and processor metadata",
            )
    valid = not errors
    return ValidationResult(
        valid=valid,
        status="pass" if valid else "error",
        errors=errors,
        warnings=warnings,
        summary=summary,
    )
