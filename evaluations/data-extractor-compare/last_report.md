# data-extractor-compare

Compare simple structured document extraction with and without the vendored data-extractor skill across low-cost assistant variants.

| Prompt | Agent/Config | no-skill | skill |
| --- | --- | ---: | ---: |
| Extract a contact list from a Markdown directory. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 16918, sd 31.9<br>time avg 10069 ms, sd 1089 ms | 100% (20/20)<br>tokens avg 23918, sd 1042<br>time avg 11114 ms, sd 2254 ms |
| Extract shipping metadata from an email message. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 16897, sd 13.6<br>time avg 10285 ms, sd 1250 ms | 100% (20/20)<br>tokens avg 24353, sd 3265<br>time avg 12093 ms, sd 4294 ms |
| Extract stable invoice fields from an HTML invoice. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 17242, sd 15.6<br>time avg 13010 ms, sd 7762 ms | 100% (20/20)<br>tokens avg 24272, sd 1029<br>time avg 13647 ms, sd 7719 ms |
| Extract a contact list from a Markdown directory. | codex mini | 90% (18/20)<br>tokens avg 22305, sd 8886<br>time avg 9498 ms, sd 4043 ms | 80% (16/20)<br>tokens avg 35534, sd 12210<br>time avg 11391 ms, sd 4244 ms |
| Extract shipping metadata from an email message. | codex mini | 85% (17/20)<br>tokens avg 21653, sd 9056<br>time avg 9046 ms, sd 3603 ms | 95% (19/20)<br>tokens avg 36764, sd 24832<br>time avg 12529 ms, sd 9729 ms |
| Extract stable invoice fields from an HTML invoice. | codex mini | 90% (18/20)<br>tokens avg 23077, sd 7876<br>time avg 9866 ms, sd 2697 ms | 100% (20/20)<br>tokens avg 32332, sd 8703<br>time avg 11787 ms, sd 3708 ms |
| Extract a contact list from a Markdown directory. | copilot gpt-5.4 | 0% (0/20)<br>time avg 9337 ms, sd 18796 ms | 0% (0/20)<br>time avg 15588 ms, sd 32811 ms |
| Extract shipping metadata from an email message. | copilot gpt-5.4 | 0% (0/20)<br>time avg 30923 ms, sd 50216 ms | 0% (0/20)<br>time avg 6163 ms, sd 13631 ms |
| Extract stable invoice fields from an HTML invoice. | copilot gpt-5.4 | 0% (0/20)<br>time avg 21535 ms, sd 28091 ms | 0% (0/20)<br>time avg 15353 ms, sd 24688 ms |
| Extract a contact list from a Markdown directory. | copilot mini | 0% (0/20)<br>time avg 24526 ms, sd 35586 ms | 0% (0/20)<br>time avg 18626 ms, sd 33999 ms |
| Extract shipping metadata from an email message. | copilot mini | 0% (0/20)<br>time avg 27993 ms, sd 30587 ms | 0% (0/20)<br>time avg 6111 ms, sd 13836 ms |
| Extract stable invoice fields from an HTML invoice. | copilot mini | 0% (0/20)<br>time avg 9261 ms, sd 18820 ms | 0% (0/20)<br>time avg 21476 ms, sd 34415 ms |
| Extract a contact list from a Markdown directory. | opencode gpt-5.4 | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3097 ms, sd 137 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3145 ms, sd 87.8 ms |
| Extract shipping metadata from an email message. | opencode gpt-5.4 | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3022 ms, sd 113 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3016 ms, sd 59.6 ms |
| Extract stable invoice fields from an HTML invoice. | opencode gpt-5.4 | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5996 ms, sd 13145 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3034 ms, sd 121 ms |
| Extract a contact list from a Markdown directory. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3051 ms, sd 93.3 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3146 ms, sd 94.1 ms |
| Extract shipping metadata from an email message. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3013 ms, sd 55.3 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3018 ms, sd 77.6 ms |
| Extract stable invoice fields from an HTML invoice. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3030 ms, sd 203 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 3037 ms, sd 159 ms |
| Extract a contact list from a Markdown directory. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 19662 ms, sd 13800 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 29072 ms, sd 11365 ms |
| Extract shipping metadata from an email message. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 25387 ms, sd 18168 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 26614 ms, sd 15824 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 19759 ms, sd 12064 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 24188 ms, sd 13494 ms |
| Extract a contact list from a Markdown directory. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5971 ms, sd 674 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 10183 ms, sd 2727 ms |
| Extract shipping metadata from an email message. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6023 ms, sd 2000 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 10411 ms, sd 2861 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6682 ms, sd 981 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 10479 ms, sd 1571 ms |