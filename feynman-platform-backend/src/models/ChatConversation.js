// models/ChatConversation.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    sources: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

const ChatConversationSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    title: { type: String, default: '新建对话' },
    messages: { type: [MessageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('ChatConversation', ChatConversationSchema);
