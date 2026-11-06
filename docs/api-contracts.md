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
| GET | `/codebase-battles` | Authenticated | Scheduled battle listing |
| POST | `/codebase-battles` | Creator or admin | Schedule a battle from own published codebase |
| POST | `/codebase-battles/:id/register` | Authenticated | Register before deadline; duplicate rejected |
| GET | `/codebase-battles/:id/leaderboard` | Authenticated | Empty disabled response, explicitly not ranked |

Endpoints from the full product brief that are not listed above are not implemented yet. Battle cancellation/management, participant listing, live battle submissions, and actual evaluation remain pending.

Creator routes require creator or admin role and scope every record lookup to the authenticated owner. Draft inputs are allowlisted; owner, state, and internal storage keys are server-controlled. Candidate routes read published records only and use an explicit public serializer, which omits private interviewer fields, version-series internals, and storage keys. Candidate workspace writes require ownership and a monotonically increasing revision. ZIP ingestion is limited by compressed size, expanded size, file count, per-file bytes, accepted extensions, and safe relative paths. Project, workspace, and snapshot files currently use private local disk storage configured by `CODEBASE_STORAGE_DIR`.
