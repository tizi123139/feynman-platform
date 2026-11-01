// services/feynmanCoachService.js
// 费曼教练：把各供应商异构的评分归一成五维雷达，并生成弱点驱动的追问
const axios = require('axios');
const { callQianfanLLM } = require('../utils/qianfan-api-example');

// 五维固定顺序，前端雷达图直接按这个顺序画，不要在前端再排一次
const DIMENSIONS = [
    { key: 'accuracy', label: '准确性', hint: '概念和事实有没有讲错' },
    { key: 'completeness', label: '完整性', hint: '关键要素是否覆盖' },
    { key: 'logic', label: '逻辑结构', hint: '先讲什么、后讲什么' },
    { key: 'fluency', label: '表达流畅', hint: '听的人能不能跟上' },
    { key: 'depth', label: '深度延伸', hint: '有没有讲到原理和边界' },
];

const DIMENSION_KEYS = DIMENSIONS.map((item) => item.key);

// 供应商字段名不统一，这里做一张并表
const SOURCE_FIELDS = {
    accuracy: ['accuracy', 'accuracyScore', 'correctness'],
    completeness: ['completeness', 'coverage'],
    logic: ['logic', 'logicScore', 'structure', 'organization'],
    fluency: ['fluency', 'clarity', 'expression', 'language'],
    depth: ['depth', 'insight', 'understanding'],
};

// 模型没给到某一维时，用总分加典型偏移补一条轮廓，保证雷达图不会塌成一个点
const FALLBACK_OFFSET = { accuracy: 3, completeness: -5, logic: -1, fluency: 6, depth: -9 };

function clampScore(value, fallback = 0) {
    const num = Number(value);
    if (!Number.isFinite(num)) return Math.max(0, Math.min(100, Math.round(fallback)));
    return Math.max(0, Math.min(100, Math.round(num)));
}

/** 供应商有的给 1-10 分，有的给 0-100，靠数量级判断 */
function toHundred(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (num <= 10) return clampScore(num * 10);
    return clampScore(num);
}

function pickSource(raw, key) {
    for (const field of SOURCE_FIELDS[key] || []) {
        const value = raw?.[field];
        const scaled = toHundred(value);
        if (scaled !== null && scaled > 0) return scaled;
    }
    return null;
}

/**
 * 把任意供应商的返回压成 { accuracy, completeness, logic, fluency, depth }
 * estimated 表示其中有维度是推算出来的，前端可以提示一句「部分维度由综合分推算」
 */
function normalizeDimensions(raw = {}, score = 0) {
    const base = clampScore(score);
    const explicit = raw?.dimensions && typeof raw.dimensions === 'object' ? raw.dimensions : null;
    const dimensions = {};
    let estimated = false;

    DIMENSION_KEYS.forEach((key) => {
        const declared = explicit ? toHundred(explicit[key]) : null;
        const direct = declared !== null ? declared : pickSource(raw, key);
        if (direct !== null) {
            dimensions[key] = direct;
            return;
        }
        estimated = true;
        dimensions[key] = clampScore(base + FALLBACK_OFFSET[key]);
    });

    // 只有推算出来的维度才需要校正；模型明确给的分不动，尊重它的判断
    const mean = DIMENSION_KEYS.reduce((sum, key) => sum + dimensions[key], 0) / DIMENSION_KEYS.length;
    if (estimated && Math.abs(mean - base) > 18) {
        const shift = base - mean;
        DIMENSION_KEYS.forEach((key) => {
            if (explicit?.[key] !== undefined) return;
            dimensions[key] = clampScore(dimensions[key] + shift);
        });
    }

    return { dimensions, estimated };
}

/** 追问失败时的兜底：演示现场不能因为模型挂了就没有下一问 */
function fallbackProbe({ weaknesses = [], round = 1, knowledgePoint = '这个知识点' }) {
    const weak = String(weaknesses[0] || '').trim();
    const plans = [
        {
            question: weak
                ? `你刚才提到「${weak}」，能再具体说说这里到底发生了什么吗？`
                : `如果对面是完全没学过的人，你会怎么用一句话解释「${knowledgePoint}」？`,
            focus: '把含糊的地方讲具体',
            hint: '先给结论，再补一个能被验证的细节',
        },
        {
            question: `假设有人举了一个反例说「${knowledgePoint}」在这里并不成立，你会怎么回应？`,
            focus: '检验边界条件',
            hint: '想一想这个结论成立的前提是什么',
        },
        {
            question: `如果要在真实项目里用上「${knowledgePoint}」，你会先确认哪些前提？`,
            focus: '检验迁移能力',
            hint: '从输入、约束、失败场景三个角度想',
        },
    ];
    const plan = plans[Math.min(Math.max(round, 1), plans.length) - 1];
    return { ...plan, reference: '', provider: 'local' };
}

function extractJson(text) {
    if (!text) return null;
    const match = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    const raw = match ? match[1] || match[0] : text;
    try {
        return JSON.parse(raw);
    } catch (error) {
        console.warn('追问结果不是合法 JSON:', error.message);
        return null;
    }
}

