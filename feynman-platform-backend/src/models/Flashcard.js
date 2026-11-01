// models/Flashcard.js
const mongoose = require('mongoose');

const FlashcardSchema = new mongoose.Schema({
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
    front: { type: String, required: true },
    back: { type: String, required: true },
    intervalDays: { type: Number, default: 1 },
    easeFactor: { type: Number, default: 2.5 },
    nextReviewAt: { type: Date, default: Date.now },
    reviewCount: { type: Number, default: 0 },
}, { timestamps: true });

FlashcardSchema.index({ user: 1, nextReviewAt: 1 });

module.exports = mongoose.model('Flashcard', FlashcardSchema);
