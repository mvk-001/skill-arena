# skill-arena-compare

Evaluate generation of compare configs covering workspace and skill source types, capability families, multiple adapters, assertion types, environment variables, and multi-profile scenarios.

| Prompt | Agent/Config | no-skill | skill |
| --- | --- | ---: | ---: |
| Generate a compare.yaml for Sunday-only product brainstorming. | codex mini | 0% (0/3)<br>tokens avg 208209, sd 220786 | 33% (1/3)<br>tokens avg 216394, sd 52504 |
| Generate a compare.yaml that exercises prompt matrices and prompt-specific assertions. | codex mini | 0% (0/3)<br>tokens avg 332409, sd 88875 | 0% (0/3)<br>tokens avg 329489, sd 114987 |
| Generate a compare.yaml that preserves system-installed skills and unsupported capability families explicitly. | codex mini | 0% (0/3)<br>tokens avg 132243, sd 71791 | 0% (0/3)<br>tokens avg 478176, sd 122080 |
| Generate a compare.yaml with a local-path skill, two variants, and workspace env using $WORKSPACE. | codex mini | 0% (0/3)<br>tokens avg 91435, sd 29439 | 0% (0/3)<br>tokens avg 196662, sd 79483 |
| Generate a compare.yaml with an inline skill plus copilot instructions, agents, hooks, and deterministic assertions. | codex mini | 0% (0/3)<br>tokens avg 1112884, sd 695394 | 0% (0/3)<br>tokens avg 1165125, sd 1474148 |
| Generate a compare.yaml with an inline-files skill, a copilot-cli variant, and llm-rubric with local judge. | codex mini | 0% (0/3)<br>tokens avg 992527, sd 732101 | 100% (3/3)<br>tokens avg 141195, sd 43804 |
| Generate a compare.yaml with git and empty workspace sources plus opencode agent capabilities. | codex mini | 0% (0/3)<br>tokens avg 129882, sd 79285 | 0% (0/3)<br>tokens avg 514590, sd 304249 |
| Generate a compare.yaml with three profiles and a file-contains assertion. | codex mini | 0% (0/3)<br>tokens avg 244615, sd 233793 | 0% (0/3)<br>tokens avg 440630, sd 382646 |
| Generate a complete compare.yaml with isolated profiles. | codex mini | 0% (0/3)<br>tokens avg 203959, sd 19140 | 0% (0/3)<br>tokens avg 191391, sd 144276 |