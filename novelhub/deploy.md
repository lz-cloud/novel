# NovelHub 部署指南

本指南将帮助你使用 Docker Compose 一键部署 NovelHub（前端 + 后端 + PostgreSQL + Redis + Nginx 反向代理）。

## 0. 一键部署（推荐）

- 进入项目目录并执行：

```bash
cd novelhub
bash ./deploy.sh
```

说明：
- 脚本会自动检测/安装 Docker 与 Docker Compose v2（需要 sudo 权限）
- 首次运行会基于 .env.example 生成 .env，并自动生成随机 JWT_SECRET
- 如需从 GHCR 拉取私有镜像，需先导出（可选）：

```bash
export GHCR_USERNAME=<your-github-username>
export CR_PAT=<your-personal-access-token-with-read:packages>
```

- 常用环境变量（可选）：
  - SKIP_DOCKER=1 跳过 Docker 安装
  - NO_PULL=1 跳过拉取镜像

## 1. 前提条件

- 已安装 Docker >= 24.x
- 已安装 Docker Compose v2（通常已集成在 Docker 中）
- 可以访问 GitHub / Google OAuth 应用（可选）

## 2. 准备环境变量

1) 复制环境变量模板

```bash
cd novelhub
cp .env.example .env
```

2) 编辑 `.env`，至少确保如下字段正确：

- PUBLIC_URL：外部访问域名/地址（本地默认 http://localhost:8080）
- JWT_SECRET：设置一个强随机值
- 数据库相关（如需修改默认账户/库名）
- OAuth 配置（如需使用 GitHub/Google 登录）

> 回调地址建议使用：
> - GitHub:  `${PUBLIC_URL}/api/auth/github/callback`
> - Google:  `${PUBLIC_URL}/api/auth/google/callback`

此外，如需使用 GHCR 中的预构建镜像，可在 `.env` 中设置镜像名称（可选）：
- BACKEND_IMAGE
- FRONTEND_IMAGE
- NGINX_IMAGE

默认镜像可直接使用，无需设置。

## 2.5 登录 GHCR（如使用私有镜像）

使用 GitHub Personal Access Token（需勾选 read:packages）登录：

```bash
echo $CR_PAT | docker login ghcr.io -u <your-github-username> --password-stdin
```

## 3. 启动服务

```bash
cd novelhub
# 拉取镜像（首次或更新版本）
docker compose pull

# 启动
docker compose up -d

# 查看所有容器状态
docker compose ps

# 查看日志
docker compose logs -f
```

首次启动后，系统会：
- 初始化数据库 Schema（Prisma）
- 暴露入口在 `http://localhost:8080`
  - 静态站点与 SPA 由 Nginx 前端容器提供
  - `/api/*` 路径反向代理到后端服务

## 4. 首次数据初始化（可选）

你可以在后端容器内执行种子脚本创建初始管理员用户、分类等：

```bash
docker compose exec backend npm run seed
```

默认管理员账号：
- 用户名：admin
- 邮箱：admin@novelhub.local
- 密码：Admin12345!

> 请及时登录后修改密码。

## 5. 常用运维命令

- 停止服务：
  ```bash
  docker compose down
  ```
- 重新构建（修改代码后）：
  ```bash
  docker compose up -d --build
  ```
- 进入容器 Shell：
  ```bash
  docker compose exec backend sh
  docker compose exec postgres sh
  docker compose exec redis sh
  ```
- 查看数据库连接：
  ```bash
  docker compose exec postgres psql -U $POSTGRES_USER -d $POSTGRES_DB
  ```

## 6. 生产环境建议

- 使用自定义域名（将 `PUBLIC_URL` 设置为 `https://your-domain`）
- 在外层使用反向代理终结 TLS，或在本 `nginx` 中添加证书配置
- 将 `JWT_SECRET` 与数据库凭据保存在安全的密钥管理系统
- 使用持久化卷（已内置）：
  - `db-data`（PostgreSQL 数据）
  - `redis-data`（Redis 持久化）
- 开启备份与监控

## 7. 目录结构速览

```
novelhub/
├── docker-compose.yml             # 编排入口
├── .env.example                   # 环境变量模板
├── deploy.md                      # 本部署文档
├── backend/                       # 后端（Express + Prisma）
├── frontend/                      # 前端（Vite + React + Tailwind）
└── nginx/                         # 反向代理（Nginx）
```

## 8. 故障排查

- 后端健康检查失败：
  - 查看后端日志 `docker compose logs -f backend`
  - 检查 `DATABASE_URL` 是否正确
- 数据库连接失败：
  - 确认 `postgres` 服务健康 `docker compose ps`
- OAuth 登录回调 404：
  - 确认在 OAuth 平台上的回调 URL 与 `.env` 中一致

如需更多帮助，请提交 Issue 或查看源码注释。
