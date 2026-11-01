// models/QuizAttempt.js
const mongoose = require('mongoose');

const QuizAttemptSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    knowledgePoint: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'KnowledgePoint',
        default: null,
    },
    questionType: { type: String, default: 'single-choice' },
    difficulty: { type: String, default: '基础' },
    question: { type: String, required: true },
    options: { type: mongoose.Schema.Types.Mixed, default: null },
    answer: { type: String, default: '' },
    userAnswer: { type: String, default: '' },
    isCorrect: { type: Boolean, default: false },
    explanation: { type: String, default: '' },
}, { timestamps: true });

QuizAttemptSchema.index({ user: 1, isCorrect: 1 });

module.exports = mongoose.model('QuizAttempt', QuizAttemptSchema);
