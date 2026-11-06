import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseAttempt', required: true },
  codebaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Codebase', required: true },
  publishedVersion: { type: Number, required: true, min: 1 },
  publishedVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseVersion', default: null },
  userId: { type: String, required: true },
  fileCount: { type: Number, required: true, min: 1, max: 300 },
  submittedFiles: { type: [{ path: { type: String, required: true }, size: { type: Number, required: true }, storageKey: { type: String, required: true, select: false } }], required: true, select: false },
  evaluationStatus: { type: String, enum: ['NOT_EVALUATED'], default: 'NOT_EVALUATED' },
  result: { type: mongoose.Schema.Types.Mixed, default: null, select: false }
}, { timestamps: true });
submissionSchema.index({ codebaseId: 1, userId: 1, createdAt: -1 });
submissionSchema.index({ attemptId: 1 }, { unique: true });
export default mongoose.model('CodebaseSubmission', submissionSchema);
