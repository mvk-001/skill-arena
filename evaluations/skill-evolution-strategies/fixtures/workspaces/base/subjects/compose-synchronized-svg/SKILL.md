---
name: compose-synchronized-svg
description: Design, build, synchronize, and validate giant standalone SVG compositions made from many related diagrams, charts, maps, schematics, illustrations, and explanatory assets. Use when Codex must turn one idea into a coherent 6–16-module megacanvas or a 12–48-module navigable world such as a Path of Exile-style skill tree, giant genealogy, causal atlas, or linked-diagram map; keep recurring concepts visually consistent; propagate canonical values through every relevant view; coordinate focus, time, world-to-district-to-module semantic zoom, or a deterministic camera route for video; and deliver one self-contained interactive SVG with meaningful static and reduced-motion fallbacks.
---

# Compose Synchronized SVG

Build one explanatory SVG, not a collage of independent charts. Let modules answer different viewer questions while one semantic state model owns every recurring value. Treat animation as optional; semantic propagation is mandatory.

## Load the focused guidance

1. Read [references/asset-selection-and-composition.md](references/asset-selection-and-composition.md) before choosing modules or an armature.
2. Read [references/semantic-state-contract.md](references/semantic-state-contract.md) before writing the plan, bindings, or runtime.
3. Read [references/critique-and-validation.md](references/critique-and-validation.md) before the first review round.
4. When the SVG must be explored in parts, read [references/spatial-world-and-camera.md](references/spatial-world-and-camera.md).
5. Read exactly one starting template: [assets/templates/composition-brief.json](assets/templates/composition-brief.json) for a compact 6–16-module megacanvas, or [assets/templates/navigable-world-brief.json](assets/templates/navigable-world-brief.json) for a 12–48-module world with 4–12 districts. Treat `composition-plan.json` as advanced compiler output, not as a file to copy or edit during normal use.

Do not inspect sibling skills or `assets/examples/` during normal use. Keep generated plans, SVGs, reports, and screenshots outside the read-only skill directory.

Treat bundled scripts as executable tools. Do not read their source during normal generation; they deliberately hide fragile runtime and XML-rewrite details.

## Obey the normal-use tool boundary

Normal generation has one short path:

1. After reading the task prompt, read exactly `skills/compose-synchronized-svg/SKILL.md` first, then the three core references once. For a PoE tree, genealogy, atlas, semantic-zoom, or camera-tour request, also read the spatial-world reference. Select the navigable-world template only when the 12–48-module, 4–12-district world criteria hold; otherwise select the compact template. This is a standalone `uv` Python bundle and intentionally has no `package.json`, Node manifest, or README. Do not probe for them, test whether they exist, or list/search the skill directory.
2. If the active shell is Git Bash on Windows, run `mkdir -p .tmp` once in the writable workspace and prefix every bundled `uv run` command with `TMPDIR="$(pwd)/.tmp"`. Never create or rely on `/tmp`; it can resolve outside the writable workspace. The examples below omit this conditional prefix only for readability.
3. Write one project brief outside the skill from the selected template. Keep the idea-specific choices—concepts, computations, scenarios, module questions, asset types, optional structural diagrams, focus, phases, and, in world mode, districts, links, and camera route—while leaving regions, anchors, selectors, identity boilerplate, transforms, and exact phase times to the compiler.
4. Run `preflight_svg_brief.py` on the brief. It never publishes a plan and reports expected authoring defects as `ok: false` with process exit zero. Rewrite the complete brief and repeat preflight until `ok: true`; do not use fragile exact-match edits.
5. Run `compile_synchronized_svg_plan.py` once to create the complete plan. Copy the documented command literally: the report switch is `--json`, not an inferred abbreviation or trial flag.
6. Run `compose_synchronized_svg.py --force` on that compiled plan.
7. Run `validate_synchronized_svg.py` once on the requested SVG. In world mode, add the navigation, district, anchor-depth, world-detail-area, and distant-shared-source gates documented in the spatial-world reference.
8. Run `audit_synchronized_svg.py` once with its report and screenshot options.
9. Inspect the audit screenshot against the visual rubric. If it reveals an actionable issue, change only the selected brief, preflight it to `ok: true`, and rerun compiler → composer → validator → audit. Record a clean round when the contract and visual review both pass.
10. For a release-grade artifact, obtain a second clean review with fresh evidence, preferably at a materially different phase or by an independent reviewer, then stop.

