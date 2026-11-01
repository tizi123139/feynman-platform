// routes/dashboard.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const KnowledgePoint = require('../models/KnowledgePoint');
const StudyLog = require('../models/StudyLog');
const User = require('../models/User');
const { dueFilter } = require('../services/reviewScheduler');
const { dateKey, shiftDateKey, levelProgress, logStudy, getDailyTasks } = require('../services/studyLogService');
const { buildTodayPlan } = require('../services/studyPlanService');

const PRACTICE_TYPES = ['create', 'review', 'feynman', 'quiz', 'flashcard'];

// @route   GET /api/dashboard/overview
router.get('/overview', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const today = dateKey();

        const [user, total, dueCount, mastered, favorite, inProgress, todayLogs, categoryAgg, recent] = await Promise.all([
            User.findById(userId),
            KnowledgePoint.countDocuments({ user: userId }),
            KnowledgePoint.countDocuments(dueFilter(userId)),
            KnowledgePoint.countDocuments({ user: userId, status: 'mastered' }),
            KnowledgePoint.countDocuments({ user: userId, favorite: true }),
            KnowledgePoint.countDocuments({ user: userId, status: 'in_progress' }),
            StudyLog.find({ user: userId, date: today }).select('type minutes xp score').lean(),
            KnowledgePoint.aggregate([
                { $match: { user: new (require('mongoose').Types.ObjectId)(userId) } },
                { $group: { _id: '$category', count: { $sum: 1 }, mastery: { $avg: '$mastery' } } },
                { $sort: { count: -1 } },
            ]),
            KnowledgePoint.find({ user: userId })
                .sort({ updatedAt: -1 })
                .limit(3)
                .select('title category mastery updatedAt reviewList'),
        ]);

        if (!user) return res.status(404).json({ msg: '用户不存在' });

        const practiceCount = todayLogs.filter((log) => PRACTICE_TYPES.includes(log.type)).length;
        const goal = user.dailyGoal || 3;
        const level = levelProgress(user.xp || 0);
        const tasks = await getDailyTasks(userId);

        res.json({
            user: {
                displayName: user.displayName || user.username,
                avatarKey: user.avatarKey,
                xp: user.xp,
                streak: user.streak,
                longestStreak: user.longestStreak,
                dailyGoal: goal,
            },
            level,
            counts: {
                total,
                due: dueCount,
                mastered,
                favorite,
                inProgress,
                notStarted: Math.max(0, total - mastered - inProgress),
            },
            categories: categoryAgg.map((item) => ({
                name: item._id || '未分类',
                count: item.count,
                mastery: Math.round(item.mastery || 0),
            })),
            today: {
                practice: practiceCount,
                goal,
                percent: Math.min(100, Math.round((practiceCount / goal) * 100)),
                xp: todayLogs.reduce((sum, log) => sum + (log.xp || 0), 0),
                minutes: todayLogs.reduce((sum, log) => sum + (log.minutes || 0), 0),
                created: todayLogs.filter((log) => log.type === 'create').length,
                reviewed: todayLogs.filter((log) => log.type === 'review').length,
            },
            tasks,
            recent,
        });
    } catch (err) {
        console.error('获取仪表盘概览失败:', err.message);
        res.status(500).json({ msg: '获取仪表盘概览失败' });
    }
});

// @route   GET /api/dashboard/plan?focus=25&rest=5
// @desc    今日学习计划：到期复习 / 薄弱点 / 待复述排成番茄序列
router.get('/plan', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const today = dateKey();
        const focus = Math.max(10, Math.min(60, Number(req.query.focus) || 25));
        const rest = Math.max(3, Math.min(20, Number(req.query.rest) || 5));

        const [points, todayLogs] = await Promise.all([
            KnowledgePoint.find({ user: userId })
                .select('title category mastery status review stats createdAt updatedAt')
                .limit(200)
                .lean(),
            StudyLog.find({ user: userId, date: today }).select('type minutes xp').lean(),
        ]);

        res.json(buildTodayPlan({ points, todayLogs, focus, rest }));
    } catch (err) {
        console.error('生成今日学习计划失败:', err.message);
        res.status(500).json({ msg: '生成今日学习计划失败' });
    }
});

