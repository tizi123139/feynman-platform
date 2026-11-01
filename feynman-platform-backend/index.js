// index.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;
const { serve, setup } = require('./src/utils/swagger');
const { createResponse } = require('./src/utils/responseHelper');

// 中间件
app.use(cors());
app.use(express.json());
app.use('/api-docs', serve, setup);

// 路由
app.use('/api/users', require('./src/routes/users'));
app.use('/api/knowledge-points', require('./src/routes/knowledgePoints')); // 新增
app.use('/api/ai', require('./src/routes/ai'));
app.use('/api/audio', require('./src/routes/audio'));
app.use('/api/graph', require('./src/routes/graph'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/chat', require('./src/routes/chat'));
app.use('/api/achievements', require('./src/routes/achievements'));
app.use('/api/flashcards', require('./src/routes/flashcards'));
app.use('/api/quiz-attempts', require('./src/routes/quizAttempts'));
app.use('/api/search', require('./src/routes/search'));

// 数据库连接
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully!'))
  .catch(err => console.error('MongoDB connection error:', err));

// 404 兜底：没有匹配到任何路由时返回统一格式响应
// 必须在 errorHandler 之前注册
app.use((req, res) => {
  res.status(404).json(createResponse(false, null, `请求的接口不存在: ${req.method} ${req.path}`));
});

// 全局错误处理中间件（必须最后注册）
app.use(require('./src/middleware/errorHandler'));

app.listen(port, () => {
  console.log(`Feynman Platform backend is running at http://localhost:${port}`);
});