// src/api/axios.js
import axios from 'axios';

const apiClient = axios.create({
    baseURL: 'http://localhost:3000/api',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 15000, // 15 秒超时
});

// --- 请求拦截器：自动注入 token ---
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers['Authorization'] = token;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// --- 响应拦截器：统一错误处理 ---
export const AUTH_EXPIRED_EVENT = 'auth:expired';
// 网络 / 服务端故障：由 ApiErrorBridge 弹一条全局 Toast，避免每个页面各写一遍
// （页面自己的「xxx 失败」提示保留，这里只补充“为什么失败”）
export const API_ERROR_EVENT = 'api:error';

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const serverMsg = error.response?.data?.msg;
        // 只有「本次请求确实带了 token」才说明是登录态失效；
        // 登录接口返回的 401（密码错误）不应该清掉本地状态
        const sentAuth = Boolean(error.config?.headers?.Authorization || error.config?.headers?.authorization);

        if (status === 401 && sentAuth) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            // 交给 AuthContext 清理内存态，由 ProtectedRoute 做客户端跳转；
            // 不再用 window.location.href = '/login'（Electron 的 file:// 协议下会变成 file:///login）
            window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
        }
        // 网络层错误（后端没起来、跨域等）
        if (!error.response) {
            console.warn('[网络错误] 请求未收到响应:', error.message);
            window.dispatchEvent(
                new CustomEvent(API_ERROR_EVENT, {
                    detail: {
                        tone: 'error',
                        message: '连不上服务，请确认后端已在 localhost:3000 启动',
                    },
                })
            );
        } else if (status >= 500) {
            window.dispatchEvent(
                new CustomEvent(API_ERROR_EVENT, {
                    detail: { tone: 'error', message: serverMsg || '服务端开小差了，请稍后重试' },
                })
            );
        }
        return Promise.reject(error);
    }
);

export default apiClient;
