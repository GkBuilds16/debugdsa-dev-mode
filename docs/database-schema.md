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

Timestamps are enabled. Codebase uses Mongoose optimistic concurrency. `version` is incremented by creator edits and publish/archive actions, and clients may include the version they edited to detect stale writes.

## Storage and limits

`Codebase.files` stores relative paths and generated local storage keys; file text and keys are excluded from default query selection. Candidate workspace overrides and submission snapshots use the same private local storage adapter with independent generated keys. Candidate responses expose file contents only through a published-file endpoint or the signed-in candidate's own workspace/submission endpoints. Public detail responses contain metadata only. The default root is `backend/storage-data/codebases`, ignored by Git. Set `CODEBASE_STORAGE_DIR` to move it. ZIP imports reject unsupported/binary or unsafe paths and enforce bounded archive, entry, file, and expanded-size limits.

## Planned integration collections

`BattleSubmission` and `BattleEvaluation` remain future slices. Candidate attempt/submission records and bookmarks are implemented; workspace and submitted text snapshots live in local storage. Published version snapshots are implemented. MongoDB transactions are not used for publishing and version creation, or for the local file/database coordination, so process or disk failures between writes can leave orphaned files or partial metadata. Add transactions where supported and periodic orphan cleanup before production. Unique indexes need to be applied to deployed databases; existing duplicate active attempts may require a cleanup migration before building the new partial unique index.
