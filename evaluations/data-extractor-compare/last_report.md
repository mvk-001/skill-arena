# data-extractor-compare

Compare simple structured document extraction with and without the vendored data-extractor skill across low-cost assistant variants.

| Prompt | Agent/Config | no-skill | skill |
| --- | --- | ---: | ---: |
| Extract a contact list from a Markdown directory. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 16908, sd 31.4<br>time avg 10081 ms, sd 1999 ms | 100% (20/20)<br>tokens avg 17531, sd 1254<br>time avg 10945 ms, sd 2501 ms |
| Extract shipping metadata from an email message. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 16907, sd 18.2<br>time avg 9796 ms, sd 2612 ms | 100% (20/20)<br>tokens avg 18928, sd 1753<br>time avg 11489 ms, sd 3149 ms |
| Extract stable invoice fields from an HTML invoice. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 17238, sd 9.9<br>time avg 11558 ms, sd 2034 ms | 100% (20/20)<br>tokens avg 21281, sd 2005<br>time avg 14755 ms, sd 2505 ms |
| Extract a contact list from a Markdown directory. | codex mini | 80% (16/20)<br>tokens avg 22692, sd 8280<br>time avg 8522 ms, sd 2940 ms | 90% (18/20)<br>tokens avg 22983, sd 12140<br>time avg 9056 ms, sd 4675 ms |
| Extract shipping metadata from an email message. | codex mini | 100% (20/20)<br>tokens avg 19701, sd 6341<br>time avg 8756 ms, sd 2583 ms | 75% (15/20)<br>tokens avg 30236, sd 28174<br>time avg 13020 ms, sd 13060 ms |
| Extract stable invoice fields from an HTML invoice. | codex mini | 85% (17/20)<br>tokens avg 22385, sd 10667<br>time avg 10139 ms, sd 5184 ms | 75% (15/20)<br>tokens avg 22839, sd 10065<br>time avg 9443 ms, sd 4171 ms |
| Extract a contact list from a Markdown directory. | copilot gpt-5.4 | 0% (0/20)<br>time avg 2679 ms, sd 201 ms | 0% (0/20)<br>time avg 9013 ms, sd 18820 ms |
| Extract shipping metadata from an email message. | copilot gpt-5.4 | 0% (0/20)<br>time avg 2717 ms, sd 252 ms | 0% (0/20)<br>time avg 15014 ms, sd 31820 ms |
| Extract stable invoice fields from an HTML invoice. | copilot gpt-5.4 | 0% (0/20)<br>time avg 8905 ms, sd 18528 ms | 0% (0/20)<br>time avg 2887 ms, sd 378 ms |
| Extract a contact list from a Markdown directory. | copilot mini | 0% (0/20)<br>time avg 18270 ms, sd 26890 ms | 0% (0/20)<br>time avg 5884 ms, sd 13664 ms |
| Extract shipping metadata from an email message. | copilot mini | 0% (0/20)<br>time avg 24628 ms, sd 36347 ms | 0% (0/20)<br>time avg 24354 ms, sd 29589 ms |
| Extract stable invoice fields from an HTML invoice. | copilot mini | 0% (0/20)<br>time avg 15017 ms, sd 24728 ms | 0% (0/20)<br>time avg 2752 ms, sd 294 ms |
| Extract a contact list from a Markdown directory. | opencode gpt-5.4 | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3315 ms, sd 144 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3332 ms, sd 156 ms |
| Extract shipping metadata from an email message. | opencode gpt-5.4 | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3649 ms, sd 326 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3702 ms, sd 347 ms |
| Extract stable invoice fields from an HTML invoice. | opencode gpt-5.4 | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3553 ms, sd 319 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3596 ms, sd 251 ms |
| Extract a contact list from a Markdown directory. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3215 ms, sd 102 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3223 ms, sd 133 ms |
| Extract shipping metadata from an email message. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3027 ms, sd 92.9 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3045 ms, sd 84.1 ms |
| Extract stable invoice fields from an HTML invoice. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 2995 ms, sd 148 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3007 ms, sd 153 ms |
| Extract a contact list from a Markdown directory. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 7266 ms, sd 1133 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 8551 ms, sd 1359 ms |
| Extract shipping metadata from an email message. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 9650 ms, sd 1649 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 10223 ms, sd 1728 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 14468 ms, sd 2272 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 13965 ms, sd 1675 ms |
| Extract a contact list from a Markdown directory. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5539 ms, sd 665 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5817 ms, sd 1361 ms |
| Extract shipping metadata from an email message. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5395 ms, sd 1124 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6075 ms, sd 1481 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6524 ms, sd 1179 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 9451 ms, sd 1803 ms |