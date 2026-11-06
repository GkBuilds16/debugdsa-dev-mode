import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
  registrationId: { type: mongoose.Schema.Types.ObjectId, ref: 'BattleRegistration', required: true },
  codebaseVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CodebaseVersion', required: true },
  userId: { type: String, required: true },
  files: { type: [{ path: { type: String, required: true, maxlength: 300 }, size: { type: Number, required: true, max: 1048576 }, storageKey: { type: String, required: true, select: false } }], default: [] },
  revision: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['ACTIVE', 'SUBMITTED', 'CLOSED'], default: 'ACTIVE' }
}, { timestamps: true });

schema.index({ battleId: 1, userId: 1 }, { unique: true });
schema.index({ registrationId: 1 }, { unique: true });
export default mongoose.model('BattleWorkspace', schema);
