# Integration guide

1. Mount the feature UI beneath a platform-owned path such as `/dev-mode/*`; do not add a second platform navbar, profile, login, or global leaderboard.
2. Replace `backend/src/identity.js` with an adapter around the existing JWT middleware and normalize the verified user to `{ id, roles }`. Do not pass a user ID from browser input.
3. Before mounting the React entry point, provide `window.DebugDSAAuth.getAccessToken()` as an async function that returns a current platform access token. The shared API client attaches it as a bearer token and does not persist credentials. The standalone development identity mode is only for local development.
4. Mount the Dev Mode router under `/api/v1` and preserve the platform's CORS, logging, error handling, and rate-limits.
5. Configure the same MongoDB deployment and review collection naming, index creation, and migration plan before rollout.
6. If the existing Socket.IO server later hosts live battles, namespace the room events and revalidate identity and deadlines server-side for every event.
7. Keep global points and leaderboard integration behind a platform-owned interface; Dev Mode currently awards no points.

Candidate source and submission files currently use private local filesystem storage. Configure durable shared/object storage before multi-instance deployment. Code evaluation is disabled and submissions are labeled `NOT_EVALUATED`.

Environment values are documented in `.env.example`. The original production repository is not modified by this project.
