# Auth Scheme Mapping

This document maps OpenAPI auth definitions to generated client behavior.

## Source Fields

- OpenAPI 3.x: `components.securitySchemes`
- Swagger 2.x: `securityDefinitions`

## Supported Mappings

- `apiKey`
  - Detected location: `header`, `query`, or `cookie`
  - Generated docs include scheme name and key field
- `http`
  - Common schemes: `bearer`, `basic`
  - Generated docs label as HTTP auth
- `oauth2`
  - Generated docs mark scheme as OAuth2 flow
  - Manual token lifecycle support should be added in Level 3 customization
- `openIdConnect`
  - Generated docs mark scheme as OpenID Connect

## Generated Client Defaults

- Base URL env var: `<SKILL_NAME>_BASE_URL`
- Auth token env var: `<SKILL_NAME>_API_KEY`
- Header env var: `<SKILL_NAME>_AUTH_HEADER` (default `Authorization`)
- Default header usage: `Bearer <API_KEY>`

## When to Customize

Customize generated `scripts/api_client.py` if the API requires:

- Query-string API keys by default
- Non-bearer header formats
- OAuth token exchange or refresh
- HMAC or signed request authentication
