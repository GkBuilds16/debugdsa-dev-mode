import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema({
  codebaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Codebase', required: true },
  publishedVersion: { type: Number, required: true, min: 1 },
  publishedVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseVersion', default: null },
  userId: { type: String, required: true },
  workspaceFiles: { type: [{ path: { type: String, required: true, maxlength: 300 }, size: { type: Number, required: true, max: 1048576 }, storageKey: { type: String, required: true, select: false } }], default: [] },
  revision: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['IN_PROGRESS', 'SUBMITTED'], default: 'IN_PROGRESS' },
  lastSubmissionAt: Date
}, { timestamps: true });
attemptSchema.index({ codebaseId: 1, publishedVersion: 1, userId: 1 }, { unique: true, partialFilterExpression: { status: 'IN_PROGRESS' } });
attemptSchema.index({ codebaseId: 1, userId: 1, updatedAt: -1 });
export default mongoose.model('CodebaseAttempt', attemptSchema);
