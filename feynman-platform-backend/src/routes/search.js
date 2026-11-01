// routes/search.js
// 语义搜索：向量召回 + 关键词兜底，返回带引用片段与高亮区间的结果
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const KnowledgePoint = require('../models/KnowledgePoint');
const { queryVectorStore } = require('../services/vectorStoreService');

const SNIPPET_PAD = 56;
const MAX_QUERY = 80;
// bge-m3 的 cosine 分布偏窄，低于这个基本是「硬凑进来的噪声」
const MIN_VECTOR_SCORE = 0.45;

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 拆词：
 * - searchTerms 用于数据库召回，只取整句和按标点/空格切出的片段，避免「什么」这类泛词把库搜穿
 * - highlightTerms 额外补上中文二元片段，让片段内部也能加亮
 */
function buildTerms(query) {
    const text = String(query || '').trim();
    if (!text) return { searchTerms: [], highlightTerms: [] };

    const searchTerms = new Set([text]);
    text.split(/[\s,，、;；:：!！?？]+/).forEach((piece) => {
        if (piece.length >= 2) searchTerms.add(piece);
    });

    const highlightTerms = new Set(searchTerms);
    const han = text.replace(/[^\u4e00-\u9fa5]/g, '');
    for (let i = 0; i < han.length - 1; i += 1) {
        highlightTerms.add(han.slice(i, i + 2));
    }

    const sortByLength = (a, b) => b.length - a.length;
    return {
        searchTerms: [...searchTerms].filter((item) => item.length >= 2).sort(sortByLength).slice(0, 6),
        highlightTerms: [...highlightTerms].sort(sortByLength).slice(0, 14),
    };
}

/** 在原文里截一段围绕命中词的上下文，并给出相对片段的加亮区间 */
function makeSnippet(rawText, terms) {
    const text = String(rawText || '').replace(/\s+/g, ' ').trim();
    if (!text) return { snippet: '', ranges: [] };

    const lower = text.toLowerCase();
    let anchor = -1;
    terms.forEach((term) => {
        const at = lower.indexOf(term.toLowerCase());
        if (at >= 0 && (anchor < 0 || at < anchor)) anchor = at;
    });
    if (anchor < 0) anchor = 0;

    const start = Math.max(0, anchor - SNIPPET_PAD);
    const end = Math.min(text.length, anchor + SNIPPET_PAD * 2);
    const prefix = start > 0 ? '…' : '';
    const snippet = `${prefix}${text.slice(start, end)}${end < text.length ? '…' : ''}`;

    const snippetLower = snippet.toLowerCase();
    const rawRanges = [];
    terms.forEach((term) => {
        const needle = term.toLowerCase();
        let from = snippetLower.indexOf(needle);
        while (from >= 0) {
            rawRanges.push([from, from + needle.length]);
            from = snippetLower.indexOf(needle, from + needle.length);
        }
    });

    // 合并重叠区间，避免前端叠着加两层高亮
    rawRanges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const ranges = [];
    rawRanges.forEach(([from, to]) => {
        const last = ranges[ranges.length - 1];
        if (last && from <= last[1]) {
            last[1] = Math.max(last[1], to);
        } else {
            ranges.push([from, to]);
        }
    });

    return { snippet, ranges };
}

/** 向量库里的片段应当真的出自这个知识点，脏数据就回退用正文截取 */
function belongsTo(chunk, content) {
    const text = String(chunk || '').trim();
    const body = String(content || '');
    if (!text || !body) return false;
    return body.includes(text.slice(0, 40));
}

