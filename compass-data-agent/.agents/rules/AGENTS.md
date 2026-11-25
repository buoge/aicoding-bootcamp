# AGENTS.md

本文件记录 Compass 的项目事实、开发入口和长期约束；命令与行内路径均以 Compass 根目录为基准。

## 1. 项目概况

| 项目     | 说明                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 项目     | Compass 电商经营分析 Agent，《企业级Agent工程架构实战营》的贯穿项目；工程名 `compass`，已交付 Web 工程基座与完整界面框架，保留 M0 工程链路。 |
| 技术栈   | Node.js 24、Next.js 16.4.1、React 19.3、TypeScript；Python 3.13、FastAPI、SQLAlchemy、psycopg、Alembic；PostgreSQL 17。                      |
| 架构     | pnpm + uv 双语言 workspace，Turborepo 编排；`home`、`web`、`agent`、`memory`、`worker` 五个应用按部署职责分离。                              |
| 工程取舍 | 按实际需求逐步建设，先验证 HTTP 契约与工程链路；共享包须有至少两个独立 app 的真实消费者。                                                    |

本仓库为 Compass 学员脚手架，远程地址为 https://github.com/shanggqm/compass；CI 入口位于 `.github/workflows/compass.yml`。

## 2. 仓库结构

| 目录                  | 职责与关键入口                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `apps/`               | 五个应用，准入规则见 [应用说明](../../apps/README.md)。                                                                |
| `apps/home/`          | 独立官网与课程指南；`src/app/` 页面，`src/components/` 交互，`scripts/prepare-assets.mjs` 派生分发素材。               |
| `apps/web/`           | 产品 Web / BFF；`src/server/modules/` 身份/权限/审计/通知，`db/main/` 独立迁移；`src/generated/` 保留 Agent 演示契约。 |
| `apps/agent/`         | 推理与 Runtime 后台；`src/compass_agent/` 演示 API 与运行状态，`migrations/` 管理应用库，`seed.py` 初始化三天样本。    |
| `apps/memory/`        | `src/compass_memory/` 独立记忆服务脚手架，目前提供健康检查。                                                           |
| `apps/worker/`        | `src/compass_worker/` 后台进程脚手架，目前提供 asyncio 生命周期和信号退出。                                            |
| `packages/`           | 共享包准入说明；达到复用条件后再提取代码。                                                                             |
| `contracts/`          | 从 Agent DTO 和路由生成的 OpenAPI / JSON Schema。                                                                      |
| `deploy/`             | `compose/` 本地服务编排、`containers/` 应用镜像、零售部署配置模板。                                                    |
| `tools/data-seed/`    | 独立离线业务数据准备工具；生成、校验、导出、候选发布与零售迁移，纳入 workspace 检查。                                  |
| `scripts/`            | 根任务编排、契约生成、workspace 边界检查、环境诊断、smoke 与数据工具入口。                                             |
| `docs/`               | `adr/` 工程决策，以及编码规范、验证记录、业务数据操作说明。                                                            |
| `mai-specs/`          | SDD 需求、设计、评审、测试与实施记录，按 `NNN-<slug>/` 管理。                                                          |
| `.agents/`            | 项目 AI 资产：`skills/`、`prompts/`、`agents/`、`rules/`；`.generated/` 为工具派生产物。                               |
| `.codex/`、`.cursor/` | 工具使用的 Agent / Skill 适配入口。                                                                                    |
| `.my-ai-infra/`       | 本地 AI 资产安装状态；选择配置为根 `.my-ai-infra.json`。                                                               |
| `.vscode/`            | 项目共享编辑器设置与推荐扩展。                                                                                         |
| `work/`               | 临时文件、生成数据与私有部署记录，不提交 Git。                                                                         |

`node_modules/`、`.venv/`、`.turbo/`、`.pytest_cache/`、`.ruff_cache/` 是本地依赖或缓存；应用的 `.next/`、`dist/`、`out/` 等为构建产物，均不作为编辑源。

## 3. 开发命令

