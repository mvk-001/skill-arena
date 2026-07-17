Use the installed `openapi-integrator` skill to generate a reusable integration
from `/app/input/openapi.json`.

The final skill root must be exactly `/app/deliverables/warehouse-client` (not a
nested directory). It must contain `SKILL.md`, `scripts/api_client.py`, and
`references/openapi.json`. Preserve the source operations, including the
fallback identifier for the operation without `operationId`, and make
`python scripts/api_client.py --list` usable.

The generated client must substitute path and query parameters. Map the HTTP
Basic scheme using `WAREHOUSE_CLIENT_API_KEY`, whose value is
`username:password`, while respecting the operation-level `security: []`
override so the health operation sends no credentials. Do not contact the real
example server while generating the files.
