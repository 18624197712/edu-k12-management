# 学途教育 K12 一对一教培管理系统

React + NestJS + PostgreSQL 的全栈教培运营系统，覆盖学生、教学、成绩、家校、续费、推荐、培训和数据报表。

## 本地开发

```bash
pnpm install
Copy-Item .env.example .env
docker compose up -d postgres minio
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/v1
- Swagger: http://localhost:3000/api/docs
- MinIO Console: http://localhost:9001

演示管理员：`admin@edu.local` / `Edu@123456`

## Docker

```bash
docker compose up --build
```

Web 将运行在 http://localhost:8080。首次启动前需在 API 容器中执行 Prisma migration 与 seed。

## 验证

```bash
pnpm build
pnpm test
pnpm lint
```

生产环境必须替换 JWT、数据库及 MinIO 密钥，并启用 HTTPS。

## 阿里云 Docker 部署

服务器需要安装 Git、Docker Engine 和 Docker Compose 插件。安全组至少开放：

- `22/tcp`：SSH
- `80/tcp`：Web 系统
- `9000/tcp`：MinIO 文件上传与下载 API

不要开放 PostgreSQL `5432` 或 MinIO 管理控制台 `9001`。

```bash
git clone <your-github-repository-url> /opt/edu
cd /opt/edu
cp .env.production.example .env.production
# 编辑 .env.production，替换所有密码、密钥、服务器 IP 或域名
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

API 容器启动时会自动执行 `prisma migrate deploy`。首次部署可设置
`SEED_DEMO_DATA=true` 创建演示数据和管理员；完成首次启动后建议改为 `false`。

如果使用域名和 HTTPS：

- 将 `WEB_ORIGIN` 改为实际 HTTPS 域名。
- 将 `S3_PUBLIC_ENDPOINT` 改为浏览器可访问的 MinIO HTTPS 地址。
- 将 `COOKIE_SECURE` 改为 `true`。

升级：

```bash
cd /opt/edu
git pull --ff-only
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

备份 PostgreSQL：

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U edu -d edu > edu-backup.sql
```
