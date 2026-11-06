# Database schema

## Collections

| Collection | Ownership and purpose | Key indexes |
|---|---|---|
| `codebases` | Creator ID, challenge metadata, files, state and version. Private fields use Mongoose `select:false`. | owner + state; state + createdAt; text index on title/description/tags |
| `battles` | Creator, published codebase reference, schedule, capacity and lifecycle status. | startsAt + status |
| `battleregistrations` | Battle and authenticated platform user identity. | Unique battleId + userId |
| `codebasebookmarks` | Candidate bookmark relationship. | Unique codebaseId + userId; userId + createdAt |
| `codebaseattempts` | Candidate-owned file workspace and attempt state. | codebaseId + userId + updatedAt |
| `codebasesubmissions` | Immutable submitted workspace snapshot and evaluator status. | codebaseId + userId + createdAt |

Timestamps are enabled. Codebase uses Mongoose optimistic concurrency. `version` is incremented by creator edits and publish/archive actions, and clients may include the version they edited to detect stale writes.

## Planned integration collections

`CodebaseVersion`, `BattleSubmission`, and `BattleEvaluation` remain future slices. Candidate attempts/bookmarks/submissions are persisted. Source archive storage is not implemented. Multi-document transactions should be introduced where coupled records need atomicity; unique indexes and a conditional battle counter protect the current registration constraints.
