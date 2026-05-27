# 小红书发布助手

本地 + 云端双模式的小红书笔记发布工具。

- **Vercel 云端**：任何人打开网页就能上传图片、管理文案
- **本地运行**：AI 文案生成 + Playwright 自动发布

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
