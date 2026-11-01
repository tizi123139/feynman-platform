// multi-llm-manager.js
const { evaluateWithDeepSeek } = require('./deepseek-api-example');
const { evaluateWithSiliconFlow } = require('./siliconflow-api-example');
const { evaluateWithOpenRouter } = require('./openrouter-api-example');
const { evaluateWithQianfan } = require('./qianfan-api-example');

async function evaluateWithMultipleLLMs(originalContent, transcribedText, knowledgePoint = '', preferredProviders = ['qianfan', 'deepseek', 'siliconflow', 'openrouter']) {
    const errors = [];
    
    // 按照优先级尝试不同的LLM服务
    for (const provider of preferredProviders) {
        try {
            console.log(`尝试使用${provider} API进行评估...`);
            let result;
            
            switch (provider) {
                case 'deepseek':
                    result = await evaluateWithDeepSeek(originalContent, transcribedText);
                    result.provider = 'DeepSeek';
                    break;
                    
                case 'siliconflow':
                    result = await evaluateWithSiliconFlow(transcribedText, knowledgePoint || originalContent);
                    break;
                    
                case 'openrouter':
                    result = await evaluateWithOpenRouter(transcribedText, knowledgePoint || originalContent);
                    break;
                    
                case 'qianfan':
                    result = await evaluateWithQianfan(originalContent, transcribedText);
                    result.provider = 'Qianfan';
                    break;
                    
                default:
                    throw new Error(`未知的LLM提供商: ${provider}`);
            }
            
            console.log(`${provider} API评估成功`);
            return result;
            
        } catch (error) {
            const errorMsg = `${provider} API评估失败: ${error.message}`;
            console.warn(errorMsg);
            errors.push(errorMsg);
        }
    }
    
    // 所有LLM服务都失败
    console.error('所有LLM服务评估失败:', errors);
    throw new Error(`所有LLM服务评估失败: ${errors.join('; ')}`);
}

module.exports = { evaluateWithMultipleLLMs };