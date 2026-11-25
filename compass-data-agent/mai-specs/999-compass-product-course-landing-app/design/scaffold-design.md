---
id: dataagent-scaffold-design
title: DataAgent 项目脚手架设计
type: scaffold-design
scope: cross-course-learner-project
status: review
owner: guomeiqing
updated: 2026-10-25
sources:
  - learner-kit/code/compass/mai-specs/999-compass-product-course-landing-app/design/TECH_DESIGN.md
  - docs/course-repository-governance.md
---

# DataAgent 项目脚手架设计

> 2026-10-15 实施登记：产品名 Compass，M0 工程脚手架见 [compass/README.md](../../../README.md)。下文保留完整目标设计及 2026-09-16 的方案背景；实际完成范围与验证见 Compass 工程。

## 1. 工程形态

**独立 DataAgent 仓库，采用 Turborepo + pnpm workspace + uv workspace 的多语言 Monorepo。** `apps/` 对应可独立启动和部署的应用；`packages/` 收纳被两个及以上 app 复用的组件、库或配置；应用内部模块按业务能力组织。

Turborepo 是任务编排与构建缓存工具，不管理线上服务。pnpm 管 Node 依赖和 workspace 图，uv 管 Python 依赖、环境与锁文件，Docker Compose 管本地运行环境。Turbopack 是 Next.js 的打包器，与 Turborepo 不是同一层工具。[Turborepo 结构约定](https://turborepo.com/docs/crafting-your-repository/structuring-a-repository)

当前课程仓库保存产品、技术设计和教学资料。依照 [仓库治理 §11.3](../../../../../../docs/course-repository-governance.md)，运行工程独立演进后，在本目录 README / manifest 登记仓库 URL、固定 commit/tag、构建命令及兼容课次。运行工程已存在于 Compass 根目录，本次增量修订目标设计；当前实施范围以工程 README 为准。技术取舍见 [技术架构](TECH_DESIGN.md)。

## 2. 目标目录

2026-10-25 按用户要求收敛部署边界：目标 app 为 `home`、`web`、`agent`、`memory`，后台持久任务按需启用 `worker`。M0 默认运行只需前三项；memory 业务随 FR-12 启用，worker 业务随定时 / 离线 / 恢复需求启用。Dispatcher 与 Sandbox 控制逻辑为内部模块。后续脚手架指令已落实：`apps/agent-api` 迁移为 `apps/agent`，memory / worker 均已有独立可运行的 Python 入口与工程配置。下图包含尚待实现的领域模块、迁移与共享包；实际目录以各 app README 为准，不预建无消费者的共享包。

当前开发命令 `pnpm dev` 会启动全部五个 App；只运行基础示例链路时使用 `pnpm dev -F home -F web -F agent`。`pnpm smoke` 检查 Web → Agent → PostgreSQL，增加 `--memory` 检查已启动的 Memory 脚手架就绪；Worker 无 HTTP 端口，通过进程日志、退出状态及生命周期单测验证。官网脚手架页同步呈现当前范围，尚未接入的业务能力继续按下文任务推进。

```text
compass/
├── apps/
│   ├── home/                          # 独立官网，已存在
│   ├── web/                           # 前端、BFF 与工程 CRUD；持久化待接入
│   │   └── db/main/                   # 首个数据库需求创建；迁移源及完整/增量 SQL
│   ├── agent/                         # 已完成名称迁移；保留既有 API 与三天工程样本
│   │   ├── src/compass_agent/
│   │   │   ├── api/                   # 委托鉴权、推理命令、查询与 SSE
│   │   │   ├── runtime/               # Harness、本地 supervisor、分派与有界执行池
│   │   │   ├── delivery/              # 持久 profile 的 Outbox relay
│   │   │   └── adapters/              # 模型、Query、Sandbox 控制与 Memory Tools
│   │   ├── migrations/                # agent schema 唯一迁移源
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── package.json
│   ├── memory/                        # 已有 FastAPI 脚手架；记忆业务随 FR-12 启用
│   │   ├── src/compass_memory/         # API、提取、检索、版本、确认与删除
│   │   ├── db/main/                   # 记忆持久化接入时登记迁移源、SQL 与索引
│   │   ├── tests/
│   │   ├── pyproject.toml
│   │   └── package.json
│   └── worker/                        # 已有 asyncio 进程脚手架；任务消费待接入
│       ├── src/compass_worker/        # Temporal Workflow / Activity、后台任务入口
│       ├── tests/
│       ├── pyproject.toml
│       └── package.json
├── tools/data-seed/                  # 独立离线零售数据准备工具
│   ├── src/compass_data_seed/         # 生成、校验、SQL 导出及发布
│   ├── migrations/                   # 零售候选库迁移，与应用迁移独立
│   └── tests/                        # 离线及 PostgreSQL 集成测试
├── packages/                          # 有两个真实消费者再创建
│   └── agent-core/                    # agent + worker 共用的执行与领域逻辑
├── contracts/                         # agent / memory 导出的版本化网络契约
├── sandbox/                           # 隔离执行器镜像与限制策略，按实际使用创建
├── evals/                             # Case / Trial / Grader，按阶段创建
├── deploy/                            # 默认环境；memory / durable 按需启用
├── scripts/                           # 工具链、契约、smoke、数据工具
├── docs/                              # ADR 与实施验证
├── package.json / pnpm-workspace.yaml / pnpm-lock.yaml / turbo.json
└── pyproject.toml / uv.lock
```

agent 内部协程、线程与子进程池随同一个服务启停。Sandbox executor 保持权限隔离；控制逻辑不新增 gateway app。memory 拥有记忆数据与迁移，通过 HTTP 工具调用，agent / worker 不直接读其数据库。双方共享 PostgreSQL 实例也须使用不同 schema / 账号。

worker 引入时再提取两处实际使用的 Harness、模型 / 工具适配与契约；Temporal SDK 留在 worker 的编排适配层。agent-core 的纯领域部分不依赖供应商 SDK；内部适配模块可封装 SDK，公开端口不泄露 SDK 类型。memory 专有提取 / 检索 / 存储不进入 agent-core。Web 管理工程实体迁移，Agent 管理推理业务迁移，Memory 管理记忆迁移；Worker 默认通过 owner API 提交状态，不直连其他 app 的业务表。各 app 可独立数据库实例，目录与 SDD 交付遵守 [数据库规范](../../../docs/database-migrations.md)。

## 3. 共享包准入与依赖方向

| 资产                                       | 起步位置                                 | 提取到 packages 的条件                                             |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------ |
| Run / Step / Decision / 预算与共同执行逻辑 | agent 内部；worker 引入时提取 agent-core | agent + worker 已有两处真实消费                                    |
| Memory 工具客户端                          | agent 的 adapters/memory.py              | worker 也调用时提取客户端 / 契约；不复制记忆存储实现               |
| UI 组件、主题、表格封装                    | apps/web/src/components                  | web + 新增 admin / portal 使用同一行为；提取为 ui                  |
| TypeScript API client / SSE 解码           | apps/web/src/server 与 generated         | 至少两个 TS app 消费；提取 api-client，分开 server 与 browser 导出 |
| TS / ESLint / Python 工具配置              | 根配置或单 app 配置                      | 两个 app 使用且升级策略一致；可提取具名 config 包                  |
| 某个 app 的页面、业务路由、部署配置        | 对应 app                                 | 不因“未来可能复用”搬入 packages                                    |

每个共享包的 README 声明消费者、公开入口、维护人和兼容策略。规则中的“两 app”按独立应用计数，Next.js 的 UI 和 BFF 属于同一个 app，不能用来凑两份消费。间接依赖链也不能成为创建无人使用的公共包的理由。只移出所需代码，不随包夹带整套业务数据库或权限。

```text
apps/web ──HTTP──▶ apps/agent ──本地调用──▶ 内部 Runner / 执行池
apps/agent ──Memory Tools / HTTP──▶ apps/memory
apps/agent ──内置 Outbox relay──▶ Temporal ◀── apps/worker（按需）
apps/worker ──Memory Tools / HTTP──▶ apps/memory
apps/agent / apps/worker ──import──▶ packages/agent-core（出现真实复用后）
```

允许 app → package、package → 较低层 package；禁止 app → app 的源码 import、循环依赖、跨目录读内部文件。服务之间通过版本化 API / 事件契约通信。领域核心不导入 FastAPI Request、Temporal SDK、供应商 SDK 类型或 SQLAlchemy Session；适配器实现核心定义的 Protocol。用 import-linter 与 JS import 约束校验，核心单测无需启动 Web。

Turborepo 提供构建边界，业务服务独立还需要稳定协议、数据所有权和运维职责。共享领域库与平台库阶段应称作多应用、模块化后端；未来拆微服务时要解除领域表与内部模型耦合，不能仅改目录名称。

## 4. Python 如何接入 Turborepo

pnpm workspace 统一发现 `apps/*` 和 `packages/*` 中的 package.json，不使用嵌套 workspace。Python 应用放一个 private package.json 作为任务适配；实际 Python 安装依赖只能由 pyproject.toml / uv.lock 决定。[pnpm workspaces](https://pnpm.io/workspaces)、[uv workspaces](https://docs.astral.sh/uv/concepts/projects/workspaces/)

以下片段展示包含未来共享包的目标配置。当前三个 Python app 已接入根 uv workspace，版本、实际命令与锁文件以 [工程入口](../../../README.md)为准。

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "packages/*"
```

```toml
# 根 pyproject.toml：明确 Python 成员，排除 Next.js app
[tool.uv.workspace]
members = ["apps/agent", "apps/memory", "apps/worker", "packages/agent-core"]
# 本示例展示共享包已提取的阶段；当前只登记三个 apps，不登记 agent-core。

# apps/agent/pyproject.toml：以下展示 worker 已加入、确有共享依赖的阶段
[project]
name = "compass-agent"
version = "0.1.0"
dependencies = ["compass-agent-core"] # 另需锁定 fastapi 等实际依赖

[tool.uv.sources]
compass-agent-core = { workspace = true }
```

```json
{
  "name": "@compass/agent",
  "private": true,
  "scripts": {
    "dev": "uv run --locked --package compass-agent uvicorn compass_agent.main:app --reload",
    "build": "uv build --package compass-agent --out-dir dist",
    "lint": "uv run --locked ruff check src tests",
    "typecheck": "uv run --locked pyright src",
    "test": "uv run --locked pytest tests/unit"
  },
  "dependencies": { "@compass/agent-core": "workspace:*" }
}
```

这里 package.json 的 workspace 依赖仅帮助 Turbo 识别任务影响范围；uv 的 `compass-agent-core` 才是 Python 运行依赖。CI 比较两个依赖图的内部边，避免漏声明使共享包改动命中旧缓存。`agent-core` 包也需同名 lint / typecheck / test / build 任务与 Python build-system 声明。Python 开发工具从根统一安装；生产镜像按 app 用 uv 的 package 选择和 frozen 锁安装必要依赖，不复制本地 `.venv`。

初期 uv workspace 共用 Python 兼容版本和锁文件。如果某个微服务需要无法统一的 Python / 依赖版本，则为该 app 明确建立独立 uv project 和锁文件，更新 Turbo inputs 与 CI；不能靠忽略约束强行共锁。

## 5. 任务图、契约与缓存

```json
{
  "$schema": "https://turborepo.com/schema.json",
  "globalDependencies": ["uv.lock", "pyproject.toml", ".python-version", ".node-version"],
  "globalEnv": ["CI_TOOLCHAIN_ID"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "!.next/dev/**"]
    },
    "lint": { "dependsOn": ["^lint"], "outputs": [] },
    "typecheck": { "dependsOn": ["^typecheck"], "outputs": [] },
    "test": { "dependsOn": ["^test"], "outputs": [] },
    "dev": { "cache": false, "persistent": true },
    "contracts": { "cache": false },
    "db:migrate": { "cache": false },
    "seed": { "cache": false },
    "test:integration": { "cache": false },
    "eval:live": { "cache": false },
    "deploy": { "cache": false }
  }
}
```

构建、静态检查、无网络单测可缓存；迁移、seed、部署、真实模型 Eval 与外部状态测试始终执行。任务以固定输入和可重建输出为前提，`CI_TOOLCHAIN_ID` 由脚本填入 OS / arch / Python / Node / uv / pnpm 实际版本；更细的 app 配置可覆盖 outputs。共享包源码变化必须使消费者检查失效。[Turborepo tasks](https://turborepo.com/docs/crafting-your-repository/configuring-tasks)

Next.js 的 `NEXT_PUBLIC_*` 等构建变量明确列入 env / inputs；不要依赖变量未被哈希的偶然命中。真实密钥仅运行时注入，不写构建输出或任务日志；需密钥且无法证明安全的任务关闭缓存。`.env`、`.venv`、node_modules、真实数据与含租户数据的 Eval 结果不作缓存输出。初期只开本地缓存，远程缓存须审查构建产物和访问权限后启用。[环境变量与缓存](https://turborepo.com/docs/crafting-your-repository/using-environment-variables)

契约生成以 Python 的 Pydantic DTO 为源，先由 agent 导出 OpenAPI / RunEvent JSON Schema 到 contracts，再生成 Web 的 TS 类型与事件校验器。根 `contracts` 脚本明确串行执行这两步；在所有消费方 typecheck / build 之前运行，CI 再生成后检查无 diff。memory 业务启用后独立导出记忆 API / 工具 Schema，agent / worker 的工具客户端消费该契约；各服务单独导出，契约生成无需连接对方或数据库。此步骤先关闭缓存，避免对生成时序作过早优化。生成代码禁止手改；未知事件 schema 返回兼容提示或重取状态。TypeScript 类型不提供网络边界运行时校验。

服务启动与数据库准备分开：先 Compose 启基础设施并等待就绪，再单次迁移和幂等 seed，最后运行选定 app 的 `turbo run dev`。持久 dev 任务不作为其他任务的完成依赖；`turbo` 不代替健康检查或运行调度。

## 6. 新增应用与独立发布

管理功能先保留在 web 的角色视图。新增 app 需证明独立用户目标、数据所有权或部署需求；memory 的独立能力边界按本轮用户要求登记。新增 Python 服务时创建具名 app、pyproject、任务适配 package.json、容器定义及明确的 API / 事件契约；服务专有数据由自己管理。workspace glob 已覆盖新目录，Python workspace 成员仍需显式登记。

CI 根据依赖图选择受影响 app；共享包修改触发消费者校验，镜像按 app 构建。`turbo prune` 的 JS 依赖裁剪结果不自动覆盖 Python 源、uv workspace 与锁文件：Python 镜像初期使用仓库根为构建上下文，Dockerfile 精确 COPY 所需源码与元数据，验证 uv frozen 安装。优化上下文体积要另测，不能假设 pnpm 图等于全部运行依赖图。

Next.js 构建为 Node 服务，核对 standalone 的 tracing root、共享包、public 和 `.next/static`；普通模型任务在 agent 内执行，持久后台任务由 worker 执行。新增 app 继承统一质量门禁，但各自有环境变量、健康检查、资源配额和部署入口。数据库迁移由其所有者单次执行，独立发布需通过当前和滚动升级窗口内的协议兼容测试。

## 7. 学员交付与实施门禁

主工程只维护一个实现源，用固定 commit / tag 标记 M0–M5；starter 与 solution 通过独立清单导出，答案不混入学员起点。课程仓库单课练习仍使用 `lessons/v5/<track>/<lesson>/practice/` 约定；正式 release 登记代码来源、锁文件与校验值。讲师预制 UI / 身份接入 / Fixture / Docker，学员重点实现 Harness、Context、Action、Memory 与 Eval。

| 验收        | 最小证据                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------- |
| 工程图      | 默认三个 app；memory / worker 按能力启用；共享包变更触发真实消费者；禁止跨 app 源码与数据库访问    |
| 构建与缓存  | 冷启动成功；uv / pnpm 冻结安装；改变锁文件、工具链和构建变量正确失效                               |
| Next.js BFF | 工程 CRUD 与数据库归 Web；登录、CSRF、委托身份、SSE 重连、多副本会话和撤权有效；租户响应无共享缓存 |
| 数据库迁移  | 按 app / 逻辑库验证完整/增量 SQL、空库/旧库、版本、权限、恢复；跨库发布按已验证清单执行            |
| 数据与执行  | 本地队列 / 并发 / 取消 / 重启中断；持久 profile 验证 Outbox 重投与恢复；两路径状态互不干扰         |
| Memory 工具 | 同用户多 Runtime 共用版本；跨用户拒绝、候选确认、并发修改、删除传播、超时与故障语义                |
| Sandbox     | 越界路径、网络与资源限制、异常回收；无平台凭据可达                                                 |
| 契约与页面  | 契约生成无 diff；Playwright 提交任务、刷新恢复、证据查看、审批拒绝                                 |
| Eval 与发布 | 固定 Fixture；质量 / 安全 / 成本 / 时延分开判断；各 app 镜像、回滚与干净环境 smoke                 |

M0 仅只读分析与不可变调整草稿；无模型密钥可用醒目标记的 Fake Provider，无 Sandbox 配置拒绝自由代码执行。上表为产品能力的后续验收要求；工程脚手架的已完成范围与验证单独记录在 [工程验证记录](../../../docs/verification.md)。

## 8. 部署收敛实施任务

用户明确授权先交付目录与工程脚手架；当前启动命令为 `pnpm dev -F agent`、`pnpm dev -F memory`、`pnpm dev -F worker`。APP-01 已完成，APP-05 的脚手架入口已完成；APP-02–04 的领域能力仍待实现，设计保持 review。

| 任务                                     | 责任文件 / 模块                                                                                                                                                 | 验收与依赖                                                                                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| APP-01 后端名称迁移（已完成）            | `apps/agent-api` → `apps/agent`；Python 包 / imports、pnpm / uv workspace 与锁文件、Turbo、contracts / data-seed / 工程测试脚本、Compose / Dockerfile、CI、文档 | 运行引用统一为 agent；既有业务接口与 998 工具保留，健康检查服务标识及 OpenAPI 标题同步新名称；检查、构建与 smoke 见工程验证记录           |
| APP-02 普通分析内置执行                  | `apps/agent/src/compass_agent/{api,runtime,adapters}` 与 agent 迁移                                                                                             | 实现 TECH_DESIGN §6.5；单进程生命周期、有界池、持久 queued 状态、取消与故障中断；脱离浏览器继续运行；无 Temporal 依赖                     |
| APP-03 持久后台能力（进程脚手架已完成）  | `apps/worker`、agent 的 `delivery/`、实际共享的 `packages/agent-core`、durable Compose profile                                                                  | 当前 worker 支持启动、SIGINT / SIGTERM 退出和独立镜像；定时 / 离线消费、去重、恢复、内置 Outbox relay 和 durable profile 待实现           |
| APP-04 独立记忆服务（HTTP 脚手架已完成） | `apps/memory`、memory 迁移、`contracts/memory`、agent / worker Memory Tools adapter、web 个人记忆页                                                             | 当前提供 healthz / readyz 与独立镜像；TECH_DESIGN §7.1、数据模型 K 域及 AC-12.1–12.5 的存储、检索、编辑和权限能力待实现                   |
| APP-05 入口与部署一致性（脚手架已完成）  | 根启动任务、各 app README / package.json、Compose profiles、home 架构与脚手架内容、验收记录                                                                     | 无独立 dispatcher / sandbox-gateway app；已有可选 memory / worker 脚手架 profiles；durable profile 随持久能力引入；展示内容按实际阶段标注 |

名称迁移与三个 Python app 脚手架完成后，普通分析闭环的身份与工程配置先由 Web 的自有服务承接；各数据库的首次接入同时实现 SQL 导出、差异检查和迁移验证。memory 与持久 worker 各随明确能力切片进入。memory 自有单元 / 集成测试不要求 worker 在线；无记忆能力的普通分析不要求 memory 在线。工具 API 的身份、版本冲突、确认和失败语义必须在写入前验证，不能用文档检查替代业务验收。