// @route   GET /api/search?q=闭包&limit=8
// @desc    在自己的知识库里做语义检索，返回知识点 + 命中片段 + 高亮位置
router.get('/', auth, async (req, res) => {
    const query = String(req.query.q || '').trim();
    const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 8));

    if (!query) return res.status(400).json({ msg: '请输入要搜索的内容' });
    if (query.length > MAX_QUERY) return res.status(400).json({ msg: '搜索内容太长了，简化一下再试' });

    const startedAt = Date.now();

    try {
        const { searchTerms, highlightTerms } = buildTerms(query);

        // 1. 向量召回：同一知识点可能命中多个块，只保留得分最高的那块作为引用片段
        const vectorDocs = await queryVectorStore(query, limit * 3, req.user.id).catch(() => []);
        const vectorBest = new Map();
        vectorDocs.forEach((doc) => {
            const score = Number(doc.score) || 0;
            // 低分命中不算数：向量库对任何查询都会凑出 top-k
            if (score < MIN_VECTOR_SCORE) return;
            const kpId = String(doc.metadata?.knowledgePointId || '');
            if (!kpId) return;
            const current = vectorBest.get(kpId);
            if (!current || score > current.score) {
                vectorBest.set(kpId, { score, text: doc.pageContent || '' });
            }
        });

        // 2. 关键词召回：按词而不是整句匹配，“索引 查询变慢”才能命中“索引”
        const termRegexes = searchTerms.map((term) => new RegExp(escapeRegex(term), 'i'));
        const keywordKps = termRegexes.length
            ? await KnowledgePoint.find({
                  user: req.user.id,
                  $or: termRegexes.flatMap((regex) => [
                      { title: regex },
                      { content: regex },
                      { category: regex },
                      { tags: regex },
                  ]),
              })
                  .sort({ updatedAt: -1 })
                  .limit(limit * 2)
                  .select('title content category tags mastery status review updatedAt')
                  .lean()
            : [];

        const candidates = new Map();
        keywordKps.forEach((kp) => {
            const id = String(kp._id);
            const titleHit = termRegexes.some((regex) => regex.test(kp.title || ''));
            const tagHit = (kp.tags || []).some((tag) => termRegexes.some((regex) => regex.test(tag)));
            // 标题命中比正文命中更值得排在前面
            const rank = titleHit ? 0.85 : tagHit ? 0.74 : 0.62;
            candidates.set(id, { id, kp, rank, source: 'keyword', text: kp.content || '', keywordRank: rank });
        });

        vectorBest.forEach((hit, id) => {
            const vectorRank = 0.6 + Math.min(1, hit.score) * 0.35;
            const existing = candidates.get(id);
            if (existing) {
                // 不要把 source 改成 vector：关键词命中过的条目，片段用正文更准
                existing.rank = Math.max(existing.rank, vectorRank);
                existing.vectorHit = true;
                return;
            }
            candidates.set(id, { id, kp: null, rank: vectorRank, source: 'vector', text: hit.text, vectorHit: true });
        });

        // 向量召回到的知识点还要补上元信息（标题、掌握度、分类）
        const missingIds = [...candidates.values()].filter((item) => !item.kp).map((item) => item.id);
        if (missingIds.length) {
            const fetched = await KnowledgePoint.find({ _id: { $in: missingIds }, user: req.user.id })
                .select('title content category tags mastery status review updatedAt')
                .lean();
            fetched.forEach((kp) => {
                const item = candidates.get(String(kp._id));
                if (item) {
                    item.kp = kp;
                    if (!item.text) item.text = kp.content || '';
                }
            });
        }

        // 已经有标题/标签级命中时，把「勉强够阈值」的向量结果丢掉，不然前三位全是噪声
        const hasStrongKeyword = [...candidates.values()].some((item) => (item.keywordRank || 0) >= 0.74);
        const pool = [...candidates.values()].filter(
            (item) => !hasStrongKeyword || item.source === 'keyword' || item.rank >= 0.78
        );

        const results = pool
            .filter((item) => item.kp)
            .sort((a, b) => b.rank - a.rank)
            .slice(0, limit)
            .map((item) => {
                // 向量库里可能存着旧版本（甚至别的知识点）的块，对不上就用正文自己截
                const usableChunk = belongsTo(item.text, item.kp.content) ? item.text : item.kp.content;
                const { snippet, ranges } = makeSnippet(usableChunk, highlightTerms);
                const confidence = item.rank >= 0.82 ? 'high' : item.rank >= 0.74 ? 'medium' : 'low';
                return {
                    id: item.id,
                    title: item.kp.title,
                    category: item.kp.category || '未分类',
                    tags: (item.kp.tags || []).slice(0, 3),
                    mastery: Math.round(Number(item.kp.mastery) || 0),
                    status: item.kp.status,
                    dueAt: item.kp.review?.dueAt || null,
                    updatedAt: item.kp.updatedAt,
                    score: Math.round(item.rank * 100),
                    confidence,
                    source: item.source,
                    snippet,
                    ranges,
                };
            });

        const usedVector = results.some((item) => item.source === 'vector');
        res.json({
            query,
            mode: usedVector ? 'hybrid' : 'keyword',
            took: Date.now() - startedAt,
            count: results.length,
            // 一条都没命中时前端要能说“没找到”，而不是硬凑几个不相关的
            weak: results.length === 0,
            results,
        });
    } catch (error) {
        console.error('语义搜索失败:', error.message);
        res.status(500).json({ msg: '搜索失败了，请稍后再试' });
    }
});

module.exports = router;
