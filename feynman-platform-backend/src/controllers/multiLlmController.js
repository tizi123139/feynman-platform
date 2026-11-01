// controllers/multiLlmController.js
const { evaluateWithMultipleLLMs } = require('../utils/multi-llm-manager');
const { afterFeynman, logStudy } = require('../services/studyLogService');
const { normalizeDimensions, generateProbe, gradeProbe } = require('../services/feynmanCoachService');

/** 把不同供应商的返回结构统一成前端需要的形状 */
function normalizeResult(result) {
    const rawScore = result.score ?? (result.overallScore ? result.overallScore * 10 : 0);
    const score = Math.max(0, Math.min(100, Math.round(Number(rawScore) || 0)));
    // 供应商给的五维字段名各不相同，统一在这里归一，前端只认一套
    const { dimensions, estimated } = normalizeDimensions(result, score);
    const followUp = result.followUp?.question
        ? {
              question: String(result.followUp.question).slice(0, 300),
              focus: String(result.followUp.focus || '').slice(0, 40),
          }
        : null;
    return {
        polishedText: result.polishedText || result.optimizedText || '',
        evaluation: result.evaluation || result.suggestions || '',
        strengths: Array.isArray(result.strengths) ? result.strengths : [],
        weaknesses: Array.isArray(result.weaknesses) ? result.weaknesses : [],
        ...result,
        score,
        dimensions,
        dimensionsEstimated: estimated,
        followUp,
    };
}

exports.evaluateFeynmanAttempt = async (req, res) => {
    const { originalContent, transcribedText, knowledgePoint, provider, knowledgePointId, durationSeconds } = req.body;

    if (!originalContent || !transcribedText || !transcribedText.trim()) {
        return res.status(400).json({ msg: 'Original content and transcribed text are required.' });
    }

    try {
        let providers;
        if (provider && provider !== 'auto') {
            providers = [provider];
        } else {
            providers = ['qianfan', 'deepseek', 'siliconflow', 'openrouter'];
        }

        const llmResult = normalizeResult(
            await evaluateWithMultipleLLMs(originalContent, transcribedText, knowledgePoint, providers)
        );

        console.log(`评估完成，使用服务: ${llmResult.provider}`);

        let mastery = null;
        let reward = null;
        if (knowledgePointId) {
            try {
                const kp = await afterFeynman(knowledgePointId, llmResult.score);
                mastery = kp?.mastery ?? null;
                reward = await logStudy({
                    userId: req.user.id,
                    type: 'feynman',
                    knowledgePointId,
                    minutes: Math.max(1, Math.round((Number(durationSeconds) || 60) / 60)),
                    score: llmResult.score,
                    meta: { provider: llmResult.provider },
                });
            } catch (error) {
                console.error('更新复述学习数据失败:', error.message);
            }
        }

        res.json({ ...llmResult, mastery, reward });
    } catch (error) {
        console.error('评估过程中出错:', error.message);
        res.status(500).json({ msg: 'AI 教练暂时不可用，请稍后重试' });
    }
};

/**
 * 弱点驱动追问：拿上一轮评语里的薄弱点，生成下一轮开场问题
 * 不落库，轮次信息由前端维护（演示时一轮会话内完成）
 */
exports.probeFeynman = async (req, res) => {
    const { knowledgePoint = '', originalContent = '', transcript = '', weaknesses, round = 1, history } = req.body || {};

    if (!Array.isArray(weaknesses) && !transcript) {
        return res.status(400).json({ msg: '缺少上一轮的评语或复述内容' });
    }

    try {
        const probe = await generateProbe({
            knowledgePoint: String(knowledgePoint).slice(0, 120),
            originalContent,
            transcript,
            weaknesses: Array.isArray(weaknesses) ? weaknesses.filter(Boolean).slice(0, 5) : [],
            round: Math.min(Math.max(Number(round) || 1, 1), 5),
            history: Array.isArray(history) ? history : [],
        });
        res.json(probe);
    } catch (error) {
        console.error('生成追问失败:', error.message);
        res.status(500).json({ msg: '追问生成失败，请稍后重试' });
    }
};

/** 给追问的回答打分，判断有没有补上关键那一点 */
exports.gradeProbeAnswer = async (req, res) => {
    const { knowledgePoint = '', question = '', answer = '', reference = '' } = req.body || {};

    if (!question || !String(answer).trim()) {
        return res.status(400).json({ msg: '需要追问和你的回答' });
    }

    try {
        const result = await gradeProbe({
            knowledgePoint: String(knowledgePoint).slice(0, 120),
            question: String(question).slice(0, 300),
            answer,
            reference,
        });
        res.json(result);
    } catch (error) {
        console.error('追问评分失败:', error.message);
        res.status(500).json({ msg: '追问评分失败，请稍后重试' });
    }
};
