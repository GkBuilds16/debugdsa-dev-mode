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
| `codebaseversions` | Immutable published snapshots, version number, series and creator reference. | Unique seriesId + version |

Timestamps are enabled. Codebase uses Mongoose optimistic concurrency. `version` is incremented by creator edits and publish/archive actions, and clients may include the version they edited to detect stale writes.

## Storage and limits

`Codebase.files` stores relative paths and generated local storage keys; file text and keys are excluded from default query selection. The creator serializer reads private file contents from disk; public serializers expose only path and text for published challenges. The default root is `backend/storage-data/codebases`, ignored by Git. Set `CODEBASE_STORAGE_DIR` to move it. ZIP imports reject unsupported/binary or unsafe paths and enforce bounded archive, entry, file, and expanded-size limits.

## Planned integration collections

`BattleSubmission` and `BattleEvaluation` remain future slices. Candidate attempts/bookmarks/submissions are persisted. Published version snapshots are implemented. MongoDB transactions are not used for publishing and version creation, so a process/database failure between writes can leave partial state; add transactions when deployment topology supports them. Unique indexes and a conditional battle counter protect the current registration constraints.
