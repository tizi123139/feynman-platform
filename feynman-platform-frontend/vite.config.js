import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
// Electron 打包后以 file:// 加载 dist/index.html，必须用相对路径，否则资源全部 404 导致白屏；
// Web 部署仍保留根路径，避免 BrowserRouter 嵌套路由下相对路径解析错位。
export default defineConfig(() => ({
  base: process.env.ELECTRON_BUILD ? './' : '/',
  plugins: [
    react(),
    // 注意：若确实需要 Cesium，需先安装 vite-plugin-cesium 并在此处 import cesium from 'vite-plugin-cesium'
    VitePWA({
      registerType: 'autoUpdate',
      // 配置 manifest.json
      manifest: {
        name: '费曼小课堂 · 讲明白才算学会',
        short_name: '费曼小课堂',
        description: '用讲解驱动学习的费曼学习法平台：语音复述、间隔复习、知识图谱与 AI 陪练。',
        lang: 'zh-CN',
        theme_color: '#FFF8F0',
        background_color: '#FFF8F0',
        display: 'standalone',
        // 图标由 scripts/make-icons.mjs 统一生成，三张同源，避免风格不一致
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      // 配置 Service Worker 缓存策略
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'] // 缓存哪些文件
      }
    })
  ],
}))
