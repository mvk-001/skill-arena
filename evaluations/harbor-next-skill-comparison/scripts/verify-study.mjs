#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

const STUDY_ID = "harbor-next-skill-comparison-20260720";
const STUDY_STATUS = "complete-descriptive-no-replay";
const RESULT_ID = "harbor-next-skill-contract-evidence-snapshot-20260720";
const PROTOCOL_REPOSITORY_PATH =
  "evaluations/harbor-next-skill-comparison/protocol.json";
const RESULT_REPOSITORY_PATH =
  "evaluations/harbor-next-skill-comparison/results/20260720/evidence-ledger.json";
const LOCK_REPOSITORY_PATH =
  "evaluations/harbor-next-skill-comparison/locks/study-lock.json";
const LOCK_FILE_ALGORITHM = "sha256-file-bytes-v1";
const LOCK_BINDING_ALGORITHM = "sha256-nul-delimited-study-lock-v1";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const studyRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(studyRoot, "../..");

const EXPECTED_COMPARISON_SET = [
  "harbor-run-results",
  "harbor-resume-external-failures",
  "harbor-realize-skill-candidate",
  "harbor-population-search",
  "harbor-trace-distillation",
  "harbor-reflective-pareto-search",
  "harbor-operator-coevolution",
  "harbor-evolve-skill",
  "harbor-metaskill-evolution",
];

const EXPECTED_NEW_BUNDLES = [
  {
    bundleId: "harbor-realize-skill-candidate",
    path: "skills/harbor-realize-skill-candidate",
    status: "sealed",
    digestAlgorithm: "sha256-tree-v1",
    treeSha256:
      "f788c14a992e941dd2f5ea3374f48f971bed28d8bc8876d6c19e3f27b0c5ccf2",
    fileCount: 4,
    totalBytes: 65487,
    contractRole:
      "Evaluator-independent realization of one bound development mutation from a digest-frozen parent into an isolated, validated, digest-sealed candidate with provenance receipts; trusted validation effects remain unverified.",
    reason:
      "The stable four-file contract is tree-digest sealed for comparison; the seal does not claim execution, fitness, selection, or promotion evidence.",
  },
  {
    bundleId: "harbor-metaskill-evolution",
    path: "skills/harbor-metaskill-evolution",
    status: "sealed",
    digestAlgorithm: "sha256-tree-v1",
    treeSha256:
      "d467e6538138830feaf97a16eac8fd15774ac51eb78c997e4be11e70135a4804",
    fileCount: 4,
    totalBytes: 91053,
    contractRole:
      "Deterministic analysis-only replay of SHA-bound, hash-chained development ledgers for task-skill nodes and five typed meta-policy bundles; no execution, generation, selection, promotion, configured holdout input, reproduction, or causal claim, with semantic holdout absence unverified.",
    reason:
      "The stable four-file analysis contract is tree-digest sealed for comparison; no repository replay or meta-productivity result is inferred from the seal.",
  },
];

const EXPECTED_EVIDENCE_BOUNDARY = {
  allowedRepositoryEvidenceRoles: [
    "development",
    "discovery-smoke",
    "prospective-development-contract",
  ],
  forbiddenRepositoryEvidenceRoles: ["holdout", "hard"],
  trackedFilesOnly: true,
  ignoredNativeJobsAllowed: false,
  candidateGenerationAllowed: false,
  candidateSelectionAllowed: false,
  promotionAllowed: false,
  historicalMutationAllowed: false,
  fieldImportPolicy:
    "Only exact JSON pointers declared in the result ledger are imported as observations. Narrative sources are hash-bound but supply no machine score.",
  developmentHoldoutRule:
    "No holdout or hard metric, task content, answer, verifier input, trajectory, or candidate decision is an input to this snapshot.",
};

const EXPECTED_TREE_DIGEST_CONTRACT = {
  algorithmId: "sha256-tree-v1",
  algorithm:
    "SHA-256 over relative-path UTF-8, NUL, file bytes, NUL for every regular file",
  fileOrder:
    "ascending unsigned UTF-8 byte order of forward-slash relative paths",
  linksOrJunctionsAllowed: false,
  omissions: [],
};

const EXPECTED_IDENTIFIABILITY_POLICY = {
  causalGain:
    "A selected development delta is descriptive unless a predeclared design identifies candidate-attributable effects with comparable lineage, cohorts, execution profile, and call accounting.",
  metaProductivity:
    "Requires repeated attributable generations and a predeclared quality-gain-per-resource measure over candidate-producing procedures.",
  missingEvidenceDisposition: "not-identifiable",
  scoreImputationAllowed: false,
};

const EXPECTED_APPEND_ONLY_POLICY = {
  historicalEvaluationFilesMayBeEdited: false,
  publishedResultMayBeOverwritten: false,
  correctionMethod: "Create a new dated result with explicit provenance.",
};

const EXPECTED_VALIDATION = {
  command:
    "node evaluations/harbor-next-skill-comparison/scripts/verify-study.mjs",
  testCommand: "node --test test/harbor-next-skill-comparison.test.js",
  digestInspectionCommand:
    "node evaluations/harbor-next-skill-comparison/scripts/verify-study.mjs --print-new-skill-digests",
};

const EXPECTED_PROTOCOL_REPLAY = {
  status: "not-run",
  harborInvocations: 0,
  modelExecutions: 0,
  candidateAuthoringCalls: 0,
  reason: "This is a contract and tracked-evidence audit, not a new evaluation run.",
};

const EXPECTED_LEDGER_REPLAY = {
  status: "not-run",
  harborInvocations: 0,
  modelExecutions: 0,
};

const EXPECTED_PAPER_CONTEXT = [
  {
    arxivId: "2607.13104v1",
    title: "Self-Improvements in Modern Agentic Systems: A Survey",
    use: "design-context-only",
    numericFiguresImported: [],
  },
  {
    arxivId: "2607.05297v1",
    title: "MetaSkill-Evolve",
    use: "design-context-only",
    numericFiguresImported: [],
  },
];

