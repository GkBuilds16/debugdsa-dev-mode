# Integration guide

1. Mount the feature UI beneath a platform-owned path such as `/dev-mode/*`; do not add a second platform navbar, profile, login, or global leaderboard.
2. Replace `backend/src/identity.js` with an adapter around the existing JWT middleware and normalize the verified user to `{ id, roles }`. Do not pass a user ID from browser input. The standalone HS256 verifier does not check issuer or audience; confirm the host's algorithm, issuer, audience, key rotation, identity claim, and role mapping before mounting.
3. Before mounting the React entry point, provide `window.DebugDSAAuth.getAccessToken()` as an async function that returns a current platform access token. The shared API client attaches it as a bearer token and does not persist credentials. The standalone development identity mode is only for local development.
4. Mount the Dev Mode router under `/api/v1` and preserve the platform's CORS, logging, error handling, and rate-limits.
5. Configure the same MongoDB deployment and review collection naming, index creation, and migration plan before rollout.
6. Battles currently use REST polling and do not attach to Socket.IO. If a host later adds socket updates, namespace rooms and revalidate identity, registration, and deadlines on every event.
7. Keep global points and leaderboard integration behind a platform-owned interface; Dev Mode currently awards no points and does not produce rankings.

Candidate and battle workspace/submission files currently use private local filesystem storage. Configure durable shared/object storage before multi-instance deployment. Code evaluation is disabled and submissions are labeled `NOT_EVALUATED`. Battle transitions are recovered at startup and polled periodically by the API process; deploy one or more worker processes only after validating database behavior and the 15-second recovery loop. Migrate any preexisting battle records that lack exact `CodebaseVersion` references before enabling organizer workflows for that data.

Environment values are documented in `.env.example`. The original production repository is not modified by this project.
