# data-extractor-compare

Latest combined status for the `data-extractor` benchmark.

## Full benchmark

Source run:
`C:\Users\villa\dev\skill-arena\results\data-extractor-compare\2026-04-11T19-34-41-321Z-compare\merged\report.md`

This is the latest full run with:
- `20` requests per cell
- `codex mini`
- `codex gpt-5.4`
- `copilot mini`
- `pi gpt-5 mini`
- `pi gpt-5.4`

| Prompt | Agent/Config | no-skill | skill |
| --- | --- | ---: | ---: |
| Extract a contact list from a Markdown directory. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 20798, sd 19.6<br>time avg 10644 ms, sd 1949 ms | 45% (9/20)<br>tokens avg 48153, sd 15523<br>time avg 27779 ms, sd 11498 ms |
| Extract shipping metadata from an email message. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 20793, sd 19.5<br>time avg 10321 ms, sd 1066 ms | 20% (4/20)<br>tokens avg 39216, sd 13429<br>time avg 37066 ms, sd 41345 ms |
| Extract stable invoice fields from an HTML invoice. | codex gpt-5.4 | 0% (0/20)<br>tokens avg 21126, sd 14.4<br>time avg 16598 ms, sd 21403 ms | 0% (0/20)<br>tokens avg 50154, sd 17008<br>time avg 40405 ms, sd 27615 ms |
| Extract a contact list from a Markdown directory. | codex mini | 0% (0/20)<br>tokens avg 52343, sd 18678<br>time avg 19859 ms, sd 7817 ms | 80% (16/20)<br>tokens avg 30250, sd 8897<br>time avg 10991 ms, sd 3659 ms |
| Extract shipping metadata from an email message. | codex mini | 0% (0/20)<br>tokens avg 56045, sd 22674<br>time avg 18375 ms, sd 8730 ms | 90% (18/20)<br>tokens avg 24377, sd 6123<br>time avg 8257 ms, sd 2031 ms |
| Extract stable invoice fields from an HTML invoice. | codex mini | 0% (0/20)<br>tokens avg 45815, sd 17216<br>time avg 16042 ms, sd 7873 ms | 5% (1/20)<br>tokens avg 25840, sd 8717<br>time avg 9456 ms, sd 3948 ms |
| Extract a contact list from a Markdown directory. | copilot mini | 0% (0/20)<br>time avg 36823 ms, sd 41274 ms | 0% (0/20)<br>time avg 52015 ms, sd 66626 ms |
| Extract shipping metadata from an email message. | copilot mini | 0% (0/20)<br>time avg 16487 ms, sd 16114 ms | 0% (0/20)<br>time avg 22525 ms, sd 23551 ms |
| Extract stable invoice fields from an HTML invoice. | copilot mini | 0% (0/20)<br>time avg 27013 ms, sd 28072 ms | 0% (0/20)<br>time avg 33994 ms, sd 31814 ms |
| Extract a contact list from a Markdown directory. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 8690 ms, sd 1733 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 9218 ms, sd 1505 ms |
| Extract shipping metadata from an email message. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 9225 ms, sd 1121 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 9785 ms, sd 1568 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5 mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 14176 ms, sd 2660 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 19177 ms, sd 13842 ms |
| Extract a contact list from a Markdown directory. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6277 ms, sd 1208 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6437 ms, sd 2094 ms |
| Extract shipping metadata from an email message. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5628 ms, sd 904 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5114 ms, sd 654 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5.4 | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6968 ms, sd 1177 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 9063 ms, sd 3663 ms |

## Invoice correction

After the full run, the `invoice-json` assertion was fixed to accept semantic equivalence for numeric values instead of requiring string-only formatting.

Source run:
`C:\Users\villa\dev\skill-arena\results\data-extractor-invoice-compare\2026-04-11T23-50-47-329Z-compare\merged\report.md`

Corrected invoice-only results:

| Prompt | Agent/Config | no-skill | skill |
| --- | --- | ---: | ---: |
| Extract stable invoice fields from an HTML invoice. | codex gpt-5.4 | 50% (10/20)<br>tokens avg 48436, sd 17416<br>time avg 27548 ms, sd 11447 ms | 100% (20/20)<br>tokens avg 24815, sd 794<br>time avg 13785 ms, sd 2567 ms |
| Extract stable invoice fields from an HTML invoice. | codex mini | 5% (1/20)<br>tokens avg 52447, sd 20128<br>time avg 17166 ms, sd 7315 ms | 75% (15/20)<br>tokens avg 29644, sd 10642<br>time avg 10369 ms, sd 4306 ms |
| Extract stable invoice fields from an HTML invoice. | copilot mini | 0% (0/20)<br>time avg 55880 ms, sd 156510 ms | 0% (0/20)<br>time avg 61582 ms, sd 155928 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 15213 ms, sd 2665 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 15524 ms, sd 3898 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6569 ms, sd 1167 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 8618 ms, sd 1757 ms |

## Current reading

- `directory-json` and `shipping-email-json` remain the latest results from the full benchmark run above.
- `invoice-json` should be interpreted using the corrected invoice-only run above, not the older full-run invoice row.
- For `codex`, the corrected invoice benchmark shows clear uplift from the skill.
- For `pi`, the corrected invoice benchmark shows the task is easy enough without the skill.
- `copilot mini` remains unreliable in this environment because many failures are shell-access or sandbox-response issues rather than extraction quality.
