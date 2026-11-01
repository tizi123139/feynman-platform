// routes/users.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const User = require('../models/User');
const KnowledgePoint = require('../models/KnowledgePoint');
const Flashcard = require('../models/Flashcard');
const QuizAttempt = require('../models/QuizAttempt');

const BACKUP_VERSION = 1;
const RESTORE_LIMIT = 1000;

function signToken(userId) {
    return jwt.sign(
        { user: { id: userId } },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// @route   POST /api/users/register
// @desc    注册一个新用户
// @access  Public
router.post('/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ msg: '用户名、邮箱和密码都不能为空' });
        }
        if (String(password).length < 6) {
            return res.status(400).json({ msg: '密码至少需要 6 位' });
        }

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: '该邮箱已注册' });

        user = await User.findOne({ username });
        if (user) return res.status(400).json({ msg: '该用户名已被使用' });

        user = new User({ username, email, displayName: username });
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        await user.save();

        res.status(201).json({ token: signToken(user.id), user: user.toSafeJSON() });
    } catch (err) {
        console.error('注册失败:', err.message);
        res.status(500).json({ msg: '注册失败，请稍后再试' });
    }
});

// @route   POST /api/users/login
// @desc    用户登录并获取token
// @access  Public
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ msg: '请输入邮箱和密码' });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: '邮箱或密码不正确' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: '邮箱或密码不正确' });

        res.json({ token: signToken(user.id), user: user.toSafeJSON() });
    } catch (err) {
        console.error('登录失败:', err.message);
        res.status(500).json({ msg: '登录失败，请稍后再试' });
    }
});

// @route   GET /api/users/me
// @route   PUT /api/users/me
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: '用户不存在' });
        res.json(user.toSafeJSON());
    } catch (err) {
        console.error('获取用户信息失败:', err.message);
        res.status(500).json({ msg: '获取用户信息失败' });
    }
});

router.put('/me', auth, async (req, res) => {
    try {
        const allowed = ['displayName', 'avatarKey', 'dailyGoal'];
        const updates = {};
        allowed.forEach((key) => {
            if (req.body[key] !== undefined) updates[key] = req.body[key];
        });
        if (updates.dailyGoal !== undefined) {
            updates.dailyGoal = Math.max(1, Math.min(30, Number(updates.dailyGoal) || 3));
        }
        if (typeof updates.displayName === 'string') {
            updates.displayName = updates.displayName.trim().slice(0, 24);
        }

        const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true });
        if (!user) return res.status(404).json({ msg: '用户不存在' });
        res.json(user.toSafeJSON());
    } catch (err) {
        console.error('更新用户信息失败:', err.message);
        res.status(500).json({ msg: '更新用户信息失败' });
    }
});

// @route   PUT /api/users/password
// @desc    修改登录密码（需要校验当前密码）
// @access  Private
router.put('/password', auth, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ msg: '请填写当前密码和新密码' });
        }
        if (String(newPassword).length < 6) {
            return res.status(400).json({ msg: '新密码至少需要 6 位' });
        }
        if (String(newPassword) === String(currentPassword)) {
            return res.status(400).json({ msg: '新密码不能与当前密码相同' });
        }

        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ msg: '用户不存在' });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ msg: '当前密码不正确' });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        res.json({ ok: true, msg: '密码已更新，下次登录请使用新密码' });
    } catch (err) {
        console.error('修改密码失败:', err.message);
        res.status(500).json({ msg: '修改密码失败，请稍后再试' });
    }
});

// @route   GET /api/users/backup
// @desc    导出当前用户的全部学习数据（知识点 / 闪卡 / 测评记录）
// @access  Private
router.get('/backup', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const [user, knowledgePoints, flashcards, quizAttempts] = await Promise.all([
            User.findById(userId).lean(),
            KnowledgePoint.find({ user: userId }).sort({ createdAt: 1 }).lean(),
            Flashcard.find({ user: userId }).sort({ createdAt: 1 }).lean(),
            QuizAttempt.find({ user: userId }).sort({ createdAt: 1 }).lean(),
        ]);

        if (!user) return res.status(404).json({ msg: '用户不存在' });

        const strip = (doc) => {
            const { user: _owner, __v, ...rest } = doc;
            return rest;
        };

        res.json({
            version: BACKUP_VERSION,
            exportedAt: new Date().toISOString(),
            app: 'feynman-platform',
            user: {
                username: user.username,
                displayName: user.displayName || user.username,
                avatarKey: user.avatarKey,
                dailyGoal: user.dailyGoal,
                xp: user.xp,
                streak: user.streak,
                longestStreak: user.longestStreak,
            },
            knowledgePoints: knowledgePoints.map(strip),
            flashcards: flashcards.map(strip),
            quizAttempts: quizAttempts.map(strip),
        });
    } catch (err) {
        console.error('导出备份失败:', err.message);
        res.status(500).json({ msg: '导出备份失败，请稍后再试' });
    }
});

