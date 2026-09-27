FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --filter @edu/api... --frozen-lockfile=false
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter @edu/api prisma:generate && pnpm --filter @edu/api build
CMD ["sh","-c","pnpm --filter @edu/api exec prisma migrate deploy && if [ \"$SEED_DEMO_DATA\" = \"true\" ]; then pnpm --filter @edu/api prisma:seed; fi && node apps/api/dist/src/main.js"]