const EXPECTED_SOURCES = [
  {
    sourceId: "contract-harbor-run-results",
    class: "tracked-skill-contract",
    path: "skills/harbor-run-results/SKILL.md",
    sha256: "0a0d1a84a916b6d2dcdacddcfaee21e2a4651f84c91e26c20bf75ce98b7e2559",
  },
  {
    sourceId: "contract-harbor-resume-external-failures",
    class: "tracked-skill-contract",
    path: "skills/harbor-resume-external-failures/SKILL.md",
    sha256: "09d611f32ad7a648569d852bc1a27ce46f0da047276ffc8c8e9fc514e1f26793",
  },
  {
    sourceId: "contract-harbor-population-search",
    class: "tracked-skill-contract",
    path: "skills/harbor-population-search/SKILL.md",
    sha256: "e42ec4cfb423c28dc742d6ea13628c6b7e8a9a9340f32049f707535ae99a897c",
  },
  {
    sourceId: "contract-harbor-trace-distillation",
    class: "tracked-skill-contract",
    path: "skills/harbor-trace-distillation/SKILL.md",
    sha256: "77cfd9096b054f3ed9ae85dd0725971d8b7ebbe3003ab82beb349eec49c03e48",
  },
  {
    sourceId: "contract-harbor-reflective-pareto-search",
    class: "tracked-skill-contract",
    path: "skills/harbor-reflective-pareto-search/SKILL.md",
    sha256: "0a82846727a1b336efd8c1009646cccb6aca3ac54e0a08f6136a940d9d6f0144",
  },
  {
    sourceId: "contract-harbor-operator-coevolution",
    class: "tracked-skill-contract",
    path: "skills/harbor-operator-coevolution/SKILL.md",
    sha256: "98a5fc081b4c56923ccad0ec522e3d84f8ab660ccea5ae2e0dfe55dd5e343c3a",
  },
  {
    sourceId: "contract-harbor-evolve-skill",
    class: "tracked-skill-contract",
    path: "skills/harbor-evolve-skill/SKILL.md",
    sha256: "c6bdde6d2e3b4e76565562eb17c563f1ebdbe120b389f2e9dba96dd6b5e32aec",
  },
  {
    sourceId: "harbor-evolution-protocol",
    class: "tracked-historical-protocol",
    path: "evaluations/harbor-evolution-comparison/protocol.yaml",
    sha256: "c1bf7ac88f3f0edd52c34f4b4d4e7ccff659a0607f75d8e0c121a188f44ad5e8",
  },
  {
    sourceId: "harbor-evolution-summary",
    class: "tracked-repository-result",
    path: "evaluations/harbor-evolution-comparison/results/20260716/summary.json",
    sha256: "d5a985ecd95d4c49aa775eb6b55d6cb16b3e10b6132f21e4054d8cf999956cb7",
  },
  {
    sourceId: "harbor-evolution-report",
    class: "tracked-repository-narrative-result",
    path: "evaluations/harbor-evolution-comparison/results/20260716/report.md",
    sha256: "c78db8032f94d7ef22258b1ce63b80e719251a41edc137d1ff8c46f765bd91e7",
  },
  {
    sourceId: "knowledge-q003-pilot",
    class: "tracked-repository-result",
    path: "evaluations/knowledge-consult-evolution/results/q003-qualification-pilot.json",
    sha256: "89a4255b7fb0bb4db77ec2f18eb1023fb69d43ca6a4e2c2cc13dce23ceabdb82",
  },
  {
    sourceId: "knowledge-g005-pareto-state",
    class: "tracked-repository-result",
    path: "evaluations/knowledge-consult-evolution/meta-evolution/generation-005/pareto-state.json",
    sha256: "88c7e96ffae5341c7b3e786aca9e631140e2440e58455ca0789dc8fb3d1f5ab1",
  },
  {
    sourceId: "knowledge-g005-candidate-lock",
    class: "tracked-historical-development-candidate-lock",
    path: "evaluations/knowledge-consult-evolution/meta-evolution/generation-005/candidate-lock.json",
    sha256: "de346888cf0fb4a897d5163f92f5c6da13c3f33f3139aee95e38b18115bf01ed",
  },
  {
    sourceId: "knowledge-g005-candidate-manifest",
    class: "tracked-historical-development-realization-manifest",
    path: "evaluations/knowledge-consult-evolution/meta-evolution/generation-005/candidates/relevance-first-facet-coverage/candidate-manifest.json",
    sha256: "13cb5c30adfd07358fcc267da2e62dbdb6d02dd5d19622544995e73bf907680e",
  },
  {
    sourceId: "knowledge-g005-operator-realization",
    class: "tracked-historical-development-operator-realization",
    path: "evaluations/knowledge-consult-evolution/meta-evolution/generation-005/candidates/relevance-first-facet-coverage/operator-realization.json",
    sha256: "43e57322df82831f2c1139e1f56dd6c4a916f539d6432f77cc86fbaf75f64f45",
  },
  {
    sourceId: "knowledge-g006-protocol",
    class: "tracked-prospective-development-contract",
    path: "evaluations/knowledge-consult-evolution/meta-evolution/generation-006/protocol.json",
    sha256: "e81f6cd4dc4aa038ab14182685d0c43e756002078c8bafa1d65bef36569c0d3f",
  },
];

