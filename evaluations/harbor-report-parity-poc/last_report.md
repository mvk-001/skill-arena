# harbor-report-parity-poc

Prove that Harbor trial artifacts can reproduce the Skill Arena comparison report contract.

| Prompt | Agent/Config | no-skill | skill |
| --- | --- | ---: | ---: |
| Write the skill-only canonical marker to the required artifact. | Claude Code / Haiku | 0% (0/2)<br>tokens avg 77.5, sd 22.5<br>time avg 1500 ms, sd 500 ms | 100% (2/2)<br>tokens avg 120, sd 10.0<br>time avg 1400 ms, sd 200 ms |
| Write the skill-only canonical marker to the required artifact. | Codex / GPT-5.1 Mini | 50% (1/2)<br>tokens avg 145, sd 25.0<br>time avg 3500 ms, sd 500 ms | 100% (2/2)<br>tokens avg 170, sd 20.0<br>time avg 2400 ms, sd 200 ms |
