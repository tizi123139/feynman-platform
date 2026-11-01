// services/achievementService.js
const mongoose = require('mongoose');
const KnowledgePoint = require('../models/KnowledgePoint');
const StudyLog = require('../models/StudyLog');
const User = require('../models/User');
const UserAchievement = require('../models/UserAchievement');
const DEFINITIONS = require('../config/achievements');

async function collectProgress(userId) {
    const oid = new mongoose.Types.ObjectId(userId);

    const [user, kpCount, reviewCount, scoreDoc, correctAgg, categoryAgg, nightLog, exploreCount] = await Promise.all([
        User.findById(userId),
        KnowledgePoint.countDocuments({ user: oid }),
        StudyLog.countDocuments({ user: oid, type: 'review' }),
        KnowledgePoint.findOne({ user: oid, 'stats.lastScore': { $ne: null } })
            .sort({ 'stats.lastScore': -1 })
            .select('stats.lastScore')
            .lean(),
        KnowledgePoint.aggregate([
            { $match: { user: oid } },
            { $group: { _id: null, total: { $sum: '$stats.correctCount' } } },
        ]),
        KnowledgePoint.aggregate([
            { $match: { user: oid } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $match: { count: { $gte: 3 } } },
        ]),
        StudyLog.exists({ user: oid, $expr: { $gte: [{ $hour: '$createdAt' }, 23] } }),
        StudyLog.countDocuments({ user: oid, type: 'explore' }),
    ]);

    const bestScore = scoreDoc?.['stats']?.lastScore || 0;
    const correctTotal = correctAgg?.[0]?.total || 0;
    const longestStreak = Math.max(user?.streak || 0, user?.longestStreak || 0);

    return {
        'first-note': kpCount,
        'review-10': reviewCount,
        'feynman-90': bestScore,
        'quiz-50': correctTotal,
        'streak-7': longestStreak,
        'streak-30': longestStreak,
        'collector-50': kpCount,
        'category-3': categoryAgg.length,
        'night-owl': nightLog ? 1 : 0,
        explorer: exploreCount,
    };
}

/**
 * 评估全部成就并解锁达成的项
 * @returns {Promise<Array>} 新解锁的成就定义
 */
async function checkAndUnlock(userId) {
    const progress = await collectProgress(userId);
    const unlockedDocs = await UserAchievement.find({ user: userId }).select('key').lean();
    const unlockedKeys = new Set(unlockedDocs.map((d) => d.key));

    const newlyUnlocked = [];
    for (const def of DEFINITIONS) {
        const current = progress[def.key] || 0;
        if (current >= def.goal && !unlockedKeys.has(def.key)) {
            try {
                await UserAchievement.create({ user: userId, key: def.key });
                newlyUnlocked.push(def);
            } catch (err) {
                // 并发下唯一索引冲突可忽略
                if (err.code !== 11000) console.error('解锁成就失败:', err.message);
            }
        }
    }
    return newlyUnlocked;
}

/**
 * 返回带解锁状态与进度的成就列表
 */
async function listAchievements(userId) {
    const progress = await collectProgress(userId);
    const unlockedDocs = await UserAchievement.find({ user: userId }).lean();
    const unlockedMap = new Map(unlockedDocs.map((d) => [d.key, d.unlockedAt]));

    return DEFINITIONS.map((def) => {
        const value = progress[def.key] || 0;
        return {
            ...def,
            progress: Math.min(value, def.goal),
            rawProgress: value,
            unlocked: unlockedMap.has(def.key),
            unlockedAt: unlockedMap.get(def.key) || null,
        };
    });
}

module.exports = { checkAndUnlock, listAchievements, collectProgress, DEFINITIONS };
