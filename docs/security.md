# Security model

- The identity adapter derives user ID and roles from an HS256 JWT in JWT mode; it checks signature, token shape, expiration, and not-before time. Production startup requires JWT mode and a secret of at least 32 bytes. The local identity mode is restricted to development and test environments.
- Creator routes require a `creator` or `admin` role and bind every codebase operation to the authenticated owner. Battle creation also requires creator/admin; candidate operations bind records to the authenticated identity.
- Creator queries always bind `ownerId` to the authenticated context. Public codebase queries constrain state to `PUBLISHED`.
- Candidate serializers omit owner IDs, interviewer notes, and hidden tests. Hidden fields use Mongoose `select:false`; creator detail opts in explicitly.
- Helmet, configured CORS origin, JSON body size cap, API rate limit, non-disclosing error responses, and ID validation are enabled.
- Invalid JSON and oversized request bodies receive safe 400/413 responses. Unexpected server errors log only error type/name and return a generic message.
- Inputs are constrained by Mongoose schema lengths/enums and required-field checks. ZIP upload is not implemented, so no archive extraction is exposed.
- Candidate code is never executed. `EXECUTION_ENABLED` is not a switch that enables unsafe execution; evaluation stays disabled until a sandbox provider is added.
- JWT-mode integration currently validates HS256 locally. Issuer/audience claims and key rotation are not validated; confirm production claim names, issuer/audience requirements, and role mapping before mounting. Prefer a direct middleware adapter when both apps share a server.

## Security work still required before production

Add API-level automated authorization/confidentiality tests, schema-specific comprehensive request validators, auth issuer/audience validation or shared middleware mounting, upload scanning and safe storage, database least-privilege credentials, and isolated evaluator threat review. Development identity must never be used outside local development.
