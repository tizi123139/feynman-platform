// routes/quizAttempts.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const QuizAttempt = require('../models/QuizAttempt');
const { afterQuiz, logStudy } = require('../services/studyLogService');

// @route   GET /api/quiz-attempts?correct=false&knowledgePointId=
router.get('/', auth, async (req, res) => {
    try {
        const query = { user: req.user.id };
        if (req.query.correct === 'false') query.isCorrect = false;
        if (req.query.correct === 'true') query.isCorrect = true;
        if (req.query.knowledgePointId) query.knowledgePoint = req.query.knowledgePointId;

        const attempts = await QuizAttempt.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .populate('knowledgePoint', 'title category mastery');
        res.json(attempts);
    } catch (err) {
        console.error('获取答题记录失败:', err.message);
        res.status(500).json({ msg: '获取答题记录失败' });
    }
});

// @route   POST /api/quiz-attempts
router.post('/', auth, async (req, res) => {
    try {
        const {
            knowledgePointId,
            questionType,
            difficulty,
            question,
            options,
            answer,
            userAnswer,
            isCorrect,
            explanation,
        } = req.body;

        if (!question) return res.status(400).json({ msg: '题目内容不能为空' });

        const attempt = await QuizAttempt.create({
            user: req.user.id,
            knowledgePoint: knowledgePointId || null,
            questionType: questionType || 'single-choice',
            difficulty: difficulty || '基础',
            question,
            options: options || null,
            answer: answer || '',
            userAnswer: userAnswer || '',
            isCorrect: Boolean(isCorrect),
            explanation: explanation || '',
        });

        if (knowledgePointId) {
            await afterQuiz(knowledgePointId, Boolean(isCorrect));
        }

        const reward = await logStudy({
            userId: req.user.id,
            type: 'quiz',
            knowledgePointId: knowledgePointId || null,
            minutes: 2,
            score: isCorrect ? 100 : 0,
            xp: isCorrect ? 8 : 2,
            meta: { difficulty, isCorrect: Boolean(isCorrect) },
        });

        res.status(201).json({ attempt, reward });
    } catch (err) {
        console.error('保存答题记录失败:', err.message);
        res.status(500).json({ msg: '保存答题记录失败' });
    }
});

// @route   DELETE /api/quiz-attempts/:id
router.delete('/:id', auth, async (req, res) => {
    try {
        const attempt = await QuizAttempt.findById(req.params.id);
        if (!attempt) return res.status(404).json({ msg: '记录不存在' });
        if (attempt.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权删除该记录' });

        await QuizAttempt.findByIdAndDelete(req.params.id);
        res.json({ msg: '记录已删除' });
    } catch (err) {
        console.error('删除答题记录失败:', err.message);
        res.status(500).json({ msg: '删除答题记录失败' });
    }
});

module.exports = router;
