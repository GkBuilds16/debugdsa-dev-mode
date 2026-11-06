# Security model

- The identity adapter derives user ID and roles from an HS256 JWT in JWT mode; it checks signature, token shape, expiration, and not-before time. Production startup requires JWT mode and a secret of at least 32 bytes. The local identity mode is restricted to development and test environments.
- Creator routes require a `creator` or `admin` role and bind every codebase operation to the authenticated owner. Battle creation also requires creator/admin; candidate operations bind records to the authenticated identity.
- Creator queries always bind `ownerId` to the authenticated context. Public codebase queries constrain state to `PUBLISHED`.
- Candidate serializers omit owner IDs, interviewer notes, and hidden tests. Hidden fields use Mongoose `select:false`; creator detail opts in explicitly.
- Helmet, configured CORS origin, JSON body size cap, API rate limit, non-disclosing error responses, and ID validation are enabled.
- Invalid JSON and oversized request bodies receive safe 400/413 responses. Unexpected server errors log only error type/name and return a generic message.
- Post Codebase draft inputs use an explicit allowlist, so clients cannot set owner/state/storage keys. File paths are constrained to safe relative paths; ZIP entries reject traversal, symlink and encrypted entries, disallowed extensions and oversized file/count/expanded payloads. ZIP extraction writes decoded text through generated local storage keys rather than trusting archive paths as filesystem paths. GitHub fetching is disabled.
- Public candidate serialization removes private interviewer fields, owner IDs, and storage keys; codebase file contents are returned only for published codebases. Dashboard and candidate list queries do not include file contents.
- Candidate code is never executed. `EXECUTION_ENABLED` is not a switch that enables unsafe execution; evaluation stays disabled until a sandbox provider is added.
- JWT-mode integration currently validates HS256 locally. Issuer/audience claims and key rotation are not validated; confirm production claim names, issuer/audience requirements, and role mapping before mounting. Prefer a direct middleware adapter when both apps share a server.

## Security work still required before production

Add deeper API-level authorization/confidentiality coverage, schema-specific edge-case validation, auth issuer/audience validation or shared middleware mounting, malware scanning and durable object storage, database least-privilege credentials, and isolated evaluator threat review. Current tests do not replace MongoDB-backed concurrency and privilege tests. Development identity must never be used outside local development.
