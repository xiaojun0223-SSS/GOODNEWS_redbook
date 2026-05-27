# 小红书发布助手

全功能小红书笔记发布工具。支持云服务器部署，国内直接访问，任何设备都能用。

- **云服务器（推荐）**：国内访问免 VPN，任何电脑手机上传/发布
- **Vercel 云端**：网页端上传图片、管理文案
- **本地运行**：AI 文案生成 + Playwright 发布

---

## 云服务器一键部署（阿里云 / 腾讯云）

买一台 Ubuntu 24.04 服务器（最低 ¥68/月），SSH 登录后执行一条命令：

```bash
# 把项目拉到服务器
cd /opt
git clone https://github.com/xiaojun0223-SSS/GOODNEWS_redbook.git xiaohongshu
cd xiaohongshu

# 安装依赖 & 构建
npm install
npm run build

# 安装 Playwright 浏览器
npx playwright install chromium

# 用 PM2 启动（持久运行）
npm install -g pm2
pm2 start server/index.js --name xiaohongshu
pm2 save
pm2 startup

# 访问 http://服务器IP:3001
```

如需配置域名和 HTTPS，告诉我帮你配 Nginx。

## 本地开发

```bash
npm install
npm run dev
```

- 前端界面：http://localhost:5173
- 图片服务：http://localhost:3001

## 部署到 Vercel（免费）

### 前期准备

1. 注册 [Vercel](https://vercel.com)（用 GitHub 登录）
2. 注册 [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) 并创建存储（免费 5GB）

### 一键部署

```bash
# 1. 安装 Vercel CLI
npm install -g vercel

# 2. 登录 Vercel
vercel login

# 3. 部署
vercel --prod
```

### 手动部署（通过 GitHub）

1. 把项目推送到 GitHub
2. 在 Vercel 中 Import 该仓库
3. 项目设置中填加环境变量：
   - `BLOB_READ_WRITE_TOKEN` → 在 Vercel Blob 设置中获取
4. 部署后，任何设备打开 URL 即可使用

### 部署后功能

| 功能 | 本地 | Vercel |
|------|:---:|:------:|
| 上传图片 | ✅ | ✅ |
| 图片管理 | ✅ | ✅ |
| 文案库管理 | ✅ | ✅ |
| 文案生成（AI） | ✅ | ✅（浏览器端调用 API） |
| Playwright 发布 | ✅ | ❌ |
| 修改代码 | ✅ | ❌ |

## 使用流程

```
选择图片 → 随机/手动选文案 → AI 生成或文案库 → 编辑确认 → 一键发布
```

## 项目结构

```
xiaohongshu/
├── api/
│   ├── images.js           # Vercel 图片 API（Blob 存储）
│   └── captions.js         # Vercel 文案库 API
├── server/
│   └── index.js            # 本地 Express 后端
├── src/
│   ├── components/
│   │   ├── ImageGrid.jsx      # 图片网格选择器
│   │   ├── CaptionEditor.jsx  # AI 文案生成 + 编辑器
│   │   └── PreviewPanel.jsx   # 小红书预览 + 发布
│   ├── lib/ai.js              # AI 文案生成模块
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── data/
│   └── captions.json       # 文案库（git 跟踪）
├── public/images/          # 本地图片（git 忽略）
├── vercel.json             # Vercel 部署配置
├── .gitignore
├── .env.example
└── package.json
```
