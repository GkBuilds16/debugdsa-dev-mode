import mongoose from 'mongoose';

const registrationSchema = new mongoose.Schema({
  battleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Battle', required: true },
  userId: { type: String, required: true },
  status: { type: String, enum: ['REGISTERED', 'CANCELLED'], default: 'REGISTERED' }
}, { timestamps: true });
registrationSchema.index({ battleId: 1, userId: 1 }, { unique: true });
export default mongoose.model('BattleRegistration', registrationSchema);
