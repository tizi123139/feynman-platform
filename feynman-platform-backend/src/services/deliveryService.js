// services/deliveryService.js
// 语音表达体检：不看内容对不对，只看「讲得让人听不听得进去」
// 纯规则计算，不消耗模型额度，毫秒级返回

const PUNCT = /[\s\p{P}\p{S}]/gu;

// 长词优先，避免「就是说」被「就是」重复计数
const FILLERS = [
    '就是说',
    '也就是说',
    '然后就是',
    '这个就是',
    '那个就是',
    '怎么说呢',
    '你知道吧',
    '所以说',
    '嗯',
    '呃',
    '啊',
    '哦',
    '唉',
    '那个',
    '这个',
    '然后',
    '就是',
    '其实',
    '反正',
    '对吧',
    '大概',
    '可能',
].sort((a, b) => b.length - a.length);

// 费曼式讲解的四段结构：是什么 → 为什么 → 举例 → 所以呢
const STRUCTURE = [
    { key: 'define', label: '定义', words: ['是指', '指的是', '定义为', '叫做', '是一种', '是一个', '什么是', '先说'] },
    { key: 'reason', label: '原因', words: ['因为', '由于', '之所以', '原因', '原理', '本质', '底层'] },
    { key: 'example', label: '举例', words: ['比如', '例如', '举个例子', '就像', '假设', '想象'] },
    { key: 'conclusion', label: '结论', words: ['所以', '因此', '总之', '一句话', '简单说', '归根到底'] },
];

// 结构缺段时给一句可照着说的开场白
const MISSING_COPY = {
    定义: '补一句「它是什么」：先用一句话把它定义清楚',
    原因: '补一句「为什么」：它解决了什么问题、原理是什么',
    举例: '补一句「比如」：举一个你自己见过的具体场景',
    结论: '补一句「所以」：用一句话把整段讲解收住',
};

const countChars = (text) => String(text || '').replace(PUNCT, '').length;

function maskFillers(text) {
    let masked = text;
    const hits = [];
    FILLERS.forEach((word) => {
        if (!masked.includes(word)) return;
        const parts = masked.split(word);
        const count = parts.length - 1;
        if (count > 0) {
            hits.push({ word, count });
            // 用等长占位符替换，保证后面的短词不会重复命中同一段
            masked = parts.join('\u0000'.repeat(word.length));
        }
    });
    hits.sort((a, b) => b.count - a.count);
    return { masked, hits };
}

function scorePace(pace) {
    if (pace >= 210 && pace <= 270) return 100;
    if (pace >= 180 && pace < 210) return 90;
    if (pace > 270 && pace <= 320) return 78;
    if (pace >= 140 && pace < 180) return 68;
    if (pace > 320 && pace <= 400) return 56;
    return 42;
}

function paceHint(pace) {
    if (pace > 330) return '明显偏快，听众来不及消化，试着在每个要点后停半秒';
    if (pace > 280) return '稍快，关键句可以放慢一点';
    if (pace >= 200) return '节奏刚好，这个速度听众跟得上';
    if (pace >= 130) return '偏慢，中间的空档可以再压缩';
    return '太慢了，先把提纲理顺再讲会顺很多';
}

function scoreFiller(density, count) {
    // 短句里一次「嗯」不代表表达差，先看绝对次数
    if (count <= 1) return 100;
    if (density <= 1.8) return 86;
    if (density <= 3.2) return 66;
    if (density <= 5) return 48;
    return 30;
}

function fillerHint(density, count, topWord) {
    const sample = topWord ? `「${topWord}」` : '口头禅';
    if (count <= 1) return '几乎没有口头禅，听起来很干净';
    if (density <= 1.8) return `偶尔蹦出${sample}，不影响理解`;
    if (density <= 3.2) return `${sample}出现得有点频繁，试着用停顿代替它`;
    return `${sample}明显打断节奏，建议刻意练习「说完一句就闭麦」`;
}

function scoreSentence(avg) {
    if (avg >= 10 && avg <= 24) return 100;
    if (avg > 24 && avg <= 32) return 78;
    if (avg > 32) return 58;
    if (avg >= 6) return 72;
    return 58;
}

