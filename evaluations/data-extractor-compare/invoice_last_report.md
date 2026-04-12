# data-extractor-invoice-compare

Targeted invoice-only extraction comparison for the data-extractor benchmark.

| Prompt | Agent/Config | no-skill | skill |
| --- | --- | ---: | ---: |
| Extract stable invoice fields from an HTML invoice. | codex gpt-5.4 | 50% (10/20)<br>tokens avg 48436, sd 17416<br>time avg 27548 ms, sd 11447 ms | 100% (20/20)<br>tokens avg 24815, sd 794<br>time avg 13785 ms, sd 2567 ms |
| Extract stable invoice fields from an HTML invoice. | codex mini | 5% (1/20)<br>tokens avg 52447, sd 20128<br>time avg 17166 ms, sd 7315 ms | 75% (15/20)<br>tokens avg 29644, sd 10642<br>time avg 10369 ms, sd 4306 ms |
| Extract stable invoice fields from an HTML invoice. | copilot mini | 0% (0/20)<br>time avg 55880 ms, sd 156510 ms | 0% (0/20)<br>time avg 61582 ms, sd 155928 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 15213 ms, sd 2665 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 15524 ms, sd 3898 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6569 ms, sd 1167 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 8618 ms, sd 1757 ms |