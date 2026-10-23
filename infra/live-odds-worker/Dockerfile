# Live odds worker image. Build from the repository root:
#   fly deploy --config infra/live-odds-worker/fly.toml --dockerfile infra/live-odds-worker/Dockerfile --ha=false
FROM node:22-slim
WORKDIR /app
COPY . .
# The worker imports apps/web/src directly (drizzle schema, sports libs), so the web workspace's dependencies are needed.
RUN npm ci --workspace=@repo/web --include-workspace-root --ignore-scripts && npm cache clean --force
WORKDIR /app/apps/web
USER node
# exec form, so SIGTERM reaches node and the worker can finish its cycle and exit cleanly.
CMD ["node", "--experimental-strip-types", "scripts/live-odds-worker.mts"]
