// electron.cjs —— Electron 主进程（CommonJS）
// 项目根 package.json 声明了 "type": "module"，因此主进程文件必须使用 .cjs 扩展名，
// 否则 Node 会按 ES Module 解析，导致 require 未定义。
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// 修复 Windows 下启动报 “Unable to move the cache: 拒绝访问 (0x5)”
// 原因：Electron 默认缓存目录可能被占用 / 无写权限，Chromium 无法迁移旧缓存。
// 做法：把磁盘缓存显式指向 userData 下可写目录，并关闭 GPU 着色器磁盘缓存。
// 必须在 app ready 之前调用 commandLine.appendSwitch 才生效。
// ---------------------------------------------------------------------------
const cacheDir = path.join(app.getPath('userData'), 'disk-cache');
try {
  fs.mkdirSync(cacheDir, { recursive: true });
  app.commandLine.appendSwitch('disk-cache-dir', cacheDir);
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
} catch (err) {
  // 目录仍不可写时降级为纯内存缓存，保证应用能正常启动
  console.warn('[electron] 磁盘缓存目录不可用，已改为仅内存缓存：', err.message);
  app.commandLine.appendSwitch('disable-http-cache');
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

function createWindow() {
  // 创建浏览器窗口
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // 推荐关闭，更安全
      contextIsolation: true, // 推荐开启
    },
  });

  // 加载React应用
  // 开发环境下，加载Vite启动的开发服务器
  // 生产环境下，加载打包后的index.html文件
  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, './dist/index.html')}`;
  win.loadURL(startUrl);

  // （可选）打开开发者工具
  if (process.env.ELECTRON_START_URL) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