const EXPECTED_CONTRACT_ROWS = [
  {
    bundleId: "harbor-run-results",
    contractBasis: "sealed-maintained-contract",
    contractSourceRef: "contract-harbor-run-results",
    lifecycleRole: "native-harbor-execution-validation-comparison-and-reporting",
    candidateMaterialization: "none",
    selectionAuthority: "comparison-report-only",
    repositoryObservationRefs: [],
    causalGain: "not-applicable-helper-contract",
    metaProductivity: "not-applicable",
  },
  {
    bundleId: "harbor-resume-external-failures",
    contractBasis: "sealed-maintained-contract",
    contractSourceRef: "contract-harbor-resume-external-failures",
    lifecycleRole: "selective-recovery-of-independently-proven-external-failures",
    candidateMaterialization: "none",
    selectionAuthority: "no-semantic-reselection",
    repositoryObservationRefs: [],
    causalGain: "not-applicable-helper-contract",
    metaProductivity: "not-applicable",
  },
  {
    bundleId: "harbor-realize-skill-candidate",
    contractBasis: "sealed-new-contract",
    contractSourceRef:
      "protocol:newBundleContracts/harbor-realize-skill-candidate",
    lifecycleRole:
      "realize-one-mutation-proposal-as-an-isolated-auditable-candidate",
    candidateMaterialization: "primary-output",
    selectionAuthority: "none",
    repositoryObservationRefs: [],
    historicalCompatibilityRefs: ["knowledge-g005-realization-primitives"],
    causalGain: "not-identifiable",
    metaProductivity: "not-applicable",
  },
  {
    bundleId: "harbor-population-search",
    contractBasis: "sealed-maintained-contract",
    contractSourceRef: "contract-harbor-population-search",
    lifecycleRole: "scalar-population-evaluation-and-development-selection",
    candidateMaterialization: "candidate-bundles-are-external-inputs",
    selectionAuthority:
      "development-selection-with-separate-promotion-gate",
    repositoryObservationRefs: ["hec-population-development"],
    causalGain: "not-identifiable",
    metaProductivity: "not-applicable",
  },
  {
    bundleId: "harbor-trace-distillation",
    contractBasis: "sealed-maintained-contract",
    contractSourceRef: "contract-harbor-trace-distillation",
    lifecycleRole:
      "evidence-cited-trace-distillation-and-development-gating",
    candidateMaterialization: "isolated-candidate-copy",
    selectionAuthority:
      "development-selection-with-separate-promotion-gate",
    repositoryObservationRefs: ["hec-trace-development"],
    causalGain: "not-identifiable",
    metaProductivity: "not-applicable",
  },
  {
    bundleId: "harbor-reflective-pareto-search",
    contractBasis: "sealed-maintained-contract",
    contractSourceRef: "contract-harbor-reflective-pareto-search",
    lifecycleRole:
      "case-level-reflection-pareto-archive-and-development-selection",
    candidateMaterialization: "isolated-candidate-copies",
    selectionAuthority:
      "pareto-development-selection-with-separate-promotion-gate",
    repositoryObservationRefs: ["hec-pareto-development"],
    causalGain: "not-identifiable",
    metaProductivity: "not-applicable",
  },
  {
    bundleId: "harbor-operator-coevolution",
    contractBasis: "sealed-maintained-contract",
    contractSourceRef: "contract-harbor-operator-coevolution",
    lifecycleRole: "parent-child-operator-credit-across-repeated-generations",
    candidateMaterialization: "operator-produced-candidate-lineage",
    selectionAuthority:
      "candidate-and-operator-development-selection-with-separate-promotion-gate",
    repositoryObservationRefs: ["hec-operator-development"],
    causalGain: "not-identifiable",
    metaProductivity: "not-identifiable",
  },
  {
    bundleId: "harbor-evolve-skill",
    contractBasis: "sealed-maintained-contract",
    contractSourceRef: "contract-harbor-evolve-skill",
    lifecycleRole: "integrated-gepa-reflective-pareto-skill-md-evolution",
    candidateMaterialization: "isolated-candidate-bundle",
    selectionAuthority:
      "development-selection-with-separate-promotion-gate",
    repositoryObservationRefs: [],
    causalGain: "not-identifiable",
    metaProductivity: "not-applicable",
  },
  {
    bundleId: "harbor-metaskill-evolution",
    contractBasis: "sealed-new-contract",
    contractSourceRef:
      "protocol:newBundleContracts/harbor-metaskill-evolution",
    lifecycleRole:
      "deterministic-analysis-only-replay-of-hash-chained-five-policy-development-lineage",
    candidateMaterialization: "none",
    selectionAuthority:
      "reports-a-hard-gated-analysis-frontier-without-promotion-authority",
    repositoryObservationRefs: [],
    historicalCompatibilityRefs: [
      "hec-operator-development",
      "knowledge-g006-prospective-protocol",
    ],
    causalGain: "not-identifiable",
    metaProductivity: "not-identifiable",
  },
];

