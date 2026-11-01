// openrouter-api-example.js
const axios = require('axios');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

async function evaluateWithOpenRouter(originalText, knowledgePoint, model = 'deepseek/deepseek-chat') {
    try {
        // 检查API密钥
        if (!OPENROUTER_API_KEY) {
            throw new Error('OpenRouter API密钥未配置');
        }

        // 构建评估提示词（与硅基流动相同）
        const prompt = `
你是一个教育评估专家，请根据费曼学习法的原则，评估以下讲解内容。

知识点：${knowledgePoint}

讲解内容：${originalText}

请从以下几个方面进行评估（每项评分1-10分）：
1. 准确性：讲解内容是否准确无误
2. 清晰度：表达是否清晰易懂
3. 完整性：是否涵盖了知识点的关键内容
4. 简洁性：是否用简单的语言解释复杂概念

请提供以下格式的JSON响应：
{
  "accuracy": 数字评分,
  "clarity": 数字评分,
  "completeness": 数字评分,
  "conciseness": 数字评分,
  "overallScore": 总体评分(1-10),
  "suggestions": "具体的改进建议",
  "optimizedText": "优化后的讲解文本"
}
`;

        // 调用OpenRouter API
        const response = await axios.post(
            `${OPENROUTER_BASE_URL}/chat/completions`,
            {
                model: model,
                messages: [
                    {
                        role: 'system',
                        content: '你是一个专业的教育评估专家，擅长评估和优化教学内容。'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 1500
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/feynman-platform', // 可选，用于统计
                    'X-Title': 'Feynman Platform' // 可选，用于统计
                },
                timeout: 60000 // 60秒超时
            }
        );

        // 解析响应
        const content = response.data.choices[0].message.content;
        
        // 尝试解析JSON响应
        let evaluationResult;
        try {
            // 提取JSON部分（可能包含在代码块中）
            const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[1] || jsonMatch[0] : content;
            evaluationResult = JSON.parse(jsonString);
        } catch (parseError) {
            console.error('解析OpenRouter API响应失败:', parseError);
            // 如果解析失败，返回一个基本评估结果
            evaluationResult = {
                accuracy: 5,
                clarity: 5,
                completeness: 5,
                conciseness: 5,
                overallScore: 5,
                suggestions: '无法解析API响应，请检查API配置或稍后重试。',
                optimizedText: originalText,
                provider: 'OpenRouter',
                model: model,
                rawResponse: content
            };
        }

        // 添加提供者信息
        evaluationResult.provider = 'OpenRouter';
        evaluationResult.model = model;

        return evaluationResult;
    } catch (error) {
        console.error('OpenRouter API调用失败:', error);
        
        // 返回错误信息
        return {
            error: true,
            message: error.message || 'OpenRouter API调用失败',
            provider: 'OpenRouter',
            model: model
        };
    }
}

module.exports = { evaluateWithOpenRouter };