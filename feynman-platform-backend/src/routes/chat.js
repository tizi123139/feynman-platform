// routes/chat.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ChatConversation = require('../models/ChatConversation');
const { answerWithRAG, answerWithRAGStream } = require('../services/ragService');
const { logStudy } = require('../services/studyLogService');

// @route   GET /api/chat/conversations
router.get('/conversations', auth, async (req, res) => {
    try {
        const conversations = await ChatConversation.find({ user: req.user.id })
            .sort({ lastMessageAt: -1 })
            .select('title lastMessageAt createdAt messages')
            .lean();

        res.json(conversations.map((conv) => {
            const last = conv.messages[conv.messages.length - 1];
            return {
                id: conv._id,
                title: conv.title,
                lastMessageAt: conv.lastMessageAt,
                messageCount: conv.messages.length,
                preview: last ? last.content.slice(0, 60) : '',
            };
        }));
    } catch (err) {
        console.error('获取会话列表失败:', err.message);
        res.status(500).json({ msg: '获取会话列表失败' });
    }
});

// @route   POST /api/chat/conversations
router.post('/conversations', auth, async (req, res) => {
    try {
        const conv = await ChatConversation.create({
            user: req.user.id,
            title: req.body.title || '新建对话',
            messages: [],
        });
        res.status(201).json(conv);
    } catch (err) {
        console.error('创建会话失败:', err.message);
        res.status(500).json({ msg: '创建会话失败' });
    }
});

// @route   GET /api/chat/conversations/:id
router.get('/conversations/:id', auth, async (req, res) => {
    try {
        const conv = await ChatConversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ msg: '会话不存在' });
        if (conv.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权访问该会话' });
        res.json(conv);
    } catch (err) {
        console.error('获取会话失败:', err.message);
        res.status(500).json({ msg: '获取会话失败' });
    }
});

// @route   PUT /api/chat/conversations/:id
router.put('/conversations/:id', auth, async (req, res) => {
    try {
        const conv = await ChatConversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ msg: '会话不存在' });
        if (conv.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权修改该会话' });

        if (req.body.title !== undefined) {
            conv.title = String(req.body.title).trim().slice(0, 40) || '未命名对话';
        }
        await conv.save();
        res.json(conv);
    } catch (err) {
        console.error('重命名会话失败:', err.message);
        res.status(500).json({ msg: '重命名会话失败' });
    }
});

// @route   DELETE /api/chat/conversations/:id
router.delete('/conversations/:id', auth, async (req, res) => {
    try {
        const conv = await ChatConversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ msg: '会话不存在' });
        if (conv.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权删除该会话' });

        await ChatConversation.findByIdAndDelete(req.params.id);
        res.json({ msg: '会话已删除' });
    } catch (err) {
        console.error('删除会话失败:', err.message);
        res.status(500).json({ msg: '删除会话失败' });
    }
});

// @route   POST /api/chat/conversations/:id/messages
router.post('/conversations/:id/messages', auth, async (req, res) => {
    try {
        const content = String(req.body.content || '').trim();
        if (!content) return res.status(400).json({ msg: '消息内容不能为空' });

        const conv = await ChatConversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ msg: '会话不存在' });
        if (conv.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权操作该会话' });

        conv.messages.push({ role: 'user', content });
        if (conv.title === '新建对话' || conv.messages.length === 1) {
            conv.title = content.slice(0, 24);
        }
        conv.lastMessageAt = new Date();
        await conv.save();

        let reply = '';
        let sources = [];
        let provider = 'local';
        try {
            const result = await answerWithRAG({ question: content, userId: req.user.id });
            reply = result.answer;
            sources = result.sources || [];
            provider = result.provider;
        } catch (error) {
            console.error('RAG 回答失败:', error.message);
            reply = '抱歉，AI 伙伴暂时打了个盹，请稍后再试一次。';
        }

        conv.messages.push({
            role: 'assistant',
            content: reply,
            sources: sources.map((item) => item.title),
        });
        conv.lastMessageAt = new Date();
        await conv.save();

        let reward = null;
        try {
            reward = await logStudy({ userId: req.user.id, type: 'chat', minutes: 2 });
        } catch (error) {
            console.error('记录聊天学习日志失败:', error.message);
        }

        res.json({
            conversationId: conv._id,
            title: conv.title,
            reply,
            sources,
            provider,
            reward,
        });
    } catch (err) {
        console.error('发送消息失败:', err.message);
        res.status(500).json({ msg: '发送消息失败' });
    }
});