const EXPECTED_OBSERVATIONS = [
  {
    observationId: "hec-baseline-development",
    sourceRef: "harbor-evolution-summary",
    evidenceRole: "development",
    interpretation: "descriptive-repository-observation",
    pointers: ["/baseline_aggregates/development_mean"],
  },
  {
    observationId: "hec-population-development",
    sourceRef: "harbor-evolution-summary",
    evidenceRole: "development",
    interpretation: "descriptive-only-not-causal",
    pointers: [
      "/strategy_aggregates/population_search/candidate_development_mean",
      "/strategy_aggregates/population_search/selected_development_mean",
      "/strategy_aggregates/population_search/selected_development_delta_mean",
      "/strategy_aggregates/population_search/development_improved_subjects",
      "/strategy_aggregates/population_search/development_regressed_subjects",
      "/strategy_aggregates/population_search/development_tied_subjects",
      "/strategy_aggregates/population_search/selected_children",
      "/strategy_aggregates/population_search/candidate_development_usage/jobs",
      "/strategy_aggregates/population_search/candidate_development_usage/trials",
      "/strategy_aggregates/population_search/candidate_development_usage/cost_usd",
      "/strategy_aggregates/population_search/mean_candidate_bundle_byte_delta",
    ],
  },
  {
    observationId: "hec-trace-development",
    sourceRef: "harbor-evolution-summary",
    evidenceRole: "development",
    interpretation: "descriptive-only-not-causal",
    pointers: [
      "/strategy_aggregates/trace_distillation/candidate_development_mean",
      "/strategy_aggregates/trace_distillation/selected_development_mean",
      "/strategy_aggregates/trace_distillation/selected_development_delta_mean",
      "/strategy_aggregates/trace_distillation/development_improved_subjects",
      "/strategy_aggregates/trace_distillation/development_regressed_subjects",
      "/strategy_aggregates/trace_distillation/development_tied_subjects",
      "/strategy_aggregates/trace_distillation/selected_children",
      "/strategy_aggregates/trace_distillation/candidate_development_usage/jobs",
      "/strategy_aggregates/trace_distillation/candidate_development_usage/trials",
      "/strategy_aggregates/trace_distillation/candidate_development_usage/cost_usd",
      "/strategy_aggregates/trace_distillation/mean_candidate_bundle_byte_delta",
    ],
  },
  {
    observationId: "hec-pareto-development",
    sourceRef: "harbor-evolution-summary",
    evidenceRole: "development",
    interpretation: "descriptive-only-not-causal",
    pointers: [
      "/strategy_aggregates/reflective_pareto_search/candidate_development_mean",
      "/strategy_aggregates/reflective_pareto_search/selected_development_mean",
      "/strategy_aggregates/reflective_pareto_search/selected_development_delta_mean",
      "/strategy_aggregates/reflective_pareto_search/development_improved_subjects",
      "/strategy_aggregates/reflective_pareto_search/development_regressed_subjects",
      "/strategy_aggregates/reflective_pareto_search/development_tied_subjects",
      "/strategy_aggregates/reflective_pareto_search/selected_children",
      "/strategy_aggregates/reflective_pareto_search/candidate_development_usage/jobs",
      "/strategy_aggregates/reflective_pareto_search/candidate_development_usage/trials",
      "/strategy_aggregates/reflective_pareto_search/candidate_development_usage/cost_usd",
      "/strategy_aggregates/reflective_pareto_search/mean_candidate_bundle_byte_delta",
    ],
  },
  {
    observationId: "hec-operator-development",
    sourceRef: "harbor-evolution-summary",
    evidenceRole: "development",
    interpretation:
      "descriptive-child-observation-only-operator-meta-productivity-not-identifiable",
    pointers: [
      "/strategy_aggregates/operator_coevolution/candidate_development_mean",
      "/strategy_aggregates/operator_coevolution/selected_development_mean",
      "/strategy_aggregates/operator_coevolution/selected_development_delta_mean",
      "/strategy_aggregates/operator_coevolution/development_improved_subjects",
      "/strategy_aggregates/operator_coevolution/development_regressed_subjects",
      "/strategy_aggregates/operator_coevolution/development_tied_subjects",
      "/strategy_aggregates/operator_coevolution/selected_children",
      "/strategy_aggregates/operator_coevolution/candidate_development_usage/jobs",
      "/strategy_aggregates/operator_coevolution/candidate_development_usage/trials",
      "/strategy_aggregates/operator_coevolution/candidate_development_usage/cost_usd",
      "/strategy_aggregates/operator_coevolution/mean_candidate_bundle_byte_delta",
    ],
  },
  {
    observationId: "knowledge-q003-exploratory-pilot",
    sourceRef: "knowledge-q003-pilot",
    evidenceRole: "discovery-smoke",
    interpretation: "exploratory-diagnostic-only-not-ranking-or-causal-evidence",
    pointers: [
      "/status",
      "/causalComparisonAllowed",
      "/notStrategyRanking",
      "/evidenceUse",
      "/task/split",
      "/aggregateUsage/candidateTrials",
      "/aggregateUsage/evaluableTrials",
    ],
  },
  {
    observationId: "knowledge-g005-unevaluated-child",
    sourceRef: "knowledge-g005-pareto-state",
    evidenceRole: "development",
    interpretation: "state-only-no-child-performance-estimate",
    pointers: [
      "/promotionDecision",
      "/children/0/status",
      "/children/0/q018Score",
    ],
  },
  {
    observationId: "knowledge-g005-realization-primitives",
    sourceRefs: [
      "knowledge-g005-candidate-lock",
      "knowledge-g005-candidate-manifest",
      "knowledge-g005-operator-realization",
    ],
    evidenceRole: "development",
    interpretation:
      "historical-compatible-realization-primitives-only-not-execution-by-new-bundle",
    pointers: [
      {
        sourceRef: "knowledge-g005-candidate-lock",
        pointer: "/schemaVersion",
      },
      {
        sourceRef: "knowledge-g005-candidate-lock",
        pointer: "/generationId",
      },
      {
        sourceRef: "knowledge-g005-candidate-lock",
        pointer: "/candidate/candidateId",
      },
      {
        sourceRef: "knowledge-g005-candidate-lock",
        pointer: "/candidate/tree/sha256",
      },
      {
        sourceRef: "knowledge-g005-candidate-lock",
        pointer: "/parent/candidateId",
      },
      {
        sourceRef: "knowledge-g005-candidate-lock",
        pointer: "/parent/tree/sha256",
      },
      {
        sourceRef: "knowledge-g005-candidate-lock",
        pointer: "/provenance/candidateManifest/fileSha256",
      },
      {
        sourceRef: "knowledge-g005-candidate-lock",
        pointer: "/provenance/operatorRealization/fileSha256",
      },
      {
        sourceRef: "knowledge-g005-candidate-manifest",
        pointer: "/schemaVersion",
      },
      {
        sourceRef: "knowledge-g005-candidate-manifest",
        pointer: "/candidateId",
      },
      {
        sourceRef: "knowledge-g005-candidate-manifest",
        pointer: "/operatorId",
      },
      {
        sourceRef: "knowledge-g005-candidate-manifest",
        pointer: "/parentCandidateId",
      },
      {
        sourceRef: "knowledge-g005-candidate-manifest",
        pointer: "/skill/treeSha256",
      },
      {
        sourceRef: "knowledge-g005-candidate-manifest",
        pointer: "/verification/modelCalls",
      },
      {
        sourceRef: "knowledge-g005-candidate-manifest",
        pointer: "/verification/harborCalls",
      },
      {
        sourceRef: "knowledge-g005-candidate-manifest",
        pointer: "/verification/promotionStatus",
      },
      {
        sourceRef: "knowledge-g005-operator-realization",
        pointer: "/schemaVersion",
      },
      {
        sourceRef: "knowledge-g005-operator-realization",
        pointer: "/candidateId",
      },
      {
        sourceRef: "knowledge-g005-operator-realization",
        pointer: "/operatorId",
      },
      {
        sourceRef: "knowledge-g005-operator-realization",
        pointer: "/parentCandidateId",
      },
      {
        sourceRef: "knowledge-g005-operator-realization",
        pointer: "/candidateTreeSha256",
      },
      {
        sourceRef: "knowledge-g005-operator-realization",
        pointer: "/promotion/status",
      },
      {
        sourceRef: "knowledge-g005-operator-realization",
        pointer: "/promotion/developmentValidationRequired",
      },
    ],
  },
  {
    observationId: "knowledge-g006-prospective-protocol",
    sourceRef: "knowledge-g006-protocol",
    evidenceRole: "prospective-development-contract",
    interpretation: "prospective-contract-not-result-evidence",
    pointers: [
      "/executionAuthorization/protocolAloneAuthorizesLiveCalls",
      "/executionAuthorization/runtimeMaterializedAtProtocolSeal",
      "/executionAuthorization/harborOrModelCallsAtProtocolSeal",
    ],
  },
];

const EXPECTED_CONCLUSIONS = [
  {
    conclusionId: "realizer-historical-compatibility",
    question:
      "Do tracked prior studies contain primitives compatible with harbor-realize-skill-candidate?",
    disposition: "compatible-primitives-only",
    reason:
      "Generation 005 tracks mutually bound candidate-lock, candidate-manifest, and operator-realization artifacts, but those ad hoc historical primitives cannot retroactively prove execution by the new realizer contract.",
  },
  {
    conclusionId: "realizer-causal-gain",
    question:
      "Does harbor-realize-skill-candidate improve object-level skill quality?",
    disposition: "not-identifiable",
    reason:
      "No tracked repository execution binds the sealed realizer contract to a candidate, comparable parent, and development result.",
  },
  {
    conclusionId: "metaskill-causal-gain",
    question:
      "Does harbor-metaskill-evolution improve object-level skill quality causally?",
    disposition: "not-identifiable",
    reason:
      "No tracked repository execution exists for the sealed contract; the compatible one-generation operator observation is descriptive and generation 006 is prospective only.",
  },
  {
    conclusionId: "metaskill-meta-productivity",
    question: "What is harbor-metaskill-evolution meta-productivity?",
    disposition: "not-identifiable",
    reason:
      "Tracked evidence lacks repeated attributable metaskill generations and a predeclared gain-per-resource measure.",
  },
  {
    conclusionId: "operator-meta-productivity",
    question:
      "Did the historical operator-coevolution observation establish operator meta-productivity?",
    disposition: "not-identifiable",
    reason:
      "The historical fairness budget supplied one applied operator per subject, so the tracked analyzer correctly treated coevolution as underidentified.",
  },
];