| 操作           | 命令                                                                                        | 说明                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 安装依赖       | `pnpm install --frozen-lockfile`；`pnpm setup`                                              | 后者执行 uv 锁定安装全部 Python 包并生成契约；仅开发 home 可省略。                                                     |
| 环境诊断       | `pnpm doctor`                                                                               | 检查 Node、pnpm、uv、Docker Compose 与 daemon。                                                                        |
| 启动数据库     | `pnpm db:up`                                                                                | 启动本地 PostgreSQL，宿主机端口 55432。                                                                                |
| 初始化应用数据 | `pnpm db:migrate`；`pnpm db:seed`                                                           | 首次先执行 `pnpm db:provision -F web`；迁移 Web/Agent，默认 seed 只写 Agent 三天样本；按 `-F` 选择应用。               |
| 开发           | `pnpm dev`；`pnpm dev -F home`                                                              | 前者启动全部五个应用；`-F` 可选 `home`、`web`、`agent`、`memory`、`worker`，支持重复筛选。                             |
| 应用检查       | `pnpm lint -F <短名>`；`pnpm typecheck -F <短名>`；`pnpm test -F <短名>`                    | 使用对应 app 的 ESLint / Ruff、TypeScript / Pyright、Node test / Vitest / pytest。                                     |
| 综合检查       | `pnpm check`                                                                                | 工具测试、格式、脚本 lint、契约漂移、依赖边界及应用 lint / 类型 / 测试。                                               |
| 工具入口测试   | `pnpm test:tooling`                                                                         | 验证短名、参数透传、环境隔离与 Turbo 依赖图。                                                                          |
| 格式检查与修复 | `pnpm format:check`；`pnpm format`                                                          | 前者只检查，后者修改文件；仅前端可用 `pnpm format:frontend`。                                                          |
| 契约生成与检查 | `pnpm contracts`；`pnpm contracts:check`                                                    | 前者更新生成文件，后者在临时目录重新生成并比对，无需数据库或运行中的 API。                                             |
| 构建           | `pnpm build`；`pnpm build -F <短名>`                                                        | 构建 Next.js 与 Python 分发包；Web build / typecheck 自动先生成契约。                                                  |
| 本机部署       | `pnpm run deploy [app]`；`pnpm deploy:status`；`pnpm deploy:logs [app]`；`pnpm deploy:down` | 省略 app 部署全部五个应用；仅本机 Docker，按序构建、迁移和验收，停止保留数据卷。                                       |
| 链路检查       | `pnpm smoke`；`pnpm smoke --memory`                                                         | 需要已启动的 Web、Agent 与已迁移且已 seed 的数据库；后者另验证 Memory 健康检查。                                       |
| 业务数据工具   | `pnpm data:seed <子命令>`                                                                   | 生成、校验、发布、回切和 SQL 导出参数见 [数据操作说明](../../docs/data-seeding.md)；发布会创建数据库 / schema 和账号。 |
| 停止数据库     | `pnpm db:down`                                                                              | 保留数据卷；完整 app profile 的启停见 [部署说明](../../deploy/README.md)。                                             |

- 所有命令从 Compass 根目录执行。工具版本以 `.node-version`、`.python-version`、`package.json` 和两份锁文件为准；当前 pnpm 为 11.3.0，uv 在 README 与 CI 中固定为 0.13.0。macOS / Linux 可直接运行，Windows 使用 WSL2。
- 完整本地开发先从 `.env.example` 创建根 `.env`。根运行入口加载它；缓存构建与静态检查不加载它。绕过根入口执行子应用脚本时需显式注入所需环境。
- 使用 `pnpm <任务> -F <短名>`；`pnpm -F <短名> <任务>` 会绕过根环境加载与 Turbo 编排。`--` 后的参数直接传给子应用；复合 Turbo 选择器中的包名写完整。
- 默认端口：home 3001、Web 3000、agent 8000、memory 8001；worker 不监听 HTTP。home 仅需 Node / pnpm，Web 的 build / typecheck 需要 Python 契约生成环境。

## 4. 规则与约束

### 业务规则

- 演示接口只返回固定合成数据，需显式设置 `COMPASS_DEMO_ENABLED=true`；关闭时返回 404，不接收租户、SQL 或自由代码输入。
- `db:seed` 必须保持幂等；空数据、数据库不可用或缺少迁移时不得报告查询成功。`/healthz` 只检查进程，Agent `/readyz` 检查数据库与初始表。
- BFF 对上游数据做 JSON Schema 运行时校验；成功和失败响应均 `no-store`，上游失败或契约不兼容统一返回 503，隐藏内部错误详情。
- 本地登录、数据库会话、租户与个人权限、设置和 Web 通知/审计已接入；OIDC、Run / SSE、模型执行、Sandbox 与 EvalOps 尚未交付；Memory 健康检查和 Worker 存活只代表脚手架入口可用，不能表述为记忆业务或任务消费已就绪。
- 涉及零售数据时遵守 [数据操作说明](../../docs/data-seeding.md)：保持可复现摘要与私有运行记录分离，保留旧库和旧活动清单；合成结果不用于宣称真实市场因果关系。

### 架构边界

