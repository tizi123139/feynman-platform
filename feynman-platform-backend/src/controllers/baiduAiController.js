// controllers/baiduAiController.js
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const os = require('os');
ffmpeg.setFfmpegPath(ffmpegPath);

// 从环境变量中获取凭证
const APP_ID = process.env.BAIDU_APP_ID;
const API_KEY = process.env.BAIDU_API_KEY;
const SECRET_KEY = process.env.BAIDU_SECRET_KEY;
const axios = require('axios');
const { callLLMText } = require('../services/aiService');
const { answerWithRAG: runRagAnswer } = require('../services/ragService');

// 百度 ASR Access Token 缓存
let asrToken = null;
let asrTokenExpiry = 0;

async function getAsrToken() {
    if (asrToken && Date.now() < asrTokenExpiry) return asrToken;
    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${API_KEY}&client_secret=${SECRET_KEY}`;
    const response = await axios.post(url, null, { timeout: 10000 });
    asrToken = response.data.access_token;
    asrTokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000; // 提前5分钟过期
    console.log('百度 ASR Token 获取成功');
    return asrToken;
}

exports.transcribeAudio = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ msg: 'No audio file uploaded.' });
    }

    // req.file.buffer 包含了音频文件的二进制数据
    const audioBuffer = req.file.buffer;

    try {
        // 判断是否需要转码（webm/ogg 需要转为 pcm）
        const mime = req.file.mimetype;

        console.log(`收到音频: MIME=${mime}, 原始大小=${audioBuffer.length} bytes`);

        // 统一用 ffmpeg 转为百度 ASR 要求的标准格式：16kHz 单声道 16bit PCM
        // 使用临时文件方式，避免 Buffer 输入不稳定
        const tmpDir = os.tmpdir();
        const ext = mime.includes('wav') ? '.wav' : mime.includes('webm') ? '.webm' : mime.includes('ogg') ? '.ogg' : '.bin';
        const inputFile = path.join(tmpDir, `asr_input_${Date.now()}${ext}`);
        const outputFile = path.join(tmpDir, `asr_output_${Date.now()}.raw`);

        // 写入临时文件
        fs.writeFileSync(inputFile, audioBuffer);

        await new Promise((resolve, reject) => {
            ffmpeg(inputFile)
                .audioFrequency(16000)
                .audioChannels(1)
                .audioCodec('pcm_s16le')
                .format('s16le')
                .output(outputFile)
                .on('end', () => resolve())
                .on('error', (err) => reject(err))
                .run();
        });

        let pcmBuffer = fs.readFileSync(outputFile);
        console.log(`转码完成: PCM 大小=${pcmBuffer.length} bytes, 时长约 ${(pcmBuffer.length / 2 / 16000).toFixed(1)} 秒`);

        // 清理临时文件
        try { fs.unlinkSync(inputFile); fs.unlinkSync(outputFile); } catch (e) { /* ignore */ }

        // 百度 ASR 限制音频不超过 60 秒
        const maxBytes = 60 * 16000 * 2; // 60秒 * 16kHz * 2bytes
        if (pcmBuffer.length > maxBytes) {
            pcmBuffer = pcmBuffer.slice(0, maxBytes);
            console.log('音频超过60秒，已截断');
        }

        const token = await getAsrToken();
        const result = await axios.post(
            `https://vop.baidu.com/server_api`,
            {
                format: 'pcm',
                rate: 16000,
                channel: 1,
                cuid: 'feynman-platform',
                token: token,
                dev_pid: 1537,
                len: pcmBuffer.length,
                speech: pcmBuffer.toString('base64'),
            },
            { timeout: 15000, headers: { 'Content-Type': 'application/json' } }
        );

        const asrData = result.data;
        console.log('Baidu ASR Result:', JSON.stringify(asrData));

        // 检查返回结果
        if (asrData.err_no === 0 && asrData.result && asrData.result[0]) {
            res.json({ result: asrData.result[0].trim() });
        } else {
            res.status(500).json({ msg: 'Baidu ASR service error or empty result', error: asrData });
        }

    } catch (error) {
        console.error('Error calling Baidu ASR API:', error);
        res.status(500).send('Server error during transcription.');
    }
};

// AI润色与评价的核心函数已迁移到 utils/qianfan-api-example.js