const EXPECTED_FUTURE_REQUIREMENTS = [
  "seal-each-new-skill-contract-and-all-composed-bundle-digests-before-authorship-or-evaluation",
  "predeclare-object-level-quality-and-meta-productivity-metrics",
  "bind-parent-operator-realizer-candidate-task-profile-and-result-lineage",
  "use-repeated-attributable-generations-with-comparable-development-cohorts",
  "account-for-candidate-authoring-harbor-model-token-cost-and-wall-clock-resources",
  "keep-harbor-built-in-retries-at-zero-and-preserve-first-evaluable-semantics",
  "keep-promotion-evidence-untouched-until-development-selection-is-frozen",
  "publish-null-or-not-identifiable-when-evidence-is-unavailable-or-underidentified",
];

const CONTRACT_ROW_FIELDS = [
  "bundleId",
  "contractBasis",
  "contractSourceRef",
  "lifecycleRole",
  "candidateMaterialization",
  "selectionAuthority",
  "repositoryObservationRefs",
  "historicalCompatibilityRefs",
  "causalGain",
  "metaProductivity",
];

const EXPECTED_LIFECYCLE_ROLES = new Set(
  EXPECTED_CONTRACT_ROWS.map((row) => row.lifecycleRole),
);

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const historicalFileHashCache = new Map();

function gitHistoryContainsFileHash(repositoryPath, expectedSha256) {
  const cacheKey = `${repositoryPath}\0${expectedSha256}`;
  if (historicalFileHashCache.has(cacheKey)) {
    return historicalFileHashCache.get(cacheKey);
  }

  const history = spawnSync(
    "git",
    ["log", "--all", "--format=%H", "--", repositoryPath],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (history.status !== 0) {
    historicalFileHashCache.set(cacheKey, false);
    return false;
  }

  for (const revision of history.stdout.split(/\r?\n/).filter(Boolean)) {
    const historical = spawnSync(
      "git",
      ["show", `${revision}:${repositoryPath}`],
      {
        cwd: repositoryRoot,
        encoding: null,
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    if (
      historical.status === 0 &&
      createHash("sha256").update(historical.stdout).digest("hex") ===
        expectedSha256
    ) {
      historicalFileHashCache.set(cacheKey, true);
      return true;
    }
  }

  historicalFileHashCache.set(cacheKey, false);
  return false;
}

function containedBy(root, candidate) {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath))
  );
}

export function secureResolveWithinRoot(root, repositoryPath) {
  if (
    typeof repositoryPath !== "string" ||
    repositoryPath.length === 0 ||
    repositoryPath.includes("\\") ||
    repositoryPath.startsWith("/") ||
    /^[A-Za-z]:/.test(repositoryPath) ||
    repositoryPath.includes("\0")
  ) {
    throw new Error(`invalid repository-relative path: ${repositoryPath}`);
  }

  const components = repositoryPath.split("/");
  if (
    components.some(
      (component) =>
        component.length === 0 ||
        component === "." ||
        component === ".." ||
        component.includes(":"),
    )
  ) {
    throw new Error(`invalid repository-relative path: ${repositoryPath}`);
  }

  const realRoot = realpathSync.native(resolve(root));
  let current = realRoot;
  for (const component of components) {
    const next = resolve(current, component);
    const stat = lstatSync(next);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `links, junctions, and reparse-point ancestors are forbidden: ${repositoryPath}`,
      );
    }
    const realNext = realpathSync.native(next);
    if (!containedBy(realRoot, realNext)) {
      throw new Error(`resolved path escapes repository root: ${repositoryPath}`);
    }
    current = realNext;
  }
  return current;
}

function resolveRepositoryPath(repositoryPath) {
  return secureResolveWithinRoot(repositoryRoot, repositoryPath);
}

function getJsonPointer(document, pointer) {
  if (pointer === "") return document;
  if (typeof pointer !== "string" || !pointer.startsWith("/")) {
    throw new Error(`invalid JSON pointer: ${pointer}`);
  }

  return pointer
    .slice(1)
    .split("/")
    .map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, part) => {
      if (value === null || value === undefined || !(part in Object(value))) {
        throw new Error(`JSON pointer does not exist: ${pointer}`);
      }
      return value[part];
    }, document);
}

function forbiddenBoundaryToken(text) {
  const lower = String(text).toLowerCase();
  return (
    lower.includes("holdout") ||
    /(^|[\/_-])hard([\/_.-]|$)/.test(lower)
  );
}

