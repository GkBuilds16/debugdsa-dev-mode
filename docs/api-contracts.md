# API contracts

Base URL: `/api/v1`. Success shape: `{ "success": true, "data": ... }`; collection endpoints may include `{ "pagination": { "page", "limit", "total", "pages" } }`. Error shape: `{ "success": false, "error": { "code", "message" } }`.

## Implemented endpoints

| Method | Path | Access | Behavior |
|---|---|---|---|
| GET | `/health` | Public | API and DB readiness, evaluation disabled status |
| GET | `/codebases?q=&difficulty=&language=&page=&limit=&sort=` | Public | Published-only filtered list |
| GET | `/codebases/:id` | Public | Published detail; increments views |
| POST | `/codebases/:id/bookmark` | Authenticated | Bookmark published codebase |
| DELETE | `/codebases/:id/bookmark` | Authenticated | Remove own bookmark |
| GET | `/bookmarks` | Authenticated | Current user's published bookmarks |
| GET | `/codebases/:id/attempts` | Authenticated | Current user's attempt metadata |
| POST | `/codebases/:id/attempts` | Authenticated | Create a candidate-owned copy of source files |
| PATCH | `/codebases/:id/attempts/:attemptId` | Attempt owner | Save candidate workspace; rejects traversal paths |
| POST | `/codebases/:id/submissions` | Attempt owner | Persist submission snapshot, evaluation disabled |
| GET | `/codebases/:id/submissions` | Authenticated | Current user's submission metadata only |
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

Endpoints from the full product brief that are not listed above are not implemented yet. In particular, candidate progress dashboards, battle cancellation/management, participant listing, live battle submissions, and real evaluation are pending.

Creator routes require creator or admin role and scope every record lookup to the authenticated owner. Draft inputs are allowlisted; owner, state, and internal storage keys are server-controlled. Candidate routes read published records only and use the public serializer, which omits all private interviewer fields and internal storage keys. ZIP ingestion is limited by compressed size, expanded size, file count, per-file bytes, accepted extensions, and safe relative paths. Project files currently use private local disk storage configured by `CODEBASE_STORAGE_DIR`.
