// src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/ui/ClayKit';
import ErrorBoundary from './components/ErrorBoundary';
import ApiErrorBridge from './components/ApiErrorBridge';

// Electron 打包后以 file:// 加载，没有真实的 pathname，必须用 HashRouter；
// 浏览器 / 开发服务器下保持 BrowserRouter，URL 不变。
const Router = window.location.protocol === 'file:' ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <ToastProvider>
            <ApiErrorBridge />
            <App />
          </ToastProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  </React.StrictMode>,
);