# 本地部署与应用镜像

`compose/compose.yaml` 默认只启动带 pgvector 的 PostgreSQL 17，镜像以 digest 固定；当前不启用向量扩展或创建向量索引。`app` profile 加入 Agent 迁移与 seed、Web 独立数据库供应/迁移、FastAPI 与 Next.js standalone。`web` profile 只启动 PostgreSQL、Web 迁移和 Web，无 Python 服务依赖。所有宿主机端口绑定 127.0.0.1；演示账号和合成数据仅供本地。

根目录使用以下统一入口，镜像构建上下文始终为 Compass 根目录：

```bash
pnpm run deploy          # 全部：home / web / agent / memory / worker
pnpm run deploy web      # 仅 Web；所需数据库与迁移自动执行
pnpm run deploy home     # 仅官网，无 Python / 数据库依赖
pnpm run deploy agent    # 仅 Agent，包含所属迁移和三天 seed
pnpm run deploy memory
pnpm run deploy worker
pnpm deploy:status       # 可追加 app 名称
pnpm deploy:logs web     # 最近 100 行日志，不持续占用终端
pnpm deploy:down         # 整个项目停止，保留数据卷和镜像
```

`pnpm deploy` 是 pnpm 的包分发命令，项目部署必须使用 `pnpm run deploy`。单应用部署只停止并重建指定应用，其余应用保持现状；数据库按需启动。只需数据库时仍使用 `pnpm db:up`。

## 部署顺序与失败处理

1. 检查参数和本机 Docker socket，将后续 Docker 调用固定到该地址；固定 Compose 文件和 `compass` 项目名。忽略 `COMPOSE_FILE`、`COMPOSE_PROFILES`、`COMPOSE_PROJECT_NAME` 等环境覆盖，禁止 TCP/SSH 远程端点。
2. 获取 `work/local-deploy.lock`，检查所需端口、已有数据库健康；不结束开发进程。运行中的同项目同服务端口允许复用。
3. Web 执行 `pnpm contracts:check`；有漂移时先运行 `pnpm contracts`。home 从规范源准备素材。构建所选应用及迁移镜像，复用 Docker 构建缓存；构建失败时旧应用继续运行。
4. 等待 PostgreSQL 健康（仅 Web / Agent 需要），停止所选应用。每次显式运行所属迁移容器：Agent 执行 Alembic 与幂等 seed；Web 执行已有供应和迁移，不自动写教学账号。
5. 重建所选应用并等待健康检查（最多 120 秒），执行固定本机地址的 smoke；Worker 额外检查容器处于 running。Worker 当前只保证进程存活。

任一步失败即退出非零，不启动后续阶段，不自动清卷或回滚数据库；迁移失败后所选应用保持停止，修复原因后重跑。跨应用迁移不具备原子性，恢复遵循各所有者数据库规范。部署脚本只创建部署锁等临时文件，不记录凭据；异常终止遗留锁时先核对 `owner.json` 的 PID，再删除过期锁。

不主动读取根 `.env`，smoke 使用 `--local` 固定 127.0.0.1 地址；Compose 使用已登记的本地凭据。`COMPASS_NPM_REGISTRY` 可显式传入。Node / pnpm 与 Docker 必需；Web 的契约检查还需要 uv 和已安装 Python workspace。端口分别为 home 3001、Web 3000、Agent 8000、Memory 8001、PostgreSQL 55432。

CI 复用同一 `pnpm run deploy` 入口，之前执行 `pnpm check` 和 `pnpm build`。本机部署默认复用已完成的开发检查，部署仍强制执行契约检查、素材准备、容器健康检查与 smoke；完整发布前可手动先执行项目检查。

## 镜像与 Compose

- `containers/home.Dockerfile`：消费部署入口生成的 public 素材，使用 standalone 构建；复制 static/public，非 root 运行。直接调用 Compose 构建 home 前，先执行 `node apps/home/scripts/prepare-assets.mjs`。
- `containers/agent.Dockerfile`：uv 冻结安装当前 API 所需生产依赖；独立非 root 用户。
- `containers/web.Dockerfile`：BuildKit 缓存依赖下载，pnpm 冻结安装，构建 Next.js standalone，运行时只复制追踪产物与 static，非 root 用户。
- `containers/memory.Dockerfile` / `worker.Dockerfile`：分别安装当前 app 的 Python 生产依赖；两者尚未接入记忆存储与持久队列。
- Python 迁移文件随 API 镜像交付；迁移任务先成功，API 再启动。生产部署需分离数据库迁移凭据。
- Web 镜像消费已生成且通过 CI 校验的契约；本地修改 DTO 后先运行 `pnpm contracts`。

停止所有服务：`pnpm deploy:down`。该入口保留数据卷，不接受 `--volumes`；数据重置需另行明确处理。

已提供独立 `memory` 与 `worker` profiles：`--profile app --profile memory --profile worker up --build -d --wait` 启动所有后端脚手架与 Web；`pnpm smoke --memory` 校验 Web → agent → 数据库及 memory 健康检查。memory 使用 8001 端口，worker 无 HTTP 端口、尚无队列消费者，启动 / 停止日志可通过 `logs worker` 查看。两者无需 agent、数据库或 Temporal 即可单独启动。durable / identity / observability profiles 随对应业务能力实施。

网络受限时，可在 Web 镜像构建时指定可访问的 npm 镜像，锁文件 integrity 校验仍然生效，默认使用官方 registry：

```bash
COMPASS_NPM_REGISTRY=https://registry.npmmirror.com/ docker compose -f deploy/compose/compose.yaml --profile app up --build -d --wait
```

## 独立零售业务库

Feature 998 的 [离线工具](../tools/data-seed/README.md) 复用同一 PostgreSQL 实例，通过 `data:seed` 创建带 release 摘要的独立候选库及专用装载/只读账号。配置模板见 [retail-local.example.json](retail-local.example.json)，操作与受限连接边界见 [业务数据说明](../docs/data-seeding.md)。模板不含凭据，`state_directory` 以 Compass 根目录为基准；工作目录与生成数据不提交 Git。应用库和原三天 seed 不参与零售版本切换。

同库保留旧数据的对照模式使用 [retail-schema.example.json](retail-schema.example.json) 与 `publish-schema`；新 schema 使用独立装载角色和状态目录，详见业务数据说明的“语义版本与旧数据对照”。

## Web 独立部署

```bash
pnpm run deploy web
docker compose -f deploy/compose/compose.yaml --profile web run --rm web-migrate node apps/web/scripts/db-manage.mjs create-user --login-name local.admin --display-name 本地管理员 --platform-admin true
```

`web-migrate` 使用 Web Dockerfile 的 `database-tools` 阶段，拥有独立供应/迁移凭据；运行容器仅得到 Web runtime 连接。迁移成功后 `/readyz` 才就绪；不会自动创建账号或写教学 fixture。账号命令交互输入隐藏密码；打开 <http://127.0.0.1:3000/login>。已有库保留，供应拒绝未知角色/数据库。跨服务旧演示只在 `app` profile 下可用，失败不影响 Web 管理。

完整 SQL 与备份恢复见 [Web 数据库说明](../apps/web/db/main/README.md)。首次发布顺序为供应角色/库、独立迁移、受管建账号、启动 Web；恢复时切换到已验证且已撤销旧会话的新库。此 Compose 为 loopback 教学环境；共享环境自行供应私有数据库凭据、HTTPS 来源和备份/审计保留策略。
