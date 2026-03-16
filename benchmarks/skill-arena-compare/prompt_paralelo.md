Necesito 6 agentes buscando las mejores estrategias para mejorar esta (skills\skill-arena-compare) skill

cada uno lo que hará es:
1. ejecutar su version del archivo de configuracion `node ./src/cli/run-compare.js ./benchmarks/skill-arena-compare/compare.yaml`
2. Luego revises los resultados que fallan y en base de eso, si es un falso negativo, es decir, lo hizo bien, pero el sistema no lo valido correctamente, mejores el compare.yaml, si es un falso positivo, es decir, el sistema dice que fue correcto, pero en realidad falló la validación y tomo como correcto algo que deberia haber fallado arregles el compare.yaml. y usando los true negativos, aprendas y propongas mejoras a la skill.
3. cuando propongas una idea que pienses pueda mejorar el resultado de la version que si usa la skill intenta que sea en uno de estos ambitos: 1. Mejorar el documento, puedes mejorar el documento haciendolo más simple (borrando lo innecesario), haciendolo más descriptibo, generando nuevas referencias que puedan ayudar a entender lo que se busca, generando scripts (dentro de la carpeta scripts) que hagan varias tareas automaticas, y dejes la documentacion como el agente puede usarlas para mejorar sus resultados o puedes mejorar haciendo assets que pueda usar de referencia
4. evalues nuevamente ejecutando el script, si funciona mejor, se queda, si funciona peor, revierte los cambios
5. guarda los intentos tanto fallidos o exitosos on learning.log, asi puedes evitar repetir los mismo, asegurate de no sobreescribir el progreso de otros, siempre append al final.
6. regresa a paso 2

Que está permitido:
- Crear scripts en la skills bajo `scripts`
- Crear references en la skills, bajo `references`
- Crear templates y esqueletos en assets bajo `assets`
- modificar SKILL.md 
- Modificar la evaluations solo en el caso que se haya encontrado falso positivos y falso negativos para arreglarlos

No esta permitido:
- Modificar algo de la evalaución que no sea dentro de la evaluacion
- Agregar archivos fuera de la skill folder (skills\skill-arena-compare)


Hints:
- un SKILL.md más simple es más fácil de entender.
- un script bien ejecutado no falla, ya que siempre hará lo que se espera
- el output de los scripts pueden retornar siguientes pasos, que puede ser contextual basado en que está sucediendo.

Asume que el que hará la acción tiene deficit atencional y le cuesta recordar instrucciones largas

luego, toma los que lograron algo y mezcla las soluciones en solo una