// @route   POST /api/chat/conversations/:id/retry
// @desc    重新生成最后一条回答（不重复追加用户消息）
router.post('/conversations/:id/retry', auth, async (req, res) => {
    try {
        const conv = await ChatConversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ msg: '会话不存在' });
        if (conv.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权操作该会话' });

        const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
        if (!lastUser) return res.status(400).json({ msg: '还没有可以重新生成的问题' });

        while (conv.messages.length && conv.messages[conv.messages.length - 1].role === 'assistant') {
            conv.messages.pop();
        }

        let reply = '';
        let sources = [];
        let provider = 'local';
        try {
            const result = await answerWithRAG({ question: lastUser.content, userId: req.user.id });
            reply = result.answer;
            sources = result.sources || [];
            provider = result.provider;
        } catch (error) {
            console.error('RAG 重答失败:', error.message);
            reply = '抱歉，AI 伙伴刚刚走神了，再试一次好吗？';
        }

        conv.messages.push({
            role: 'assistant',
            content: reply,
            sources: sources.map((item) => item.title),
        });
        conv.lastMessageAt = new Date();
        await conv.save();

        res.json({ conversationId: conv._id, title: conv.title, reply, sources, provider });
    } catch (err) {
        console.error('重新生成失败:', err.message);
        res.status(500).json({ msg: '重新生成失败' });
    }
});

// 流式回答的公共实现：边生成边推送 SSE，结束后落库并结算学习时长
async function streamAnswer({ req, res, conv, question }) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    // 监听 res 而不是 req：req 的 close 在请求体读完时就会触发，会导致后续内容被全部跳过
    let clientClosed = false;
    res.on('close', () => {
        clientClosed = true;
    });

    const send = (payload) => {
        if (clientClosed || res.writableEnded) return;
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    let reply = '';
    let sources = [];
    let provider = 'local';

    try {
        const result = await answerWithRAGStream({ question, userId: req.user.id }, (delta) => {
            reply += delta;
            send({ type: 'delta', text: delta });
        });
        reply = result.answer;
        sources = result.sources || [];
        provider = result.provider;
    } catch (error) {
        console.error('流式回答失败:', error.message);
        if (!reply) reply = '抱歉，AI 伙伴暂时打了个盹，请稍后再试一次。';
        send({ type: 'error', msg: error.message, text: reply });
    }

    try {
        conv.messages.push({
            role: 'assistant',
            content: reply,
            sources: sources.map((item) => item.title),
        });
        conv.lastMessageAt = new Date();
        await conv.save();
    } catch (error) {
        console.error('保存流式回答失败:', error.message);
    }

    let reward = null;
    try {
        reward = await logStudy({ userId: req.user.id, type: 'chat', minutes: 2 });
    } catch (error) {
        console.error('记录聊天学习日志失败:', error.message);
    }

    send({ type: 'done', text: reply, title: conv.title, sources, provider, reward });
    if (!res.writableEnded) res.end();
}

// @route   POST /api/chat/conversations/:id/messages/stream
// @desc    发送消息并以 SSE 流式返回回答
router.post('/conversations/:id/messages/stream', auth, async (req, res) => {
    const content = String(req.body.content || '').trim();
    if (!content) return res.status(400).json({ msg: '消息内容不能为空' });

    let conv;
    try {
        conv = await ChatConversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ msg: '会话不存在' });
        if (conv.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权操作该会话' });

        conv.messages.push({ role: 'user', content });
        if (conv.title === '新建对话' || conv.messages.length === 1) {
            conv.title = content.slice(0, 24);
        }
        conv.lastMessageAt = new Date();
        await conv.save();
    } catch (err) {
        console.error('发送消息失败:', err.message);
        return res.status(500).json({ msg: '发送消息失败' });
    }

    await streamAnswer({ req, res, conv, question: content });
});

// @route   POST /api/chat/conversations/:id/retry/stream
// @desc    重新生成最后一条回答，流式返回
router.post('/conversations/:id/retry/stream', auth, async (req, res) => {
    let conv;
    try {
        conv = await ChatConversation.findById(req.params.id);
        if (!conv) return res.status(404).json({ msg: '会话不存在' });
        if (conv.user.toString() !== req.user.id) return res.status(401).json({ msg: '无权操作该会话' });

        const lastUser = [...conv.messages].reverse().find((m) => m.role === 'user');
        if (!lastUser) return res.status(400).json({ msg: '还没有可以重新生成的问题' });

        while (conv.messages.length && conv.messages[conv.messages.length - 1].role === 'assistant') {
            conv.messages.pop();
        }
        await conv.save();

        await streamAnswer({ req, res, conv, question: lastUser.content });
    } catch (err) {
        console.error('流式重答失败:', err.message);
        if (!res.headersSent) res.status(500).json({ msg: '重新生成失败' });
        else if (!res.writableEnded) res.end();
    }
});

module.exports = router;
