// scripts/reindex-vectors.js
// 用途：把 MongoDB 里已有的知识点重新写入本地向量库
// 触发场景：首次启用向量检索、切换 embedding 模型、向量库文件损坏或被删除
// 运行：node scripts/reindex-vectors.js
require('dotenv').config();
const mongoose = require('mongoose');
const KnowledgePoint = require('../src/models/KnowledgePoint');
const { addKnowledgePointToStore, getVectorStoreStats } = require('../src/services/vectorStoreService');

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB connected successfully!');

        const points = await KnowledgePoint.find({}).select('_id title content user').lean();
        console.log(`共 ${points.length} 条知识点待向量化`);

        for (const [i, kp] of points.entries()) {
            console.log(`[${i + 1}/${points.length}] ${kp.title}`);
            await addKnowledgePointToStore(kp);
        }

        const stats = await getVectorStoreStats();
        if (stats) {
            console.log(`向量库条目数：${stats.items ?? stats.count ?? JSON.stringify(stats)}`);
        }
        console.log('向量库重建完成');
    } catch (error) {
        console.error('重建向量库失败:', error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
})();
