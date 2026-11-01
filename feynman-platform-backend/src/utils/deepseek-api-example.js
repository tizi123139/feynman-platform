const axios = require('axios');

const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

async function evaluateWithDeepSeek(originalContent, transcribedText) {
    try {
        const url = `${DEEPSEEK_API_BASE_URL}/chat/completions`;
        
        const prompt = `
你是一个严格而友善的计算机科学学习教练。你的任务是评估学生对一个知识点的复述，并给出反馈。

【原始知识点】:
\`\`\`
${originalContent}
\`\`\`

【学生的口头复述文本】:
\`\`\`
${transcribedText}
\`\`\`

请你完成以下四项任务:
1.  **文本润色**: 将学生的复述文本润色成一段通顺、专业、书面化的文字。
2.  **综合评价**: 基于原始知识点，对学生的复述进行评价。指出其优点和可以改进的地方。
3.  **五维评分**: 分别给准确性（有没有讲错）、完整性（关键要素是否覆盖）、逻辑结构（讲述顺序）、表达流畅（听的人能否跟上）、深度延伸（有没有讲到原理与边界）打分，每项 0-100 的整数。五维要能看出差异，不要全部给同一个分数。
4.  **追问**: 针对最薄弱的一维，提出一个学生需要展开两句以上才能答好的追问。

请严格按照以下JSON格式返回你的结果，不要包含任何额外的解释或文字。
{
  "polishedText": "这里是润色后的文本",
  "evaluation": "这里是你的综合评价",
  "strengths": ["优点1", "优点2"],
  "weaknesses": ["可以改进的地方1", "可以改进的地方2"],
  "dimensions": {
    "accuracy": 82,
    "completeness": 70,
    "logic": 76,
    "fluency": 88,
    "depth": 65
  },
  "followUp": {
    "question": "针对薄弱点的追问",
    "focus": "这次追问想检验什么，10字以内"
  },
  "score": 85
}
`;
        
        const response = await axios.post(url, {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 1500
        }, {
            headers: {
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                'Content-Type': 'application/json'
            },
            timeout: 60000
        });
        
        const content = response.data.choices[0].message.content;
        // 尝试提取JSON
        const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
        const result = JSON.parse(jsonString);
        result.provider = 'DeepSeek';
        return result;
    } catch (error) {
        console.error('DeepSeek API调用失败:', error.message);
        throw error;
    }
}

module.exports = { evaluateWithDeepSeek };