Before the single brief write, perform this in-context preflight without calling a tool:

- every timeline `focusId` names a declared top-level focus group;
- every direct or derived divisor stays strictly away from zero over its full credible domain, or the formula models the zero case explicitly with `max`/`clamp`;
- any ratio that can exceed 100% is named as a load/target ratio and uses a bullet or progress asset, never utilization or a radial gauge;
- every network without an explicit `module.diagram` contains at least one selected direct source/derived dependency pair and every intermediate node needed to connect a claimed transitive path;
- every explicit structural diagram is connected, uses declared node/link kinds, and binds each numeric module value exactly once;
- every visible derived node in a network includes all of its direct parents, and every declared source concept is visibly bound in at least one module;
- every stack contains only nonnegative disjoint parts and names its reconciled `stackTotal`;
- no claim or formula treats a subtotal and one of its included parts as peers.
- when the task requires a forward causal chain, every required facet belongs to one connected relationship spine and feedback closes that same component;
- when a scenario promises an unchanged representation, that entire module binds only values that remain unchanged in the transition.
- every relationship label names only the exact shared value or declared dependency carried between its two endpoint modules; never use “and” to claim an omitted concept, and name a transferred subtotal rather than the broader source-module total.
- in world mode, every module belongs to exactly one district, every district is reachable from the declared root through directed non-feedback links, and a looping camera route returns to its initial anchor after covering every required district.

After the first complete JSON write, make the bundled preflight the first external command. Do not reread, chunk-read, or inspect the brief between a write and preflight; the preflight is the inspection step. Do not run `--help`, `python -m json.tool`, another JSON linter, a directory listing, or a speculative tool call first. When preflight reports `ok: false`, rewrite the whole brief with one `write` call rather than using exact-match `edit`, then rerun preflight. Only `ok: true` authorizes the single publishing compiler command.

Do not run `ls`, `find`, `rg`, `grep`, `sed`, `head`, or `tail`, and do not use Python, Node, shell globs, `test -f`, or filesystem APIs to enumerate or probe the bundle. Do not read the compiled plan, monolithic SVG, helper source, package manifests, or unrelated files after a pass. Command exit status, durable reports, and rendered screenshots are the evidence; inspect screenshots, not implementation internals. Do not run the scaffold, replacer, or tests during normal generation. Use the bundled browser audit by default; add a direct browser interaction review only when the task explicitly requires pointer, keyboard, or state-specific acceptance beyond that audit. Keep every generated review artifact outside the skill bundle.

Keep the brief, compiled plan, reports, and requested output in the workspace. Resolve expected brief errors through the nonpublishing preflight so the compiler is called only on a passing brief. If compilation nevertheless fails, treat it as a blocking gate and fix only the selected brief. Route post-compile failures by check class: when a semantic, quantitative, geometry, accessibility, relationship, or navigation finding names an actionable module, value, district, or route stop, revise only the brief, preflight it, and rerun the full chain once. For `runtime-api`, `real-input-controls`, `navigation-input-controls`, worker, timeout, or playback-timing failures—or when the identical check repeats unchanged—preserve the reports, cite the exact check ID and message as a generator/auditor defect, and stop. Do not inspect the plan, monolithic SVG, or bundled scripts; do not run ad-hoc browser diagnostics, tune phase or route durations, or remove required focus, relationship, scenario, timeline, district, or route semantics to make a mechanical check pass.

## Follow the workflow

### 1. Freeze the idea and its facets

- State the thesis, audience, evidence status, and intended delivery context.
- Choose the delivery mode before selecting geometry. Use compact mode for 6–16 modules that should coexist on one fitted page. Use navigable-world mode for 12–48 modules grouped into 4–12 districts when the overview should explain topology, district views should index local destinations, module views should reveal complete diagrams, and a deterministic route should support narration or video.
- Separate source concepts from derived concepts. Assign stable IDs, units, domains, and defaults; let the compact compiler derive semantic identity tokens. Use `fraction` for values stored as `0..1` and `percent` only for percentage points stored as `0..100`; never multiply a fraction by 100 merely to feed a generated gauge. Make each domain the full credible decision envelope—not an arbitrary maximum and not merely the named-scenario range—so every legal patch remains in-frame without making ordinary states visually sparse.
- List distinct viewer questions: magnitude, composition, change, distribution, causality, flow, hierarchy, capacity, uncertainty, geography, scenario, or exact lookup.
- Mark assumptions and synthetic values visibly. Never imply sourced precision when the input is illustrative.

