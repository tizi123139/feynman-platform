// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    displayName: { type: String, default: '' },
    avatarKey: { type: String, default: 'sprout' },
    dailyGoal: { type: Number, default: 3 },
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastStudyDate: { type: String, default: '' }, // YYYY-MM-DD
}, { timestamps: true }); // timestamps会自动添加createdAt和updatedAt字段

// 返回给前端的安全字段
UserSchema.methods.toSafeJSON = function () {
    return {
        id: this._id.toString(),
        username: this.username,
        email: this.email,
        displayName: this.displayName || this.username,
        avatarKey: this.avatarKey,
        dailyGoal: this.dailyGoal,
        xp: this.xp,
        streak: this.streak,
        longestStreak: this.longestStreak,
        createdAt: this.createdAt,
    };
};

module.exports = mongoose.model('User', UserSchema);
