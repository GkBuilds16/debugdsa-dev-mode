import mongoose from 'mongoose';

const codebaseSchema = new mongoose.Schema({
  ownerId: { type: String, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, maxlength: 300 },
  problemStatement: { type: String, default: '', maxlength: 10000 },
  category: { type: String, default: 'General', maxlength: 60 },
  difficulty: { type: String, enum: ['Easy', 'Medium', 'Hard'], default: 'Medium' },
  languages: [{ type: String, maxlength: 30 }],
  technologies: [{ type: String, maxlength: 40 }],
  tags: [{ type: String, maxlength: 30 }],
  sourceUrl: { type: String, default: '', maxlength: 500 },
  instructions: { type: String, default: '', maxlength: 10000 },
  publicHints: [{ type: String, maxlength: 500 }],
  privateNotes: { type: String, select: false, default: '' },
  hiddenTests: { type: [mongoose.Schema.Types.Mixed], select: false, default: [] },
  files: { type: [{ path: String, content: String }], default: [] },
  state: { type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'], default: 'DRAFT', index: true },
  version: { type: Number, default: 1 },
  viewCount: { type: Number, default: 0 },
  attemptCount: { type: Number, default: 0 }
}, { timestamps: true, optimisticConcurrency: true });

codebaseSchema.index({ state: 1, createdAt: -1 });
codebaseSchema.index({ title: 'text', description: 'text', tags: 'text' });
export default mongoose.model('Codebase', codebaseSchema);