- 禁止跨 app 导入源码；已有 Web → Agent 链路通过 HTTP 契约通信。单 app 的 UI、客户端和配置留在 app 内；UI 与 BFF 计为同一个消费者。
- 新共享包须记录公开入口、维护人、兼容策略和测试命令；Python workspace 与 `package.json` 的内部依赖必须同步声明。
- Web / BFF 直接负责账户、租户、成员、角色、权限及通用配置等工程 CRUD，拥有自有数据库；Agent 负责 Runtime 推理、工具执行、分析状态及运行相关配置；Memory 拥有记忆数据。Web 持久化与迁移入口见 [Web 运行说明](../../apps/web/README.md)，Agent/Memory 业务页继续为空页。
- 全项目数据库规则见 [数据所有权与 SQL 迁移规范](../../docs/database-migrations.md)：按 `<app>/<database-key>` 独立管理迁移源、版本、凭据、完整 SQL 和增量 SQL；跨 app 禁止直连对方业务表、跨库外键和跨库事务假设。Worker 默认通过所有者 API 提交业务状态。
- 当前 Agent HTTP 契约唯一源为 `apps/agent/src/compass_agent/schemas.py` 与 FastAPI 路由；修改源后运行 `pnpm contracts`，禁止手改 `contracts/*.json` 和 `apps/web/src/generated/`。
- 数据库变更必须在 SDD 设计登记 owner、起止版本、源路径、SQL 交付、发布与恢复顺序；实现同步模型与派生 SQL，评审核对不可变历史，验收验证空库、旧库、权限、生成一致性和恢复。此规则适用于 simple / standard；需求目录链接迁移真源，不另建可编辑副本。首次接入数据库时同时交付工具入口，禁止虚构命令或声称尚未实现的 CI 门禁已生效。
- 应用迁移与零售迁移使用独立入口和版本表；API 导入、契约导出及启动不隐式迁移 schema。零售工具使用专用 `COMPASS_RETAIL_*` 配置，禁止复用应用 `DATABASE_URL`。
- Memory 持久化接入时由该 app 管理独立 schema、账号与迁移，不读取 Agent 数据库配置。Worker 后续接入业务时仍遵守跨 app 导入边界。

### 工程约定

- 新应用使用 `apps/<短名>` 与 `@compass/<短名>`，短名与目录名相同且 workspace 内唯一；提供独立 `dev`、`lint`、`typecheck`、`test` 入口，禁止靠手工别名表或专用根脚本完成注册。
- 编码规则以根 EditorConfig、Prettier、Ruff 配置和应用 ESLint / TypeScript 配置为准；前端 `strict`、ESLint 零 warning，Python Pyright `standard`。Python 子项目自定义 Ruff 时须通过 `extend` 继承根配置。
- 保持运行任务与缓存任务分离：开发、迁移、seed、契约生成和网络 smoke 不缓存；缓存检查 / 构建使用实际工具链指纹，Python 指纹不应阻断 home 独立运行。
- home 的 `public/prototype/` 与脚本派生的 `public/resources/` 文件从规范源生成；修改对应源文档、SQL 或生成脚本，具体清单见 [home README](../../apps/home/README.md)。独立发布副本和已有数据源码快照不作为日常编辑源。
- 中文直接陈述结论，并遵守上层课程仓库对否定与转折配对句式的限制；新增课程名称使用《企业级Agent工程架构实战营》。

### 安全与权限

- `AGENT_API_URL` 等内部连接配置只在 Web 服务端读取，保持 `server-only` 隔离。根 `.env` 不复制到 Web 目录，不提交密钥、私有候选账号或真实个人数据。
- 演示账号仅供本地，Compose 宿主机端口绑定 `127.0.0.1`；当前应用缺少正式鉴权体系，共享环境需引入正式权限并分离迁移与运行凭据。
- 零售发布的管理员、装载账号、受限只读账号保持分离；受限查询按 `session_user` 绑定租户与区域，成本权限不足应拒绝查询，不能按零成本处理。
- 数据工具不覆盖未知既有目标；活动版本切换保留期望版本与锁校验，失败候选清理和旧版本回切使用显式入口。删除数据卷仅用于明确要求的重置，禁止顺带清理旧库或旧 schema。

## 5. 验证要求

按改动范围选择检查，完整集成验收保持 [Compass CI](../../.github/workflows/compass.yml) 的门禁。

