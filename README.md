# DebugDSA Dev Mode

An independent React and Express feature package for **Post Codebase**, **View Codebases**, and **Battles Codebase**. It does not include platform authentication, profile, global navigation, or global leaderboard features. The repository has a dedicated `origin` remote and does not modify the production DebugDSA repository.

## Current implementation

- Creator-owned drafts, edit/version conflict handling, publish validation, archive, and draft deletion.
- Post Codebase creator dashboard with persisted status metrics, search/filters, preview, publish/archive/restore, and published version history.
- Multi-section Post Codebase editor with metadata, setup instructions, source tree editing, ZIP import, autosave, candidate preview, and private interviewer evaluation fields.
- Published version snapshots and independent draft forks; project text is held in private local storage using generated keys.
- Public, paginated published-codebase discovery with text and difficulty filters.
- Candidate bookmarks, private attempts/workspaces, and submission snapshots are persisted through APIs.
- Battle scheduling records, creator-role checks, authenticated registration with unique and capacity constraints, and server deadline checks.
- Candidate APIs explicitly omit creator notes and hidden tests.
- Candidate execution and competition rankings remain disabled until a genuine isolated evaluator exists.
- Dark responsive React workspace for creator creation/editing, discovery/detail viewing, and battle registration.

GitHub import currently validates a public repository URL and then returns 501; it does not fetch source. MongoDB connectivity and persistent-storage deployment have not been verified. This is an active implementation baseline, not a claim that every item in the master implementation brief is delivered. See [known limitations](docs/deployment.md).

## Run locally

Requirements: Node.js 20+, npm, MongoDB.

1. Copy `.env.example` to `backend/.env` and set `MONGODB_URI`.
2. From the repository root run `npm install`.
3. Run `npm run dev`.
4. Open <http://localhost:5173>. API health is at <http://localhost:5000/api/v1/health>.

The default identity adapter is development-only and assigns the configured local identity. For production set `AUTH_MODE=jwt`, `JWT_SECRET` (at least 32 bytes), `MONGODB_URI`, and `NODE_ENV=production`. HS256 tokens are checked for signature, expiration, and not-before time. Never deploy with development identity enabled. See [security](docs/security.md).

## Workspaces

- `frontend/` React 18 + Vite feature entry point.
- `backend/` Express REST API, Mongoose models, identity adapter.
- `docs/` architecture, schema, API, security, integration, testing, deployment.

## API prefix

All endpoints use `/api/v1`. Responses follow `{ success, data, pagination?, error? }`. See [API contracts](docs/api-contracts.md).

## Checks

Run backend tests with `npm test`, frontend component tests with `npm run test -w frontend`, and the production frontend bundle with `npm run build`. Tests mock database calls and do not prove MongoDB connectivity. See [testing](docs/testing.md) for coverage and gaps.
