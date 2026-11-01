// services/ragService.js
const KnowledgePoint = require('../models/KnowledgePoint');
const { queryVectorStore } = require('./vectorStoreService');
const { callLLMText, callLLMStream } = require('./aiService');

const SYSTEM_PROMPT = '你是费曼学习法知识库助手，回答准确、亲切、通俗。';

// 检索 -> 取标题 -> 拼上下文，非流式与流式共用
async function buildRagMessages({ question, userId, k = 4 }) {
    const docs = await queryVectorStore(question, k, userId);

    if (!docs || docs.length === 0) return { messages: null, sources: [] };

    const ids = [...new Set(
        docs.map((d) => d.metadata?.knowledgePointId).filter(Boolean)
    )];
    const kps = await KnowledgePoint.find({ _id: { $in: ids }, user: userId }).select('title');
    const titleMap = new Map(kps.map((kp) => [kp._id.toString(), kp.title]));

    const context = docs
        .map((doc, index) => {
            const kpTitle = titleMap.get(doc.metadata?.knowledgePointId);
            return `--- 片段 ${index + 1}${kpTitle ? `（来自笔记《${kpTitle}》）` : ''} ---\n${doc.pageContent}`;
        })
        .join('\n\n');

    const prompt = `你是一个温柔耐心的知识库问答伙伴，名叫「费曼小助手」。
请只根据下面的资料回答用户问题；资料里没有的信息就直说不知道，不要编造。
回答使用简体中文，可以用 Markdown 分点，尽量把复杂概念讲得像给小朋友解释一样清楚，最后可以给一个生活化的小比喻。

<资料>
${context}
</资料>

<问题>
${question}
</问题>`;

    return {
        messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
        ],
        sources: kps.map((kp) => ({ id: kp._id.toString(), title: kp.title })),
    };
}

const EMPTY_ANSWER = '我在你的知识库里还没有找到相关内容。先记录一个知识点，或者换个说法问问我吧。';

/**
 * 基于当前用户自己的知识库回答问题
 * @param {{question: string, userId: string, k?: number}} params
 */
async function answerWithRAG({ question, userId, k = 4 }) {
    const { messages, sources } = await buildRagMessages({ question, userId, k });

    if (!messages) {
        return { answer: EMPTY_ANSWER, sources: [], provider: 'local' };
    }

    const { text, provider } = await callLLMText(messages, { temperature: 0.3, maxTokens: 1200 });

    return { answer: text, provider, sources };
}

/**
 * 流式版本：每收到一段增量文本就通过 onDelta 推给调用方
 * @param {{question: string, userId: string, k?: number}} params
 * @param {(delta: string) => void} onDelta
 * @returns {Promise<{answer: string, sources: Array, provider: string}>}
 */
async function answerWithRAGStream({ question, userId, k = 4 }, onDelta) {
    const { messages, sources } = await buildRagMessages({ question, userId, k });

    if (!messages) {
        if (onDelta) onDelta(EMPTY_ANSWER);
        return { answer: EMPTY_ANSWER, sources: [], provider: 'local' };
    }

    const { text, provider } = await callLLMStream(messages, { temperature: 0.3, maxTokens: 1200 }, onDelta);

    return { answer: text, provider, sources };
}

module.exports = { answerWithRAG, answerWithRAGStream };
