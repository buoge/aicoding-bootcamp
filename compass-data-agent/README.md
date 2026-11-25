# Compass

电商经营分析 Agent；《企业级Agent工程架构实战营》的贯穿项目。产品名 **Compass**，工程名 `compass`，包命名空间 `@compass/*` / `compass-*`。

当前交付包括 **Web 工程基座与完整界面框架**，并保留 M0 工程链路：Turborepo + pnpm + uv，Next.js 前端与 BFF、FastAPI、PostgreSQL、Alembic、契约生成、测试与容器构建。通过合成经营数据验证 Web → BFF → API → 数据库链路。

产品、PRD、设计与交互原型统一维护在 [Feature 999 需求目录](mai-specs/999-compass-product-course-landing-app/README.md)。工程实施决策见 [ADR](docs/adr/0001-workspace.md)。学员脚手架仓库为 [shanggqm/compass](https://github.com/shanggqm/compass)，本次交付标签为 `v0.0.1`。仓库当前为 private，克隆需要访问权限。

## 获取 v0.0.1

先安装 Git LFS，再执行：

```bash
git lfs install
git clone --branch v0.0.1 https://github.com/shanggqm/compass.git
cd compass
```

`v0.0.1` 是整套学员脚手架的交付版本，各应用保留自身的包版本。

## 本地启动

需要 Node.js 24（验收版本见 `.node-version`）、pnpm 11.3.0、uv 0.13.0，以及运行中的 Docker Desktop。uv 根据 `.python-version` 获取 Python。Windows 使用 WSL2。

从本目录执行：

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm setup
pnpm doctor
pnpm db:up
pnpm db:provision -F web
pnpm db:migrate
pnpm db:seed
pnpm db:manage -F web -- create-user --login-name local.admin --display-name 本地管理员 --platform-admin true
pnpm dev
```

打开 <http://127.0.0.1:3000/login> 使用刚创建的账号登录；受管工具会提示隐藏输入密码。原链路演示位于 <http://127.0.0.1:3000/demo>。API 文档位于 <http://127.0.0.1:8000/docs>。在另一个终端执行 `pnpm smoke` 验证整个链路。停止开发服务使用 Ctrl+C；`pnpm db:down` 停止数据库并保留数据卷。

默认端口：home 3001、Web 3000、agent 8000、memory 8001、PostgreSQL 55432；worker 不监听 HTTP 端口。启动前确认端口空闲。`.env` 只由根任务脚本加载；绕过根入口直接运行子应用脚本或 `next start` 时需显式注入环境。不要把 `.env` 复制到 Web 目录或提交 Git。

根命令通过 Turborepo 筛选子应用。统一规范为 `pnpm <任务> -F <应用短名>`，短名从 workspace 的 `package.json` 包名自动解析，新增 app 无需登记别名：

```bash
pnpm dev -F home       # 只启动官网，端口 3001；只需 Node.js 与 pnpm
pnpm dev -F web        # 只启动 Web / BFF，仍加载根 .env
pnpm dev -F agent      # 推理后台，需要 uv 与 Python 环境
pnpm dev -F memory     # 记忆服务脚手架，端口 8001
pnpm dev -F worker     # Python 后台进程脚手架，无 HTTP 端口
pnpm build -F home     # 只构建官网，使用 Turbo 缓存
pnpm typecheck -F home
```

`pnpm dev` 启动全部五个应用；`pnpm dev -F home -F web -F agent` 只启动基础环境。支持 `-F home`、`--filter home`、`--filter=home` 和重复筛选；`-F '!home'` 排除对应应用。完整包名 `-F @compass/home` 和目录 `-F ./apps/home` 继续可用。依赖图、glob、Git 等复合 Turbo 筛选保持原生语法，其中包名写完整，如 `-F '@compass/web...'`。`--` 后面的参数直接交给子应用。

`pnpm -F home dev` 由 pnpm 直接调用子应用脚本，会绕过根环境加载及 Turbo 编排；日常使用上面的统一入口。新增应用必须遵守 [应用准入规范](apps/README.md)，短名冲突会报错，`pnpm check` 会自动验证所有 app 的短名启动入口。

## 检查与构建

```bash
pnpm check           # 格式、工程脚本、契约漂移、依赖边界、lint、类型检查和单元测试
pnpm format          # Prettier + Ruff 自动格式化
pnpm format:check    # 只检查格式，不修改文件
pnpm build           # 生成契约，构建 Next.js standalone 和 Python wheel/sdist
pnpm contracts       # Python DTO → OpenAPI / JSON Schema → Web TypeScript
pnpm contracts:check # 重新生成到临时目录，检测漂移，不改工作文件
pnpm test:tooling    # 验证任务转发、工具链隔离与 Turbo 依赖图
```

完整工程初次安装后先运行 `pnpm setup`；只开发 home 无需此步骤。数据库相关任务和网络 smoke 不缓存；构建和静态测试缓存包含实际工具链版本，Python 版本指纹仅影响三个 Python app、数据准备工具与契约任务。开发任务使用 `.env`，缓存任务不加载 `.env`。Web 的 build / typecheck 通过 Turbo 依赖根 contracts 任务；home 不触发契约生成。契约生成无需数据库、模型密钥或运行中的 API。

数据归属与 SQL 迁移遵循 [全项目规范](docs/database-migrations.md)：Web / BFF 负责账户、权限与通用配置等工程 CRUD；Agent 负责推理运行及相关状态；各 app 按逻辑数据库独立管理迁移、完整 SQL 与增量交付。Web 自有数据库使用独立迁移与 SQL 交付，见 [web/main](apps/web/db/main/README.md)。`pnpm db:migrate` 会运行 Web 与 Agent 已登记迁移；用 `-F web` 或 `-F agent` 明确选择目标。

编码风格与排除范围见 [编码规范](docs/coding-style.md)：前端使用 ESLint + Prettier，Python 使用 Ruff，跨编辑器使用 EditorConfig。以 Compass 根目录打开 VS Code / Cursor 并安装推荐扩展后，保存时自动格式化；仅开发前端可使用 `pnpm format:frontend`，无需 Python。

Claude Code 与 Codex 共用 [`.agents/hooks/`](.agents/hooks/README.md) 的 `PostToolUse` 配置，在编辑工具修改文件后自动执行单文件格式化。首次加载需重新开启会话；Codex 还需在 `/hooks` 中信任该 Hook。具体覆盖范围与客户端启用要求见 Hook 说明。

## 容器启动

从本目录执行：

```bash
pnpm run deploy        # 构建、迁移、启动并验证全部五个应用
pnpm run deploy home   # 仅部署指定应用；也可选 web / agent / memory / worker
pnpm deploy:status     # 查看状态，可追加 app 名称
pnpm deploy:logs web   # 查看最近日志
pnpm deploy:down       # 停止整个 Compose 项目，保留数据卷与镜像
```

`deploy` 与 pnpm 内置命令重名，必须写 `pnpm run deploy`。入口固定本机 Unix socket 与 Compose 项目，拒绝远程 Docker；已有开发进程占用端口或数据库不健康时提前失败。Web 先检查契约一致性，修改 DTO 后先执行 `pnpm contracts`；home 先生成分发素材。镜像构建完成后才停止所选应用，每次部署显式执行所属迁移，再启动并等待健康检查及 smoke。默认地址为 home 3001、Web 3000、Agent 8000、Memory 8001。

部署不读取根 `.env`，本地连接由 Compose 声明；不同应用独立选择，数据库按需启动，已有数据保留。首次 Web 登录账号仍需受管命令显式创建。要求 Node / pnpm、Docker Desktop；部署 Web 另需已有 Python 契约环境。失败退出非零，保留现场；详情及恢复边界见 [部署说明](deploy/README.md)。

## 工程结构

| 目录                                 | 职责                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------- |
| [apps/home](apps/home/README.md)     | 独立产品官网与课程指南，Next.js / React / TypeScript / shadcn/ui，端口 3001 |
| [apps/web](apps/web/README.md)       | Next.js App Router、页面、BFF、生成类型与网络响应校验                       |
| [apps/agent](apps/agent/README.md)   | FastAPI、运行相关数据、应用迁移及三天演示样本                               |
| [apps/memory](apps/memory/README.md) | FastAPI 记忆服务脚手架，独立健康检查与构建                                  |
| [apps/worker](apps/worker/README.md) | Python 后台进程脚手架，信号退出与独立构建                                   |
| [packages](packages/README.md)       | 共享包准入规则；达到两个 app 消费时才提取                                   |
| [contracts](contracts/README.md)     | 从 API DTO 生成的版本化网络契约                                             |
| [data](data/README.md)               | 已验收学员数据、Git LFS 压缩包与初始化说明                                  |
| [deploy](deploy/README.md)           | Compose 与每个 app 的镜像入口                                               |
| [tools](tools/README.md)             | 独立离线工具；业务数据生成、校验、导出与候选发布                            |
| [scripts](scripts/README.md)         | 契约、工具链、依赖边界与 smoke                                              |
| [docs](docs/README.md)               | 工程决策、验证记录与后续阶段边界                                            |

CI 由本仓库的 [Compass workflow](.github/workflows/compass.yml) 执行。

## 当前能力边界

- 示例接口显式启用 `COMPASS_DEMO_ENABLED=true` 后才开放，数据全部为固定合成数据。接口不接受租户、SQL 或自由代码输入；尚未接入真实经营数据。
- 本地登录、数据库会话、租户与成员、个人权限、CSRF、设置、通知和审计已接入；企业 OIDC、委托身份、Run / SSE、模型执行、Sandbox、EvalOps 留待后续 Feature。共享部署需配置 HTTPS、私有凭据及备份策略。
- Python 应用已创建：`agent`（原 agent-api）、`memory`、`worker`。memory 当前仅有服务健康检查，worker 仅有进程生命周期；普通分析 Runner、记忆业务、Temporal / Outbox 与共享执行包仍按 [实施任务](mai-specs/999-compass-product-course-landing-app/design/scaffold-design.md#8-部署收敛实施任务)推进。
- 当前 Web 已搭齐原型框架；分析、报告、看板及 Agent/Memory 业务页面为空页。实现及验收见 [995](mai-specs/995-web-management-foundation/README.md)。
- 本工程没有授予开源许可证；依赖许可证由各上游项目提供。

## 独立产品官网

运行 `pnpm dev -F home`，打开 <http://127.0.0.1:3001>。官网包含六个产品与课程说明页、绿色 GhostFibers 首屏和原型入口，无需 Python、数据库或模型密钥。生产构建用 `pnpm build -F home`；`dev:home` / `build:home` 保留为同一 Turbo 入口的快捷命令。详见 [home 运行说明](apps/home/README.md)。

## 合成零售业务数据

已验收的 111,055 单诊断数据保存在 [`data/retail/`](data/retail/README.md)，约 117 MiB 的压缩包通过 Git LFS 分发。先安装 [Git LFS](https://git-lfs.com/) 并执行 `git lfs install`，再克隆仓库。已有克隆在 Compass 根目录执行：

```bash
git lfs pull --include="$(git rev-parse --show-prefix)data/retail/compass-retail.sql.gz" --exclude=""
pnpm data:prepare
```

`data:prepare` 校验压缩包与解压 SQL，生成 `data/retail/compass-retail.sql`；仅需 Node.js / pnpm，无需 Python、数据库或重新生成数据。完整导入命令见 [学员初始化步骤](data/retail/README.md#导入)。`pnpm db:migrate -F agent` / `pnpm db:seed -F agent` 初始化三天工程样本，与完整零售数据入口分开。

`pnpm data:seed` 调用 [tools/data-seed](tools/data-seed/README.md) 的独立 Python 工具，提供 Feature 998 的业务包生成、校验、候选库装载和发布入口。支持边界小样、1 万单 dev、10 万单工程 demo 和固定机会量的 diagnostic；提供学员单文件 SQL 导出、固定业务历史、十二类场景输入和源侧只读权限。使用专用零售库配置，原 `pnpm db:seed` 保留。

命令、交付目录、参考时钟和失败回切见 [业务数据操作说明](docs/data-seeding.md)；实际验证记录见 [998 实施记录](mai-specs/998-business-data-seeding-tool/IMPLEMENTATION.md)。
