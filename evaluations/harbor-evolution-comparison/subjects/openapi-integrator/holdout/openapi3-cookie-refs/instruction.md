Use the installed `openapi-integrator` skill to generate a reusable integration
from `/app/input/openapi.json`.

Place the final skill root exactly at `/app/artifacts/parcel-sdk`; do not create
a nested `parcel-sdk` directory. Include `SKILL.md`, `scripts/api_client.py`,
and `references/openapi.json`. The client must compile, list every operation,
substitute referenced path and query parameters, and preserve the referenced
JSON request body.

Implement the declared cookie API-key scheme using `PARCEL_SDK_API_KEY` and the
cookie name from the source specification. Do not reinterpret it as bearer or
Authorization-header authentication, and do not contact the example host while
generating the files.
