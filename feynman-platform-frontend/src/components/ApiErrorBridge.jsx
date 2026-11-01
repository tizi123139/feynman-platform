// src/components/ApiErrorBridge.jsx
// 把 axios 拦截器的错误事件接到全局 Toast 上：同一个错误 6 秒内只弹一次，
// 免得一屏请求同时失败时刷出一堆重复提示。
import { useEffect } from 'react';
import { API_ERROR_EVENT } from '../api/axios';
import { useToast } from './ui/ClayKit';

const COOLDOWN = 6000;

export default function ApiErrorBridge() {
  const toast = useToast();

  useEffect(() => {
    let lastAt = 0;
    let lastMessage = '';

    const onError = (event) => {
      const { message, tone = 'error' } = event.detail || {};
      if (!message) return;
      const now = Date.now();
      if (message === lastMessage && now - lastAt < COOLDOWN) return;
      lastAt = now;
      lastMessage = message;
      const show = toast[tone] || toast.error;
      show(message, 3600);
    };

    window.addEventListener(API_ERROR_EVENT, onError);
    return () => window.removeEventListener(API_ERROR_EVENT, onError);
  }, [toast]);

  return null;
}
