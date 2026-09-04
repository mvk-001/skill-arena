# Study Design and Leakage Review

Read this before registering a new study. This procedure prepares the evidence
and execution boundaries; native Harbor owners still run jobs, interpret metrics,
select candidates, and make acceptance decisions. It applies to skill evolution
and to model-training studies represented by compatible native Harbor owners.
It does not add a training backend or promise the globally best skill.

## Contents

- [Declare the claim and portfolio](#declare-the-claim-and-portfolio)
- [Choose a methodology using public development](#choose-a-methodology-using-public-development)
- [Review task independence and shortcuts](#review-task-independence-and-shortcuts)
- [Keep private verification independent](#keep-private-verification-independent)
- [Seal the preparation evidence](#seal-the-preparation-evidence)
- [Execute and interpret the complete gate](#execute-and-interpret-the-complete-gate)
- [Research basis and limits](#research-basis-and-limits)

## Declare the Claim and Portfolio

Before seeing candidate results, write a private protocol with the target task
population, capability coverage, baseline identity, competing methods, native
owner for each stage, primary metric, resource budget, stopping and selection
rules, and independent acceptance rule. Record model revision, tool/environment
versions, attempts, seeds or replicate schedule, and Harbor built-in retries of
zero. For a remote model, bind a revision manifest and state any limits on
reproducing that service; a mutable model alias is not an immutable checkpoint.

Create a dataset matrix in that protocol. Each row specifies an immutable
dataset ID and source revision, split and optimizer access, purpose, population
or shift, independent grouping unit, metric/report owner, weight, repetitions,
and acceptance role. Keep weights and cross-dataset aggregation with the native
report owner. Do not average incomparable reward scales in the organizer.

| Role | Split | Optimizer access | Example portfolio |
| --- | --- | --- | --- |
| Smoke and diagnosis | `discovery` | Public/visible | Separate tool and environment smoke cohorts |
| Training, method comparison, and candidate selection | `development` | Public/visible | Several domain cohorts, training cohorts, grouped selection folds, and robustness suites |
| Independent progress verification | `validation` | Private/sealed | Several unseen cohorts testing target-distribution performance and transfer |
| Optional final confirmation | `holdout` | Private/sealed | Further untouched cohorts for the same frozen candidate |

The split determines permitted use, not the dataset count. Register every
disjoint cohort once and repeat its `--dataset-id` when stages reuse it. Do not
register overlapping training-fold unions as new datasets: register disjoint
fold roots and let the owning runner bind the appropriate fold IDs. Repeated
use within development is legitimate optimization evidence, not new independent
verification. If an owner cannot handle several datasets in one job, plan
separate native jobs and their combined decision before execution.

"Public" here means available to optimization, not necessarily available on the
Internet or publishable in Git. Conversely, an Internet benchmark kept out of
the current prompt is not proven absent from model pretraining. Record known
exposure, source dates, licensing, provenance, and uncertainty. Use fresh,
independently curated cases for claims requiring unseen tasks. Include both
matched-population verification and deliberately declared transfer tests when
the deployment claim needs them; report the two claims separately.

## Choose a Methodology Using Public Development

1. Establish the unchanged baseline and a reproducible native run configuration.
   Use public smoke tasks to check infrastructure, valid outputs, and failure
   classification before committing an expensive study.
2. Declare the methods worth comparing for the evidence available: direct
   candidate search for few alternatives, trace-based refinement when usable
   failure traces exist, or population/Pareto/operator approaches when diversity
   or heterogeneous capabilities justify the cost. These are planning criteria,
   not a universal ranking of the evolution skills.
3. Compare methods using only public development evidence with matched cohorts,
   task exposure, model/tool configurations, and a common total budget that
   counts discovery, mutations, failed calls, and selection. Record unavoidable
   resource differences; do not claim a method effect when budgets differ.
4. Where data support it, let the native owner use grouped inner folds or
   repeated development runs to examine stability. Everything used to choose
   prompts, training hyperparameters, methods, stopping points, or candidates
   remains development, even if a library calls it "validation". Fit learned
   preprocessing and data-derived choices only on the relevant training folds.
5. Select the method and exactly one candidate by the predeclared public rule.
   Freeze that artifact before any private result is available. Multiple private
   datasets test that same choice jointly; they are not a menu from which to
   choose a flattering result or a different winner.

Plan evolution stages before their downstream validation stages. Later
development bookkeeping may be appended within the frozen protocol, but a new
evolution branch still needs a preplanned downstream validation gate. A changed
methodology, expanded budget, or different acceptance claim needs a new protocol
and study, not a retrospective rewrite.

## Review Task Independence and Shortcuts

Have the dataset curator perform these checks before sealing. Keep the
curator's private cases and detailed findings out of the optimizer's context.
The organizer receives digest-bound receipts, not permission to inspect sealed
prompts. Use the dataset authoring skill when available; equivalent native task
roots and review evidence are sufficient when this bundle is copied alone.

1. **Group before splitting.** Assign stable opaque group IDs to shared source
   records, repositories, entities, prompt templates, generators, reference
   solutions, fixture families, and variant parents. Include every credible
   source of dependence; do not mint a new family just because prose or a file
   name changed. Keep connected families in one registered dataset. Capability
   labels such as "summarization" may span datasets; solution-bearing family IDs
   may not. Use time- or source-separated cohorts when the claim requires them.
2. **Audit beyond exact duplicates.** Review normalized prompt similarity,
   paraphrases, renamed files, shared reference answers, and common source or
   generator ancestry. Remove duplicates or keep related variants in one
   family. Choose similarity rules using public data or curator methodology
   before results exist. A hash check cannot detect semantic clones; embeddings
   or string similarity also need review and have false positives and negatives.
3. **Inventory nuisance surfaces.** Review output basenames, directory paths,
   extensions when format is not fixed, entity names, numerical constants,
   question openings, clause order, prompt length, formatting, answer order,
   and repeated interaction sequences. Check their realized distribution by
   capability, difficulty, outcome class, and split. A different seed alone
   does not show that cues are balanced or independent of the answer.
4. **Vary incidental cues without hiding requirements.** If a task legitimately
   requires a path or format, state it clearly and have the verifier use that
   task's declared requirement. Across suitable cases, vary realistic basenames
   and paths so a skill cannot pass by always writing `report.json`. A valid
   instruction should teach following the requested path, not memorizing a
   benchmark name. Preserve required formats and semantics; avoid arbitrary
   strings or misleading distractors that introduce irrelevant difficulty.
5. **Break question-pattern shortcuts.** Balance realistic phrasing, request
   order, and interaction shapes independently of answers and split roles.
   Use new semantic families in private data rather than paraphrasing public
   solutions. Do not give private prompts a distinctive prefix, filename range,
   directory layout, or "hidden test" label. Broad presentation distributions
   should be comparable across splits; exact solution-bearing templates remain
   grouped. A question-only or metadata-only probe can flag predictable answers
   when appropriate, but absence of such a signal does not prove independence.
6. **Exercise counterfactuals and verifiers.** On curator fixtures, change only
   an irrelevant name or presentation cue and confirm the intended requirement
   and valid solution still agree. Also change a meaningful requirement and
   confirm stale hard-coded outputs fail. Check that empty files, filename-only
   stubs, copied sample answers, and reward-file manipulation cannot pass, while
   legitimate alternative solutions do. Record actual test artifacts. Keep
   variants in one family and count independent groups, not variants, for power.
7. **Close the exposure path.** Verify the optimizer cannot read private source
   mounts, solution files, verifier inputs, private logs, retrieval indexes,
   caches, shared transcripts, or dataset-generation seeds. An evaluator may
   deliver the current private task to the frozen candidate at execution time;
   the candidate must not receive hidden answers, sibling tasks, or a channel
   back to training. Reset task sessions and isolate private evaluation outputs.

Document each finding, disposition, evidence path, and remaining limitation in
the curator's private review bundle. Repair failed checks before registration or
create a new study if locked data need to change. Do not silently relabel a
failure as a pass. A supported, explained "not applicable" rationale belongs in
the review evidence only where the corresponding failure mode cannot occur;
the overall check must still pass.

## Keep Private Verification Independent

Reserve private data for verifying progress against the sealed baseline, never
for training, mutation, method choice, early stopping, ranking, or reselection.
This prohibition includes scalar rewards, aggregates, error labels, and a single
"advance/no advance" signal. Repeatedly tuning in response to that signal turns
the private set into development data even if its questions remain hidden.

Use an isolated evaluator context or service to hold private sources and
receipts. `.gitignore`, SHA-256 locks, and a reviewer's name do not implement
filesystem permissions or prove that an optimizer has not seen the data. Restrict
the actual accounts, mounts, tool permissions, memory, and telemetry for the
study. Hashing by the organizer is mechanical and emits no task inventory in
normal status; a human curator must not paste private receipt details into a
candidate-generation conversation.

One validation release opens the whole predeclared validation portfolio for
one frozen candidate. Do not schedule validation after every generation. Finish
all required cohorts and apply the combined rule once. The optional holdout is
also for this candidate, after validation has accepted it. No cohort can rescue
a failed mandatory cohort by being selected after the results are known.

After disclosure, record consumption in the curator's cross-study inventory and
retire the cohort from future unbiased gates. Track source and family ancestry,
not just study names or file hashes. Another candidate revision needs a new
study with fresh independent validation (and fresh holdout when needed).
Relabeling, renaming, or paraphrasing a consumed dataset does not replenish it.
The organizer has no global exposure registry and does not implement a
differentially private reusable holdout or sequential-testing service.

## Seal the Preparation Evidence

New `study.json` files use schema 2; ledger events, dataset locks, and the
curator receipt below retain their own schema 1. The `seal-design` command binds
the protocol file, baseline artifact, complete review directory, all registered
dataset digests, and planned private evaluation/comparison stage IDs. It requires
a planned `validation` or `holdout` stage covering every dataset of that split.
All evolution stages must already have downstream validation planned.
All private validation gates need a common evolution selection ancestor, and
all holdout gates a common pre-holdout selection ancestor. For an ordinary study
without evolution, use a public evaluation/comparison selection stage and a
private holdout gate; the validation-release command requires evolution. Opening
that holdout also ends optimizer-visible work in the study.

The private review directory must contain `review.json` and non-empty supporting
files. The same supporting report can substantiate several checks. These files
are curator evidence, not another job or reward format. Use this receipt shape:

~~~json
{
  "schemaVersion": 1,
  "reviewer": "curator-identity",
  "checks": {
    "provenanceAndContamination": {"status": "pass", "evidenceFile": "review.md"},
    "groupIsolation": {"status": "pass", "evidenceFile": "review.md"},
    "surfaceCues": {"status": "pass", "evidenceFile": "surface-audit.md"},
    "verifierQuality": {"status": "pass", "evidenceFile": "verifier-checks.json"},
    "coverageAndPower": {"status": "pass", "evidenceFile": "review.md"},
    "accessIsolation": {"status": "pass", "evidenceFile": "review.md"}
  },
  "datasets": [
    {
      "datasetId": "development-a",
      "datasetSha256": "<exact aggregate SHA-256 from the dataset lock>",
      "tasks": [
        {
          "taskId": "<exact task ID from the lock>",
          "taskSha256": "<exact task SHA-256 from the lock>",
          "groupIds": ["family-001", "source-017", "template-023"]
        }
      ]
    }
  ]
}
~~~

Include every registered dataset and every locked task exactly once, including
the sealed cohorts; the abbreviated example shows one entry. Group IDs use the
same lowercase opaque-ID syntax as dataset IDs. Within a dataset, related tasks
may share groups. Across datasets, any shared group causes rejection without
printing that group's identity. Evidence paths must stay within the review
directory; links, empty evidence, unresolved checks, missing tasks, mismatched
digests, and incomplete private gate coverage prevent sealing.

The command proves that the declared groups are disjoint and the review is bound
to the exact dataset bytes. It cannot validate the honesty or expertise of the
reviewer, discover undeclared relationships, evaluate narrative evidence, or
calculate statistical power. The curator must supply real review evidence;
never manufacture passing receipts to satisfy the command. Execution is blocked
until sealing succeeds, and starting a stage rehashes source artifacts. Changed
datasets, protocol, baseline, or review require new artifacts and a new study.

After sealing, the private gate plan cannot grow. A recovery stage owned by
`harbor-resume-external-failures` is the exception: bind the original split and
native failure evidence and follow its independently proven external-failure,
first-evaluable, no-best-of contract. Recovery cannot introduce another candidate
or use a scoreable failure to buy a new attempt.

## Execute and Interpret the Complete Gate

The evaluator must verify baseline and candidate identity in the actual native
jobs. Organizer digests do not prove that an external process used those inputs.
Use matched task cohorts and fixed repetitions for baseline and candidate, with
paired comparisons and uncertainty estimated at the independent family level
when appropriate. Repeated seeds and multiple variants do not create additional
independent tasks. Predeclare minimum useful improvement, sample-size rationale,
confidence/uncertainty method, regression limits, and multiplicity treatment for
several required datasets or outcomes. A tiny sample may justify a pilot, not a
generalization claim; there is no universal required dataset size or split ratio.

Record per-dataset results and the predeclared combined conclusion in the native
report. Distinguish demonstrated improvement, no demonstrated improvement, and
inconclusive evidence. A non-significant result is not proof of equivalence.
Missing, non-evaluable, or failed mandatory cohorts retain the baseline. No
post-hoc dropping of datasets, seed selection, weight changes, or alternate
winners is allowed. Stage completion records execution, not statistical success.

Release holdout only after the owner accepts the complete validation result.
The script requires every planned validation stage to complete before holdout
release; it does not read rewards or infer acceptance. Publish only reviewed
aggregate tables and the generated source-path-free indexes. Keep private task
names, filenames, prompt patterns, diagnostics, and review contents out of the
publication and out of any continuing optimization context.

## Research Basis and Limits

These sources motivate the procedure. The receipt schema, six checks, stage
gates, and conservative one-release policy are local engineering choices, not
results or algorithms reproduced from the papers.

| Primary source | Supported principle and local use |
| --- | --- |
| [Cawley and Talbot, 2010](https://www.jmlr.org/papers/v11/cawley10a.html) | Model selection can overfit its evaluation criterion. Choose methods on development and reserve independent verification for the frozen choice. |
| [Dwork et al., 2015](https://arxiv.org/abs/1506.02629) | Adaptive reuse can overfit a holdout. This organizer conservatively consumes a cohort after release; it does not implement the paper's reuse guarantees. |
| [scikit-learn cross-validation guidance](https://scikit-learn.org/stable/modules/cross_validation.html) | Grouped or temporal data need appropriate partitions; learned preprocessing must respect training boundaries. Public selection folds do not become independent private evidence. |
| [Geirhos et al., 2020](https://arxiv.org/abs/2004.07780) | Predictive shortcuts can fail under changed conditions. Filename and question-surface audits are task-specific applications of that concern. |
| [Ribeiro et al., 2020, CheckList](https://aclanthology.org/2020.acl-main.442/) | Behavioral tests examine capabilities, invariance, and directional expectations beyond aggregate accuracy. Use curator counterfactual and verifier checks. |
| [Gebru et al., Datasheets for Datasets](https://arxiv.org/abs/1803.09010) | Record dataset motivation, composition, collection, intended use, and maintenance. Keep that provenance in the private protocol and review. |
