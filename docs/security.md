# Security model

- The identity adapter derives user ID and roles from an HS256 JWT in JWT mode; it checks signature, token shape, expiration, and not-before time. Production startup requires JWT mode and a secret of at least 32 bytes. The local identity mode is restricted to development and test environments.
- Creator routes require a `creator` or `admin` role and bind every codebase operation to the authenticated owner. Battle creation also requires creator/admin; candidate operations bind records to the authenticated identity.
- Creator queries always bind `ownerId` to the authenticated context. Public codebase queries constrain state to `PUBLISHED`.
- Candidate serializers omit owner IDs, interviewer notes, and hidden tests. Hidden fields use Mongoose `select:false`; creator detail opts in explicitly.
- Helmet, configured CORS origin, JSON body size cap, API rate limit, non-disclosing error responses, and ID validation are enabled.
- Invalid JSON and oversized request bodies receive safe 400/413 responses. Unexpected server errors log only error type/name and return a generic message.
- Post Codebase draft inputs use an explicit allowlist, so clients cannot set owner/state/storage keys. File paths are constrained to safe relative paths; ZIP entries reject traversal, symlink and encrypted entries, disallowed extensions and oversized file/count/expanded payloads. ZIP extraction writes decoded text through generated local storage keys rather than trusting archive paths as filesystem paths. GitHub fetching is disabled.
- Candidate routes require a valid identity. Candidate serialization removes private interviewer fields, owner IDs, publication-series internals, and storage keys. Source reads require a currently published codebase and return one validated relative path at a time. Workspace and submission queries bind both identity and codebase/attempt IDs; file contents and generated keys remain private.
- Candidate workspace edits are limited to existing source paths and enforce per-file/project limits. Updates require the current revision in an owner-scoped conditional write; stale writes return a conflict. Submission snapshots copy current files to new storage keys and can only be read by their owner.
- Bookmarks use a unique codebase/user index and filter against current published state; stale bookmarks do not expose archived challenges. Progress labels only reflect real attempt/submission records and never imply completion from submission alone.
- Candidate code is never executed. `EXECUTION_ENABLED` is not a switch that enables unsafe execution; evaluation stays disabled until a sandbox provider is added.
- JWT-mode integration currently validates HS256 locally. Issuer/audience claims and key rotation are not validated; confirm production claim names, issuer/audience requirements, and role mapping before mounting. Prefer a direct middleware adapter when both apps share a server.

## Security work still required before production

Add deeper API-level authorization/confidentiality coverage, schema-specific edge-case validation, auth issuer/audience validation or shared middleware mounting, malware scanning and durable object storage, database least-privilege credentials, and isolated evaluator threat review. Current tests do not replace MongoDB-backed concurrency and privilege tests. Development identity must never be used outside local development.