/** 依次尝试可用的供应商，任何一家通了就返回 */
async function chatJSON(prompt, { temperature = 0.6, maxTokens = 900 } = {}) {
    const attempts = [];
    if (process.env.QIANFAN_API_KEY) {
        attempts.push(async () => {
            const data = await callQianfanLLM([{ role: 'user', content: prompt }], 'ernie-5.1');
            return { text: data.choices?.[0]?.message?.content, provider: 'Qianfan' };
        });
    }
    if (process.env.DEEPSEEK_API_KEY) {
        attempts.push(async () => {
            const { data } = await axios.post(
                'https://api.deepseek.com/v1/chat/completions',
                { model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature, max_tokens: maxTokens },
                { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` }, timeout: 45000 }
            );
            return { text: data.choices?.[0]?.message?.content, provider: 'DeepSeek' };
        });
    }
    if (process.env.SILICONFLOW_API_KEY) {
        attempts.push(async () => {
            const { data } = await axios.post(
                'https://api.siliconflow.cn/v1/chat/completions',
                {
                    model: 'deepseek-ai/DeepSeek-V3',
                    messages: [{ role: 'user', content: prompt }],
                    temperature,
                    max_tokens: maxTokens,
                },
                { headers: { Authorization: `Bearer ${process.env.SILICONFLOW_API_KEY}` }, timeout: 45000 }
            );
            return { text: data.choices?.[0]?.message?.content, provider: 'SiliconFlow' };
        });
    }

    const errors = [];
    for (const attempt of attempts) {
        try {
            const result = await attempt();
            if (result.text) return result;
            errors.push('返回内容为空');
        } catch (error) {
            errors.push(error.message);
        }
    }
    throw new Error(errors.join('; ') || '没有可用的模型供应商');
}

/**
 * 弱点驱动追问：把上一轮暴露的薄弱点变成下一轮的开场问题
 * round 越大越往「反例 / 边界 / 迁移」上压，避免一直在原地澄清
 */
async function generateProbe({ knowledgePoint, originalContent, transcript, weaknesses = [], round = 1, history = [] }) {
    const asked = (history || []).filter(Boolean).slice(-4);
    const prompt = `
你是一位严格但友善的费曼学习教练。学生刚刚把「${knowledgePoint}」讲了一遍，你要接着追问，逼他把没讲清的地方讲清楚。

【知识点原文】
"""
${String(originalContent || '').slice(0, 1500)}
"""

【学生这一轮的原话】
"""
${String(transcript || '').slice(0, 1500)}
"""

【上一轮评语中指出的薄弱点】
${weaknesses.length ? weaknesses.map((item, i) => `${i + 1}. ${item}`).join('\n') : '（暂无，挑一个最可能讲浅的地方）'}

【已经问过的问题，不要重复】
${asked.length ? asked.map((item, i) => `${i + 1}. ${item}`).join('\n') : '（无）'}

【当前是第 ${round} 轮追问】
第 1 轮：把一个含糊的说法问具体（到底指什么、怎么发生）
第 2 轮：给一个反例或反直觉场景，问边界条件
第 3 轮：问真实场景怎么用，检验能不能迁移

只问一个问题，必须能一句话回答不了、需要展开两句以上。
请严格返回如下 JSON，不要输出任何额外解释：
{
  "question": "你的追问",
  "focus": "这次追问想检验什么（10 字以内）",
  "hint": "给学生的提示，不能直接给答案",
  "reference": "参考答案要点，2-3 句"
}
`;

    try {
        const { text, provider } = await chatJSON(prompt);
        const parsed = extractJson(text);
        if (!parsed || !parsed.question) throw new Error('追问结果缺少 question');
        return {
            question: String(parsed.question).slice(0, 300),
            focus: String(parsed.focus || '深入一层').slice(0, 40),
            hint: String(parsed.hint || '').slice(0, 200),
            reference: String(parsed.reference || '').slice(0, 500),
            provider,
        };
    } catch (error) {
        console.warn('生成追问失败，使用本地兜底:', error.message);
        return fallbackProbe({ weaknesses, round, knowledgePoint });
    }
}

/** 追问的作答同样要打分，这里只关心「补得够不够」，所以要纯一点 */
async function gradeProbe({ knowledgePoint, question, answer, reference }) {
    const prompt = `
你是费曼教练。请判断学生对追问的回答是否补上了关键一点。

【知识点】${knowledgePoint}
【追问】${question}
【参考要点】${String(reference || '（无）').slice(0, 600)}
【学生回答】
"""
${String(answer || '').slice(0, 1200)}
"""

请严格返回如下 JSON：
{
  "score": 0 到 100 的整数,
  "verdict": "一句话结论",
  "filled": "他补上了什么",
  "stillMissing": "还缺什么，没有就留空"
}
`;

    try {
        const { text } = await chatJSON(prompt, { temperature: 0.2, maxTokens: 600 });
        const parsed = extractJson(text);
        if (!parsed) throw new Error('评分结果不是合法 JSON');
        return {
            score: clampScore(parsed.score),
            verdict: String(parsed.verdict || '').slice(0, 200),
            filled: String(parsed.filled || '').slice(0, 300),
            stillMissing: String(parsed.stillMissing || '').slice(0, 300),
        };
    } catch (error) {
        console.warn('追问评分失败，使用兜底:', error.message);
        // 兜底只做粗判：有实质内容就给及格线以上，避免现场卡住
        const length = String(answer || '').trim().length;
        const score = length >= 80 ? 78 : length >= 30 ? 66 : 45;
        return {
            score,
            verdict: length >= 30 ? '有展开，但还没有点到关键约束' : '回答太短，更像复述而不是解释',
            filled: length ? '给出了自己的说法' : '',
            stillMissing: '缺少可被验证的细节或例子',
        };
    }
}

module.exports = {
    DIMENSIONS,
    DIMENSION_KEYS,
    normalizeDimensions,
    generateProbe,
    gradeProbe,
};
