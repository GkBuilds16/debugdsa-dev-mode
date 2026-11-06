# Testing

Run backend tests from the root with `npm test`, and compile the frontend with `npm run build`. At the time of the engineering audit, 14 backend tests passed. The suite covers health/discovery route mounting, public response confidentiality, creator ownership query scoping, candidate attempt/submission boundaries, malformed JSON errors, identity/JWT cases, and schema constraints. The route tests use mocked Mongoose model calls and an ephemeral HTTP server; they do not constitute MongoDB integration, database concurrency, frontend component, or end-to-end verification.

Remaining high-priority tests: creator draft/publish/update conflicts, full candidate endpoint ownership/confidentiality coverage, concurrent battle capacity/duplicate registration with MongoDB, and React form/detail interactions. Then add component tests for creator workflows and discovery filtering.
