import mongoose from 'mongoose';

const submissionSchema = new mongoose.Schema({
  attemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseAttempt', required: true },
  codebaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Codebase', required: true },
  userId: { type: String, required: true },
  submittedFiles: { type: [{ path: String, content: String }], required: true },
  evaluationStatus: { type: String, enum: ['DISABLED', 'MOCK', 'COMPLETED'], default: 'DISABLED' },
  result: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: true });
submissionSchema.index({ codebaseId: 1, userId: 1, createdAt: -1 });
export default mongoose.model('CodebaseSubmission', submissionSchema);
