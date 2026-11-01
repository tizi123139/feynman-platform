// services/studyLogService.js
const StudyLog = require('../models/StudyLog');
const User = require('../models/User');
const KnowledgePoint = require('../models/KnowledgePoint');
const { checkAndUnlock } = require('./achievementService');

const DAY_MS = 24 * 60 * 60 * 1000;

const XP_RULES = {
    create: 10,
    edit: 2,
    review: 5,
    feynman: 20,
    quiz: 8,
    chat: 2,
    flashcard: 3,
    explore: 1,
};

function dateKey(date = new Date()) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function shiftDateKey(days) {
    return dateKey(new Date(Date.now() + days * DAY_MS));
}

function levelFromXp(xp = 0) {
    return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

function levelProgress(xp = 0) {
    const level = levelFromXp(xp);
    const currentBase = 50 * Math.pow(level - 1, 2);
    const nextBase = 50 * Math.pow(level, 2);
    const percent = Math.min(100, Math.round(((xp - currentBase) / (nextBase - currentBase)) * 100));
    return { level, current: xp - currentBase, needed: nextBase - currentBase, percent };
}

/**
 * 记录一次学习行为：写日志、加经验、更新连续天数、检查成就
 */
async function logStudy({
    userId,
    type,
    knowledgePointId = null,
    minutes = 0,
    score = null,
    meta = {},
    xp = null,
}) {
    const baseXp = xp !== null ? xp : (XP_RULES[type] || 0);
    const bonus = type === 'feynman' && score ? Math.round(score / 5) : 0;
    const xpGained = Math.max(0, baseXp + bonus);
    const today = dateKey();

    const log = await StudyLog.create({
        user: userId,
        type,
        knowledgePoint: knowledgePointId,
        minutes,
        score,
        xp: xpGained,
        date: today,
        meta,
    });

    const user = await User.findById(userId);
    if (!user) return { log, xpGained, xp: 0, streak: 0, level: 1, unlocked: [] };

    let streak = user.streak || 0;
    if (user.lastStudyDate !== today) {
        streak = user.lastStudyDate === shiftDateKey(-1) ? streak + 1 : 1;
    }
    if (streak < 1) streak = 1;

    user.xp = (user.xp || 0) + xpGained;
    user.streak = streak;
    user.longestStreak = Math.max(user.longestStreak || 0, streak);
    user.lastStudyDate = today;
    await user.save();

    let unlocked = [];
    try {
        unlocked = await checkAndUnlock(userId);
    } catch (err) {
        console.error('检查成就失败:', err.message);
    }

    return {
        log,
        xpGained,
        xp: user.xp,
        streak: user.streak,
        level: levelFromXp(user.xp),
        unlocked,
    };
}

/** 掌握度变更并同步学习状态 */
function applyMastery(kp, delta) {
    const next = Math.max(0, Math.min(100, Math.round((kp.mastery || 0) + delta)));
    kp.mastery = next;
    if (next >= 80) kp.status = 'mastered';
    else if (next > 0) kp.status = 'in_progress';
    return kp;
}

async function afterFeynman(knowledgePointId, score) {
    const kp = await KnowledgePoint.findById(knowledgePointId);
    if (!kp) return null;
    const oldMastery = kp.mastery || 0;
    kp.mastery = Math.max(0, Math.min(100, Math.round(oldMastery * 0.6 + score * 0.4)));
    kp.stats.feynmanCount = (kp.stats.feynmanCount || 0) + 1;
    kp.stats.lastScore = score;
    if (kp.mastery >= 80) kp.status = 'mastered';
    else if (kp.mastery > 0) kp.status = 'in_progress';
    await kp.save();
    return kp;
}

async function afterQuiz(knowledgePointId, isCorrect) {
    if (!knowledgePointId) return null;
    const kp = await KnowledgePoint.findById(knowledgePointId);
    if (!kp) return null;
    kp.stats.quizCount = (kp.stats.quizCount || 0) + 1;
    if (isCorrect) kp.stats.correctCount = (kp.stats.correctCount || 0) + 1;
    applyMastery(kp, isCorrect ? 5 : -8);
    if (!isCorrect) kp.reviewList = true;
    await kp.save();
    return kp;
}

/** 今日任务（由学习日志派生，不需要额外集合） */
async function getDailyTasks(userId) {
    const today = dateKey();
    const logs = await StudyLog.find({ user: userId, date: today }).select('type').lean();
    const createCount = logs.filter((l) => l.type === 'create').length;
    const practiceCount = logs.filter((l) => l.type === 'feynman' || l.type === 'quiz').length;
    const reviewCount = logs.filter((l) => l.type === 'review').length;

    return [
        {
            key: 'daily-create',
            title: '播下一颗新种子',
            desc: '新建 1 个知识点',
            goal: 1,
            progress: Math.min(createCount, 1),
            xp: 10,
            done: createCount >= 1,
        },
        {
            key: 'daily-practice',
            title: '开口讲一遍',
            desc: '完成 1 次复述或测评',
            goal: 1,
            progress: Math.min(practiceCount, 1),
            xp: 15,
            done: practiceCount >= 1,
        },
        {
            key: 'daily-review',
            title: '复习老朋友',
            desc: '完成 3 次间隔复习',
            goal: 3,
            progress: Math.min(reviewCount, 3),
            xp: 15,
            done: reviewCount >= 3,
        },
    ];
}

module.exports = {
    logStudy,
    applyMastery,
    afterFeynman,
    afterQuiz,
    getDailyTasks,
    dateKey,
    shiftDateKey,
    levelFromXp,
    levelProgress,
    XP_RULES,
    DAY_MS,
};
