Trabaja en un loop autónomo para mejorar `skills/skill-arena-compare`.

Reglas:
- Haz baseline primero:
  `node ./src/cli/run-compare.js ./benchmarks/skill-arena-compare/compare.yaml`
- En cada iteración, prueba solo una hipótesis.
- Nunca mezcles en la misma iteración cambios de evaluación y cambios de skill.
- Si tocas evaluación, modifica solo `benchmarks/skill-arena-compare/compare.yaml` y solo para corregir falsos positivos o falsos negativos probados.
- Si tocas la skill, solo puedes modificar:
  - `skills/skill-arena-compare/SKILL.md` # Archivo que carga por defecto
  - `skills/skill-arena-compare/scripts` # Scripts que puede usar (debe ser referenciado para darse a conocer)
  - `skills/skill-arena-compare/references`  # referencias extendidas (debe ser referenciado para darse a conocer)
  - `skills/skill-arena-compare/assets`  # templates (debe ser referenciado para darse a conocer)
- Después de cada cambio, re-ejecuta el benchmark.
- Si mejora el resultado, o corrige un FP/FN real, conserva el cambio.
- Si empeora, es ambiguo, o agrega ruido, revierte.
- Registra cada intento en `skills/skill-arena-compare/learning.log` con append-only.
- Evita repetir hipótesis ya registradas.
- Prioriza instrucciones simples, cortas y robustas. Asume que el ejecutor se distrae fácil.

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