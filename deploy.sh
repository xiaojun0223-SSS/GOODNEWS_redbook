#!/bin/bash
# 一键部署脚本 — 阿里云/腾讯云 Ubuntu 24.04
# 用法在你的服务器终端执行（一次）：
#   curl -sL https://raw.githubusercontent.com/你的用户名/xiaohongshu-tool/main/deploy.sh | bash

set -e

echo "=============================="
echo " 小红书发布助手 — 一键部署"
echo "=============================="

# 1. 安装基础环境
echo "[1/6] 安装 Node.js 和 Chromium..."
apt update -y
apt install -y git curl nginx

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
npm install -g pm2

# Chromium（Playwright 需要）
npx playwright install chromium 2>/dev/null || true

# 2. 拉取项目
echo "[2/6] 拉取项目代码..."
cd /opt
if [ -d xiaohongshu ]; then
  cd xiaohongshu && git pull
else
  git clone https://github.com/xiaojun0223-SSS/GOODNEWS_redbook.git xiaohongshu
  cd xiaohongshu
fi

# 3. 安装依赖 & 构建前端
echo "[3/6] 安装依赖 & 构建..."
npm install
npm run build

# 4. 创建数据目录
mkdir -p data public/images
chmod -R 755 data public/images

# 5. 用 PM2 启动服务（生产模式）
echo "[4/6] 启动服务..."
pm2 delete xiaohongshu 2>/dev/null || true
pm2 start server/index.js --name xiaohongshu --time
pm2 save
pm2 startup 2>/dev/null || true

# 6. 配置 Nginx 反向代理（端口 80 → 3001）
echo "[5/6] 配置 Nginx..."
cat > /etc/nginx/sites-available/xiaohongshu << 'EOF'
server {
    listen 80;
    server_name _;

    # 前端静态文件
    root /opt/xiaohongshu/dist;
    index index.html;

    # API 代理到 Express
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        client_max_body_size 100m;
    }

    # 图片服务
    location /images/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_cache_bypass $http_upgrade;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }

    # 前端 SPA 路由
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

ln -sf /etc/nginx/sites-available/xiaohongshu /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 7. 显示访问地址
echo "=============================="
echo " ✅ 部署完成！"
echo ""
echo " 访问地址: http://$(curl -s ifconfig.me || hostname -I | awk '{print $1}')"
echo ""
echo " 管理命令:"
echo "   pm2 status              # 查看运行状态"
echo "   pm2 logs xiaohongshu    # 查看日志"
echo "   pm2 restart xiaohongshu # 重启服务"
echo "=============================="
