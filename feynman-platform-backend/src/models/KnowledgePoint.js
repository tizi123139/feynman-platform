// models/KnowledgePoint.js
const mongoose = require('mongoose');

// 间隔复习调度信息（SM-2）
const ReviewSchema = new mongoose.Schema({
    repetitions: { type: Number, default: 0 },
    intervalDays: { type: Number, default: 0 },
    easeFactor: { type: Number, default: 2.5 },
    dueAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
    lastReviewedAt: { type: Date, default: null },
    lastGrade: { type: Number, default: null },
}, { _id: false });

// 学习行为统计
const StatsSchema = new mongoose.Schema({
    feynmanCount: { type: Number, default: 0 },
    quizCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    lastScore: { type: Number, default: null },
}, { _id: false });

const KnowledgePointSchema = new mongoose.Schema({
    user: { // 关联到用户
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // 引用User模型
        index: true,
    },
    title: {
        type: String,
        required: true
    },
    content: { // 存放Markdown, LaTeX, Mermaid等原始内容
        type: String,
        required: true
    },
    category: {
        type: String,
        default: '未分类',
        trim: true,
    },
    tags: {
        type: [String],
        default: [],
    },
    favorite: {
        type: Boolean,
        default: false,
    },
    summary: { // AI 生成的一句話摘要
        type: String,
        default: '',
    },
    mastery: { // 掌握度 0-100
        type: Number,
        default: 0,
        min: 0,
        max: 100,
    },
    status: { // 学习状态： 'not_started', 'in_progress', 'mastered'
        type: String,
        default: 'not_started'
    },
    reviewList: { // 是否在复习列表中（兼容旧数据）
        type: Boolean,
        default: false
    },
    review: {
        type: ReviewSchema,
        default: () => ({}),
    },
    stats: {
        type: StatsSchema,
        default: () => ({}),
    },
}, { timestamps: true });

KnowledgePointSchema.index({ user: 1, 'review.dueAt': 1 });
KnowledgePointSchema.index({ user: 1, category: 1 });

module.exports = mongoose.model('KnowledgePoint', KnowledgePointSchema);
