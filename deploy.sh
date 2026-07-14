#!/usr/bin/env bash
#
# 一键部署脚本：在装有 Docker 的服务器上运行本脚本即可启动系统。
#   使用方法：
#     chmod +x deploy.sh
#     ./deploy.sh
#
set -euo pipefail
cd "$(dirname "$0")"

echo "==> 员工打卡管理系统 · 一键部署"

# 1) 检查 Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 未检测到 Docker，请先安装：https://docs.docker.com/engine/install/"
  exit 1
fi

# docker compose（v2）或 docker-compose（v1）
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "❌ 未检测到 docker compose，请安装 Docker Compose 插件。"
  exit 1
fi

# 2) 首次运行时生成 .env，并写入随机 JWT_SECRET
if [ ! -f .env ]; then
  cp .env.example .env
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -hex 32)"
  else
    SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  # 兼容 macOS / Linux 的 sed
  if sed --version >/dev/null 2>&1; then
    sed -i "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" .env
  else
    sed -i '' "s|^JWT_SECRET=.*|JWT_SECRET=${SECRET}|" .env
  fi
  echo "✅ 已生成 .env（含随机 JWT_SECRET）。如需修改数据库密码/端口，请编辑 .env 后重新运行。"
else
  echo "ℹ️  已存在 .env，沿用现有配置。"
fi

# 3) 构建并启动
echo "==> 构建镜像并启动容器（首次可能需要几分钟）..."
$DC up -d --build

echo ""
echo "🎉 部署完成！"
echo "   访问地址：http://<服务器IP>:$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d '\r' || echo 3000)"
echo "   管理后台：http://<服务器IP>:$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d '\r' || echo 3000)/admin"
echo "   默认管理员：admin / Admin@123（首次登录后请尽快修改密码）"
echo ""
echo "   常用命令："
echo "     查看日志： $DC logs -f app"
echo "     停止服务： $DC down"
echo "     更新代码后重新部署： git pull && ./deploy.sh"