// @route   GET /api/dashboard/heatmap?weeks=12
router.get('/heatmap', auth, async (req, res) => {
    try {
        const weeks = Math.max(4, Math.min(26, Number(req.query.weeks) || 12));
        const days = weeks * 7;
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        start.setDate(start.getDate() - days + 1);

        const agg = await StudyLog.aggregate([
            { $match: { user: new (require('mongoose').Types.ObjectId)(req.user.id), createdAt: { $gte: start } } },
            {
                $group: {
                    _id: '$date',
                    count: { $sum: 1 },
                    minutes: { $sum: '$minutes' },
                    xp: { $sum: '$xp' },
                },
            },
        ]);

        const map = new Map(agg.map((item) => [item._id, item]));
        const result = [];
        for (let i = 0; i < days; i += 1) {
            const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
            const key = dateKey(d);
            const item = map.get(key);
            result.push({
                date: key,
                count: item?.count || 0,
                minutes: item?.minutes || 0,
                xp: item?.xp || 0,
            });
        }

        res.json({ weeks, days: result });
    } catch (err) {
        console.error('获取学习热力图失败:', err.message);
        res.status(500).json({ msg: '获取学习热力图失败' });
    }
});

// @route   GET /api/dashboard/annual-report?year=2026
// @desc    年度回顾：12 个月的投入、知识库增长、最强主题
router.get('/annual-report', auth, async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const userId = req.user.id;
        const objectId = new mongoose.Types.ObjectId(userId);
        const now = new Date();
        const year = Math.min(now.getFullYear(), Math.max(2001, Number(req.query.year) || now.getFullYear()));
        const start = new Date(year, 0, 1);
        const end = new Date(year + 1, 0, 1);

        const [monthlyAgg, scoreAgg, createdAgg, categoryAgg, baseline, user, distinctDays] = await Promise.all([
            StudyLog.aggregate([
                { $match: { user: objectId, createdAt: { $gte: start, $lt: end } } },
                {
                    $group: {
                        _id: { $month: '$createdAt' },
                        actions: { $sum: 1 },
                        minutes: { $sum: '$minutes' },
                        xp: { $sum: '$xp' },
                        days: { $addToSet: '$date' },
                    },
                },
            ]),
            StudyLog.aggregate([
                { $match: { user: objectId, createdAt: { $gte: start, $lt: end }, score: { $ne: null } } },
                { $group: { _id: { $month: '$createdAt' }, avg: { $avg: '$score' }, count: { $sum: 1 } } },
            ]),
            KnowledgePoint.aggregate([
                { $match: { user: objectId, createdAt: { $lt: end } } },
                { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, count: { $sum: 1 } } },
            ]),
            KnowledgePoint.aggregate([
                { $match: { user: objectId, createdAt: { $gte: start, $lt: end } } },
                { $group: { _id: '$category', count: { $sum: 1 }, mastery: { $avg: '$mastery' } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
            ]),
            KnowledgePoint.countDocuments({ user: userId, createdAt: { $lt: start } }),
            User.findById(userId),
            StudyLog.distinct('date', { user: userId, createdAt: { $gte: start, $lt: end } }),
        ]);

        const byMonth = new Map(monthlyAgg.map((item) => [item._id, item]));
        const scoreByMonth = new Map(scoreAgg.map((item) => [item._id, item]));
        const createdByMonth = new Map(
            createdAgg
                .filter((item) => item._id.year === year)
                .map((item) => [item._id.month, item.count])
        );

        let cumulative = baseline;
        const months = Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const item = byMonth.get(month);
            const newNotes = createdByMonth.get(month) || 0;
            cumulative += newNotes;
            return {
                month,
                actions: item?.actions || 0,
                minutes: item?.minutes || 0,
                xp: item?.xp || 0,
                activeDays: item?.days?.length || 0,
                newNotes,
                totalNotes: cumulative,
                avgScore: scoreByMonth.get(month)?.avg ? Math.round(scoreByMonth.get(month).avg) : null,
            };
        });

        const totals = months.reduce(
            (acc, m) => ({
                actions: acc.actions + m.actions,
                minutes: acc.minutes + m.minutes,
                xp: acc.xp + m.xp,
                newNotes: acc.newNotes + m.newNotes,
                activeDays: acc.activeDays + m.activeDays,
            }),
            { actions: 0, minutes: 0, xp: 0, newNotes: 0, activeDays: 0 }
        );
        const scored = months.filter((m) => m.avgScore != null);
        totals.avgScore = scored.length
            ? Math.round(scored.reduce((sum, m) => sum + m.avgScore, 0) / scored.length)
            : 0;
        totals.activeDays = distinctDays.length;
        totals.totalNotes = cumulative;
        totals.startNotes = baseline;

        const best = months.reduce((top, m) => (m.minutes > top.minutes ? m : top), months[0]);
        const busiest = months.reduce((top, m) => (m.newNotes > top.newNotes ? m : top), months[0]);
        const summary =
            totals.actions === 0
                ? `${year} 年还没有学习记录，从今天开始也不晚。`
                : `${year} 年你在 ${totals.activeDays} 天里投入了 ${totals.minutes} 分钟，` +
                  `${best.minutes > 0 ? `${best.month} 月最专注（${best.minutes} 分钟）` : '节奏平均'}，` +
                  `知识库从 ${baseline} 个长到 ${cumulative} 个${busiest.newNotes > 0 ? `，${busiest.month} 月一口气新增了 ${busiest.newNotes} 个` : ''}。`;

        res.json({
            year,
            totals,
            months,
            bestMonth: best.month,
            categories: categoryAgg.map((item) => ({
                name: item._id || '未分类',
                count: item.count,
                mastery: Math.round(item.mastery || 0),
            })),
            longestStreak: user?.longestStreak || 0,
            summary,
        });
    } catch (err) {
        console.error('获取年度回顾失败:', err.message);
        res.status(500).json({ msg: '获取年度回顾失败' });
    }
});

