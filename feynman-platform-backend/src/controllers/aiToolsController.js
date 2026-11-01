// controllers/aiToolsController.js
const KnowledgePoint = require('../models/KnowledgePoint');
const Flashcard = require('../models/Flashcard');
const { callLLMJson, callLLMText } = require('../services/aiService');
const { logStudy } = require('../services/studyLogService');

async function findOwnedKp(id, userId) {
    if (!id) return null;
    const kp = await KnowledgePoint.findById(id);
    if (!kp || kp.user.toString() !== userId) return null;
    return kp;
}

/** AI 摘要：返回一句话摘要、要点与建议标签 */
exports.summarize = async (req, res) => {
    try {
        const { knowledgePointId, content: rawContent, apply } = req.body;
        const kp = await findOwnedKp(knowledgePointId, req.user.id);
        const content = kp ? kp.content : rawContent;
        if (!content || !String(content).trim()) {
            return res.status(400).json({ msg: '知识点内容不能为空' });
        }

        const prompt = `请阅读下面的学习笔记，并输出 JSON：
{
  "summary": "不超过 60 字的一句话摘要",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "tags": ["标签1", "标签2", "标签3"]
}
标签请控制在 2-6 个字，数量 3-5 个，尽量是学科概念词。

<笔记>
${String(content).slice(0, 6000)}
</笔记>`;

        const { data, provider } = await callLLMJson(
            [
                { role: 'system', content: '你是擅长提炼知识要点的学习助手。只输出 JSON。' },
                { role: 'user', content: prompt },
            ],
            { temperature: 0.3, maxTokens: 900 }
        );

        const summary = String(data.summary || '').trim();
        const keyPoints = Array.isArray(data.keyPoints) ? data.keyPoints.slice(0, 6) : [];
        const tags = Array.isArray(data.tags)
            ? [...new Set(data.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 5)
            : [];

        if (kp && apply) {
            kp.summary = summary;
            kp.tags = [...new Set([...(kp.tags || []), ...tags])].slice(0, 8);
            await kp.save();
        }

        res.json({ summary, keyPoints, tags, provider, saved: Boolean(kp && apply) });
    } catch (err) {
        console.error('生成摘要失败:', err.message);
        res.status(500).json({ msg: err.message || '生成摘要失败' });
    }
};

/** 根据知识点生成闪卡 */
exports.generateFlashcards = async (req, res) => {
    try {
        const { knowledgePointId, count = 5 } = req.body;
        const kp = await findOwnedKp(knowledgePointId, req.user.id);
        if (!kp) return res.status(404).json({ msg: '知识点不存在或无权访问' });

        const num = Math.max(3, Math.min(10, Number(count) || 5));
        const prompt = `请根据下面的笔记生成 ${num} 张问答式学习闪卡，输出 JSON：
{
  "cards": [
    { "front": "正面问题（简洁、可独立理解）", "back": "背面答案（不超过 120 字）" }
  ]
}
问题要覆盖核心概念、易混淆点与例子，避免重复。

<笔记>
${kp.content.slice(0, 6000)}
</笔记>`;

        const { data, provider } = await callLLMJson(
            [
                { role: 'system', content: '你是擅长设计闪卡的学习教练。只输出 JSON。' },
                { role: 'user', content: prompt },
            ],
            { temperature: 0.5, maxTokens: 1600 }
        );

        const cards = (Array.isArray(data.cards) ? data.cards : []).slice(0, num);
        const created = [];
        for (const card of cards) {
            if (!card?.front || !card?.back) continue;
            const doc = await Flashcard.create({
                user: req.user.id,
                knowledgePoint: kp._id,
                front: String(card.front).slice(0, 300),
                back: String(card.back).slice(0, 800),
            });
            created.push(doc);
        }

        if (created.length > 0) {
            await logStudy({
                userId: req.user.id,
                type: 'flashcard',
                knowledgePointId: kp._id,
                minutes: 2,
                meta: { action: 'generate', count: created.length },
            });
        }

        res.json({ cards: created, provider, knowledgePointTitle: kp.title });
    } catch (err) {
        console.error('生成闪卡失败:', err.message);
        res.status(500).json({ msg: err.message || '生成闪卡失败' });
    }
};

/** 语音陪练：开始一轮提问 */
exports.startPractice = async (req, res) => {
    try {
        const kp = await findOwnedKp(req.body.knowledgePointId, req.user.id);
        if (!kp) return res.status(404).json({ msg: '知识点不存在或无权访问' });

        const prompt = `你是一个温柔的费曼陪练伙伴。请根据下面的知识点，向学生提出一个开放式问题，引导他用自己的话讲解。只输出问题本身，不要任何前后缀，不超过 60 字。

<知识点>
${kp.content.slice(0, 4000)}
</知识点>`;

        const { text, provider } = await callLLMText(
            [
                { role: 'system', content: '你是费曼学习法的陪练伙伴，语气亲切。' },
                { role: 'user', content: prompt },
            ],
            { temperature: 0.6, maxTokens: 200 }
        );

        res.json({ question: text, provider, knowledgePointTitle: kp.title });
    } catch (err) {
        console.error('开始陪练失败:', err.message);
        res.status(500).json({ msg: err.message || '开始陪练失败' });
    }
};

/** 语音陪练：根据学生回答给反馈并提出下一问 */
exports.practiceReply = async (req, res) => {
    try {
        const { knowledgePointId, transcript, history = [] } = req.body;
        const kp = await findOwnedKp(knowledgePointId, req.user.id);
        if (!kp) return res.status(404).json({ msg: '知识点不存在或无权访问' });
        if (!transcript || !String(transcript).trim()) {
            return res.status(400).json({ msg: '回答内容不能为空' });
        }

        const historyText = history
            .slice(-6)
            .map((item) => `${item.role === 'assistant' ? '陪练' : '学生'}：${item.content}`)
            .join('\n');

        const prompt = `你正在用费曼学习法陪学生练习。请根据知识点、对话历史与学生的本次回答，输出 JSON：
{
  "feedback": "针对本次回答的点评，先肯定再指出一个改进点，不超过 120 字",
  "score": 0到100的整数,
  "nextQuestion": "追问或下一个引导问题，不超过 60 字"
}

<知识点>
${kp.content.slice(0, 3500)}
</知识点>

<对话历史>
${historyText || '（这是第一轮回答）'}
</对话历史>

<学生本次回答>
${String(transcript).slice(0, 2000)}
</学生本次回答>`;

        const { data, provider } = await callLLMJson(
            [
                { role: 'system', content: '你是费曼学习法的陪练伙伴，点评要具体、温暖、可执行。只输出 JSON。' },
                { role: 'user', content: prompt },
            ],
            { temperature: 0.5, maxTokens: 800 }
        );

        const score = Math.max(0, Math.min(100, Math.round(Number(data.score) || 0)));
        await logStudy({
            userId: req.user.id,
            type: 'chat',
            knowledgePointId: kp._id,
            minutes: 3,
            meta: { scene: 'practice', score },
        });

        res.json({
            feedback: data.feedback || '先肯定你的表达，再试着补充一个具体例子会更好。',
            score,
            nextQuestion: data.nextQuestion || '能不能再举一个生活中的例子说明它？',
            provider,
        });
    } catch (err) {
        console.error('陪练反馈失败:', err.message);
        res.status(500).json({ msg: err.message || '陪练反馈失败' });
    }
};
