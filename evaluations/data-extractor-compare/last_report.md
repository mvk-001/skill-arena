# data-extractor-compare

Compare simple structured document extraction with and without the vendored data-extractor skill across low-cost assistant variants.

| Prompt | Agent/Config | no-skill | skill |
| --- | --- | ---: | ---: |
| Extract a contact list from a Markdown directory. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 16923, sd 39.5<br>time avg 10047 ms, sd 1825 ms | 100% (20/20)<br>tokens avg 17364, sd 1051<br>time avg 11107 ms, sd 2896 ms |
| Extract shipping metadata from an email message. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 16899, sd 8.4<br>time avg 8635 ms, sd 679 ms | 100% (20/20)<br>tokens avg 19291, sd 2600<br>time avg 11104 ms, sd 2329 ms |
| Extract stable invoice fields from an HTML invoice. | codex gpt-5.4 | 100% (20/20)<br>tokens avg 17241, sd 8.2<br>time avg 10400 ms, sd 1091 ms | 100% (20/20)<br>tokens avg 20487, sd 1041<br>time avg 13412 ms, sd 1741 ms |
| Extract a contact list from a Markdown directory. | codex mini | 90% (18/20)<br>tokens avg 20535, sd 6442<br>time avg 7922 ms, sd 2844 ms | 90% (18/20)<br>tokens avg 22055, sd 8635<br>time avg 8579 ms, sd 3654 ms |
| Extract shipping metadata from an email message. | codex mini | 95% (19/20)<br>tokens avg 17927, sd 3065<br>time avg 7877 ms, sd 2145 ms | 90% (18/20)<br>tokens avg 19810, sd 4177<br>time avg 7579 ms, sd 2073 ms |
| Extract stable invoice fields from an HTML invoice. | codex mini | 90% (18/20)<br>tokens avg 21767, sd 8526<br>time avg 8729 ms, sd 2804 ms | 85% (17/20)<br>tokens avg 29614, sd 14119<br>time avg 12153 ms, sd 6477 ms |
| Extract a contact list from a Markdown directory. | copilot mini | 0% (0/20)<br>time avg 21045 ms, sd 34788 ms | 0% (0/20)<br>time avg 18221 ms, sd 33299 ms |
| Extract shipping metadata from an email message. | copilot mini | 0% (0/20)<br>time avg 24173 ms, sd 35343 ms | 0% (0/20)<br>time avg 8627 ms, sd 18413 ms |
| Extract stable invoice fields from an HTML invoice. | copilot mini | 0% (0/20)<br>time avg 15110 ms, sd 24846 ms | 0% (0/20)<br>time avg 2631 ms, sd 261 ms |
| Extract a contact list from a Markdown directory. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 2854 ms, sd 75.8 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 2902 ms, sd 65.7 ms |
| Extract shipping metadata from an email message. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 2952 ms, sd 127 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 2986 ms, sd 91.5 ms |
| Extract stable invoice fields from an HTML invoice. | opencode mini | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 2897 ms, sd 83.4 ms | 0% (0/20)<br>tokens avg 0.0, sd 0.0<br>time avg 2922 ms, sd 126 ms |
| Extract a contact list from a Markdown directory. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 8763 ms, sd 1193 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 9576 ms, sd 2142 ms |
| Extract shipping metadata from an email message. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 10285 ms, sd 1430 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 10726 ms, sd 1505 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5 mini | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 15192 ms, sd 2619 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 15677 ms, sd 2054 ms |
| Extract a contact list from a Markdown directory. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5919 ms, sd 1301 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6029 ms, sd 1239 ms |
| Extract shipping metadata from an email message. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5526 ms, sd 1041 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 5861 ms, sd 1725 ms |
| Extract stable invoice fields from an HTML invoice. | pi gpt-5.4 | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 6939 ms, sd 1249 ms | 100% (20/20)<br>tokens avg 0.0, sd 0.0<br>time avg 9406 ms, sd 2152 ms |