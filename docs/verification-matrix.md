# Implementation and verification matrix

This matrix separates code and mock-based checks from external integration checks. No real MongoDB deployment, host platform, or production storage was available during this audit.

| Area | Implemented behavior | Verification evidence | Status |
|---|---|---|---|
| Post Codebase | Creator dashboard, allowlisted drafts, autosave/version checks, bounded ZIP import, file operations, preview, publish/version snapshots, archive/restore, ownership scoping | Backend route/service tests and creator component tests; ZIP parser tests; no browser end-to-end or full feature route-to-real-database workflow | PASS WITH LIMITATIONS |
| View Codebases | Published-only discovery/detail, candidate workspace overrides, revisioned autosave/reset, immutable submissions, attempts, bookmarks, progress | Candidate API tests for identity/ownership/private serialization and component tests; cross-module service regression; no MongoDB execution | PASS WITH LIMITATIONS |
| Battles | Owner-scoped organizer routes, exact CodebaseVersion binding, capacity predicate and unique index, server-time lifecycle/cutoffs, registered candidate workspaces, immutable snapshots, polling | Battle service/controller tests and component tests; cross-module service regression; no real concurrent MongoDB write test | PASS WITH LIMITATIONS |
| Authentication | Development-only identity and HS256 JWT signature, exp, nbf, identity, role checks; frontend bearer adapter | Unit tests validate token shape/signature/expiry and role; host token provider not present for verification | PASS WITH LIMITATIONS |
| Candidate privacy | Explicit candidate serializer allowlists; candidate-owned workspace/submission query predicates; hidden creator fields excluded | API/service tests assert private fields and cross-user filters | PASS WITH LIMITATIONS |
| File and ZIP safety | Relative path and extension policy, archive bounds, symlink/traversal rejection, opaque generated storage keys | Unit tests; local storage only; no adversarial deployed filesystem test | PASS WITH LIMITATIONS |
| MongoDB | Mongoose schemas/index declarations, optimistic/revision predicates, conditional battle capacity | Schema/query mocks only; connectivity, index creation, transactions, and real races not exercised | NOT VERIFIED |
| Evaluation | Provider explicitly reports `NOT_EVALUATED`; source is not executed | Tests assert provider unavailable and no fabricated output | PASS (disabled by design) |
| Storage/deployment | Private local filesystem storage with configurable root | Unit tests cover put/read/remove; durability, backups, permissions under deployment, and multiple instances not tested | NOT VERIFIED |
| UI/browser | React/Vite pages, validation/error/loading/autosave flows, responsive CSS, component coverage | Component tests and production bundle; no browser console, accessibility tooling, or end-to-end interaction audit run | PASS WITH LIMITATIONS |
| Documentation | README and module contracts plus security, schema, integration, deployment, test guidance | Reviewed against current routes and code; this matrix records boundaries | PASS WITH LIMITATIONS |

## Cross-module regression

`backend/src/crossModule.test.js` verifies, using mocked Mongoose calls and real temporary local source objects, that the published source reference feeds candidate workspace and immutable submission services, and that a battle binds the same exact `CodebaseVersion` and opens a version-bound workspace. It does **not** create a creator record through HTTP, connect MongoDB, test actual registration persistence, or exercise the frontend in a browser. Separate battle tests cover registration capacity predicate and duplicate rollback behavior at the service/query level.

## Production readiness

The repository is not verified for production deployment. Before production use, integrate the host's verified auth middleware or configure JWT issuer/audience validation and claim mapping; verify indexes and races against MongoDB; move source/workspace/submission files to durable private object storage; add backup, retention and orphan cleanup; perform platform browser and accessibility testing; and plan a reviewed migration for legacy battles without version references. Do not enable code execution without a separately reviewed isolation boundary.
