#!/usr/bin/env bash
# 在安装了 Docker 与 Docker Compose 的 Linux 服务器上执行：./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"
umask 077

echo "==> 企业打卡系统 · 安全一键部署"

if ! command -v docker >/dev/null 2>&1; then
  echo "❌ 未检测到 Docker：https://docs.docker.com/engine/install/"
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "❌ 未检测到 Docker Compose。"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "❌ Docker 服务未运行，请先启动 Docker Engine 后重新执行。"
  exit 1
fi

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

if [ ! -f .env ]; then
  JWT_SECRET="$(random_hex 32)"
  DB_PASSWORD="Db1_$(random_hex 16)"
  DB_ROOT_PASSWORD="Root1_$(random_hex 16)"
  ADMIN_PASSWORD="Adm1_$(random_hex 12)"
  {
    printf 'DB_HOST=db\n'
    printf 'DB_PORT=3306\n'
    printf 'DB_NAME=attendance_db\n'
    printf 'DB_USER=attendance\n'
    printf 'DB_PASSWORD=%s\n' "$DB_PASSWORD"
    printf 'DB_ROOT_PASSWORD=%s\n' "$DB_ROOT_PASSWORD"
    printf 'JWT_SECRET=%s\n' "$JWT_SECRET"
    printf 'ADMIN_PASSWORD=%s\n' "$ADMIN_PASSWORD"
    printf 'COOKIE_SECURE=false\n'
    printf 'TRUST_PROXY=false\n'
    printf 'REQUIRE_DATABASE=true\n'
    printf 'PORT=3000\n'
  } > .env
  echo "✅ 已生成仅当前用户可读的随机生产密钥。"
else
  chmod 600 .env
  echo "ℹ️  沿用已有 .env。"
fi

read_env() {
  local key="$1"
  awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' .env
}

JWT_SECRET="$(read_env JWT_SECRET)"
DB_PASSWORD="$(read_env DB_PASSWORD)"
DB_ROOT_PASSWORD="$(read_env DB_ROOT_PASSWORD)"
ADMIN_PASSWORD="$(read_env ADMIN_PASSWORD)"
APP_PORT="$(read_env PORT)"
APP_PORT="${APP_PORT:-3000}"

if [ "${#JWT_SECRET}" -lt 32 ] || [ "$JWT_SECRET" = "attendance-enterprise-secret-2026" ] || [ "$JWT_SECRET" = "change-me-before-production" ]; then
  echo "❌ .env 中 JWT_SECRET 不安全，请删除 .env 后重新运行，或手动设置至少 32 位随机值。"
  exit 1
fi
if [ -z "$DB_PASSWORD" ] || [ "$DB_PASSWORD" = "123456" ] || [ "$DB_PASSWORD" = "change-me-before-production" ]; then
  echo "❌ .env 中 DB_PASSWORD 不安全。"
  exit 1
fi
if [ -z "$DB_ROOT_PASSWORD" ] || [ "$DB_ROOT_PASSWORD" = "123456" ] || [ "$DB_ROOT_PASSWORD" = "change-me-before-production" ]; then
  echo "❌ .env 中 DB_ROOT_PASSWORD 不安全。"
  exit 1
fi
if [ "${#ADMIN_PASSWORD}" -lt 8 ] || [[ ! "$ADMIN_PASSWORD" =~ [A-Za-z] ]] || [[ ! "$ADMIN_PASSWORD" =~ [0-9] ]]; then
  echo "❌ .env 中 ADMIN_PASSWORD 至少 8 位，并且必须包含字母和数字。"
  exit 1
fi

echo "==> 校验部署配置..."
"${COMPOSE[@]}" config >/dev/null

echo "==> 构建并启动容器..."
"${COMPOSE[@]}" up -d --build --remove-orphans

echo "==> 等待应用健康检查..."
healthy=false
for _ in $(seq 1 60); do
  container_id="$("${COMPOSE[@]}" ps -q app)"
  if [ -n "$container_id" ]; then
    status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id" 2>/dev/null || true)"
    if [ "$status" = "healthy" ]; then
      healthy=true
      break
    fi
  fi
  sleep 2
done

if [ "$healthy" != "true" ]; then
  echo "❌ 应用未通过健康检查，最近日志如下："
  "${COMPOSE[@]}" logs --tail=120 app db
  exit 1
fi

echo ""
echo "🎉 部署完成"
echo "   系统地址：http://<服务器IP>:${APP_PORT}"
echo "   管理账号：admin"
echo "   初始密码：${ADMIN_PASSWORD}"
echo "   数据库 3306 端口未对公网开放。"
echo ""
echo "常用命令："
echo "   查看状态：${COMPOSE[*]} ps"
echo "   查看日志：${COMPOSE[*]} logs -f app"
echo "   更新部署：git pull && ./deploy.sh"
echo "   停止服务：${COMPOSE[*]} down"
