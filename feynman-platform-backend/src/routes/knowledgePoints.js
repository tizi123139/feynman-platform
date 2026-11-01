// routes/knowledgePoints.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const KnowledgePoint = require('../models/KnowledgePoint');
const { addKnowledgePointToStore, removeKnowledgePointFromStore } = require('../services/vectorStoreService');
const { scheduleReview, gradeToMasteryDelta, dueFilter } = require('../services/reviewScheduler');
const { logStudy, applyMastery } = require('../services/studyLogService');

function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 8);
}

// @route   GET /api/knowledge-points/facets
// @desc    分类与标签聚合（用于筛选栏）
router.get('/facets', auth, async (req, res) => {
    try {
        const kps = await KnowledgePoint.find({ user: req.user.id })
            .select('category tags status favorite')
            .lean();

        const categoryMap = new Map();
        const tagMap = new Map();
        const statusMap = { not_started: 0, in_progress: 0, mastered: 0 };
        let favoriteCount = 0;

        kps.forEach((kp) => {
            const cat = kp.category || '未分类';
            categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
            (kp.tags || []).forEach((tag) => tagMap.set(tag, (tagMap.get(tag) || 0) + 1));
            if (statusMap[kp.status] !== undefined) statusMap[kp.status] += 1;
            if (kp.favorite) favoriteCount += 1;
        });

        res.json({
            total: kps.length,
            favorites: favoriteCount,
            status: statusMap,
            categories: [...categoryMap.entries()]
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count),
            tags: [...tagMap.entries()]
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 30),
        });
    } catch (err) {
        console.error('获取统计聚合失败:', err.message);
        res.status(500).json({ msg: '获取统计聚合失败' });
    }
});

// @route   GET /api/knowledge-points/review/due
// @desc    今日待复习队列
router.get('/review/due', auth, async (req, res) => {
    try {
        const items = await KnowledgePoint.find(dueFilter(req.user.id))
            .sort({ 'review.dueAt': 1, createdAt: 1 })
            .limit(50);
        res.json(items);
    } catch (err) {
        console.error('获取待复习队列失败:', err.message);
        res.status(500).json({ msg: '获取待复习队列失败' });
    }
});

// @route   GET /api/knowledge-points
// @desc    获取当前用户的所有知识点，支持搜索与筛选
router.get('/', auth, async (req, res) => {
    try {
        const { search, category, tag, status, favorite, sort } = req.query;
        const query = { user: req.user.id };

        if (category && category !== 'all') query.category = category;
        if (tag) query.tags = tag;
        if (status && status !== 'all') query.status = status;
        if (favorite === 'true') query.favorite = true;
        if (search) {
            const regex = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            query.$or = [{ title: regex }, { content: regex }, { tags: regex }];
        }

        const sortMap = {
            recent: { updatedAt: -1 },
            created: { createdAt: -1 },
            mastery: { mastery: 1, updatedAt: -1 },
            due: { 'review.dueAt': 1 },
            title: { title: 1 },
        };
        const sortOption = sortMap[sort] || sortMap.recent;

        const kps = await KnowledgePoint.find(query).sort(sortOption);
        res.json(kps);
    } catch (err) {
        console.error('获取知识点失败:', err.message);
        res.status(500).json({ msg: '获取知识点失败' });
    }
});

// @route   POST /api/knowledge-points
router.post('/', auth, async (req, res) => {
    try {
        const { title, content, category, tags, summary, favorite } = req.body;
        if (!title || !String(title).trim()) {
            return res.status(400).json({ msg: '标题不能为空' });
        }
        const newKp = new KnowledgePoint({
            title: String(title).trim().slice(0, 120),
            content: content || '',
            category: (category || '未分类').trim().slice(0, 20) || '未分类',
            tags: normalizeTags(tags),
            summary: summary || '',
            favorite: Boolean(favorite),
            user: req.user.id,
        });
        const kp = await newKp.save();
        addKnowledgePointToStore(kp);

        const reward = await logStudy({
            userId: req.user.id,
            type: 'create',
            knowledgePointId: kp._id,
            minutes: 5,
            meta: { title: kp.title },
        });

        res.json({ ...kp.toObject(), reward });
    } catch (err) {
        console.error('创建知识点失败:', err.message);
        res.status(500).json({ msg: '创建知识点失败' });
    }
});