function sentenceHint(avg) {
    if (avg > 32) return '一句话太长，听众抓不住重点，拆成两三句';
    if (avg > 24) return '句子偏长，适当拆句会更利落';
    if (avg >= 10) return '句子长度舒服，信息一层一层递进';
    return '句子偏碎，可以适当合并成完整的因果句';
}

function scoreStructure(covered) {
    return [20, 38, 58, 78, 100][covered] ?? 20;
}

function gradeOf(score) {
    if (score >= 85) return '像在给同学讲题';
    if (score >= 70) return '表达清晰，再收一收';
    if (score >= 55) return '能听懂，但有点费劲';
    return '建议先写提纲再开口';
}

/**
 * @param {{ text?: string, durationSeconds?: number }} input
 * @returns {object|null} 没有文本时返回 null
 */
function analyzeDelivery({ text = '', durationSeconds = 0 } = {}) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const seconds = Math.max(1, Math.round(Number(durationSeconds) || 0));
    const { masked, hits } = maskFillers(raw);
    const fillerCount = hits.reduce((sum, item) => sum + item.count, 0);
    const chars = countChars(masked);
    const totalChars = countChars(raw);
    const minutes = seconds / 60;
    const pace = Math.round(chars / minutes);

    const sentences = raw
        .split(/[\s\p{P}]+/u)
        .map((item) => item.trim())
        .filter((item) => item.length > 1);
    const sentenceCount = Math.max(1, sentences.length);
    const avgSentence = Math.round(chars / sentenceCount);

    const coveredList = STRUCTURE.filter((group) => group.words.some((word) => raw.includes(word)));
    const missing = STRUCTURE.filter((group) => !coveredList.some((item) => item.key === group.key));

    const fillerDensity = chars > 0 ? (fillerCount / chars) * 100 : 0;
    const paceScore = scorePace(pace);
    const fillerScore = scoreFiller(fillerDensity, fillerCount);
    const sentenceScore = scoreSentence(avgSentence);
    const structureScore = scoreStructure(coveredList.length);

    const score = Math.round(paceScore * 0.25 + fillerScore * 0.2 + sentenceScore * 0.2 + structureScore * 0.35);

    const metrics = [
        {
            key: 'pace',
            label: '语速',
            value: `${pace} 字/分`,
            score: paceScore,
            hint: paceHint(pace),
        },
        {
            key: 'filler',
            label: '口头禅',
            value: fillerCount > 0 ? `${fillerCount} 次` : '没有',
            score: fillerScore,
            hint: fillerHint(fillerDensity, fillerCount, hits[0]?.word),
        },
        {
            key: 'sentence',
            label: '句子长度',
            value: `平均 ${avgSentence} 字`,
            score: sentenceScore,
            hint: sentenceHint(avgSentence),
        },
        {
            key: 'structure',
            label: '讲解结构',
            value: `${coveredList.length}/4 段`,
            score: structureScore,
            hint:
                missing.length === 0
                    ? '定义、原因、举例、结论都有了，结构完整'
                    : `还差「${missing.map((item) => item.label).join('、')}」，补上会更像在讲课`,
        },
    ].map((item) => ({ ...item, level: item.score >= 80 ? 'good' : item.score >= 60 ? 'ok' : 'warn' }));

    const tips = [];
    const weakest = [...metrics].sort((a, b) => a.score - b.score).slice(0, 2);
    weakest.forEach((item) => {
        if (item.score < 85) tips.push(item.hint);
    });
    if (missing.length > 0 && tips.length < 3) {
        tips.push(MISSING_COPY[missing[0].label]);
    }
    if (tips.length === 0) tips.push('这段表达已经很耐听了，换一段更难的讲解再练。');

    return {
        score,
        grade: gradeOf(score),
        words: totalChars,
        seconds,
        pace,
        metrics,
        fillers: hits.slice(0, 6),
        structure: {
            covered: coveredList.map((item) => item.label),
            missing: missing.map((item) => item.label),
        },
        tips,
    };
}

module.exports = { analyzeDelivery, FILLERS, STRUCTURE };
