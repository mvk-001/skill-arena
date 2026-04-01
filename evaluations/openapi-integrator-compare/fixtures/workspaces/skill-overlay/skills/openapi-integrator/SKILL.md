---
name: openapi-integrator
description: Generate OpenClaw skills and API clients from OpenAPI or Swagger specs. Use when users provide `openapi.json`, `swagger.yaml`, or API spec URLs and want a ready-to-use integration skill.
---

# OpenAPI Integrator

Convert API specs into usable skills with generated client tooling and reusable references.

## Metadata

- triggers: `openapi.json`, `swagger.yaml`, `swagger.json`, API spec URL, "generate client from OpenAPI"
- degrees_of_freedom: MEDIUM
- when_to_use: user wants a generated integration skill or starter client from OpenAPI/Swagger
- when_not_to_use: user needs only one manual API call with no reusable skill generation

## Level 1 - Quick Generate

Use this for the default path.

```bash
python3 scripts/openapi_to_skill.py <spec_url_or_path> [--name <skill-name>] [--output <dir>]
```

Examples:

```bash
python3 scripts/openapi_to_skill.py https://petstore3.swagger.io/api/v3/openapi.json --output ./
python3 scripts/openapi_to_skill.py ./my-api.yaml --name my-api --output ./
```

## Level 2 - Controlled Generation

Use these controls when the user wants naming, output, or auth conventions changed.

- `--name`: set deterministic generated skill name.
- `--output`: choose target folder for generated skill.
- Auth mapping behavior:
  - OpenAPI 3.x reads `components.securitySchemes`.
  - Swagger 2.x reads `securityDefinitions`.
  - Generated client uses `<SKILL>_API_KEY` and `<SKILL>_AUTH_HEADER` env vars.
- Operation ID behavior:
  - Uses `operationId` when present.
  - Falls back to `<method>_<path>` pattern when missing.
  - Normalizes IDs to snake_case for stable CLI usage.

Reference docs:

- `references/auth-scheme-mapping.md`
- `references/openapi-3-vs-swagger-2.md`
- `references/openapi-docs.md`

## Level 3 - Manual Refinement

Use this when the user needs strict behavior beyond generator defaults.

1. Manually edit generated `scripts/api_client.py` for custom auth flows (OAuth token refresh, signed headers).
2. Manually remap operation naming if organization-specific naming is required.
3. Validate and fix spec quality before generation (missing `info`, malformed `paths`, invalid JSON/YAML).
4. Add organization-specific guidance to generated `SKILL.md` and references.

Troubleshooting:

- Invalid JSON or YAML: fix syntax and rerun.
- Missing `openapi`/`swagger` root field: the spec is unsupported until corrected.
- YAML parse errors: install `PyYAML`.

## Artifacts

- Sample spec: `assets/sample-openapi-spec.json`
- Example output structure: `assets/example-generated-skill/`
