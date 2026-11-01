// routes/flashcards.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Flashcard = require('../models/Flashcard');
const { logStudy } = require('../services/studyLogService');

// @route   GET /api/flashcards?due=1&knowledgePointId=
router.get('/', auth, async (req, res) => {
    try {
        const query = { user: req.user.id };
        if (req.query.knowledgePointId) query.knowledgePoint = req.query.knowledgePointId;
        if (req.query.due === '1') query.nextReviewAt = { $lte: new Date() };

        const cards = await Flashcard.find(query).sort({ nextReviewAt: 1 }).limit(200);
        res.json(cards);
    } catch (err) {
        console.error('获取闪卡失败:', err.message);
        res.status(500).json({ msg: '获取闪卡失败' });
    }
});

// @route   POST /api/flashcards/:id/review
router.post('/:id/review', auth, async (req, res) => {
    try {
        const card = await Flashcard.findById(req.params.id);
        if (!card) return res.status(404).json({ msg: '闪卡不存在' });
        if (card.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权操作该闪卡' });

        const grade = Number(req.body.grade) || 4;
        let ease = Number(card.easeFactor) || 2.5;
        ease = Math.max(1.3, Number((ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))).toFixed(2)));

        let interval;
        if (grade < 3) {
            interval = 1;
        } else if (card.reviewCount === 0) {
            interval = 1;
        } else if (card.reviewCount === 1) {
            interval = 3;
        } else {
            interval = Math.round(Math.max(1, card.intervalDays) * ease);
        }
        interval = Math.min(interval, 120);

        card.intervalDays = interval;
        card.easeFactor = ease;
        card.reviewCount += 1;
        card.nextReviewAt = new Date(Date.now() + interval * 24 * 60 * 60 * 1000);
        await card.save();

        const reward = await logStudy({
            userId: req.user.id,
            type: 'flashcard',
            knowledgePointId: card.knowledgePoint,
            minutes: 1,
            meta: { grade },
        });

        res.json({ card, reward });
    } catch (err) {
        console.error('复习闪卡失败:', err.message);
        res.status(500).json({ msg: '复习闪卡失败' });
    }
});

// @route   DELETE /api/flashcards/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        const card = await Flashcard.findById(req.params.id);
        if (!card) return res.status(404).json({ msg: '闪卡不存在' });
        if (card.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权删除该闪卡' });

        await Flashcard.findByIdAndDelete(req.params.id);
        res.json({ msg: '闪卡已删除' });
    } catch (err) {
        console.error('删除闪卡失败:', err.message);
        res.status(500).json({ msg: '删除闪卡失败' });
    }
});

module.exports = router;
