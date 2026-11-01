# 费曼学习平台（Feynman Learning Platform）

> 用输出倒逼输入：写下知识点 → 讲给别人听 → AI 评分 → 间隔复习 → 沉淀成知识图谱。

React 19 + Express 5 + MongoDB 的全栈学习系统，把费曼学习法拆成可测量、可坚持的动作，并用 XP、等级、连续天数与成就徽章串成完整闭环。

**演示与技术细节**：完整说明见 [项目说明文档.md](项目说明文档.md)（架构 / 数据模型 / 核心机制 / API 清单 / AI 能力设计 / 部署方案）。

---

## 学习闭环

```
⓪ 今日计划（到期 / 薄弱 / 待复述 / 新种子 → 番茄序列）
        ↓
① 录入知识点（Markdown）
        ↓
② 复述：录音 → 语音识别 → 五维评分 → 表达体检 → 弱点追问
        ↓
③ 测评：AI 出题 → 作答 → AI 阅卷 → 错题进复习队列
        ↓
④ 复习：SM-2 间隔调度
        ↓
⑤ 沉淀：知识图谱（规则边 + AI 语义边 + 学习路径）+ 知识宇宙
        ↓
⑥ 激励：XP / 等级 / 连续天数 / 成就 / 每日任务 / 周报 → 回到 ①
```

每个动作都写入学习日志，并联动掌握度、XP 与成就——仪表盘上的每个数字都能追溯到具体行为。

---

## 亮点

| 能力 | 说明 |
| --- | --- |
| **五维评分 + 弱点追问** | 复述不止一个总分，拆成准确性 / 完整性 / 逻辑结构 / 表达流畅 / 深度延伸，并只针对最弱的那一点继续追问 |
| **表达体检（零模型成本）** | 语速 / 口头禅 / 句长 / 讲解结构全部用规则计算，毫秒级返回、结果可复现：内容好不好交给模型，讲得顺不顺交给规则 |
| **多供应商自动降级** | 千帆 `ernie-5.1` → DeepSeek → SiliconFlow → OpenRouter，任一家密钥失效或限流都不影响整体可用性 |
| **本地向量库 RAG** | `vectra` + SiliconFlow `bge-m3`（1024 维），AI 伙伴基于**你自己的笔记**回答，SSE 流式输出并带引用来源 |
| **语义搜索（Ctrl + K）** | 向量召回 + 关键词召回混合排序，片段高亮、命中来源标注、防脏数据与硬凑结果 |
| **知识图谱推理** | AI 语义关系（前置 / 延伸 / 混淆 / 应用）+ 拓扑排序生成分阶段学习路径，按用户缓存 12 小时 |
| **今日学习计划** | 纯函数排程：四档优先级候选 + 番茄分桶 + 复用日志回填完成度，不额外维护计划表 |
| **三种交付形态** | 同一份前端代码 → Web / PWA / Electron 桌面端；后端始终是独立服务 |
| **黏土（clay）设计体系** | 分层 CSS 设计令牌 + 自绘黏土插画组件库 `ClayKit`，路由级懒加载 |

---

## 技术栈

**后端**：Node.js（CommonJS）· Express 5 · MongoDB Atlas + Mongoose 9 · JWT + bcryptjs · `vectra` 本地向量索引 · `@langchain/textsplitters` · 百度智能云 ASR · `fluent-ffmpeg` · Swagger（`/api-docs`）

**前端**：React 19 · React Router 7（懒加载）· Vite 8 · 原生分层 CSS · `@uiw/react-md-editor` + `react-markdown` · ECharts · Three.js + `d3-force-3d` · `react-media-recorder` · Electron + `vite-plugin-pwa`

---

## 快速上手

需要 Node.js 22+、一个 MongoDB（Atlas 或本地）以及至少一家 LLM 供应商的密钥。

```bash
# 1) 后端
cd feynman-platform-backend
cp .env.example .env      # 填入 MONGO_URI / JWT_SECRET / SILICONFLOW_API_KEY
npm install
node index.js             # → http://localhost:3000，接口文档 /api-docs

# 2) 前端（另开终端）
cd feynman-platform-frontend
npm install
npm run dev               # → http://localhost:5173
```

首次使用或更换 embedding 模型后，执行 `node scripts/reindex-vectors.js` 把历史知识点补进向量库，否则 AI 伙伴与语义搜索检索不到旧笔记。

其余命令：`npm run build`（生产构建）、`npm run lint`（oxlint）、`npm run electron:build`（桌面安装包，产物在 `release/`）。

> 环境变量清单（含百度语音、各供应商密钥的必填/可选关系）见 [项目说明文档.md · 第十一章](项目说明文档.md)。

---

## 安全与密钥

- 所有密钥只存在于 `feynman-platform-backend/.env`，该文件已被 `.gitignore` 忽略，**永不入库**；仓库仅提供占位符文件 `.env.example`。
- 业务代码统一通过 `process.env.*` 读取，未硬编码任何密钥、连接串或 token。
- `vector_data/`、`chroma_data/`、`node_modules/`、`dist/`、`release/` 同样被忽略——向量索引里含笔记正文，不适合公开。
- 若曾把真实密钥提交过，请**在供应商控制台吊销并更换**，仅删除文件或用 `git rm --cached` 移出跟踪都不能让历史提交里的内容失效。

---

## 仓库结构

```
feynman-platform/
├── feynman-platform-backend/    # Express 5 API（models / routes / services / controllers）
├── feynman-platform-frontend/   # React 19 + Vite（pages / components / layouts / styles）
├── 项目说明文档.md                # 完整说明书：架构、数据模型、机制、API、部署
└── 演示录制说明.md                # 演示分镜与验收链路
```

---

## 已知限制

普通 AI 请求仍受 axios 全局 15 秒超时约束 · 向量库为单机文件索引（多实例部署需替换为独立向量服务）· 关系推理与今日计划不落库（重启后需重算、无法回看历史某天）· 核心调度逻辑（SM-2 / 成就 / 计划）暂无单元测试，仅有接口冒烟脚本。

---

## License

未指定（私有项目 / 课程设计与答辩演示用途）。
