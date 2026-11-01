// services/graphReasoningService.js
// 让模型读出知识点之间的真实语义关系，再据此排出学习路径
// 与 routes/graph.js 里的规则连线互补：规则线看「像不像」，语义线看「有没有因果/依赖」

const { callLLMText } = require('./aiService');

const RELATION_TYPES = {
    prerequisite: {
        label: '前置知识',
        color: 'rgba(79,183,154,0.95)',
        width: 4,
        hint: '先学它，再学后者',
    },
    extends: {
        label: '延伸深入',
        color: 'rgba(143,108,240,0.9)',
        width: 3.4,
        hint: '后者是前者的展开',
    },
    contrast: {
        label: '容易混淆',
        color: 'rgba(239,106,96,0.9)',
        width: 3.2,
        dashed: true,
        hint: '两者常被搞混',
    },
    applies: {
        label: '应用场景',
        color: 'rgba(79,149,232,0.85)',
        width: 2.8,
        hint: '前者用在后者的场景里',
    },
};

const MAX_POINTS = 30;
const MAX_RELATIONS = 18;
const MIN_CONFIDENCE = 0.55;
const CACHE_TTL = 12 * 60 * 60 * 1000;

// userId -> { signature, at, relations, path }
const cache = new Map();

const clamp01 = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0.6;
    return Math.max(0, Math.min(1, Number(num.toFixed(2))));
};

function brief(point) {
    const text = String(point.summary || point.content || '')
        .replace(/[#*`>|-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return text.slice(0, 70);
}

function buildPrompt(points) {
    const list = points
        .map((point, index) => `${index + 1}: ${String(point.title || '').trim()} —— ${brief(point) || '（暂无摘要）'}`)
        .join('\n');

    return `你是知识结构分析师。下面是一位学习者的知识点列表（编号: 标题 —— 摘要）。

请找出它们之间真正的语义关系，只输出 JSON 数组，不要任何解释。

可选关系类型（from 是起点，to 是终点）：
- prerequisite：学 to 之前应该先掌握 from
- extends：to 是 from 的进一步展开或深入
- contrast：两者容易混淆，放在一起对比才清楚
- applies：from 应用在 to 的场景中

要求：
1. 宁少勿多：只输出你能说清「为什么」的关系，最多 ${MAX_RELATIONS} 条
2. 只是同属一个领域、但说不出具体依赖的，一律不输出（比如两个不同的前端框架、两个不相关的后端概念）
3. 同一对知识点只给一条关系，方向必须正确：from 是更基础/更早学的那一个
4. reason 不超过 20 字，必须具体，不能写成「相关」「有联系」这种空话
5. confidence 是 0-1 的小数，没把握就低于 0.6

知识点：
${list}

输出格式（严格 JSON 数组）：
[{"from":1,"to":2,"type":"prerequisite","reason":"没有它就讲不清闭包","confidence":0.9}]`;
}

function parseRelations(text, points) {
    const raw = String(text || '');
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];

    let list;
    try {
        list = JSON.parse(match[0]);
    } catch {
        return [];
    }
    if (!Array.isArray(list)) return [];

    const byIndex = new Map(points.map((point, index) => [index + 1, point]));
    const byId = new Map(points.map((point) => [String(point._id), point]));

    const seen = new Set();
    const relations = [];

    list.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const from = byIndex.get(Number(item.from)) || byId.get(String(item.from));
        const to = byIndex.get(Number(item.to)) || byId.get(String(item.to));
        if (!from || !to) return;
        if (String(from._id) === String(to._id)) return;

        const type = RELATION_TYPES[item.type] ? item.type : null;
        if (!type) return;

        const key = `${from._id}|${to._id}`;
        if (seen.has(key)) return;
        seen.add(key);

        relations.push({
            source: String(from._id),
            target: String(to._id),
            type,
            reason: String(item.reason || '').slice(0, 40),
            confidence: clamp01(item.confidence),
        });
    });

    return relations
        .filter((item) => item.confidence >= MIN_CONFIDENCE)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, MAX_RELATIONS);
}

/**
 * 按前置关系做拓扑排序，输出推荐学习顺序
 * 只保留出现在前置关系里的知识点，孤立点不进路径
 */
function derivePath(points, relations = []) {
    const prereq = relations.filter((item) => item.type === 'prerequisite');
    if (prereq.length === 0) return [];

    const ids = points.map((point) => String(point._id));
    const indegree = new Map(ids.map((id) => [id, 0]));
    const next = new Map(ids.map((id) => [id, []]));

    prereq.forEach((item) => {
        if (!indegree.has(item.source) || !indegree.has(item.target)) return;
        next.get(item.source).push(item.target);
        indegree.set(item.target, indegree.get(item.target) + 1);
    });

    const queue = ids.filter((id) => indegree.get(id) === 0);
    const order = [];
    while (queue.length > 0) {
        const current = queue.shift();
        order.push(current);
        next.get(current).forEach((child) => {
            indegree.set(child, indegree.get(child) - 1);
            if (indegree.get(child) === 0) queue.push(child);
        });
    }
    // 有环时把剩下的按原顺序补进去，保证不丢节点
    ids.forEach((id) => {
        if (!order.includes(id)) order.push(id);
    });

    const byId = new Map(points.map((point) => [String(point._id), point]));
    const levelCache = new Map();
    const levelOf = (id, guard = 0) => {
        if (levelCache.has(id)) return levelCache.get(id);
        if (guard > 24) return 0;
        const parents = prereq.filter((item) => item.target === id).map((item) => item.source);
        const value = parents.length > 0 ? 1 + Math.max(...parents.map((parent) => levelOf(parent, guard + 1))) : 0;
        levelCache.set(id, value);
        return value;
    };

    const inPath = new Set(prereq.flatMap((item) => [item.source, item.target]));
    const steps = order
        .filter((id) => inPath.has(id) && byId.has(id))
        .map((id) => {
            const point = byId.get(id);
            return {
                id,
                title: point.title,
                category: point.category || '未分类',
                mastery: point.mastery || 0,
                stage: levelOf(id) + 1,
            };
        });

    return steps.length >= 2 ? steps : [];
}

function signatureOf(points) {
    return points
        .map((point) => `${point._id}:${point.updatedAt ? new Date(point.updatedAt).getTime() : 0}`)
        .sort()
        .join('|');
}

/** 调模型推理关系（点数过多时只取最近更新的 30 个） */
async function reasonRelations(points) {
    const batch = points.slice(0, MAX_POINTS);
    if (batch.length < 2) return { relations: [], path: [] };

    const { text } = await callLLMText(
        [
            { role: 'system', content: '你是知识结构分析师，只输出合法 JSON 数组，不要任何额外文字。' },
            { role: 'user', content: buildPrompt(batch) },
        ],
        { temperature: 0.2, maxTokens: 2000 }
    );

    const relations = parseRelations(text, batch);
    return { relations, path: derivePath(batch, relations) };
}

function readCache(userId, signature) {
    const hit = cache.get(String(userId));
    if (!hit) return null;
    if (hit.signature !== signature) return null;
    if (Date.now() - hit.at > CACHE_TTL) {
        cache.delete(String(userId));
        return null;
    }
    return { relations: hit.relations, path: hit.path };
}

function writeCache(userId, signature, result) {
    cache.set(String(userId), { signature, at: Date.now(), relations: result.relations, path: result.path });
}

module.exports = {
    RELATION_TYPES,
    buildPrompt,
    parseRelations,
    derivePath,
    signatureOf,
    reasonRelations,
    readCache,
    writeCache,
    MAX_POINTS,
};
