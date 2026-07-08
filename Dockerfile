FROM node:24-bookworm-slim

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV GRAPHCODE_SERVER_HOST=0.0.0.0
ENV GRAPHCODE_WEB_HOST=0.0.0.0

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile && pnpm build

EXPOSE 3010 5173

CMD ["pnpm", "dev"]