export function findForbiddenSelectedBoundary(value, path = "$") {
  if (typeof value === "string" && forbiddenBoundaryToken(value)) {
    return `${path} contains forbidden boundary text`;
  }
  if (value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenSelectedBoundary(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (forbiddenBoundaryToken(key)) {
      return `${path}.${key} is a forbidden boundary key`;
    }
    const found = findForbiddenSelectedBoundary(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function listTreeFiles(root) {
  const files = [];
  const realRoot = realpathSync.native(root);

  function visit(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const entryPath = resolve(path, entry.name);
      const stat = lstatSync(entryPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`links and junctions are forbidden: ${entryPath}`);
      }
      const realEntryPath = realpathSync.native(entryPath);
      if (!containedBy(realRoot, realEntryPath)) {
        throw new Error(`tree entry escapes bundle root: ${entryPath}`);
      }
      if (stat.isDirectory()) {
        visit(realEntryPath);
      } else if (stat.isFile()) {
        files.push(realEntryPath);
      } else {
        throw new Error(`unsupported tree entry: ${entryPath}`);
      }
    }
  }

  visit(realRoot);
  files.sort((left, right) =>
    Buffer.compare(
      Buffer.from(relative(realRoot, left).split(sep).join("/"), "utf8"),
      Buffer.from(relative(realRoot, right).split(sep).join("/"), "utf8"),
    ),
  );
  return { files, realRoot };
}

function sha256Tree(root) {
  const hash = createHash("sha256");
  let totalBytes = 0;
  const { files, realRoot } = listTreeFiles(root);
  for (const path of files) {
    const relativePath = relative(realRoot, path).split(sep).join("/");
    const bytes = readFileSync(path);
    hash.update(Buffer.from(relativePath, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(bytes);
    hash.update(Buffer.from([0]));
    totalBytes += bytes.length;
  }
  return { fileCount: files.length, totalBytes, treeSha256: hash.digest("hex") };
}

function isTracked(path) {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", path], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  return result.status === 0;
}

function frontmatterName(skillPath) {
  const text = readFileSync(resolve(skillPath, "SKILL.md"), "utf8");
  const match = /^---\s*\r?\n[\s\S]*?^name:\s*([^\r\n]+)$/m.exec(text);
  return match ? match[1].trim() : null;
}

function project(object, fields) {
  return Object.fromEntries(fields.map((field) => [field, object?.[field]]));
}

function describeSelectedValue(value) {
  if (value !== null && typeof value === "object") {
    return Array.isArray(value) ? "<array redacted>" : "<object redacted>";
  }
  return JSON.stringify(value);
}

function exactArrayIds(actual, expected, field, label, issues) {
  const actualIds = Array.isArray(actual) ? actual.map((entry) => entry?.[field]) : null;
  const expectedIds = expected.map((entry) => entry[field]);
  if (!isDeepStrictEqual(actualIds, expectedIds)) {
    issues.push(`${label} IDs or order differ from the frozen contract`);
  }
}

export function computeStudyLockBinding(lock) {
  const hash = createHash("sha256");
  const values = [
    lock.schemaVersion,
    lock.studyId,
    lock.algorithm,
    lock.bindingAlgorithm,
  ];
  for (const file of lock.files ?? []) {
    values.push(file.role, file.path, file.sha256);
  }
  for (const value of values) {
    hash.update(Buffer.from(String(value), "utf8"));
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

function verifyStudyLock(issues) {
  let lock;
  try {
    lock = readJson(resolveRepositoryPath(LOCK_REPOSITORY_PATH));
  } catch (error) {
    issues.push(`cannot read deterministic study lock: ${error.message}`);
    return;
  }

  const expectedFiles = [
    { role: "protocol", path: PROTOCOL_REPOSITORY_PATH },
    { role: "evidence-ledger", path: RESULT_REPOSITORY_PATH },
  ];
  if (
    !isDeepStrictEqual(Object.keys(lock).sort(), [
      "algorithm",
      "bindingAlgorithm",
      "bindingSha256",
      "files",
      "schemaVersion",
      "studyId",
    ])
  ) {
    issues.push("study lock object shape differs from the frozen lock contract");
  }
  if (
    lock.schemaVersion !== 1 ||
    lock.studyId !== STUDY_ID ||
    lock.algorithm !== LOCK_FILE_ALGORITHM ||
    lock.bindingAlgorithm !== LOCK_BINDING_ALGORITHM
  ) {
    issues.push("study lock metadata differs from the frozen lock contract");
  }
  if (
    !isDeepStrictEqual(
      (lock.files ?? []).map(({ role, path }) => ({ role, path })),
      expectedFiles,
    )
  ) {
    issues.push("study lock file roles, paths, or order differ from the frozen contract");
  }

  for (const expected of expectedFiles) {
    const file = (lock.files ?? []).find((entry) => entry.role === expected.role);
    if (!file) continue;
    if (
      !isDeepStrictEqual(Object.keys(file).sort(), ["path", "role", "sha256"]) ||
      !/^[0-9a-f]{64}$/.test(String(file.sha256))
    ) {
      issues.push(`study lock entry is malformed: ${expected.role}`);
      continue;
    }
    try {
      const actualHash = sha256File(resolveRepositoryPath(expected.path));
      if (actualHash !== file.sha256) {
        issues.push(
          `study lock SHA-256 mismatch for ${expected.path}: expected ${file.sha256}, got ${actualHash}`,
        );
      }
    } catch (error) {
      issues.push(`cannot verify study lock path ${expected.path}: ${error.message}`);
    }
  }

  if (!/^[0-9a-f]{64}$/.test(String(lock.bindingSha256))) {
    issues.push("study lock bindingSha256 is not a lowercase SHA-256 digest");
  }
  if (computeStudyLockBinding(lock) !== lock.bindingSha256) {
    issues.push("study lock bindingSha256 does not bind its protocol and ledger hashes");
  }
}

function validateProtocol(protocol, issues) {
  if (
    protocol.schemaVersion !== 1 ||
    protocol.studyId !== STUDY_ID ||
    protocol.kind !== "append-only-contract-and-tracked-evidence-snapshot" ||
    protocol.status !== STUDY_STATUS ||
    protocol.sealedAt !== "2026-07-20T00:00:00Z" ||
    protocol.purpose !==
      "Compare the lifecycle role and available tracked evidence for two new digest-sealed Harbor skills against the maintained Harbor skill portfolio without generating candidates or opening evaluation data." ||
    protocol.resultPath !== RESULT_REPOSITORY_PATH ||
    protocol.studyLockPath !== LOCK_REPOSITORY_PATH
  ) {
    issues.push("protocol identity, status, result path, or lock path differs from the frozen contract");
  }
  if (!isDeepStrictEqual(protocol.comparisonSet, EXPECTED_COMPARISON_SET)) {
    issues.push("protocol comparisonSet must contain the exact fixed nine bundle IDs");
  }
  if (!isDeepStrictEqual(protocol.evidenceBoundary, EXPECTED_EVIDENCE_BOUNDARY)) {
    issues.push("protocol evidenceBoundary differs from the frozen boundary constants");
  }
  if (!isDeepStrictEqual(protocol.repositoryReplay, EXPECTED_PROTOCOL_REPLAY)) {
    issues.push("protocol repository replay must remain not-run with zero calls");
  }
  if (!isDeepStrictEqual(protocol.paperContext, EXPECTED_PAPER_CONTEXT)) {
    issues.push("protocol paper context differs or imports paper figures");
  }
  if (!isDeepStrictEqual(protocol.treeDigestContract, EXPECTED_TREE_DIGEST_CONTRACT)) {
    issues.push("protocol tree digest contract differs from sha256-tree-v1");
  }
  if (
    !isDeepStrictEqual(
      protocol.identifiabilityPolicy,
      EXPECTED_IDENTIFIABILITY_POLICY,
    )
  ) {
    issues.push("protocol identifiability policy differs from the frozen no-imputation contract");
  }
  if (!isDeepStrictEqual(protocol.appendOnlyPolicy, EXPECTED_APPEND_ONLY_POLICY)) {
    issues.push("protocol append-only policy differs from the frozen contract");
  }
  if (!isDeepStrictEqual(protocol.validation, EXPECTED_VALIDATION)) {
    issues.push("protocol validation commands differ from the frozen contract");
  }

  exactArrayIds(
    protocol.newBundleContracts,
    EXPECTED_NEW_BUNDLES,
    "bundleId",
    "new bundle contracts",
    issues,
  );
  for (const expected of EXPECTED_NEW_BUNDLES) {
    const contract = (protocol.newBundleContracts ?? []).find(
      (entry) => entry.bundleId === expected.bundleId,
    );
    if (!contract) continue;
    if (!isDeepStrictEqual(contract, expected)) {
      issues.push(`sealed new bundle contract differs from the frozen seal: ${expected.bundleId}`);
    }
  }
}

function validateSources(ledger, issues) {
  exactArrayIds(ledger.sources, EXPECTED_SOURCES, "sourceId", "source inventory", issues);
  const sourceById = new Map(
    (ledger.sources ?? []).map((source) => [source.sourceId, source]),
  );

  for (const expected of EXPECTED_SOURCES) {
    const source = sourceById.get(expected.sourceId);
    if (!source) continue;
    if (!isDeepStrictEqual(source, expected)) {
      issues.push(
        `source ref/path/class/hash differs from the frozen contract: ${expected.sourceId}`,
      );
    }

    if (forbiddenBoundaryToken(source.path) || source.path.startsWith(".tmp/")) {
      issues.push(`forbidden evidence source path: ${source.path}`);
      continue;
    }

    let absolutePath;
    try {
      absolutePath = resolveRepositoryPath(source.path);
    } catch (error) {
      issues.push(`${source.sourceId}: ${error.message}`);
      continue;
    }
    if (!isTracked(source.path)) {
      issues.push(`source is not tracked by git: ${source.path}`);
    }
    const actualHash = sha256File(absolutePath);
    const historicalSkillContractAvailable =
      expected.class === "tracked-skill-contract" &&
      gitHistoryContainsFileHash(expected.path, expected.sha256);
    if (actualHash !== expected.sha256 && !historicalSkillContractAvailable) {
      issues.push(
        `historical source bytes unavailable for ${source.path}: expected ${expected.sha256}, got ${actualHash}`,
      );
    }
  }
  return sourceById;
}

function validateObservations(ledger, protocol, sourceById, issues) {
  exactArrayIds(
    ledger.repositoryObservations,
    EXPECTED_OBSERVATIONS,
    "observationId",
    "repository observations",
    issues,
  );
  const allowedRoles = new Set(
    EXPECTED_EVIDENCE_BOUNDARY.allowedRepositoryEvidenceRoles,
  );

  for (const expected of EXPECTED_OBSERVATIONS) {
    const observation = (ledger.repositoryObservations ?? []).find(
      (entry) => entry.observationId === expected.observationId,
    );
    if (!observation) continue;

    for (const field of [
      "sourceRef",
      "sourceRefs",
      "evidenceRole",
      "interpretation",
    ]) {
      if (!isDeepStrictEqual(observation[field], expected[field])) {
        issues.push(
          `observation ${expected.observationId} has a non-frozen ${field}`,
        );
      }
    }
    if (!allowedRoles.has(observation.evidenceRole)) {
      issues.push(
        `forbidden evidence role on ${expected.observationId}: ${observation.evidenceRole}`,
      );
    }

    const selectors = Array.isArray(observation.selectors)
      ? observation.selectors
      : [];
    const selectorIdentities = selectors.map((selector) =>
      selector?.sourceRef
        ? `${selector.sourceRef}#${selector.pointer}`
        : selector?.pointer,
    );
    const expectedSelectorIdentities = expected.pointers.map((pointer) =>
      typeof pointer === "string"
        ? pointer
        : `${pointer.sourceRef}#${pointer.pointer}`,
    );
    if (!isDeepStrictEqual(selectorIdentities, expectedSelectorIdentities)) {
      issues.push(
        `observation ${expected.observationId} selectors differ from the exact development-only pointer set`,
      );
    }

    const declaredSourceRefs = expected.sourceRefs ?? [expected.sourceRef];
    for (const sourceRef of declaredSourceRefs) {
      const source = sourceById.get(sourceRef);
      if (!source || !source.path.endsWith(".json")) {
        issues.push(`machine observation source is unavailable or not JSON: ${sourceRef}`);
      }
    }

    const documentBySourceRef = new Map();

    for (let index = 0; index < selectors.length; index += 1) {
      const selector = selectors[index];
      const expectedPointer = expected.pointers[index];
      const selectorUsesExplicitSource =
        expectedPointer !== undefined && typeof expectedPointer !== "string";
      const expectedSelectorKeys = selectorUsesExplicitSource
        ? ["expected", "pointer", "sourceRef"]
        : ["expected", "pointer"];
      if (
        !isDeepStrictEqual(
          Object.keys(selector ?? {}).sort(),
          expectedSelectorKeys,
        )
      ) {
        issues.push(
          `selector shape differs on ${expected.observationId}: ${selector?.pointer}`,
        );
      }
      if (forbiddenBoundaryToken(selector?.pointer)) {
        issues.push(
          `forbidden evidence selector on ${expected.observationId}: ${selector?.pointer}`,
        );
        continue;
      }

      const sourceRef = selector?.sourceRef ?? expected.sourceRef;
      if (!declaredSourceRefs.includes(sourceRef)) {
        issues.push(
          `selector on ${expected.observationId} uses undeclared sourceRef: ${sourceRef}`,
        );
        continue;
      }
      const source = sourceById.get(sourceRef);
      if (!source || !source.path.endsWith(".json")) continue;

      let document = documentBySourceRef.get(sourceRef);
      if (!document) {
        try {
          document = readJson(resolveRepositoryPath(source.path));
          documentBySourceRef.set(sourceRef, document);
        } catch (error) {
          issues.push(`cannot parse observation source ${source.path}: ${error.message}`);
          continue;
        }
      }
      try {
        const actual = getJsonPointer(document, selector?.pointer);
        const forbidden = findForbiddenSelectedBoundary(actual);
        if (forbidden) {
          issues.push(
            `selected value exposes forbidden nested evidence on ${expected.observationId}${selector.pointer}: ${forbidden}`,
          );
        }
        if (!isDeepStrictEqual(actual, selector?.expected)) {
          issues.push(
            `selector mismatch ${source.path}${selector?.pointer}: expected ${describeSelectedValue(selector?.expected)}, got ${describeSelectedValue(actual)}`,
          );
        }
      } catch (error) {
        issues.push(`${source.path}: ${error.message}`);
      }
    }
  }

  if (!isDeepStrictEqual(protocol.evidenceBoundary, EXPECTED_EVIDENCE_BOUNDARY)) {
    issues.push("observation validation refused a mutated protocol evidence boundary");
  }
}

function validateContractRows(ledger, protocol, issues) {
  exactArrayIds(
    ledger.contractComparison,
    EXPECTED_CONTRACT_ROWS,
    "bundleId",
    "contract comparison",
    issues,
  );

  const observationIds = new Set(
    (ledger.repositoryObservations ?? []).map((entry) => entry.observationId),
  );
  for (const expected of EXPECTED_CONTRACT_ROWS) {
    const row = (ledger.contractComparison ?? []).find(
      (entry) => entry.bundleId === expected.bundleId,
    );
    if (!row) continue;

    const expectedProjection = project(expected, CONTRACT_ROW_FIELDS);
    const actualProjection = project(row, CONTRACT_ROW_FIELDS);
    if (!isDeepStrictEqual(actualProjection, expectedProjection)) {
      for (const field of CONTRACT_ROW_FIELDS) {
        if (!isDeepStrictEqual(actualProjection[field], expectedProjection[field])) {
          issues.push(
            `contract row ${expected.bundleId} has a non-frozen ${field}`,
          );
        }
      }
    }
    if (!EXPECTED_LIFECYCLE_ROLES.has(row.lifecycleRole)) {
      issues.push(`contract row has an unknown lifecycle role: ${expected.bundleId}`);
    }
    for (const field of [
      "repositoryObservationRefs",
      "historicalCompatibilityRefs",
    ]) {
      for (const observationRef of row[field] ?? []) {
        if (!observationIds.has(observationRef)) {
          issues.push(
            `contract row ${expected.bundleId} has an unknown ${field}: ${observationRef}`,
          );
        }
      }
    }
    const performanceRefs = new Set(row.repositoryObservationRefs ?? []);
    for (const compatibilityRef of row.historicalCompatibilityRefs ?? []) {
      if (performanceRefs.has(compatibilityRef)) {
        issues.push(
          `contract row ${expected.bundleId} conflates compatibility with performance evidence: ${compatibilityRef}`,
        );
      }
    }
  }
}

function validateNewBundleSeals(protocol, ledger, issues) {
  const rowById = new Map(
    (ledger.contractComparison ?? []).map((row) => [row.bundleId, row]),
  );
  for (const expected of EXPECTED_NEW_BUNDLES) {
    const contract = (protocol.newBundleContracts ?? []).find(
      (entry) => entry.bundleId === expected.bundleId,
    );
    if (!contract) continue;
    const row = rowById.get(expected.bundleId);

    let bundlePath;
    try {
      bundlePath = resolveRepositoryPath(expected.path);
      resolveRepositoryPath(`${expected.path}/SKILL.md`);
    } catch (error) {
      issues.push(`${expected.bundleId}: ${error.message}`);
      continue;
    }
    const name = frontmatterName(bundlePath);
    if (name !== expected.bundleId) {
      issues.push(`new bundle frontmatter name mismatch: ${expected.bundleId} != ${name}`);
    }

    let digest;
    try {
      digest = sha256Tree(bundlePath);
    } catch (error) {
      issues.push(`${expected.bundleId}: ${error.message}`);
      continue;
    }

    if (contract.status === "sealed") {
      if (contract.treeSha256 !== digest.treeSha256) {
        issues.push(
          `new bundle tree mismatch ${expected.bundleId}: expected ${contract.treeSha256}, got ${digest.treeSha256}`,
        );
      }
      if (row?.contractBasis !== "sealed-new-contract") {
        issues.push(`sealed bundle must use sealed-new-contract contractBasis: ${expected.bundleId}`);
      }
      if (
        contract.fileCount !== digest.fileCount ||
        contract.totalBytes !== digest.totalBytes
      ) {
        issues.push(
          `new bundle tree statistics mismatch ${expected.bundleId}: expected ${contract.fileCount} files/${contract.totalBytes} bytes, got ${digest.fileCount} files/${digest.totalBytes} bytes`,
        );
      }
    } else {
      issues.push(`invalid new bundle seal status: ${expected.bundleId}/${contract.status}`);
    }
  }
}

function validateLedger(ledger, protocol, issues) {
  if (
    ledger.schemaVersion !== 1 ||
    ledger.studyId !== STUDY_ID ||
    ledger.resultId !== RESULT_ID ||
    ledger.status !== STUDY_STATUS ||
    ledger.evidenceUse !==
      "contract-comparison-and-descriptive-development-only"
  ) {
    issues.push("ledger identity, status, or evidence use differs from the frozen contract");
  }
  if (!isDeepStrictEqual(ledger.repositoryReplay, EXPECTED_LEDGER_REPLAY)) {
    issues.push("ledger repository replay must remain not-run with zero calls");
  }
  if (
    !isDeepStrictEqual(ledger.paperReportedEvidence, {
      use: "design-context-only",
      numericFiguresImported: [],
      repositoryReplayClaims: [],
    })
  ) {
    issues.push("paper-reported evidence differs or contains numeric/replay claims");
  }
  if (!isDeepStrictEqual(ledger.conclusions, EXPECTED_CONCLUSIONS)) {
    issues.push("ledger conclusions differ from the exact required not-identifiable set");
  }
  if (
    !isDeepStrictEqual(
      ledger.futureEvaluationRequirements,
      EXPECTED_FUTURE_REQUIREMENTS,
    )
  ) {
    issues.push("ledger futureEvaluationRequirements differ from the exact required set");
  }

  const sourceById = validateSources(ledger, issues);
  validateObservations(ledger, protocol, sourceById, issues);
  validateContractRows(ledger, protocol, issues);
  validateNewBundleSeals(protocol, ledger, issues);
}

export function verifyStudy({ protocol: protocolOverride, ledger: ledgerOverride } = {}) {
  const issues = [];
  verifyStudyLock(issues);

  const protocol =
    protocolOverride ?? readJson(resolveRepositoryPath(PROTOCOL_REPOSITORY_PATH));
  const ledger =
    ledgerOverride ?? readJson(resolveRepositoryPath(RESULT_REPOSITORY_PATH));

  validateProtocol(protocol, issues);
  validateLedger(ledger, protocol, issues);
  return { issues, protocol };
}

function printNewSkillDigests(protocol) {
  for (const expected of EXPECTED_NEW_BUNDLES) {
    const contract = protocol.newBundleContracts.find(
      (entry) => entry.bundleId === expected.bundleId,
    );
    const bundlePath = resolveRepositoryPath(expected.path);
    const digest = sha256Tree(bundlePath);
    process.stdout.write(
      `${JSON.stringify({
        bundleId: expected.bundleId,
        path: expected.path,
        digestAlgorithm: contract.digestAlgorithm,
        ...digest,
      })}\n`,
    );
  }
}

function main() {
  const argumentsSet = new Set(process.argv.slice(2));
  const allowedArguments = new Set(["--print-new-skill-digests"]);
  for (const argument of argumentsSet) {
    if (!allowedArguments.has(argument)) {
      process.stderr.write(`Unknown argument: ${argument}\n`);
      process.exit(2);
    }
  }

  let verification;
  try {
    verification = verifyStudy();
  } catch (error) {
    process.stderr.write(`FAIL: ${error.stack ?? error.message}\n`);
    process.exit(1);
  }

  if (verification.issues.length > 0) {
    process.stderr.write("FAIL: harbor-next-skill-comparison validation failed\n");
    for (const issue of verification.issues) {
      process.stderr.write(`- ${issue}\n`);
    }
    process.exit(1);
  }

  const sealedCount = verification.protocol.newBundleContracts.filter(
    (contract) => contract.status === "sealed",
  ).length;
  const unsealedCount = verification.protocol.newBundleContracts.length - sealedCount;
  process.stdout.write(
    `PASS: harbor-next-skill-comparison validated (${sealedCount} sealed new contracts, ${unsealedCount} unsealed)\n`,
  );

  if (argumentsSet.has("--print-new-skill-digests")) {
    printNewSkillDigests(verification.protocol);
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]).toLowerCase() ===
    fileURLToPath(import.meta.url).toLowerCase()
) {
  main();
}
