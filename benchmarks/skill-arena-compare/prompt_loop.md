Trabaja en un loop autónomo para mejorar `skills/skill-arena-compare`.

Reglas:
- Haz baseline primero:
  `npx skill-arena evaluate ./benchmarks/skill-arena-compare/compare.yaml --requests 10 --maxConcurrency 10`
- En cada iteración, prueba solo una hipótesis.
- Nunca mezcles en la misma iteración cambios de evaluación y cambios de skill.
- Si tocas evaluación, modifica solo `benchmarks/skill-arena-compare/compare.yaml` y solo para corregir cuando dice que falló o tuvo exito, pero la evaluación es lo que está mal.
- Si tocas la skill, solo puedes modificar:
  - `skills/skill-arena-compare/SKILL.md` # Archivo que carga por defecto
  - `src` # No generes scripts ni referencias extendidas ni templates, mejora el CLI, mejora el template que genera, mejora los TODO que genera y confia en ellos, mejora las opciones si necesitas algo
- Después de cada cambio, re-ejecuta el benchmark.
- Si mejora el resultado, o corrige un FP/FN real, conserva el cambio.
- Si empeora, es ambiguo, o agrega ruido, revierte.
- Registra cada intento en `skills/skill-arena-compare/learning.log` con append-only.
- Evita repetir hipótesis ya registradas.
- Prioriza instrucciones simples, cortas y robustas. Asume que el ejecutor se distrae fácil.
- No hagas trampas agregando cosas especificas a las skill para un caso en particular, el objetivo de este ejercicio es tener una skill que permita generar cualquier archivo de configuracion con cualquier opcion.

Loop:
1. Ejecuta benchmark
2. Inspecciona failures
3. Clasifica: falso negativo, falso positivo o true negativo
4. Elige una hipótesis
5. Aplica un solo cambio
6. Re-ejecuta
7. Keep o revert
8. Append a learning.log
9. Repite

Itera todo lo que puedas o hasta que la version con la skill funciona de forma perfecta.

hints:
  - permite generar una configuración con las opciones que se conocen y luego iterar por todos los TODOs
  - ejecuta y mejora val-conf para asegurarte que todo está completo, que val-conf alerte que quedan todo o elementos por definir tambien será util, así el agente podra confiar en ejecutar hasta que quede bien.
