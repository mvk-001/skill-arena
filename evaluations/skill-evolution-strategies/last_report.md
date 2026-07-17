# skill-evolution-strategies

Compare four skill-improvement workflows on identical corpus-derived evidence tasks.

| Prompt | Agent/Config | population-search | trace-distillation | reflective-pareto-search | operator-coevolution |
| --- | --- | ---: | ---: | ---: | ---: |
| Heterogeneous multi-case orchestration case. | codex | 0% (0/1)<br>tokens avg 31378, sd 0.0<br>time avg 28454 ms, sd 0.0 ms | 0% (0/1)<br>tokens avg 30669, sd 0.0<br>time avg 35991 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 28544, sd 0.0<br>time avg 33615 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 28114, sd 0.0<br>time avg 33912 ms, sd 0.0 ms |
| Recurrent labeled trace evidence case. | codex | 0% (0/1)<br>tokens avg 37399, sd 0.0<br>time avg 51410 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 84919, sd 0.0<br>time avg 86873 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 33561, sd 0.0<br>time avg 56961 ms, sd 0.0 ms | 0% (0/1)<br>tokens avg 22512, sd 0.0<br>time avg 37531 ms, sd 0.0 ms |
| Repeated-generation operator plateau case. | codex | 0% (0/1)<br>tokens avg 25025, sd 0.0<br>time avg 36670 ms, sd 0.0 ms | 0% (0/1)<br>tokens avg 32640, sd 0.0<br>time avg 37192 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 21234, sd 0.0<br>time avg 36067 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 21469, sd 0.0<br>time avg 46705 ms, sd 0.0 ms |
| Stable scalar-fitness converter case. | codex | 100% (1/1)<br>tokens avg 36164, sd 0.0<br>time avg 48676 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 36063, sd 0.0<br>time avg 41647 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 67683, sd 0.0<br>time avg 75650 ms, sd 0.0 ms | 100% (1/1)<br>tokens avg 22206, sd 0.0<br>time avg 29879 ms, sd 0.0 ms |