### 2. Select a nonredundant module set

- Score candidate assets with the bundled selection reference.
- Give every accepted module one viewer question, one visible claim, one asset type, one region, and explicit concept bindings.
- Bind every declared source concept visibly somewhere. In exact tables, distinguish recurring annual and monthly measures in their labels; generated table rails add period prefixes, but the source labels should still be semantically specific.
- In compact mode, prefer 6–12 strong modules and extend to 13–16 only when the extra questions remain distinct and legible. In navigable-world mode, require 12–48 nonredundant modules, group them into 4–12 meaningful districts, and make each district a local navigation structure rather than a container of miniature cards.
- Keep two encodings of one concept only when they serve different tasks, such as exact lookup versus distribution or present state versus projection.
- Choose the global armature after selecting the modules. The top-level `armature` is a descriptive narrative phrase; `world.armature`, when present, is the validated spatial enum `radial-skill-tree`, `genealogical-tree`, or `constellation-map`. Declare causal, dependency, transfer, and feedback relationships explicitly; leave modules visually disconnected only when no honest relationship exists.

### 3. Author the selected brief and compile the plan

Read the selected compact or navigable-world template, then author the project-specific `composition-brief.json` as one complete JSON write in the workspace. Do not adapt the large full-plan template: copying it can leave unrelated identities, roles, domains, or layout residue in a new subject. Keep `locale` as `en-US`; the literal fallback intentionally supports one deterministic locale so its formatting stays identical to the browser runtime. The compiler extracts dependency leaves, checks the DAG, normalizes legal direct-divisor domains away from exact zero when safe, estimates value envelopes, creates canonical identities and selectors, assigns either an asset-aware compact layout or a navigable spatial world, infers transforms and formats, and distributes omitted phase or route times. It preserves one identity automatically through direct references and pure constant scale, unit-conversion, or rounding derivations; multi-input computations remain distinct unless a valid canonical ancestor is named with `colorSource`. Without `module.diagram`, it keeps network nodes equal-area and draws only declared dependency edges. With `module.diagram`, it validates and renders the explicit qualitative topology while binding each listed numeric value once. Generated percentage gauges accept either `fraction` values in `0..1` or percentage-point values in `0..100` and render both honestly. Ordinary comparative bars require one unit, nonnegative legal envelopes, one zero baseline, and one shared scale; use a flow or table until a diverging-bar renderer exists when values can be negative. The compiler also rejects an implicit network with no real dependency edge, a radial measure with an incompatible unit, and radial percentages whose legal envelope exceeds 100%; choose a non-network asset, an explicit structural diagram, or a bullet/progress load-ratio view respectively.

Require in the brief:

- one concise visible `provenance` note that distinguishes sourced, assumed, and synthetic evidence;
- canonical source `concepts` with credible domains plus safe derived computation trees; omit `dependsOn` because the compiler derives it from `{ "ref": ... }` leaves;
- atomic named `scenarios`;
- distinct module questions, claims, asset types, and concise `values` lists;
- asset types whose names include one supported renderer-family token: bar/column/stack, flow/sankey/process, gauge/bullet/progress, line/timeline/series, network/graph/tree, spatial/map, table/matrix/grid, or waterfall. The compiler rejects generic fallback names such as `metric-card` because colored blocks without a semantic renderer cannot prove a claim;
- for every flow asset, put one conserved same-unit source total first and only mutually exclusive branches after it. Require the algebraic branch sum to equal the source in defaults and every scenario. Permit a negative branch only when it intentionally represents reverse or deficit flow; retain its exact signed value, reverse direction, dash, arrow, and `DEFICIT` cue. Use a network or table for independent, overlapping, mixed-unit, or nonconserving values;
- never create a derived rollup that adds a conserved total to any of its own flow branches. The compiler rejects this provable double count; `total - branch A - branch B` is a valid reconciliation identity, while `total + branch A + branch B` is not;
- for every ledger, table, or derived value labeled as a total, check, reconciliation, residual, or remainder, write the equality it is meant to prove before encoding it. Compare a whole with the sum of its disjoint parts; never add the whole to those same parts and present the doubled result as a check;
- a specific `selectionRationale` and `rejectedAlternative` for every module;
- one short `armature` name that describes the composition's reading structure;
- up to 18 optional `relationships` with stable IDs, distinct source and target module IDs, a `flow`, `dependency`, or `feedback` kind, and a viewer-readable label; keep only the explanatory spine when the graph is denser;
- evidence for every claimed dependency or feedback edge. A downstream-risk-to-response feedback must target either a recommendation derived from that risk in the canonical DAG or a declared policy/source control whose scenarios or later phases explicitly change after the risk signal. A connector alone never proves causality;
- shared focus groups declared only in the top-level `focusGroups` array; list member module IDs there and never duplicate membership inside module records;
- `timeline: null` unless time explains the idea;
- timeline phases with one master focus sequence when time matters; use `baseScenario`, `interpolation`, `autoplay`, and per-concept `interpolation: "step"` deliberately rather than as decoration. At exact `durationMs`, a looping runtime wraps to the same semantic, focus, and rendered state as time zero. Add an explicit return-to-start final phase when a visually smooth approach to that seam matters.
- in navigable-world mode, one `world` object whose districts partition all modules, whose directed links make every district reachable from `rootDistrictId`, and whose route covers required districts and closes an exact loop seam when looping; use `focusId` and `handoff` as narration metadata rather than semantic mutations.

Before the first compiler call, perform this first-write gate. Do not use a failing compiler invocation as a speculative linter.

- Confirm the file is one complete JSON object with escaped newlines, balanced delimiters, commas between every member, and no comments or trailing commas.
- Prove every direct and derived divisor stays away from zero across its full declared domain. If that proof is awkward, show the underlying amount instead of inventing a ratio.
- Prove every radial value stays inside `[0, 1]` for fractions or `[0, 100]` for percentage points. Call a value utilization only under that same bound; otherwise call it a load ratio and use bullet, progress, line, or table.
- Recheck the selected family contract: same-unit nonnegative ordinary bars; disjoint nonnegative zero-anchored stack parts plus one total; one conserved source-first flow; a real declared dependency edge for every network; and one ordered opening-minus-deductions waterfall.
- Resolve every scenario, module, relationship, focus, and phase ID exactly once. Every phase `focusId` must name a declared top-level focus group.
- Write the equality behind every total, check, reconciliation, residual, and remainder. Never add a whole to its own parts.
- When any proof fails, change the selected brief before invoking the compiler: prefer an exact table, network, or signed line over a misleading quantitative form.

Do not embed executable expressions in the brief. Use the documented pure computation nodes.

Preflight without publishing a plan. An expected authoring finding still exits zero, so inspect the JSON `ok` field rather than treating process success as semantic success:

```text
uv run --script <skill-root>/scripts/preflight_svg_brief.py --brief composition-brief.json --json
```

When and only when preflight reports `"ok": true`, compile the full deterministic plan once:

```text
uv run --script <skill-root>/scripts/compile_synchronized_svg_plan.py --brief composition-brief.json --output composition-plan.json --force --json
```

Treat the compiler result, including any reported divisor-domain normalization, as the plan gate. Do not read or hand-edit `composition-plan.json`.

### 4. Compose a deterministic first pass

Run the final composer once with the exact requested output path and a durable report:

```text
uv run --script <skill-root>/scripts/compose_synchronized_svg.py --spec composition-plan.json --output <exact-output.svg> --report composition-report.json --force --json
```

This is the mandatory normal-use path. It validates the plan, creates the embedded canonical runtime, renders one body-local asset per module from the chosen asset family, routes declared relationships through shared gutters, preserves every binding, removes all placeholders, and publishes the output atomically. It supports eight canonical renderer families: bar, flow, gauge, line, network, spatial, table, and waterfall. Asset-type names may specialize those families; do not claim that every name is a distinct renderer.