// @route   GET /api/knowledge-points/:id
router.get('/:id', auth, async (req, res) => {
    try {
        const kp = await KnowledgePoint.findById(req.params.id);
        if (!kp) return res.status(404).json({ msg: '知识点不存在' });
        if (kp.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: '无权访问该知识点' });
        }
        res.json(kp);
    } catch (err) {
        console.error('获取知识点详情失败:', err.message);
        res.status(500).json({ msg: '获取知识点详情失败' });
    }
});

// @route   PUT /api/knowledge-points/:id
router.put('/:id', auth, async (req, res) => {
    try {
        const kp = await KnowledgePoint.findById(req.params.id);
        if (!kp) return res.status(404).json({ msg: '知识点不存在' });
        if (kp.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: '无权修改该知识点' });
        }

        const contentChanged = req.body.content !== undefined && req.body.content !== kp.content;
        const allowed = ['title', 'content', 'category', 'tags', 'summary', 'favorite', 'status', 'reviewList', 'mastery'];
        allowed.forEach((key) => {
            if (req.body[key] === undefined) return;
            if (key === 'tags') kp.tags = normalizeTags(req.body.tags);
            else if (key === 'title') kp.title = String(req.body.title).trim().slice(0, 120);
            else if (key === 'category') kp.category = String(req.body.category || '未分类').trim().slice(0, 20) || '未分类';
            else if (key === 'mastery') kp.mastery = Math.max(0, Math.min(100, Number(req.body.mastery) || 0));
            else kp[key] = req.body[key];
        });

        if (req.body.status === undefined) {
            if (kp.mastery >= 80) kp.status = 'mastered';
            else if (kp.mastery > 0) kp.status = 'in_progress';
        }

        await kp.save();
        if (contentChanged) addKnowledgePointToStore(kp);

        res.json(kp);
    } catch (err) {
        console.error('更新知识点失败:', err.message);
        res.status(500).json({ msg: '更新知识点失败' });
    }
});

// @route   POST /api/knowledge-points/:id/review
// @desc    提交一次间隔复习评分（1 忘记 / 3 有点难 / 4 记得 / 5 很简单）
router.post('/:id/review', auth, async (req, res) => {
    try {
        const kp = await KnowledgePoint.findById(req.params.id);
        if (!kp) return res.status(404).json({ msg: '知识点不存在' });
        if (kp.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: '无权操作该知识点' });
        }

        const grade = Number(req.body.grade);
        if (![1, 3, 4, 5].includes(grade)) {
            return res.status(400).json({ msg: '评分必须是 1、3、4、5 之一' });
        }

        kp.review = scheduleReview(kp.review, grade);
        kp.stats.reviewCount = (kp.stats.reviewCount || 0) + 1;
        applyMastery(kp, gradeToMasteryDelta(grade));
        kp.reviewList = grade < 3;
        await kp.save();

        const reward = await logStudy({
            userId: req.user.id,
            type: 'review',
            knowledgePointId: kp._id,
            minutes: 2,
            meta: { grade },
        });

        res.json({ knowledgePoint: kp, reward });
    } catch (err) {
        console.error('提交复习失败:', err.message);
        res.status(500).json({ msg: '提交复习失败' });
    }
});

// @route   DELETE /api/knowledge-points/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        const kp = await KnowledgePoint.findById(req.params.id);
        if (!kp) return res.status(404).json({ msg: '知识点不存在' });
        if (kp.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: '无权删除该知识点' });
        }
        await KnowledgePoint.findByIdAndDelete(req.params.id);
        removeKnowledgePointFromStore(kp._id);
        res.json({ msg: '知识点已删除' });
    } catch (err) {
        console.error('删除知识点失败:', err.message);
        res.status(500).json({ msg: '删除知识点失败' });
    }
});

module.exports = router;
