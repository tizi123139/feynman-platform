// routes/graph.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const KnowledgePoint = require('../models/KnowledgePoint');
const {
    reasonRelations,
    signatureOf,
    readCache,
    writeCache,
} = require('../services/graphReasoningService');

// 关系权重：正文引用 > 共同标签 > 同分类 > 同日创建 > 连通性兜底
const LINK_WEIGHT = { reference: 3, tag: 2, category: 1.6, day: 1.2, auto: 1 };

/**
 *  构建知识点之间的连线：
 *  1) 正文互相引用（最强关系）
 *  2) 共同标签
 *  3) 同分类（按创建时间串成链，避免全连接爆炸）
 *  4) 同一天创建
 *  5) 最后把孤立节点 / 孤立子图接到主图上，保证整张图是连通的
 */
function buildLinks(kps) {
    const idOf = (kp) => kp._id.toString();
    const links = [];
    const seen = new Set();

    const addLink = (a, b, type) => {
        if (!a || !b || a === b) return;
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        if (seen.has(key)) return;
        seen.add(key);
        links.push({ source: a, target: b, type, value: LINK_WEIGHT[type] || 1 });
    };

    const chain = (list, type) => {
        if (!list || list.length < 2) return;
        const sorted = [...list].sort((x, y) => new Date(x.createdAt) - new Date(y.createdAt));
        for (let i = 1; i < sorted.length; i += 1) {
            addLink(idOf(sorted[i - 1]), idOf(sorted[i]), type);
        }
    };

    // 1) 正文互相引用
    const titleMap = new Map();
    kps.forEach((kp) => {
        const title = (kp.title || '').trim();
        if (title.length >= 2) titleMap.set(title, idOf(kp));
    });
    kps.forEach((kp) => {
        const selfId = idOf(kp);
        const content = kp.content || '';
        titleMap.forEach((targetId, title) => {
            if (targetId !== selfId && content.includes(title)) addLink(selfId, targetId, 'reference');
        });
    });

    // 2) 共同标签
    const tagGroups = new Map();
    kps.forEach((kp) => {
        (kp.tags || []).forEach((tag) => {
            const key = String(tag || '').trim();
            if (!key) return;
            if (!tagGroups.has(key)) tagGroups.set(key, []);
            tagGroups.get(key).push(kp);
        });
    });
    tagGroups.forEach((list) => chain(list, 'tag'));

    // 3) 同分类
    const categoryGroups = new Map();
    kps.forEach((kp) => {
        const key = kp.category || '未分类';
        if (!categoryGroups.has(key)) categoryGroups.set(key, []);
        categoryGroups.get(key).push(kp);
    });
    categoryGroups.forEach((list) => chain(list, 'category'));

    // 4) 同一天创建
    const dayGroups = new Map();
    kps.forEach((kp) => {
        const day = new Date(kp.createdAt).toISOString().slice(0, 10);
        if (!dayGroups.has(day)) dayGroups.set(day, []);
        dayGroups.get(day).push(kp);
    });
    dayGroups.forEach((list) => chain(list, 'day'));

    // 5) 并查集：把互不相连的子图接到最大的那一个上
    const parent = new Map(kps.map((kp) => [idOf(kp), idOf(kp)]));
    const find = (x) => {
        let cur = x;
        while (parent.get(cur) !== cur) cur = parent.get(cur);
        return cur;
    };
    const union = (a, b) => parent.set(find(a), find(b));

    links.forEach((link) => union(link.source, link.target));

    const components = new Map();
    kps.forEach((kp) => {
        const root = find(idOf(kp));
        if (!components.has(root)) components.set(root, []);
        components.get(root).push(kp);
    });

    if (components.size > 1) {
        const ordered = [...components.values()].sort((a, b) => b.length - a.length);
        const anchor = idOf(ordered[0][0]);
        for (let i = 1; i < ordered.length; i += 1) {
            addLink(anchor, idOf(ordered[i][0]), 'auto');
        }
    }

    return links;
}

// @route   GET /api/graph/knowledge-map
// @desc    获取知识图谱数据
// @access  Private
router.get('/knowledge-map', auth, async (req, res) => {
    try {
        const kps = await KnowledgePoint.find({ user: req.user.id });

        if (kps.length === 0) {
            return res.json({ nodes: [], links: [] });
        }

        const nodes = kps.map(kp => ({
            id: kp._id.toString(),
            name: kp.title,
            value: (kp.summary || kp.content || '').substring(0, 100), // 截取部分内容作为提示
            category: kp.category || '未分类',
            tags: kp.tags || [],
            mastery: kp.mastery || 0,
            status: kp.status,
            symbolSize: 26 + Math.min((kp.content || '').length / 60, 26),
        }));

        res.json({ nodes, links: buildLinks(kps) });

    } catch (error) {
        console.error('Error generating knowledge graph:', error);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/graph/reason
// @desc    读取缓存的语义关系与学习路径（不触发模型调用）
// @access  Private
router.get('/reason', auth, async (req, res) => {
    try {
        const kps = await KnowledgePoint.find({ user: req.user.id })
            .select('title category mastery updatedAt')
            .lean();
        const cached = readCache(req.user.id, signatureOf(kps));
        res.json({
            relations: cached?.relations || [],
            path: cached?.path || [],
            cached: Boolean(cached),
        });
    } catch (err) {
        console.error('读取语义关系失败:', err.message);
        res.status(500).json({ msg: '读取语义关系失败' });
    }
});

// @route   POST /api/graph/reason
// @desc    让模型推理知识点之间的前置/延伸/易混/应用关系，并排出学习路径
// @access  Private
router.post('/reason', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const kps = await KnowledgePoint.find({ user: userId })
            .select('title category summary content mastery updatedAt')
            .sort({ updatedAt: -1 })
            .lean();

        if (kps.length < 2) {
            return res.json({ relations: [], path: [], cached: false, msg: '至少要有两个知识点才能看出关系' });
        }

        const signature = signatureOf(kps);
        const cached = readCache(userId, signature);
        if (cached && !req.body?.force) {
            return res.json({ ...cached, cached: true });
        }

        const result = await reasonRelations(kps);
        writeCache(userId, signature, result);
        res.json({ ...result, cached: false });
    } catch (err) {
        console.error('推理语义关系失败:', err.message);
        res.status(500).json({ msg: 'AI 关系推理失败，稍后再试' });
    }
});

module.exports = router;