In navigable-world mode, the same composer also renders the world topology, district indexes, complete module diagrams, fixed camera viewport, HUD, minimap, anchors, deep links, and deterministic camera route. Do not hand-author a second wrapper or video-only copy.

Rerun from the selected brief when the first pass needs improvement. Change the asset type, claim, bound values, module priority, focus, source domain, district graph, or route before considering custom SVG geometry. Let the compiler regenerate region, reading order, binding, transform, identity, and navigation mechanics. Never bypass the compiler/composer pair with a separate hand-authored document.

### 5. Refine the real composition

- Allocate the primary module first, then the reading path, supporting modules, global legend, controls, and annotations.
- Render the initial scenario as literal geometry and text before the script runs.
- Preserve one visual identity per recurring concept while allowing different encodings and scales.
- Declare every scale and transform; never imply equal pixel magnitude across incompatible units.
- Give every ordinary comparative bar in one module the same unit, zero baseline, domain, range, and pixels-per-unit slope; never normalize peers independently.
- When a module includes both a subtotal and its constituents, state their hierarchy as an equation or sequence; never describe the subtotal and one of its already-included parts as peer components. Use a table or arithmetic bridge for a static equality or unit-conversion reconciliation. Reserve a line/timeline asset for a real ordered progression with a meaningful axis, not two equal values that merely need to reconcile.
- In a network, include every intermediate dependency needed to make the claimed path visible. A total plus transitive leaves is not a composition diagram when the subtotal connecting them is absent.
- Treat generated flows as conservation diagrams: one same-unit source total must equal the algebraic sum of its mutually exclusive branches in defaults, scenarios, and legal runtime states. Decide zero and direction from the exact raw canonical value after negative-zero normalization; transformed magnitude controls thickness only, and every finite nonzero branch receives a visible minimum stroke. Do not use flow width to compare independent values.
- Keep exact ledgers mathematically independent from the marks they audit. A partition check is either `sum(parts)`, `whole - sum(parts)`, or an explicit side-by-side equality; it is never `whole + parts`. Reject any check whose formula double-counts a source through its own allocation, rollup, or descendants.
- Keep structural network nodes equal-area unless one shared unit, domain, scale, and legend justify quantitative area. Use exact per-node readouts for mixed units.
- Use generated waterfalls only for one nonnegative opening total, ordered sign-stable deductions, and a nonnegative ending balance in one shared unit. Deductions may be nonnegative magnitudes or nonpositive canonical values, but their inferred envelopes must not cross zero. Require one zero-anchored absolute scale, opening minus deduction magnitudes equals ending, and no visual clamping in every scenario and sampled phase; use bars, flow, or a table for overlapping or independent amounts.
- Keep bullet and progress geometry anchored at canonical zero. Before saturation, the distance to the 100% target must equal the canonical value-to-target ratio; preserve exact negative or above-range values in text even when the visible mark clamps at an endpoint.
- Call a bounded `[0, 1]` measure utilization; call demand divided by capacity a load ratio when it can exceed 100%, and show the 100% threshold in a bullet or progress view.
- Prefix imported SVG IDs and rewrite every local reference. Remove remote resources and autonomous animation.
- Add connectors only when they encode a real causal, temporal, spatial, or transfer relationship.
- Make a requested causal spine connected across its required facets. Phrase labels with the actual canonical driver (for example, “gross cash determines tax”), not an ambiguous umbrella term that could imply a false dependency. For feedback, distinguish current required response from a deployed response that persists after its trigger; support the connector with either the derived DAG or an explicit trigger/response phase sequence and lag in the visible claim.
- For feedback, distinguish observation from actuation. Keep the canonical state acyclic: derive a recommendation from the observed signal, or show a policy control changing in a later scenario or phase. Do not claim that risk drives a response whose value is actually computed from an unrelated input.
- Keep DOM construction outside the frame loop. Update existing bound marks from one state snapshot.
- In navigable-world mode, keep the three levels semantically distinct: world reveals topology, district reveals local destinations, and module reveals the complete diagram. Do not paint dashboard cards at the first two tiers.

