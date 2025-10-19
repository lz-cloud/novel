#!/usr/bin/env bash
# 一键部署脚本（Linux）
# 适用于 NovelHub（Docker Compose 编排：Postgres + Redis + Backend + Frontend + Nginx）
# 使用方法：
#   bash ./deploy.sh
# 可选环境变量：
#   GHCR_USERNAME   - 登录 GHCR 的用户名（若使用私有镜像）
#   CR_PAT          - GitHub Personal Access Token（read:packages 权限）
#   SKIP_DOCKER     - 若已安装并正确配置 Docker/Compose，可设置为 1 跳过安装
#   NO_PULL         - 若不想在启动前拉取镜像，设置为 1
#   COMPOSE_FILE    - 自定义 compose 文件，默认使用当前目录 docker-compose.yml

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE_PATH="${COMPOSE_FILE:-$PROJECT_ROOT/docker-compose.yml}"
APP_NAME="novelhub"

# 彩色输出
info()  { echo -e "\033[1;34m[INFO]\033[0m  $*"; }
succ()  { echo -e "\033[1;32m[SUCCESS]\033[0m $*"; }
warn()  { echo -e "\033[1;33m[WARN]\033[0m  $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*"; }

# 检查 sudo
SUDO=""
if [ "${EUID}" -ne 0 ]; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
  else
    error "需要以 root 运行或安装 sudo。请使用 root 账户运行：sudo bash ./deploy.sh"
    exit 1
  fi
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

ensure_pkg_tools() {
  # 尝试探测包管理器
  if need_cmd apt-get; then
    PKG_MGR="apt-get"
  elif need_cmd dnf; then
    PKG_MGR="dnf"
  elif need_cmd yum; then
    PKG_MGR="yum"
  elif need_cmd zypper; then
    PKG_MGR="zypper"
  else
    PKG_MGR=""
  fi
}

install_packages() {
  local pkgs=("$@")
  if [ -z "${PKG_MGR:-}" ]; then
    ensure_pkg_tools
  fi
  if [ -z "${PKG_MGR:-}" ]; then
    warn "未能检测到包管理器，跳过安装：${pkgs[*]}（可能已安装）"
    return 0
  fi
  info "安装依赖：${pkgs[*]}"
  case "$PKG_MGR" in
    apt-get)
      $SUDO apt-get update -y
      $SUDO apt-get install -y "${pkgs[@]}"
      ;;
    dnf)
      $SUDO dnf install -y "${pkgs[@]}"
      ;;
    yum)
      $SUDO yum install -y "${pkgs[@]}"
      ;;
    zypper)
      $SUDO zypper refresh || true
      $SUDO zypper install -y "${pkgs[@]}"
      ;;
  esac
}

install_docker() {
  if [ "${SKIP_DOCKER:-}" = "1" ]; then
    info "已设置 SKIP_DOCKER=1，跳过 Docker 安装"
    return 0
  fi

  if need_cmd docker; then
    info "已检测到 Docker: $(docker --version 2>/dev/null || true)"
  else
    info "未检测到 Docker，开始安装"
    install_packages curl ca-certificates gnupg lsb-release || true
    # 优先使用官方一键脚本，保证跨发行版可用
    if curl -fsSL https://get.docker.com >/tmp/get-docker.sh; then
      $SUDO sh /tmp/get-docker.sh
    else
      warn "下载 Docker 官方安装脚本失败，尝试使用包管理器安装"
      if need_cmd apt-get; then
        $SUDO apt-get update -y
        $SUDO apt-get install -y docker.io
      elif need_cmd dnf; then
        $SUDO dnf install -y docker
      elif need_cmd yum; then
        $SUDO yum install -y docker
      elif need_cmd zypper; then
        $SUDO zypper install -y docker
      else
        error "无法安装 Docker，请手动安装后重试"
        exit 1
      fi
    fi
  fi

  # 启动并开机自启
  if need_cmd systemctl; then
    $SUDO systemctl enable docker || true
    $SUDO systemctl start docker || true
  else
    info "系统不使用 systemd，跳过 systemctl 操作"
  fi

  # 检查 Docker Compose v2
  if docker compose version >/dev/null 2>&1; then
    info "已检测到 Docker Compose v2"
  else
    info "未检测到 Docker Compose v2，尝试安装 compose 插件"
    if need_cmd apt-get; then
      $SUDO apt-get update -y
      $SUDO apt-get install -y docker-compose-plugin
    elif need_cmd dnf; then
      $SUDO dnf install -y docker-compose-plugin
    elif need_cmd yum; then
      $SUDO yum install -y docker-compose-plugin || true
    elif need_cmd zypper; then
      $SUDO zypper install -y docker-compose || true
    fi
  fi
}

