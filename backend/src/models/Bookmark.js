import mongoose from 'mongoose';

const bookmarkSchema = new mongoose.Schema({
  codebaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Codebase', required: true },
  userId: { type: String, required: true }
}, { timestamps: true });
bookmarkSchema.index({ codebaseId: 1, userId: 1 }, { unique: true });
bookmarkSchema.index({ userId: 1, createdAt: -1 });
export default mongoose.model('CodebaseBookmark', bookmarkSchema);
