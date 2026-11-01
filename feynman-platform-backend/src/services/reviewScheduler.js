// services/reviewScheduler.js
// 基于 SM-2 的间隔复习调度

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 根据评分计算下一次复习时间
 * @param {object} review 当前复习状态 { repetitions, intervalDays, easeFactor }
 * @param {number} grade 0-5：忘记=1 有点难=3 记得=4 很简单=5
 */
function scheduleReview(review = {}, grade = 4) {
    const q = Math.max(0, Math.min(5, Number(grade) || 0));
    const repetitions = Number(review.repetitions) || 0;
    const intervalDays = Number(review.intervalDays) || 0;
    const easeFactor = Number(review.easeFactor) || 2.5;

    // 难度因子调整（SM-2 原始公式）
    let nextEase = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    nextEase = Math.max(1.3, Number(nextEase.toFixed(2)));

    let nextReps;
    let nextInterval;
    if (q < 3) {
        // 回答失败：重置进度，明天再来
        nextReps = 0;
        nextInterval = 1;
    } else {
        nextReps = repetitions + 1;
        if (nextReps === 1) nextInterval = 1;
        else if (nextReps === 2) nextInterval = 6;
        else nextInterval = Math.round(Math.max(1, intervalDays || 1) * nextEase);
    }
    nextInterval = Math.max(1, Math.min(nextInterval, 180));

    return {
        repetitions: nextReps,
        intervalDays: nextInterval,
        easeFactor: nextEase,
        dueAt: new Date(Date.now() + nextInterval * DAY_MS),
        lastReviewedAt: new Date(),
        lastGrade: q,
    };
}

/**
 * 评分对掌握度的增量
 */
function gradeToMasteryDelta(q) {
    if (q < 3) return -8;
    if (q === 3) return 3;
    if (q === 4) return 6;
    return 10;
}

/**
 * 找出当前用户需要复习的知识点（兼容没有 review.dueAt 的旧数据）
 */
function dueFilter(userId) {
    const yesterday = new Date(Date.now() - DAY_MS);
    return {
        user: userId,
        $or: [
            { 'review.dueAt': { $lte: new Date() } },
            { 'review.dueAt': { $exists: false }, createdAt: { $lte: yesterday } },
            { 'review.dueAt': null, createdAt: { $lte: yesterday } },
        ],
    };
}

module.exports = { scheduleReview, gradeToMasteryDelta, dueFilter, DAY_MS };
