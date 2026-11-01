// services/aiService.js
const axios = require('axios');

// 统一的对话模型供应商列表（按优先级）
const PROVIDERS = [
    {
        key: 'qianfan',
        label: '千帆',
        url: 'https://qianfan.baidubce.com/v2/chat/completions',
        model: 'ernie-5.1',
        getKey: () => process.env.QIANFAN_API_KEY,
        // ERNIE 5.1 默认开启深度思考，会额外消耗数百 token 并显著拖慢响应；
        // 摘要 / 出题 / 阅卷用不到思维链，显式关闭
        extraBody: { thinking: { type: 'disabled' } },
    },
    {
        key: 'deepseek',
        label: 'DeepSeek',
        url: 'https://api.deepseek.com/v1/chat/completions',
        model: 'deepseek-chat',
        getKey: () => process.env.DEEPSEEK_API_KEY,
    },
    {
        key: 'siliconflow',
        label: 'SiliconFlow',
        url: 'https://api.siliconflow.cn/v1/chat/completions',
        model: 'deepseek-ai/DeepSeek-V3',
        getKey: () => process.env.SILICONFLOW_API_KEY,
    },
    {
        key: 'openrouter',
        label: 'OpenRouter',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        model: 'deepseek/deepseek-chat',
        getKey: () => process.env.OPENROUTER_API_KEY,
    },
];

function buildHeaders(provider, apiKey) {
    const headers = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    if (provider.key === 'openrouter') {
        headers['HTTP-Referer'] = 'https://github.com/feynman-platform';
        headers['X-Title'] = 'Feynman Platform';
    }
    return headers;
}

/**
 * 依次尝试各供应商，返回第一段可用文本
 * @returns {Promise<{text: string, provider: string}>}
 */
async function callLLMText(messages, options = {}) {
    const {
        temperature = 0.4,
        maxTokens = 1500,
        timeout = 45000,
        order = ['qianfan', 'deepseek', 'siliconflow', 'openrouter'],
    } = options;

    const errors = [];
    for (const key of order) {
        const provider = PROVIDERS.find((p) => p.key === key);
        if (!provider) continue;
        const apiKey = provider.getKey();
        if (!apiKey) {
            errors.push(`${provider.label} 未配置密钥`);
            continue;
        }
        try {
            const response = await axios.post(
                provider.url,
                {
                    model: provider.model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    ...(provider.extraBody || {}),
                },
                { headers: buildHeaders(provider, apiKey), timeout }
            );
            const text = response.data?.choices?.[0]?.message?.content;
            if (!text || !String(text).trim()) throw new Error('返回内容为空');
            return { text: String(text).trim(), provider: provider.label };
        } catch (error) {
            errors.push(`${provider.label}: ${error.message}`);
            console.warn(`${provider.label} 调用失败:`, error.message);
        }
    }
    throw new Error(`所有 AI 服务暂不可用（${errors.join('; ')}）`);
}

/** 从模型输出中提取 JSON */
function extractJson(text) {
    if (!text) throw new Error('模型返回为空');
    const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
    const generic = text.match(/\{[\s\S]*\}/);
    const jsonString = fenced ? fenced[1] : generic ? generic[0] : text;
    return JSON.parse(jsonString);
}

async function callLLMJson(messages, options = {}) {
    const { text, provider } = await callLLMText(messages, options);
    return { data: extractJson(text), provider, raw: text };
}

/**
 * 流式调用：边接收边通过 onDelta 输出增量文本
 * 某个供应商在输出首字前失败会自动切换下一个；已输出内容则不再切换，避免重复文本
 * @returns {Promise<{text: string, provider: string}>}
 */
async function callLLMStream(messages, options = {}, onDelta = () => {}) {
    const {
        temperature = 0.4,
        maxTokens = 1500,
        timeout = 90000,
        order = ['qianfan', 'deepseek', 'siliconflow', 'openrouter'],
    } = options;

    const errors = [];
    for (const key of order) {
        const provider = PROVIDERS.find((p) => p.key === key);
        if (!provider) continue;
        const apiKey = provider.getKey();
        if (!apiKey) {
            errors.push(`${provider.label} 未配置密钥`);
            continue;
        }

        let text = '';
        let started = false;
        try {
            const response = await axios.post(
                provider.url,
                {
                    model: provider.model,
                    messages,
                    temperature,
                    max_tokens: maxTokens,
                    stream: true,
                    ...(provider.extraBody || {}),
                },
                { headers: buildHeaders(provider, apiKey), timeout, responseType: 'stream' }
            );

            await new Promise((resolve, reject) => {
                const stream = response.data;
                let buffer = '';
                let settled = false;

                const finish = (error) => {
                    if (settled) return;
                    settled = true;
                    if (typeof stream.destroy === 'function') stream.destroy();
                    if (error) reject(error);
                    else resolve();
                };

                stream.on('data', (chunk) => {
                    if (settled) return;
                    buffer += chunk.toString('utf8');
                    let index;
                    while ((index = buffer.indexOf('\n')) !== -1) {
                        const line = buffer.slice(0, index).trim();
                        buffer = buffer.slice(index + 1);
                        if (!line.startsWith('data:')) continue;
                        const payload = line.slice(5).trim();
                        if (!payload) continue;
                        if (payload === '[DONE]') {
                            finish();
                            return;
                        }
                        try {
                            const json = JSON.parse(payload);
                            const delta = json?.choices?.[0]?.delta?.content;
                            if (delta) {
                                started = true;
                                text += delta;
                                onDelta(delta);
                            }
                        } catch {
                            // 心跳等非 JSON 行直接忽略
                        }
                    }
                });
                stream.on('end', () => finish());
                stream.on('error', (streamError) => finish(streamError));
            });

            if (!text.trim()) throw new Error('返回内容为空');
            return { text: text.trim(), provider: provider.label };
        } catch (error) {
            errors.push(`${provider.label}: ${error.message}`);
            console.warn(`${provider.label} 流式调用失败:`, error.message);
            if (started) throw new Error(`流式输出中断（${provider.label}）: ${error.message}`);
        }
    }
    throw new Error(`所有 AI 服务暂不可用（${errors.join('; ')}）`);
}

module.exports = { callLLMText, callLLMJson, callLLMStream, extractJson, PROVIDERS };