// @route   GET /api/dashboard/weekly-report
router.get('/weekly-report', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const keys = Array.from({ length: 7 }, (_, i) => shiftDateKey(-6 + i));
        const weekStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

        const [logs, newNotes, weakPoints, categoryAgg] = await Promise.all([
            StudyLog.find({ user: userId, date: { $in: keys } }).lean(),
            KnowledgePoint.countDocuments({ user: userId, createdAt: { $gte: weekStart } }),
            KnowledgePoint.find({ user: userId }).sort({ mastery: 1, updatedAt: -1 }).limit(3).select('title mastery category'),
            KnowledgePoint.aggregate([
                { $match: { user: new (require('mongoose').Types.ObjectId)(userId) } },
                { $group: { _id: '$category', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 5 },
            ]),
        ]);

        const typeCounts = logs.reduce((acc, log) => {
            acc[log.type] = (acc[log.type] || 0) + 1;
            return acc;
        }, {});
        const feynmanScores = logs.filter((log) => log.type === 'feynman' && log.score !== null);
        const avgScore = feynmanScores.length
            ? Math.round(feynmanScores.reduce((sum, log) => sum + log.score, 0) / feynmanScores.length)
            : 0;
        const activeDays = new Set(logs.map((log) => log.date)).size;

        res.json({
            range: { from: keys[0], to: keys[6] },
            totals: {
                actions: logs.length,
                minutes: logs.reduce((sum, log) => sum + (log.minutes || 0), 0),
                xp: logs.reduce((sum, log) => sum + (log.xp || 0), 0),
                activeDays,
                avgScore,
                newNotes,
            },
            typeCounts,
            daily: keys.map((key) => ({
                date: key,
                actions: logs.filter((log) => log.date === key).length,
                minutes: logs.filter((log) => log.date === key).reduce((sum, log) => sum + (log.minutes || 0), 0),
            })),
            weakPoints: weakPoints.map((kp) => ({
                id: kp._id,
                title: kp.title,
                mastery: kp.mastery,
                category: kp.category,
            })),
            categories: categoryAgg.map((item) => ({ name: item._id || '未分类', count: item.count })),
        });
    } catch (err) {
        console.error('生成学习周报失败:', err.message);
        res.status(500).json({ msg: '生成学习周报失败' });
    }
});

// @route   POST /api/dashboard/explore
// @desc    记录一次知识宇宙探索（用于成就）
router.post('/explore', auth, async (req, res) => {
    try {
        const reward = await logStudy({
            userId: req.user.id,
            type: 'explore',
            minutes: 1,
            meta: { scene: 'universe' },
        });
        res.json({ ok: true, reward });
    } catch (err) {
        console.error('记录探索失败:', err.message);
        res.status(500).json({ msg: '记录探索失败' });
    }
});

module.exports = router;
