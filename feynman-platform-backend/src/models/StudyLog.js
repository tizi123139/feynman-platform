// models/StudyLog.js
const mongoose = require('mongoose');

const StudyLogSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    type: {
        type: String,
        enum: ['create', 'edit', 'review', 'feynman', 'quiz', 'chat', 'flashcard', 'explore'],
        required: true,
    },
    knowledgePoint: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'KnowledgePoint',
        default: null,
    },
    minutes: { type: Number, default: 0 },
    score: { type: Number, default: null },
    xp: { type: Number, default: 0 },
    date: { type: String, required: true }, // YYYY-MM-DD（本地时区）
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

StudyLogSchema.index({ user: 1, date: 1 });
StudyLogSchema.index({ user: 1, type: 1 });

module.exports = mongoose.model('StudyLog', StudyLogSchema);
