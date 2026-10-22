# API reference (baseline)

Base path: `/api/v1`. Responses are JSON. Authentication uses the `cc_session` HTTP-only cookie. Registration always creates a `VOTER`; privileged roles cannot be self-assigned. The OpenAPI document is not yet generated in the baseline build, so this human-readable listing is the current contract and should be converted to OpenAPI before extending the API.

## Implemented routes

| Method and path | Auth / role | Notes |
|---|---|---|
| `GET /health` | Public | Runtime health and prototype mode |
| `GET /session` | Public | Current session state |
| `POST /auth/register` | Public | Validates name/email/password; creates VOTER only |
| `POST /auth/login` | Public | Rate-limited; returns HTTP-only cookie |
| `POST /auth/logout` | Cookie if present | Revokes current in-memory session |
| `POST /auth/forgot-password` | Public | Generic response; in non-production writes a short-lived token link to a local private mock-mail outbox; no real email is sent |
| `POST /auth/reset-password` | Public token | Validates single-use, 15-minute token and password policy; updates password and revokes sessions |
| `GET /overview` | Public | Local fixture counts, elections, network and crypto status |
| `GET /elections` | Public | Supports `q` search and `status` filter |
| `GET /elections/:id` | Public | Public election detail |
| `GET /network` | Public | Configured RPC and proof artifact status; reports a configured chain-ID mismatch explicitly |
| `GET /crypto/status` | Public | ZK and optional public-key integration state |
| `GET /crypto/ballot-public-key` | Public | Returns only configured public key; 503 if absent |
| `GET /verify/transaction/:hash` | Public | Queries RPC if configured; does not claim ballot verified without event-level checks |
| `GET /ballots/:reference/receipt` | Public reference | Returns stored receipt metadata without plaintext selection |
| `GET /audit` | Public | Local mutable audit log, explicitly labelled non-immutable |
| `GET /eligibility/applications` | ADMIN / ISSUER | Protected review queue |
| `POST /eligibility/apply` | VOTER | Creates an eligibility review application |
| `POST /admin/elections` | ADMIN | Creates a local election draft |
| `POST /admin/elections/:id/publish` | ADMIN | Explicitly unavailable until chain lifecycle adapter is configured |
| `GET /admin/dashboard` | ADMIN | Protected admin overview |
| `GET /voter/dashboard` | Authenticated | Account, applications and election overview |
| `GET /results` | Public | Published records; fixtures are marked as non-verified |
| `POST /elections/:id/ballots` | Eligible authenticated voter | Requires configured real proof artifacts and chain prerequisites; refuses by default |
| `POST /admin/elections/:id/sync` | ADMIN | Reads configured on-chain state if chain adapter is available |

## Error model

Errors generally use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "A safe user-facing explanation."
  }
}
```

Use status codes for request validation, authentication and authorization; long-running EVM operations should have explicit status polling before production. The current baseline does not implement every route proposed in the original project brief, including a complete result tally API, threshold-share submission API, proof artifact export service, full OpenAPI spec or public auditor proof verifier.

## Sensitive data rules

- Never accept role assignments from public registration input.
- Never accept a boolean such as `verified` as proof-verification evidence.
- Do not return a voter's selected plaintext option.
- Do not put secrets or private witness data in query strings or error messages.
- Keep transaction state distinct from proof acceptance, contract execution and finality.
