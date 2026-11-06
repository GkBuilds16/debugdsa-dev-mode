import mongoose from 'mongoose';

const battleSchema = new mongoose.Schema({
  ownerId: { type: String, required: true },
  codebaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Codebase', required: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, default: '', maxlength: 2000 },
  startsAt: { type: Date, required: true },
  registrationDeadline: { type: Date, required: true },
  durationMinutes: { type: Number, min: 5, max: 360, required: true },
  capacity: { type: Number, min: 2, max: 10000, default: 100 },
  registrationCount: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['UPCOMING', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'LIVE', 'FINISHED', 'CANCELLED'], default: 'UPCOMING' }
}, { timestamps: true });

battleSchema.index({ startsAt: 1, status: 1 });
export default mongoose.model('Battle', battleSchema);
