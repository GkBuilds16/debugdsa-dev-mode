# Database schema

## Collections

| Collection | Ownership and purpose | Key indexes |
|---|---|---|
| `codebases` | Creator ID, challenge metadata, files, state and version. Private fields use Mongoose `select:false`. | owner + state; state + createdAt; text index on title/description/tags |
| `battles` | Creator, published codebase reference, schedule, capacity and lifecycle status. | startsAt + status |
| `battleregistrations` | Battle and authenticated platform user identity. | Unique battleId + userId |
| `codebasebookmarks` | Candidate bookmark relationship. | Unique codebaseId + userId; userId + createdAt |
| `codebaseattempts` | Candidate-owned workspace revision/state, published CodebaseVersion reference, and private generated-key overrides. File contents are outside MongoDB. | Unique active codebaseId + publishedVersion + userId (partial `IN_PROGRESS`); codebaseId + userId + updatedAt |
| `codebasesubmissions` | Immutable submitted snapshot references, version identity, file count, and evaluation status. Snapshot contents are outside MongoDB. | Unique attemptId; codebaseId + userId + createdAt |
| `codebaseversions` | Immutable published snapshots, version number, series and creator reference. | Unique seriesId + version |
| `battles` | Organizer-owned configuration, exact CodebaseVersion reference, schedule, capacity, eligibility, and lifecycle state. | startsAt + status; ownerId + startsAt |
| `battleregistrations` | Candidate registration and cancellation record. | Unique battleId + userId; battleId + status + createdAt |
| `battleworkspaces` | Workspace bound to battle, registration, candidate, and exact challenge version. File contents are in private local storage. | Unique battleId + userId; unique registrationId |
| `battlesubmissions` | One immutable file snapshot per battle workspace and evaluation status. | Unique workspaceId; battleId + createdAt; battleId + userId |

Timestamps are enabled. Codebase uses Mongoose optimistic concurrency. `version` is incremented by creator edits and publish/archive actions, and clients may include the version they edited to detect stale writes.

`CodebaseVersion.snapshot` is stored as `Mixed`, so Mongoose does not recursively enforce historical snapshot shape. It is written by the allowlisted publish service and should be validated before a future migration/import writes snapshots. The indexes above describe schema declarations; index creation has not been confirmed against live MongoDB.

## Storage and limits

`Codebase.files` stores relative paths and generated local storage keys; file text and keys are excluded from default query selection. Candidate workspace overrides and submission snapshots use the same private local storage adapter with independent generated keys. Candidate responses expose file contents only through a published-file endpoint or the signed-in candidate's own workspace/submission endpoints. Public detail responses contain metadata only. The default root is `backend/storage-data/codebases`, ignored by Git. Set `CODEBASE_STORAGE_DIR` to move it. ZIP imports reject unsupported/binary or unsafe paths and enforce bounded archive, entry, file, and expanded-size limits.

## Planned integration collections

Battle evaluation records are not created because there is no verified evaluation provider. Battle submissions use `NOT_EVALUATED` with no score or result. Capacity reservation uses a conditional update and unique registration index with compensating rollback if registration insertion fails; a process crash can still split those writes. MongoDB transactions are also not used for codebase publishing or local file/database coordination. Add transactions where supported and orphan cleanup before production. Apply new indexes to deployed databases and review duplicate registrations, legacy battles without exact version references, and duplicate active candidate attempts before migration.
