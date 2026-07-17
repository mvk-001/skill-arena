Use the installed `openapi-integrator` skill to generate a reusable integration
from `/app/input/swagger.json`.

The final skill root must be exactly `/app/deliverables/ledger-relay` (without a
second `ledger-relay` directory). It must contain `SKILL.md`,
`scripts/api_client.py`, and `references/openapi.json`. The generated client
must compile and its `--list` mode must expose both the explicit operation and
the deterministic fallback operation identifier.

Honor the Swagger 2 `apiKey` definition: read the key from
`LEDGER_RELAY_API_KEY` and send it in the declared query field, never as an
Authorization header. Preserve the legacy body parameter for the create
operation, as well as path and query arguments for the read operation. Do not
call the example host while generating the integration.