// @route   POST /api/users/restore
// @desc    从备份恢复知识点与闪卡（按标题+分类 / 正面+背面 去重，不会删除已有数据）
// @access  Private
router.post('/restore', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const rawPoints = Array.isArray(req.body?.knowledgePoints) ? req.body.knowledgePoints : [];
        const rawCards = Array.isArray(req.body?.flashcards) ? req.body.flashcards : [];

        if (!rawPoints.length && !rawCards.length) {
            return res.status(400).json({ msg: '备份文件里没有可导入的知识点或闪卡' });
        }
        if (rawPoints.length > RESTORE_LIMIT || rawCards.length > RESTORE_LIMIT) {
            return res.status(400).json({ msg: `一次最多导入 ${RESTORE_LIMIT} 条记录` });
        }

        const existing = await KnowledgePoint.find({ user: userId }).select('title category').lean();
        const existingKeys = new Set(existing.map((kp) => `${kp.title}||${kp.category || '未分类'}`));

        const idMap = new Map(); // 旧 id → 新 id
        const createdPoints = [];
        let skippedPoints = 0;

        for (const item of rawPoints) {
            const title = String(item?.title || '').trim();
            const content = String(item?.content || '');
            if (!title || !content.trim()) {
                skippedPoints += 1;
                continue;
            }
            const category = String(item.category || '未分类').trim() || '未分类';
            const key = `${title}||${category}`;
            if (existingKeys.has(key)) {
                skippedPoints += 1;
                continue;
            }
            existingKeys.add(key);
            createdPoints.push({
                user: userId,
                title: title.slice(0, 120),
                content,
                category,
                tags: Array.isArray(item.tags) ? item.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12) : [],
                favorite: Boolean(item.favorite),
                summary: String(item.summary || '').slice(0, 500),
                mastery: Math.max(0, Math.min(100, Number(item.mastery) || 0)),
                status: ['not_started', 'in_progress', 'mastered'].includes(item.status) ? item.status : 'not_started',
                reviewList: Boolean(item.reviewList),
                review: item.review || {},
                stats: item.stats || {},
                _restoreId: item._id ? String(item._id) : null,
            });
        }

        const inserted = createdPoints.length
            ? await KnowledgePoint.insertMany(createdPoints.map(({ _restoreId, ...rest }) => rest))
            : [];

        createdPoints.forEach((point, i) => {
            if (point._restoreId && inserted[i]) idMap.set(point._restoreId, inserted[i]._id);
        });

        const existingCards = await Flashcard.find({ user: userId }).select('front back').lean();
        const cardKeys = new Set(existingCards.map((c) => `${c.front}||${c.back}`));
        const cardsToInsert = [];
        let skippedCards = 0;

        for (const card of rawCards) {
            const front = String(card?.front || '').trim();
            const back = String(card?.back || '').trim();
            if (!front || !back) {
                skippedCards += 1;
                continue;
            }
            const key = `${front}||${back}`;
            if (cardKeys.has(key)) {
                skippedCards += 1;
                continue;
            }
            cardKeys.add(key);
            const linkedPoint = card.knowledgePoint && idMap.get(String(card.knowledgePoint));
            cardsToInsert.push({
                user: userId,
                knowledgePoint: linkedPoint || null,
                front,
                back,
                intervalDays: Number(card.intervalDays) || 1,
                easeFactor: Number(card.easeFactor) || 2.5,
                reviewCount: Number(card.reviewCount) || 0,
            });
        }

        const insertedCards = cardsToInsert.length ? await Flashcard.insertMany(cardsToInsert) : [];

        await User.findByIdAndUpdate(userId, { $inc: { xp: inserted.length * 2 + insertedCards.length } });

        res.json({
            ok: true,
            created: { knowledgePoints: inserted.length, flashcards: insertedCards.length },
            skipped: { knowledgePoints: skippedPoints, flashcards: skippedCards },
        });
    } catch (err) {
        console.error('恢复备份失败:', err.message);
        res.status(500).json({ msg: '恢复备份失败，请检查文件格式' });
    }
});

module.exports = router;
