import mongoose from 'mongoose';

const attemptSchema = new mongoose.Schema({
  codebaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Codebase', required: true },
  userId: { type: String, required: true },
  workspace: { type: [{ path: { type: String, required: true, maxlength: 300 }, content: { type: String, maxlength: 200000 } }], default: [] },
  status: { type: String, enum: ['IN_PROGRESS', 'SUBMITTED'], default: 'IN_PROGRESS' },
  lastSubmissionAt: Date
}, { timestamps: true });
attemptSchema.index({ codebaseId: 1, userId: 1, updatedAt: -1 });
export default mongoose.model('CodebaseAttempt', attemptSchema);
