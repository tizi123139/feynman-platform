// routes/audio.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
// 引入百度AI的控制器（我们稍后创建）
const { transcribeAudio } = require('../controllers/baiduAiController');

// 配置multer
// 我们这里使用内存存储，因为只是临时中转给百度AI，不需要存到服务器硬盘
const upload = multer({ storage: multer.memoryStorage() });

// @route   POST /api/audio/transcribe
// @desc    上传音频并进行语音识别
// @access  Private
router.post(
    '/transcribe',
    auth,
    upload.single('audio'), // 'audio' 必须和前端 FormData.append 的字段名一致
    transcribeAudio // 将主要逻辑放到Controller中
);

module.exports = router;