# q003 Harbor Qualification Pilot

Status: **complete, no qualified winner; exploratory and non-promotable**. This
is a one-task discovery pilot, not a ranking of the four evolution strategies,
not a causal candidate comparison, and not a substitute for the frozen
five-task smoke or full development budgets.

The observed Pi/model/thinking profile matched `protocol.json`. Harbor 0.18.0
is preserved as an operator-captured runtime attestation because Harbor 0.18.0
did not embed its own package version in the native result JSON. Every native
JobConfig, result, diagnostic, reward, and normalized candidate result used here
is bound by SHA-256 in the tracked evidence lock.

All eight rows are diagnostic only. Candidates `00`–`04` were installed
under the legacy basename `skill`, candidate `05` under its candidate ID,
and only `06`–`07` under the canonical logical basename
`consult-semantic-okf`. That mixed identity provenance blocks promotion and
prevents causal interpretation even for the canonically staged rows.

| Candidate | Evaluable | Installed identity | Contract | Min docs | Mechanical | Diagnostic utility | Covered qrels / cited docs | Input / output tokens | Outcome |
| --- | :---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `00-baseline` | no | legacy `skill` | n/a | n/a | n/a | n/a | 0 / 0 | 2,346,645 / 10,121 | provider context limit |
| `01-exact-json-evidence` | yes | legacy `skill` | 0 | 0 | 0 | 0.376 | 3 / 6 | 3,489,523 / 29,339 | two invalid evidence identities |
| `02-multi-paper-breadth` | no | legacy `skill` | n/a | n/a | n/a | n/a | 0 / 0 | 1,964,712 / 6,934 | provider context limit |
| `03-minimal-direct-support` | yes | legacy `skill` | 0 | 0 | 0 | 0.656 | 5 / 8 | 2,782,997 / 35,307 | locator contract invalid |
| `04-harbor-legacy-port` | yes | legacy `skill` | 1 | 0 | 0 | 0.657 | 5 / 7 | 1,176,645 / 19,886 | exact evidence; one document short of minimum |
| `05-context-budgeted` | yes | candidate ID | 0 | 1 | 0 | 0.782 | 7 / 10 | 1,399,091 / 33,012 | strongest retrieval; locator contract invalid |
| `06-compiler-first` | no | canonical logical name | n/a | n/a | n/a | n/a | 0 / 0 | 36,512 / 116,172 | provider context limit before finalizer |
| `07-four-call-finalizer` | no | canonical logical name | n/a | n/a | n/a | n/a | 0 / 0 | 15,108 / 121,788 | provider context limit plus 600 s agent timeout |

For non-evaluable provider outcomes, gates and utility are shown as `n/a`;
the raw verifier zeros remain preserved only as reported values in the evidence
lock. Diagnostic utility behind a failed gate is not reward, qualification,
semantic correctness, causal evidence, or promotion evidence.

## Analyzer diagnostics

- Selected winner: none.
- Holdout: not eligible and not opened.
- Primary-fitness survivors reported by the historical analyzer: `01` and
  `03`, tied at evaluated zero. This is replayable analyzer state only.
- Complementary repair-parent diagnostics: `04` and `05`. They preserve
  different public signals, but are not promoted parents or evidence that either
  mutation caused an improvement.
- Semantic review: not performed because no candidate passed mechanical
  qualification.
- Aggregate usage: 13,211,233 input,
  12,449,920 cached, and 372,559
  output tokens across eight trials; provider cost was unavailable.

The live traces motivated generic evolver hardening, but this pilot does not
estimate the causal effect of those repairs. The full study must start new
canonical-identity runs under the frozen protocol.

## Reproduce the publication

The sanitized evidence projection is
[`q003-evidence.lock.json`](q003-evidence.lock.json), SHA-256
`9bd995690b452c0e3251f39e625f8c4112f449ed22cae631efaecb72f73def40`. It contains no agent reasoning, answers, qrel
identities, hidden rubric, oracle data, credentials, or private verifier input.

```powershell
node evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js verify
# When the ignored native artifacts are still present:
node evaluations/knowledge-consult-evolution/scripts/publish-q003-pilot.js verify-native
```

Machine-readable details are in
[`q003-qualification-pilot.json`](q003-qualification-pilot.json).