Do not use custom fragments unless the user explicitly requests bespoke, hand-authored module geometry. A complex domain or a desire for polish does not activate that path: improve the plan and rerun the final composer. For an explicit custom-fragment request only, use the scaffold and replacer help text without reading their source; preserve the generated body-local shell and never rewrite the full SVG.

### 6. Synchronize from one authority

- Recompute the derived DAG once per source patch and render the complete dependency closure in one transaction.
- Stamp every affected binding with the same revision and dispatch one `svg-sync-change` event after the DOM is settled.
- Leave unrelated bindings unchanged. Similar labels never justify coupling two concepts.
- Expose the complete deterministic `window.svgSync` API from the semantic-state contract.
- Drive optional motion only through `pause()` and authoritative `seek(ms)`. Never stitch independent module clocks.
- For a loop, require the semantic values, focus, and rendered marks at `durationMs` to equal time zero exactly; phase IDs and the clock itself may differ.
- Move every active relationship pulse from the same phase progress snapshot. Highlight a relationship only when its participating focus modules make that connection relevant.
- Synchronize every visible value echo in the same render transaction as its bound mark and accessible value. In a generated flow, the source label must equal `<base label> · <accessible value>` and every branch value label must exactly equal that branch mark's current accessible value. A current mark with stale visible text is a blocking synchronization failure.
- Keep focus independent from values. Keep script-free and reduced-motion states complete and meaningful.
- Keep camera state independent from semantic values, scenarios, focus, and timeline state. Camera-only calls use their own revision and `svg-camera-change` event and must never dispatch `svg-sync-change`.

### 7. Validate before visual scoring

Run the static contract validator and write a durable report:

```powershell
uv run --script <skill-root>/scripts/validate_synchronized_svg.py <output.svg> `
  --output <validation.json> `
  --min-modules <expected-count> `
  --min-asset-types <expected-count> `
  --min-renderer-families <expected-family-count> `
  --min-shared-sources 1 `
  --min-modules-per-shared-source 2 `
  --min-encodings-per-shared-source 2
```

Do not pass `--allow-placeholders` for a deliverable. Add `--require-time-sync` only when the plan declares a timeline.

For a navigable world, also pass `--require-navigation --min-navigation-regions 4 --min-anchor-depth 2 --min-world-detail-area-ratio 16 --min-distant-shared-sources 1` unless the accepted brief justifies stricter minima.

Then run the browser audit when Chromium is available:

```powershell
uv run --script <skill-root>/scripts/audit_synchronized_svg.py <output.svg> `
  --report <browser-audit.json> `
  --screenshot <overview.png> `
  --compact-report
```

The compact report retains all metrics, pass IDs, warnings, browser errors, and complete failing-check details while omitting bulky details for checks that passed. Treat the concise terminal result and compact report as the normal verification surface; do not read or print an exhaustive browser report into the agent context. Omit `--compact-report` only when a human explicitly needs the full per-check evidence as a separate diagnostic artifact.

The audit command launches its browser worker in an isolated process group with kill-on-close containment where supported, gives each attempt 180 finite seconds, sweeps surviving descendants after worker exit, terminates and drains the tree after a timeout or cancellation, and retries one timeout internally. It handles terminal-close signals on POSIX, relays Unicode diagnostics safely on Windows, and preserves a genuine worker failure code. Do not add an external retry loop: one command must remain one strict tool call, and a second timeout or semantic failure must remain visible.

Treat static validation and browser propagation as blocking gates. Static validation proves structure and the binding contract; it does not prove cross-mark pixel truth. The bundled audit must confirm that the root and modules remain non-atomic groups, correlate every bound DOM representation to its own named Chromium accessibility node, exercise every pointer and keyboard focus control, verify relationship focus/pulse state, compare phase progress independently with the authoritative timeline time, and test legal zero-flow boundaries for every eligible value, including multiple close interior roots whose domain endpoints have the same sign. The auditor may select one non-baseline legal root per value, but it must not assume that an endpoint sign change is required. It must also reject mixed-unit or nonconserving flows, stale flow source or branch labels, independently normalized comparative bars, nonzero zero-value bars, negative or materially clipped stack parts, failed stack reconciliation, waterfall clamping, unequal waterfall pixels per canonical unit, failed waterfall reconciliation, nonzero zero-height steps, and incorrect progress distance to target across the initial state, every named scenario, legal perturbation, solved zero-flow state, and sampled phase. It must inspect direct-open, script-free, and reduced-motion states. Use the bundled overview screenshot for the macro review. For a release-grade artifact, also capture readable module crops and materially different states outside the skill bundle; in world mode capture districts plus route arrivals and midpoints. Treat a fitted overview as a structural view that requires zoom for text, not as proof that every label is readable at world scale.

