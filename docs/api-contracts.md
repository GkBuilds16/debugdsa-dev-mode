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
| GET | `/codebase-battles` | Authenticated | Scheduled battle listing |
| POST | `/codebase-battles` | Creator or admin | Schedule a battle from own published codebase |
| POST | `/codebase-battles/:id/register` | Authenticated | Register before deadline; duplicate rejected |
| GET | `/codebase-battles/:id/leaderboard` | Authenticated | Empty disabled response, explicitly not ranked |

Endpoints from the full product brief that are not listed above are not implemented yet. In particular, candidate progress dashboards, battle cancellation/management, participant listing, live battle submissions, and real evaluation are pending.
