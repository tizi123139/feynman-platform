const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { evaluateFeynmanAttempt, probeFeynman, gradeProbeAnswer } = require('../controllers/multiLlmController');
const { generateQuestion, gradeAnswer, answerWithRAG } = require('../controllers/baiduAiController');
const {
    summarize,
    generateFlashcards,
    startPractice,
    practiceReply,
} = require('../controllers/aiToolsController');
const { analyzeDelivery } = require('../services/deliveryService');

router.post('/generate-question', auth, generateQuestion);

router.post('/evaluate', auth, evaluateFeynmanAttempt);

// 五维评分 → 弱点驱动追问 → 追问作答评分
router.post('/probe', auth, probeFeynman);

router.post('/probe-grade', auth, gradeProbeAnswer);

// 表达体检：语速 / 口头禅 / 句长 / 讲解结构（纯规则，不调模型）
router.post('/delivery', auth, (req, res) => {
    try {
        const report = analyzeDelivery({
            text: req.body?.text,
            durationSeconds: req.body?.durationSeconds,
        });
        if (!report) return res.status(400).json({ msg: '缺少复述文本，无法体检' });
        res.json(report);
    } catch (err) {
        console.error('表达体检失败:', err.message);
        res.status(500).json({ msg: '表达体检失败' });
    }
});

router.post('/rag-qa', auth, answerWithRAG);

router.post('/grade-answer', auth, gradeAnswer);

router.post('/summarize', auth, summarize);

router.post('/flashcards', auth, generateFlashcards);

router.post('/practice-start', auth, startPractice);

router.post('/practice-reply', auth, practiceReply);

module.exports = router;