The audit report and its screenshot are the authoritative browser evidence. Do not open or search the monolithic SVG to reconfirm facts the passing commands already established. Inspect the screenshot for hierarchy, reading path, relationship routing, and claim/asset fit; if it is clean, record the review round. After the required second clean round, stop and report completion.

### 8. Critique and refine autonomously

- Review claim/asset fit before styling.
- Test each source concept with a legal perturbation and a negative control.
- Test invalid patches, atomic revision, idempotent reset/replay, scenario changes, focus, and timeline boundaries.
- Score the rendered artifact with the reconciled 100-point rubric.
- Fix every objective, repeated, or low-cost issue. Rerun earlier gates after every material change.
- Stop only after two consecutive clean rounds with fresh evidence. Ask for taste-level feedback only when the remaining alternatives preserve semantics, accessibility, legibility, and all acceptance criteria.

## Definition of done

Deliver the exact requested SVG only after all of these hold:

- module questions are useful and nonredundant;
- at least one canonical source influences multiple modules through materially different encodings;
- positive propagation, unrelated-variable isolation, atomic revision, and idempotence pass;
- the root SVG and modules use non-atomic group roles, and every bound mark is separately exposed in the browser accessibility tree with a synchronized human-readable label, formatted value, and unit without leaking internal concept IDs;
- the initial SVG remains explanatory without JavaScript;
- reduced motion preserves meaning and disables autoplay;
- the visible provenance note accurately labels sourced, assumed, simulated, or synthetic evidence;
- focus never dims essential text below readable contrast, and playback state is visible and accessible, including an explicit disabled state under reduced motion;
- every waterfall uses one shared unit and zero-anchored absolute scale, opening minus deduction magnitudes equals ending, and no step clamps in any audited state;
- every generated stack uses nonnegative disjoint parts on one zero-anchored scale, reconciles to its declared total, and never clips materially;
- every ordinary comparative-bar module uses one unit, zero baseline, and one shared pixels-per-unit scale, with no negative legal state or independently normalized peer;
- every generated flow uses one unit, conserves algebraically in defaults, scenarios, legal perturbations, zero-flow states, and sampled phases, and keeps its visible source and branch labels synchronized with current accessible values;
- `locale` is exactly `en-US`; unsupported locales fail before output, and literal fallback formatting matches runtime formatting for grouping, rounding, currency sign placement, percentages, suffixes, adaptive scientific notation for nonzero values that would otherwise display as zero, and negative zero;
- every discoverable zero-flow boundary renders zero thickness, neutral `zero` direction, no reverse arrow, dash, or deficit cue, and a human-readable zero, including an interior root when legal endpoints share one sign;
- every bullet or progress mark has truthful distance to its 100% target before saturation while retaining exact negative and above-range readouts;
- relationship ports and route lanes remain physically distinct after projection and clamping, and no route enters the footer key or essential module content;
- the overview has hierarchy and every module crop is readable;
- in navigable-world mode, the world tier exposes root, trunks, districts, and compact local nodes without a wall of cards; every district tier is a labeled local index; every module anchor reveals one complete diagram with at least 95% target-frame coverage and no label or frame escape;
- in navigable-world mode, every district is reachable, every module belongs to exactly one district, the deterministic route covers required districts and returns exactly at a loop seam, deep links and minimap work, and camera-aware tab order exposes only controls for the active tier;
- camera navigation is history-independent, reduced motion disables camera autoplay without disabling instant navigation, and every camera-only action leaves the serialized semantic snapshot byte-identical;
- the SVG contains no placeholders, remote dependencies, broken references, duplicate IDs, clipping, or runtime errors;
- two consecutive critique rounds have no actionable finding.

Keep the authoring plan and validation evidence beside the project artifact unless the user explicitly requests only the single SVG.
