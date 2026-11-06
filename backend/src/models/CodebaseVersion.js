import mongoose from 'mongoose';

const versionSchema = new mongoose.Schema({
  seriesId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  codebaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Codebase', required: true },
  version: { type: Number, min: 1, required: true },
  creatorId: { type: String, required: true },
  snapshot: { type: mongoose.Schema.Types.Mixed, required: true, select: false }
}, { timestamps: true, strict: true });
versionSchema.index({ seriesId: 1, version: -1 }, { unique: true });
export default mongoose.model('CodebaseVersion', versionSchema);