choose_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    echo "docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    echo "docker-compose"
  else
    echo ""
  fi
}

prepare_env_file() {
  if [ -f "$PROJECT_ROOT/.env" ]; then
    info ".env 已存在，跳过创建"
    return 0
  fi
  if [ -f "$PROJECT_ROOT/.env.example" ]; then
    info "未发现 .env，基于 .env.example 创建"
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    # 若 JWT_SECRET 为占位值则生成随机值
    if grep -q '^JWT_SECRET=please_change_me' "$PROJECT_ROOT/.env"; then
      local secret
      if need_cmd openssl; then
        secret=$(openssl rand -hex 32)
      else
        install_packages openssl || true
        secret=$(openssl rand -hex 32 2>/dev/null || cat /proc/sys/kernel/random/uuid)
      fi
      $SUDO sed -i "s/^JWT_SECRET=.*/JWT_SECRET=${secret}/" "$PROJECT_ROOT/.env"
      info "已生成随机 JWT_SECRET"
    fi
  else
    warn "未找到 .env 或 .env.example，请自行创建 .env"
  fi
}

maybe_login_ghcr() {
  if [ -n "${GHCR_USERNAME:-}" ] && [ -n "${CR_PAT:-}" ]; then
    info "尝试登录 GHCR（ghcr.io）以拉取私有镜像"
    if echo "$CR_PAT" | $SUDO docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin; then
      succ "GHCR 登录成功"
    else
      warn "GHCR 登录失败，继续以匿名方式拉取镜像"
    fi
  else
    info "未设置 GHCR_USERNAME/CR_PAT，跳过 GHCR 登录"
  fi
}

wait_for_health() {
  local name="$1"
  local tries=60
  info "等待服务 ${name} 变为 healthy（最长约 ${tries}0 秒）"
  for i in $(seq 1 "$tries"); do
    local status
    status=$($SUDO docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo "unknown")
    if [ "$status" = "healthy" ] || [ "$status" = "running" ]; then
      succ "${name} 状态：$status"
      return 0
    fi
    sleep 10
  done
  warn "等待 ${name} 健康检查超时，请使用 'docker compose logs -f' 查看日志"
}

main() {
  info "项目目录：$PROJECT_ROOT"
  if [ ! -f "$COMPOSE_FILE_PATH" ]; then
    error "未找到 docker-compose.yml：$COMPOSE_FILE_PATH"
    exit 1
  fi

  install_docker
  local COMPOSE
  COMPOSE=$(choose_compose_cmd)
  if [ -z "$COMPOSE" ]; then
    error "未检测到 Docker Compose，请手动安装 docker compose 后重试"
    exit 1
  fi
  info "使用 Compose 命令：$COMPOSE"

  prepare_env_file
  maybe_login_ghcr

  cd "$PROJECT_ROOT"
  if [ "${NO_PULL:-}" != "1" ]; then
    info "拉取最新镜像"
    $SUDO $COMPOSE -f "$COMPOSE_FILE_PATH" pull
  else
    info "跳过拉取镜像（NO_PULL=1）"
  fi

  info "启动服务（后台模式）"
  $SUDO $COMPOSE -f "$COMPOSE_FILE_PATH" up -d

  info "当前容器状态："
  $SUDO $COMPOSE -f "$COMPOSE_FILE_PATH" ps || true

  # 依次等待后端与前端、网关
  wait_for_health "novelhub-backend" || true
  wait_for_health "novelhub-frontend" || true
  wait_for_health "novelhub-nginx" || true

  succ "部署完成！"
  echo
  echo "访问地址：${PUBLIC_URL:-http://localhost:8080}"
  echo "常用命令："
  echo "  查看状态： $SUDO $COMPOSE -f $COMPOSE_FILE_PATH ps"
  echo "  查看日志： $SUDO $COMPOSE -f $COMPOSE_FILE_PATH logs -f"
  echo "  停止服务： $SUDO $COMPOSE -f $COMPOSE_FILE_PATH down"
}

main "$@"