exports.generateQuestion = async (req, res) => {
    const { knowledgePointContent, difficulty, type = 'single-choice' } = req.body;

    if (!knowledgePointContent || !difficulty) {
        return res.status(400).json({ msg: 'Knowledge point content and difficulty are required.' });
    }

    try {
        let prompt;

        if (type === 'short-answer') {
            prompt = `
        你是一个专业的计算机科学出题专家。请根据以下提供的知识点内容和指定的难度，生成一个相关的简答题。

        【知识点内容】:
        """
        ${knowledgePointContent}
        """

        【指定难度】: ${difficulty}

        请严格按照以下JSON格式返回题目，不要包含任何额外的解释或文字，确保所有字段都存在。
        {
          "type": "short-answer",
          "difficulty": "${difficulty}",
          "question": "这里是简答题的题干",
          "answer_key_points": [
            "要点1",
            "要点2",
            "要点3"
          ]
        }
        `;
        } else {
            prompt = `
        你是一个专业的计算机科学出题专家。请根据以下提供的知识点内容和指定的难度，生成一个相关的单项选择题。

        【知识点内容】:
        """
        ${knowledgePointContent}
        """

        【指定难度】: ${difficulty}

        请严格按照以下JSON格式返回题目，不要包含任何额外的解释或文字，确保所有字段都存在。
        {
          "type": "single-choice",
          "difficulty": "${difficulty}",
          "question": "这里是题干",
          "options": {
            "A": "选项A的内容",
            "B": "选项B的内容",
            "C": "选项C的内容",
            "D": "选项D的内容"
          },
          "answer": "C",
          "explanation": "这里是对正确答案的简短解释"
        }
        `;
        }
        
        const { text: llmText, provider } = await callLLMText(
            [
                { role: 'system', content: '你是专业的计算机科学出题专家，只输出合法 JSON。' },
                { role: 'user', content: prompt },
            ],
            { temperature: 0.5, maxTokens: 1500 }
        );

        try {
            const jsonMatch = llmText.match(/```json\s*([\s\S]*?)\s*```/) || llmText.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : llmText;
            const questionData = JSON.parse(jsonString);
            res.json({ ...questionData, provider });
        } catch (parseError) {
            console.error("LLM did not return valid JSON:", llmText);
            res.status(500).json({ msg: "AI返回格式错误，请稍后重试" });
        }

    } catch (error) {
        console.error('Error calling LLM API for question generation:', error.response ? error.response.data : error.message);
        res.status(500).send('Server error during question generation.');
    }
};

// AI简答题评分
exports.gradeAnswer = async (req, res) => {
    const { question } = req.body;
    const answerKeyPoints = req.body.answerKeyPoints ?? req.body.correctAnswer ?? req.body.answer;
    const studentAnswer = req.body.studentAnswer ?? req.body.userAnswer;

    if (!question || !answerKeyPoints || !studentAnswer) {
        return res.status(400).json({ msg: '缺少题目、参考答案或学生答案' });
    }

    try {
        const keyPointsText = Array.isArray(answerKeyPoints)
            ? answerKeyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')
            : String(answerKeyPoints);

        const prompt = `
        你是一个客观的计算机科学阅卷老师。请根据以下题目、答案要点和学生的回答，判断学生的回答是否正确，并给出解释。

        【题目】:
        ${question}

        【答案要点】:
        ${keyPointsText}

        【学生的回答】:
        ${studentAnswer}

        请严格按照以下JSON格式返回你的评判结果，不要包含任何额外的解释或文字。
        {
          "isCorrect": true,
          "explanation": "这里是你的评判理由"
        }
        `;

        const { text: llmText } = await callLLMText(
            [
                { role: 'system', content: '你是客观的计算机科学阅卷老师，只输出合法 JSON。' },
                { role: 'user', content: prompt },
            ],
            { temperature: 0.2, maxTokens: 800 }
        );

        try {
            const jsonMatch = llmText.match(/```json\s*([\s\S]*?)\s*```/) || llmText.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : llmText;
            const gradeResult = JSON.parse(jsonString);
            res.json(gradeResult);
        } catch (parseError) {
            console.error("LLM did not return valid JSON:", llmText);
            res.status(500).json({ msg: "AI返回格式错误，请稍后重试" });
        }

    } catch (error) {
        console.error('Error calling LLM API for grading:', error.response ? error.response.data : error.message);
        res.status(500).json({ msg: 'AI 评分服务暂时不可用' });
    }
};

exports.answerWithRAG = async (req, res) => {
    const { question } = req.body;
    if (!question) {
        return res.status(400).json({ msg: '问题不能为空' });
    }

    try {
        const result = await runRagAnswer({ question, userId: req.user.id });
        res.json(result);
    } catch (error) {
        console.error('RAG execution error:', error);
        res.status(500).json({ msg: 'AI 问答服务暂时不可用' });
    }
};