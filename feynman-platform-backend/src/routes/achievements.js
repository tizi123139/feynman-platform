// routes/achievements.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const User = require('../models/User');
const { listAchievements, checkAndUnlock } = require('../services/achievementService');
const { getDailyTasks, levelProgress } = require('../services/studyLogService');

// @route   GET /api/achievements
router.get('/', auth, async (req, res) => {
    try {
        const [achievements, user] = await Promise.all([
            listAchievements(req.user.id),
            User.findById(req.user.id),
        ]);

        res.json({
            achievements,
            unlockedCount: achievements.filter((item) => item.unlocked).length,
            total: achievements.length,
            xp: user?.xp || 0,
            streak: user?.streak || 0,
            longestStreak: user?.longestStreak || 0,
            level: levelProgress(user?.xp || 0),
        });
    } catch (err) {
        console.error('获取成就失败:', err.message);
        res.status(500).json({ msg: '获取成就失败' });
    }
});

// @route   GET /api/achievements/daily-tasks
router.get('/daily-tasks', auth, async (req, res) => {
    try {
        const tasks = await getDailyTasks(req.user.id);
        res.json({ tasks, doneCount: tasks.filter((task) => task.done).length });
    } catch (err) {
        console.error('获取每日任务失败:', err.message);
        res.status(500).json({ msg: '获取每日任务失败' });
    }
});

// @route   POST /api/achievements/check
router.post('/check', auth, async (req, res) => {
    try {
        const unlocked = await checkAndUnlock(req.user.id);
        res.json({ unlocked });
    } catch (err) {
        console.error('检查成就失败:', err.message);
        res.status(500).json({ msg: '检查成就失败' });
    }
});

module.exports = router;
