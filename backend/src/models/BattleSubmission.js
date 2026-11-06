import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
  workspaceId: { type: mongoose.Schema.Types.ObjectId, ref: 'BattleWorkspace', required: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'BattleRegistration', required: true },
  codebaseVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseVersion', required: true },
  userId: { type: String, required: true },
  files: { type: [{ path: { type: String, required: true, maxlength: 300 }, size: { type: Number, required: true }, storageKey: { type: String, required: true, select: false } }], required: true, select: false },
  fileCount: { type: Number, required: true, min: 1, max: 300 },
  evaluationStatus: { type: String, enum: ['NOT_EVALUATED', 'PENDING', 'EVALUATED', 'FAILED'], default: 'NOT_EVALUATED' },
  result: { type: mongoose.Schema.Types.Mixed, default: null, select: false }
}, { timestamps: true });

schema.index({ workspaceId:  1 }, { unique: true });
schema.index({ battleId: 1, createdAt: 1 });
schema.index({ battleId: 1, userId: 1 });
export default mongoose.model('BattleSubmission', schema);
