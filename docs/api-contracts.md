# API contracts

Base URL: `/api/v1`. Success shape: `{ "success": true, "data": ... }`; collection endpoints may include `{ "pagination": { "page", "limit", "total", "pages" } }`. Error shape: `{ "success": false, "error": { "code", "message" } }`.

## Implemented endpoints

| Method | Path | Access | Behavior |
|---|---|---|---|
| GET | `/health` | Public | API and DB readiness, evaluation disabled status |
| GET | `/codebases?q=&difficulty=&language=&framework=&tag=&page=&limit=&sort=` | Authenticated candidate | Published-only search/filter, sort by newest/oldest/difficulty/estimated time, and pagination |
| GET | `/codebases/:id` | Authenticated candidate | Candidate-safe published details and file metadata; increments views |
| GET | `/codebases/:id/files?q=` | Authenticated candidate | Published file tree and metadata; optional filename search |
| GET | `/codebases/:id/file?path=` | Authenticated candidate | Read one validated published text file |
| POST | `/codebases/:id/bookmark` | Authenticated | Bookmark published codebase |
| DELETE | `/codebases/:id/bookmark` | Authenticated | Remove own bookmark |
| GET | `/bookmarks` | Authenticated | Current user's published bookmarks |
| GET/POST | `/codebases/:id/workspace` | Authenticated | Retrieve active version-bound workspace or create/retrieve one; candidate files returned without storage keys |
| PATCH | `/codebases/:id/workspace/:attemptId` | Workspace owner | Save file deltas/reset paths with required revision; rejects paths outside source tree |
| POST | `/codebases/:id/workspace/:attemptId/reset` | Workspace owner | Reset candidate overrides to published source with revision check |
| GET | `/attempts` | Authenticated | Current user's attempt and submission summaries |
| GET | `/codebases/:id/attempts` | Authenticated | Current user's attempts for this codebase only |
| POST | `/codebases/:id/attempts` | Authenticated | Compatibility alias to create/retrieve the active workspace |
| PATCH | `/codebases/:id/attempts/:attemptId` | Attempt owner | Compatibility save alias; requires revision and rejects traversal paths |
| POST | `/codebases/:id/submissions` | Workspace owner | Persist immutable file snapshot, status `NOT_EVALUATED` |
| GET | `/codebases/:id/submissions` | Authenticated | Current user's submission metadata only |
| GET | `/submissions?codebaseId=` | Authenticated | Current user's submission summaries |
| GET | `/submissions/:submissionId` | Submission owner | View own immutable snapshot contents |
| GET | `/progress` | Authenticated | Own progress and currently available bookmarks; no auto-completion |
| GET | `/creator/codebases` | Creator or admin | Current creator's records |
| POST | `/creator/codebases` | Creator or admin | Create draft |
| GET | `/creator/codebases/:id` | Creator/admin + owner | Draft/published private creator view |
| PATCH | `/creator/codebases/:id` | Creator/admin + owner | Update allowlisted fields; pass `version` for conflict detection |
| DELETE | `/creator/codebases/:id` | Creator/admin + owner | Permanently delete own draft only |
| POST | `/creator/codebases/:id/publish` | Creator/admin + owner | Validate and publish |
| POST | `/creator/codebases/:id/archive` | Creator/admin + owner | Archive |
| GET | `/creator/dashboard?page=&limit=&status=&difficulty=&language=&framework=&q=&sort=` | Creator/admin | Persisted metrics, owned rows, filtering and pagination |
| POST | `/creator/codebases` | Creator/admin | Create allowlisted draft metadata; ownership is derived from identity |
| GET | `/creator/codebases/:id/preview` | Creator/admin + owner | Candidate-safe preview with source file contents |
| POST | `/creator/codebases/:id/versions` | Creator/admin + owner | Fork a published codebase into a new owner-owned draft |
| GET | `/creator/codebases/:id/versions` | Creator/admin + owner | List immutable published version metadata |
| POST | `/creator/codebases/:id/publish` | Creator/admin + owner | Validate and publish; previous published series versions are archived |
| POST | `/creator/codebases/:id/restore` | Creator/admin + owner | Restore an archived version as the active published version |
| POST | `/creator/codebases/:id/upload` | Creator/admin + owner | Import bounded UTF-8 text files from ZIP field `archive` |
| GET | `/creator/codebases/:id/files?q=` | Creator/admin + owner | Return owned source file tree (without contents) |
| GET | `/creator/codebases/:id/file?path=` | Creator/admin + owner | Read one owned source file |
| POST | `/creator/codebases/:id/files` | Creator/admin + owner | Add one draft source file |
| PUT | `/creator/codebases/:id/files` | Creator/admin + owner | Replace draft source file set |
| PATCH | `/creator/codebases/:id/file-content` | Creator/admin + owner | Update one draft source file, optionally with version conflict token |
| PATCH | `/creator/codebases/:id/files/rename` | Creator/admin + owner | Rename a draft source file |
| DELETE | `/creator/codebases/:id/files?path=` | Creator/admin + owner | Delete a draft source file |
| POST/DELETE | `/creator/codebases/:id/directories` | Creator/admin + owner | Add/remove an empty logical directory |
| POST | `/creator/codebases/:id/import-github` | Creator/admin + owner | Validates a public GitHub URL, then returns 501 because fetch/import is disabled |
| GET | `/codebase-battles?q=&status=&difficulty=&language=&sort=&page=&limit=` | Authenticated eligible candidate | Eligible version-bound battles; status `upcoming`, `live`, or `completed`; filters and pagination |
| POST | `/codebase-battles` | Creator or admin | Create battle draft from an owned codebase and published version |
| GET | `/codebase-battles/mine` | Creator or admin | List owned battles |
| GET | `/codebase-battles/manage/:id` | Creator/admin + owner | Organizer detail for an owned battle |
| GET | `/codebase-battles/manage/:id/summary` | Creator/admin + owner | Owned battle with registration and submission counts |
| PATCH | `/codebase-battles/manage/:id` | Creator/admin + owner | Edit battle before start, including exact challenge version |
| POST | `/codebase-battles/manage/:id/publish` | Creator/admin + owner | Publish a valid scheduled draft |
| POST | `/codebase-battles/manage/:id/cancel` | Creator/admin + owner | Cancel a battle before it starts |
| GET | `/codebase-battles/manage/:id/participants` | Creator/admin + owner | Registered candidate IDs and submission status |
| GET | `/codebase-battles/manage/:id/submissions` | Creator/admin + owner | Submission metadata after battle completion |
| GET | `/codebase-battles/manage/:id/submissions/:submissionId` | Creator/admin + owner | Read an authorized submission snapshot after completion |
| POST | `/codebase-battles/manage/:id/results/publish` | Creator/admin + owner | Publish completion/submission status; rankings remain unavailable |
| GET | `/codebase-battles/:id` | Eligible candidate | Public battle/challenge preview, own registration, server time |
| GET | `/codebase-battles/:id/lobby` | Registered candidate | Lobby state and server-authoritative timestamps |
| GET | `/codebase-battles/:id/registration` | Authenticated | Current user's registration status |
| POST/DELETE | `/codebase-battles/:id/register` | Eligible candidate | Register or cancel before registration cutoff |
| GET/POST | `/codebase-battles/:id/workspace` | Registered candidate | Read own workspace or create during live battle |
| PATCH | `/codebase-battles/:id/workspace/:workspaceId` | Workspace owner | Save validated file deltas with revision check before server deadline |
| POST | `/codebase-battles/:id/submit` | Workspace owner | Create one immutable snapshot before server deadline; evaluation is `NOT_EVALUATED` |
| GET | `/codebase-battles/:id/results` | Eligible candidate | Completion and own submission status; no rankings |
| GET | `/codebase-battles/submissions/:submissionId` | Submission owner | Read own snapshot contents |
| GET | `/codebase-battles/history` | Authenticated | Own registration, submission, and battle history |
| GET | `/codebase-battles/:id/leaderboard` | Eligible candidate | Explicit disabled response with `rankings: null`; drafts, cancelled, legacy-unbound, and ineligible battles are hidden |

Features not implemented include an evaluation job runner/sandbox, verified scores, rankings, Socket.IO events, user-name participant profiles, and automatic capacity/report reconciliation after process failure. Battles use REST polling and expose no fake evaluation output.

Creator routes require creator or admin role and scope every record lookup to the authenticated owner. Draft inputs are allowlisted; owner, state, and internal storage keys are server-controlled. Candidate routes read published records only and use an explicit public serializer, which omits private interviewer fields, version-series internals, and storage keys. Candidate workspace writes require ownership and a monotonically increasing revision. ZIP ingestion is limited by compressed size, expanded size, file count, per-file bytes, accepted extensions, and safe relative paths. Project, candidate workspace, and submission files currently use private local disk storage configured by `CODEBASE_STORAGE_DIR`.

Battle discovery and detail reads exclude drafts, cancellations, and legacy records without a codebase-version reference. Lifecycle is computed from server timestamps and persisted by startup/periodic recovery; the client countdown is display only. There is no Socket.IO server. Registration capacity uses a conditional database update plus the unique battle/user index and compensating rollback; MongoDB transaction and crash behavior has not been verified. Candidate workspace and submission queries bind battle, registration, workspace, and authenticated user. Results never contain rankings without verified evaluator output.
