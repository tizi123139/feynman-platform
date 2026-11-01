// services/vectorStoreService.js
const path = require('path');
const axios = require('axios');
const { LocalIndex } = require('vectra');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');
const KnowledgePoint = require('../models/KnowledgePoint');

// 本地文件向量库（vectra），数据持久化到 backend/vector_data
const VECTOR_DIR = path.join(__dirname, '../../vector_data');
const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL || 'https://api.siliconflow.cn/v1/embeddings';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'BAAI/bge-m3';

// 文本分割器
const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
});

// 缓存索引实例，避免每次请求都重新读盘
let indexPromise = null;

async function getIndex() {
    if (!indexPromise) {
        indexPromise = (async () => {
            const index = new LocalIndex(VECTOR_DIR);
            if (!(await index.isIndexCreated())) {
                await index.createIndex({
                    version: 1,
                    metadata_config: { indexed: ['knowledgePointId', 'userId'] },
                });
                console.log(`已创建本地向量索引: ${VECTOR_DIR}`);
            }
            return index;
        })().catch((err) => {
            indexPromise = null;
            throw err;
        });
    }
    return indexPromise;
}

// vectra 每次写操作都会重写索引文件，这里串行化，避免并发录入互相踩踏
let writeChain = Promise.resolve();
function withWriteLock(task) {
    const run = writeChain.then(task, task);
    writeChain = run.then(() => undefined, () => undefined);
    return run;
}

// 调用 SiliconFlow Embedding API（OpenAI 兼容格式）
async function getEmbeddings(texts) {
    const apiKey = process.env.SILICONFLOW_API_KEY;
    if (!apiKey) throw new Error('未配置 SILICONFLOW_API_KEY，无法生成向量');

    try {
        const { data } = await axios.post(
            EMBEDDING_API_URL,
            { model: EMBEDDING_MODEL, input: texts, encoding_format: 'float' },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );

        const list = Array.isArray(data?.data) ? data.data : [];
        if (list.length !== texts.length) {
            throw new Error(`Embedding 返回条数不匹配（期望 ${texts.length}，实际 ${list.length}）`);
        }
        return list.map(item => item.embedding);
    } catch (error) {
        const status = error.response?.status;
        if (status === 401) throw new Error('SiliconFlow 鉴权失败（401），请检查 SILICONFLOW_API_KEY');
        if (status === 403) throw new Error('SiliconFlow 无权限（403），请确认模型已开通');
        if (status) throw new Error(`SiliconFlow 调用失败（${status}）: ${error.response?.data?.message || ''}`);
        throw error;
    }
}

function toDoc(result) {
    const metadata = result.item.metadata || {};
    const { text, ...rest } = metadata;
    return {
        pageContent: typeof text === 'string' ? text : '',
        metadata: rest,
        score: result.score,
    };
}

/**
 * 将单个知识点的内容添加到向量库
 * @param {object} knowledgePoint - 包含 _id、title、content、user 的知识点对象
 */
exports.addKnowledgePointToStore = async (knowledgePoint) => {
    const kpId = String(knowledgePoint?._id || '').trim();
    if (!kpId) return;

    try {
        const content = String(knowledgePoint.content || '').trim();
        if (!content) {
            console.warn(`知识点 ${kpId} 内容为空，跳过向量化`);
            return;
        }

        console.log(`正在为知识点 ${kpId} 创建向量...`);
        const userId = knowledgePoint.user ? String(knowledgePoint.user) : '';
        const docs = await textSplitter.createDocuments([content], [{ knowledgePointId: kpId, userId }]);
        console.log(`知识点被分割成 ${docs.length} 个文本块。`);

        const texts = docs.map(d => d.pageContent);
        const embeddings = await getEmbeddings(texts);

        const items = docs.map((d, i) => ({
            id: `${kpId}_${i}`,
            vector: embeddings[i],
            metadata: {
                knowledgePointId: kpId,
                userId,
                title: String(knowledgePoint.title || ''),
                chunkIndex: i,
                text: d.pageContent,
            },
        }));

        await withWriteLock(async () => {
            const index = await getIndex();
            // 先清掉该知识点的旧块，保证重复录入 / 编辑后不会残留过期向量
            const stale = await index.listItemsByMetadata({ knowledgePointId: kpId });
            if (stale.length > 0) await index.deleteItems(stale.map(item => item.id));
            await index.batchInsertItems(items);
        });

        console.log(`知识点 ${kpId} 的 ${items.length} 个向量块已写入本地向量库。`);
    } catch (error) {
        console.error(`添加到向量库失败（知识点 ${kpId}）:`, error.message);
    }
};

/**
 * 从向量库中删除指定知识点的所有向量块
 * @param {string} knowledgePointId - 知识点的 _id
 */
exports.removeKnowledgePointFromStore = async (knowledgePointId) => {
    const kpId = String(knowledgePointId || '').trim();
    if (!kpId) return;

    try {
        await withWriteLock(async () => {
            const index = await getIndex();
            const matched = await index.listItemsByMetadata({ knowledgePointId: kpId });
            if (matched.length === 0) return;
            await index.deleteItems(matched.map(item => item.id));
            console.log(`已从向量库删除知识点 ${kpId} 的 ${matched.length} 个向量块。`);
        });
    } catch (error) {
        console.error('从向量库删除失败:', error.message);
    }
};

/**
 * 根据查询文本检索相关知识点（不限用户）
 * @param {string} query - 查询文本
 * @param {number} k - 返回结果数量
 */
exports.similaritySearch = async (query, k = 3) => {
    try {
        const index = await getIndex();
        const [embedding] = await getEmbeddings([query]);
        const results = await index.queryItems(embedding, String(query), k);
        return results.map(toDoc);
    } catch (error) {
        console.error('向量检索失败:', error.message);
        return [];
    }
};

/**
 * 从向量库中检索与问题相关的文档（限定用户，避免跨用户泄露）
 * @param {string} query - 用户的问题
 * @param {number} k - 返回结果数量
 * @param {string|null} userId - 用户 ID，传入后只返回该用户的知识点片段
 * @returns {Promise<Array>} - 相关文档片段数组
 */
exports.queryVectorStore = async (query, k = 4, userId = null) => {
    try {
        const index = await getIndex();
        const [embedding] = await getEmbeddings([query]);
        const filter = userId ? { userId: String(userId) } : undefined;

        const results = await index.queryItems(embedding, String(query), k, filter);
        const docs = results.map(toDoc);

        console.log(`为问题 "${query}" 检索到 ${docs.length} 个相关文档。`);
        return docs;
    } catch (error) {
        console.error('从向量库检索失败:', error.message);
        return [];
    }
};

/**
 * 统计当前向量库中的条目数，便于排查
 */
exports.getVectorStoreStats = async () => {
    try {
        const index = await getIndex();
        return await index.getIndexStats();
    } catch (error) {
        console.error('读取向量库状态失败:', error.message);
        return null;
    }
};
