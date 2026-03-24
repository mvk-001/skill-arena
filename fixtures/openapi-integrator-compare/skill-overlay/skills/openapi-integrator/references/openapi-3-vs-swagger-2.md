# OpenAPI 3.x vs Swagger 2.x

This note explains how `openapi_to_skill.py` handles both formats.

## Version Detection

- OpenAPI 3.x: root field `openapi`
- Swagger 2.x: root field `swagger`

## Base URL Extraction

- OpenAPI 3.x: first entry in `servers[].url`
- Swagger 2.x: `schemes[0] + host + basePath`

## Security Scheme Source

- OpenAPI 3.x: `components.securitySchemes`
- Swagger 2.x: `securityDefinitions`

## Request Body Handling

- OpenAPI 3.x: reads `requestBody.content.application/json.schema`
- Swagger 2.x: no `requestBody`; body parameters are represented differently

## Response Schema Handling

- OpenAPI 3.x: reads `responses[*].content.application/json.schema`
- Swagger 2.x: reads `responses[*].schema`

## Practical Guidance

- Prefer OpenAPI 3.x for modern APIs.
- Use Swagger 2.x inputs when legacy specs are still authoritative.
- For mixed ecosystems, keep generated skill names stable with `--name`.
