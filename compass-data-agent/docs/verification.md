# 脚手架验证记录

## 2026-10-26 · 独立业务数据准备工具

生成器与零售候选迁移已移入 `tools/data-seed/`，home 脚手架页同步。根 `pnpm check`、`pnpm build` 和实际 CLI 生成 / 校验 / 导出 / 快照重放通过；Docker 存储 I/O 错误阻断容器与真实 PostgreSQL 验证，11 项集成测试因无专用凭据跳过。完整范围、证据与待验项见 [998 本次实施记录](../mai-specs/998-business-data-seeding-tool/IMPLEMENTATION.md#独立数据准备工具迁移2026-10-26)。

## 2026-10-26 · 本机 Docker 部署入口

[Feature 994 实施与验证记录](../mai-specs/994-local-docker-deploy/IMPLEMENTATION.md) 为本次证据真源。根部署命令、五应用选择、home 镜像和官网 CI/CD 说明已交付；项目 check/build、56 项工具测试及 home standalone smoke 通过。实际 Docker 部署受已有容器磁盘 I/O 错误和开发端口占用阻碍，容器验收保持待完成。

## 2026-10-26 · Web 工程基座与完整界面框架

[Feature 995 实施与验收记录](../mai-specs/995-web-management-foundation/IMPLEMENTATION.md) 为本次证据真源，含 21 项 AC、环境、命令及日志；[代码评审](../mai-specs/995-web-management-foundation/review/code_review.md)记录 C01–C07 修复和复核结论。

- 本地身份/数据库会话、租户与空间、直接成员/个人权限、设置、通知、总览和 Web 审计已交付，原型完整导航与页面框架接入真实应用。Agent/Memory 业务保持空页。
- `pnpm check`、`pnpm build` 通过；Web 19 项单元/边界测试、15 项真实 PG 集成测试、12 项生产容器浏览器测试通过；全 profiles smoke、独立 Web、迁移/完整 SQL/恢复和受管账号实际创建登录通过。
- 生产浏览器运行时 Agent、Memory、Worker 停止。375/390/768/900/1440px 及原型截图对照已检查；后台端口冲突使用隔离映射，保留用户原有进程与数据。
- 远程 CI 未触发；原零售数据库 11 项测试缺专用凭据而跳过，本次不计为通过。剩余传递依赖扫描告警及当前不可达依据见代码评审，不宣称全依赖零告警。

## 2026-10-25 · Python 三应用脚手架

- `apps/agent-api` / `compass_api` 已迁移为 `apps/agent` / `compass_agent`；新增 Memory FastAPI 入口与 Worker asyncio 常驻进程。三个 app 均接入 uv workspace、Turbo 独立任务、Ruff / Pyright / pytest、wheel / sdist 和非 root 容器。已有业务代码经改动前快照核对，仅名称、任务入口及必要格式调整。
- `uv sync --locked --all-packages`、`pnpm install --frozen-lockfile` 通过；锁文件仅变更本地应用成员，现有第三方依赖版本保持不变。`pnpm check` 通过：11 项工程工具测试、home 16 项、Web 9 项、Agent 37 项、Memory 1 项、Worker 2 项；五个 app 的格式、lint 与类型检查，以及契约一致性、workspace 依赖边界通过。
- 默认 Agent 测试跳过 11 项需显式凭据的 PostgreSQL 集成测试；另在本次新建的隔离 Compose 项目 `compass-scaffold-check` 中执行这 11 项，全部通过，覆盖真实账号、迁移、数据装载、发布、失败恢复与回切。未使用用户零售库连接。
- `pnpm build` 通过：两个 Next.js app 生产构建及三个 Python app 的 wheel / sdist 完成；`pnpm data:seed --help` 正常进入迁移后的 CLI。
- 通过根 `pnpm dev -F agent / memory / worker` 分别实际启动，使用临时端口检查 HTTP 入口并停止进程；worker 验证启动日志和正常退出。单元测试另覆盖 SIGINT / SIGTERM 两种信号。
- 三个 Python 镜像与 Web 镜像构建成功；Compose 的迁移 / seed、Agent / Memory / Web 健康检查通过。容器版 `pnpm smoke --memory` 验证 Web → BFF → Agent → PostgreSQL 合成数据及 Memory readiness。Worker 容器收到停止信号后退出码为 0。
- 服务拆分使官网系统模型包含跨服务逻辑引用；同步解析与展示，保留 REF 标识，Memory 内部外键继续按 FK 展示。模型保留 94 张表、1,091 字段、344 条关联，其中 14 条为逻辑引用；新增拒绝丢失引用、目标错配和误标 FK 的回归检查。
- 官网十二域的完整字段 / 关键字段共 24 张图在 Chromium 中实际解析、渲染通过，节点与关系数量保持完整；27 份关联文档的 309 个内部链接、36 个锚点与两个 manifest 的 51 个登记路径有效。`git diff --check` 及新增 app / 容器文件空白检查通过。
- 课程根 `npm test` 通过。CI 已同步三应用容器与 Memory smoke；本次验证在本机执行，尚未触发远程 CI。

验证后已停止本次启动的本地进程与隔离容器，清理本次创建的测试卷和网络；用户原有开发服务与数据卷保留。

本次范围为工程脚手架：Memory 只返回标明 `stage=scaffold` 的健康信息，Worker 尚无消费者；普通分析 Runner、记忆存储 / 检索 / 编辑、Runtime 工具与持久编排仍待实施。FastAPI TestClient 保留既有 HTTPX 弃用提示，未放宽检查规则。

## 2026-10-22 · 统一编码风格配置

- 新增根 EditorConfig、Prettier 与 VS Code / Cursor 设置；两个前端接入 `eslint-config-prettier`，ESLint 要求零 warning。Ruff 显式固定 4 空格、双引号、LF，API lint 扩展到两套迁移，根 Python 工程脚本加入 `lint:tooling`。配置入口见 [编码规范](coding-style.md)。
- `pnpm install --frozen-lockfile`、`pnpm format:check`、`pnpm lint:tooling`、契约一致性与 workspace 边界检查通过。格式检查已接入根 `pnpm check`，现有 CI 随之执行。
- `pnpm check` 中工具测试 10 项、home 测试 3 项、Web 测试 9 项，以及三个应用的 lint、两个前端的类型检查通过。整体检查失败：既有 `apps/agent-api/src/compass_api/data_seed/access.py` 第 197、200、204、212 行出现 4 处 `reportOptionalSubscript`；`fetchone()` 的返回值可能为 `None`。该 Python 文件与改动前完全一致，本次保留该问题，未放宽类型规则。
- stdin 正反例验证通过：两个前端接受规范 TSX，拒绝条件调用 Hook 与显式 `any`；Prettier 拒绝不规范排版并接受规范输入；Ruff 拒绝未排序导入、未使用导入、未定义名称与不规范缩进。
- 完整检查中断后单独运行 `pnpm test -F agent-api`：36 项通过；11 项 PostgreSQL 集成测试因未提供专用测试连接而跳过。保留一条既有 TestClient / HTTPX 弃用提示。
- 与改动前快照比对，62 个已有文件仅发生 Prettier 格式调整；其他文件按明确配置和说明变更处理。生成契约、外部输入、临时输出和上游 React Bits 源文件均验证为格式化排除项。
- `pnpm build -F home`、课程根 `npm test`、`git diff --check` 和受影响文档链接 / manifest 路径检查通过。官网工程规范说明同步至实际配置。

## 2026-10-21 · 应用短名启动规范

- `pnpm dev -F home` 实际启动通过，Turbo 只选择 `@compass/home`，Next.js 就绪；`http://127.0.0.1:3001` 返回 HTTP 200。验证后停止本次启动的服务，释放端口。
- `pnpm test:tooling`：10 项通过，覆盖各类短名参数、排除筛选、未知名和重名错误、原生复合筛选透传、新 workspace app 自动发现，以及全部现有 app 的真实 pnpm / Turbo dry-run。
- 新增 app 的目录、包名短名、唯一性与 dev 脚本由工具测试自动校验，随 `pnpm check` 执行；规范见 [应用 README](../apps/README.md)。
- 课程根 `npm test`、`git diff --check` 和受影响文档链接检查通过。

## 2026-10-20 · Turbo 任务入口调整

- `pnpm test:tooling`：5 项通过；隔离目录不提供 uv / Python，验证 home 任务转发和环境行为；真实 Turbo dry-run 验证 home 无契约依赖、Web build / typecheck 共享一次契约生成。
- `pnpm check`：契约一致性、依赖边界、三个应用的 lint / typecheck / test 全部通过；工具脚本 5 项、home 3 项、Web 9 项、API 5 项测试通过。
- `pnpm build`：home / Web 的 Next.js 生产构建及 API wheel / sdist 全部通过；契约任务执行一次，Web 构建等待其完成。
- `pnpm dev:home --dry-run=json`：快捷入口只选择 `@compass/home#dev`，保持不缓存、常驻任务配置。
- `pnpm build:home`：只选择 home，复用统一入口产生的构建缓存，结果为 `1 cached, 1 total`。
- 课程根 `npm test`、`git diff --check`、受影响 Markdown 链接与 manifest 路径检查通过。

本次未重启已有开发服务，也未重跑数据库或容器 smoke。API 测试仍有下文记录的上游 HTTPX 弃用提示。

## M0 基线验收

日期：2026-10-15。范围：Compass M0 工程脚手架；完整产品功能按后续里程碑实现。

## 已验证

| 项目                      | 证据 / 复现入口                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------ |
| Node 依赖冻结安装         | `pnpm install --frozen-lockfile` 通过                                                                  |
| Python workspace 冻结安装 | `uv sync --locked --all-packages` 通过                                                                 |
| 契约一致性                | `pnpm contracts:check`；Python DTO → OpenAPI / JSON Schema → TS 无漂移                                 |
| 工程检查                  | `pnpm check`；lint、TypeScript、Pyright、跨 app 导入与双依赖图检查通过                                 |
| 单元测试                  | Python 5 项 + Web 9 项通过；包含 seed 幂等、空库、关闭演示、依赖故障、契约错误和 BFF 错误边界          |
| 生产构建                  | `pnpm build`；Next.js standalone、Python wheel / sdist 通过                                            |
| PostgreSQL                | `pnpm db:up`、`pnpm db:migrate`、`pnpm db:seed` 通过；重复 seed 不增加记录；`alembic check` 无模型漂移 |
| 环境诊断                  | `pnpm doctor` 全部通过                                                                                 |
| 本机端到端                | `pnpm smoke` 通过；Web → BFF → API → 实际 PostgreSQL 返回三天合成数据                                  |
| 浏览器交互                | Chrome 点击“查看示例数据”，显示 ¥40,000、397 笔、3 天；页面排版检查通过                                |
| API 容器                  | Dockerfile 构建、非 root 运行、迁移一致性检查与 PostgreSQL 查询通过；生产依赖使用 uv frozen 安装       |
| Web 容器                  | Next.js standalone 镜像构建、浏览器静态资源加载与交互通过                                              |
| 完整 Compose              | 单次迁移 / seed → API healthy → Web healthy；容器版 `pnpm smoke` 通过                                  |
| 课程仓库                  | 根 `npm test`、`git diff --check`、受影响链接与 manifest 路径检查通过                                  |

本机验收：macOS arm64，Node 24.12.0、pnpm 11.3.0、uv 0.13.0、Python 3.13.16；API 镜像使用摘要固定的 Python 3.13 基础镜像（实际解释器 3.13.11），Web 镜像固定 Node 24.16.0。Python workspace 支持 3.13 系列，缓存按实际版本隔离。

## 限制与环境说明

- 当前 API 测试依赖组合有一条上游 TestClient 关于 HTTPX 的弃用提示，测试正常通过；后续更新测试客户端依赖时处理。
- Docker Hub 在本机配置的镜像源返回 403。数据库采用摘要固定的已有 pgvector 镜像，Python 基础镜像使用可正常获取的官方 uv GHCR 镜像；没有修改全局 Docker 镜像源。
- CI 工作流已写入课程根 `.github/workflows/compass.yml`，尚未推送触发 GitHub 托管运行。
- Web 容器构建使用 `COMPASS_NPM_REGISTRY=https://registry.npmmirror.com/` 完成验证。官方 npm 源的大包下载多次超时；镜像安装复用缓存，依赖版本与锁文件 integrity 校验保持一致。默认 registry 仍为官方源，替换方式见部署说明。
- 验证后已停止本次开发服务与 Compose 服务，保留 `compass_postgres-data` 示例数据卷。按 README 可重新启动。
