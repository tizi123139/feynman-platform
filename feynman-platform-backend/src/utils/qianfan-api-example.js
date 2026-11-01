// qianfan-api-example.js
const axios = require('axios');

// 使用 Bearer Token 调用千帆 ModelBuilder API
async function callQianfanLLM(messages, model = 'ernie-5.1') {
    const response = await axios.post(
        'https://qianfan.baidubce.com/v2/chat/completions',
        {
            model,
            messages,
            temperature: 0.3,
            max_tokens: 1500,
            // ERNIE 5.1 默认开启深度思考，复述评价不需要思维链，关闭以降低耗时和 token 消耗
            thinking: { type: 'disabled' },
        },
        {
            headers: {
                'Authorization': `Bearer ${process.env.QIANFAN_API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
        }
    );
    return response.data;
}

async function evaluateWithQianfan(originalContent, transcribedText) {
    try {
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
    1.  **文本润色**: 将学生的复述文本润色成一段通顺、专业、书面化的文字。修正明显的语法错误和口语化表达，但保持其核心观点不变。
    2.  **综合评价**: 基于原始知识点，对学生的复述进行评价。指出其优点和可以改进的地方。
    3.  **五维评分**: 分别给准确性、完整性、逻辑结构、表达流畅、深度延伸打分，每项 0-100 的整数，并且要能看出差异，不要全部给同一个分数。
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

        const data = await callQianfanLLM([{ role: 'user', content: prompt }]);

        const llmText = data.choices?.[0]?.message?.content;
        if (!llmText) throw new Error('Qianfan API returned no result: ' + JSON.stringify(data));

        const jsonMatch = llmText.match(/```json\s*([\s\S]*?)\s*```/) || llmText.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : llmText;
        const result = JSON.parse(jsonString);
        result.provider = 'Qianfan';
        return result;
    } catch (error) {
        console.error('Qianfan API调用失败:', error.message);
        throw error;
    }
}

module.exports = { evaluateWithQianfan, callQianfanLLM };