| 变更类型                                  | 必须执行的验证                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文档与规则                                | `git diff --check`；核对受影响内部链接、manifest 路径和命令定义；对本次文件做 Prettier 检查。`.agents/` 在默认格式排除范围内，本正文使用 `pnpm exec prettier --check --ignore-path /dev/null .agents/rules/AGENTS.md`。                                                                   |
| 单应用代码                                | 对受影响 app 执行 `pnpm lint -F <短名>`、`pnpm typecheck -F <短名>`、`pnpm test -F <短名>`；涉及构建或分发时加 `pnpm build -F <短名>`。                                                                                                                                                   |
| workspace、任务脚本、共享配置或跨应用集成 | `pnpm check`、`pnpm build`；新增 app 的短名准入由其中的 `pnpm test:tooling` 自动验证。涉及上层课程仓库工具时，另在课程根执行 `npm test`。                                                                                                                                                 |
| DTO、路由或网络契约                       | `pnpm contracts` 后执行 `pnpm contracts:check`，运行 Agent 与 Web 的检查 / 测试，验证生成类型与运行时响应校验。                                                                                                                                                                           |
| 应用数据库、迁移或 seed                   | 按 [数据库规范](../../docs/database-migrations.md)验证受影响 app 的空库安装、旧库升级、SQL 一致性、权限及恢复。现有 Agent 另执行 `pnpm db:migrate -F agent`、重复 `pnpm db:seed -F agent` 与 `pnpm smoke`；Web 执行已登记的专用 PostgreSQL 集成与浏览器入口，SQLite 不能替代 PostgreSQL。 |
| 零售数据生成、发布或权限                  | `pnpm test -F data-seed` 与 `pnpm check`；发布 / 权限变更另设置专用 `COMPASS_RETAIL_TEST_ADMIN_URL` 后执行 `pnpm test:integration -F data-seed`，该测试会创建候选库与账号。                                                                                                               |
| 容器与部署                                | 按部署说明构建并启动对应 profiles，运行 `pnpm smoke`；涉及 Memory 时使用 `pnpm smoke --memory`，Worker 另验证日志与正常信号退出。                                                                                                                                                         |

CI 依次执行冻结安装、`pnpm check`、`pnpm build`、`pnpm run deploy` 五应用容器部署及内置 smoke。零售 PostgreSQL 集成测试在缺少专用凭据时跳过，跳过不能计作通过；报告实际执行结果与未验证项，不用历史验证记录代替本次证据。

## 6. 知识与参考

| 内容                  | 查阅入口                                                                   |
| --------------------- | -------------------------------------------------------------------------- |
| 启动流程与项目边界    | [根 README](../../README.md)                                               |
| 工程决策与历史背景    | [workspace ADR](../../docs/adr/0001-workspace.md)                          |
| 编码规则与格式排除    | [编码规范](../../docs/coding-style.md)                                     |
| 应用与共享包准入      | [应用说明](../../apps/README.md)、[共享包说明](../../packages/README.md)   |
| HTTP 契约与任务编排   | [契约说明](../../contracts/README.md)、[工程脚本](../../scripts/README.md) |
| 数据所有权与 SQL 迁移 | [全项目数据库规范](../../docs/database-migrations.md)                      |
| 数据发布、权限与回切  | [业务数据操作说明](../../docs/data-seeding.md)                             |
| 容器与验证证据        | [部署说明](../../deploy/README.md)、[验证记录](../../docs/verification.md) |

ADR 的日期条目保留当时的实施背景；当前五应用结构见应用 README 与 `manifest.yml`。目标设计、历史验收与当前实现分别核对，发现契约冲突时记录差异。

## 7. 维护约定

- 根 `AGENTS.md` 通过软链接指向 `.agents/rules/AGENTS.md`；编辑真实正文并保留链接，Markdown 链接按正文真实位置解析。该目录沿用现有 `.gitignore` 的本地记忆配置；没有共享正文的 `CLAUDE.md`。
- 修改 Next.js 应用前先读 [web 局部规则](../../apps/web/AGENTS.md) 或 [home 局部规则](../../apps/home/AGENTS.md)，按其要求查阅该 app 安装的 Next.js 文档，保留受管区块；home 的视觉与交互细则留在其 README。
- 命令、目录、应用职责或交付边界变化时，同步相关 README、规范入口和受影响的 `manifest.yml`；生成契约随源一起更新。保留无关未提交修改，不用本次初始化顺带清理历史资产。
- 需求和任务材料放入 `mai-specs/NNN-<slug>/`，依 [SDD 工作区说明](../../mai-specs/README.md) 使用 Feature 初始化入口与有效路径契约；当前任务进度不写入长期记忆。所有承诺条件有当前通过证据后才结项。
- AI 资产按 [项目 AI 资产说明](../README.md) 维护；课程级软链接只有一份真源，修改前确认作用域。Skill 行为变化需同步相应 Eval；工具生成目录不作为唯一编辑源。
