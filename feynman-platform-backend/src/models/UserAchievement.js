// models/UserAchievement.js
const mongoose = require('mongoose');

const UserAchievementSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    key: { type: String, required: true },
    unlockedAt: { type: Date, default: Date.now },
}, { timestamps: true });

UserAchievementSchema.index({ user: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('UserAchievement', UserAchievementSchema);
