# 0001 · Compass M0 工程边界

日期：2026-10-15。状态：active。依据：用户确认产品名 Compass、仓库名 compass，并授权按已有设计搭建脚手架。

## 决策

采用 [原脚手架设计](../../mai-specs/999-compass-product-course-landing-app/design/scaffold-design.md) 中的 M0 起点：Next.js Web / BFF + FastAPI + PostgreSQL。Turborepo 编排任务，pnpm 管 Node workspace，uv 管 Python workspace。固定工具版本和两份锁文件。当前由课程 Git 管理源码，不在目录中创建隐藏的嵌套 Git 仓库；外部 remote / submodule 待独立发布时登记。

M0 脚手架完成环境与工程链路准备。完整 M0 产品功能仍待实现。使用三天合成数据验证 BFF、DTO、迁移和错误处理，不实现真实租户登录或任务执行。

`packages/` 记录准入标准；有两个 app 真实消费时才创建共享包。Worker、Dispatcher、Sandbox Gateway 与持久执行属于后续 M2 结构，本次不预建空目录。这个范围沿用原设计的渐进建仓规则。

## 验收

冻结安装、OpenAPI / JSON Schema / TS 契约无漂移、lint、类型检查、单元测试、Next.js standalone 与 Python 分发包构建、真实 PostgreSQL 迁移及幂等 seed、Web → BFF → API → DB smoke。

构建 / 静态检查缓存包含实际工具链；schema 生成、迁移、seed、集成 smoke 不缓存。API / Web 仅通过 HTTP 契约依赖，当前没有人为添加的 Python 共享包。

2026-10-20 任务入口调整：根命令统一透传 Turbo 参数，以完整包名筛选，如 `pnpm dev -F @compass/home`；home 快捷命令复用同一入口。运行时任务跳过工具链指纹探测；缓存任务将 Node / pnpm 与 Python 指纹分离，Python 指纹只进入 API 与契约任务。缺少 Python 工具不阻断独立 Node 应用。契约生成登记为不缓存的根任务，Web 的 build / typecheck 显式依赖该任务，home 不依赖契约。

2026-10-21 短名入口规范：统一使用 `pnpm <任务> -F <应用短名>`，保留 `@compass/*` 包命名。根任务入口从 pnpm workspace 清单解析唯一短名，完整包名、目录与复合选择器保持原生行为；未知名称或重名明确报错。新增应用遵守 [应用准入规范](../../apps/README.md)，由工具测试自动枚举并验证短名启动，不维护手工别名表。

2026-10-25 目标设计修订：用户要求收敛 app 数量，并单独提供 memory 服务。当前 M0 实施事实与上文历史决策保留；后续目标以 [技术架构](../../mai-specs/999-compass-product-course-landing-app/design/TECH_DESIGN.md) 为准：agent 内普通执行 / 投递 / Sandbox 控制，按需 worker，memory 独立数据与工具接口。本轮尚未迁名或创建新运行服务。

2026-10-25 脚手架落实：后续实施已将 `apps/agent-api` 迁为 `apps/agent`，并建立 Memory FastAPI 健康检查与 Worker asyncio 进程脚手架，当前共五个 App。`pnpm dev` 启动全部五项，基础示例链路可筛选 `pnpm dev -F home -F web -F agent`；`pnpm smoke --memory` 在原示例链路上额外检查 Memory 就绪，Worker 生命周期由单测覆盖。Memory / Worker 目前不依赖数据库或 Temporal，业务能力按后续需求接入。Dispatcher 与 Sandbox 控制仍属于 agent 内部规划，共享包继续遵循两个真实消费者的准入条件。当前入口与能力边界见 [应用索引](../../apps/README.md)。

2026-10-25 数据所有权决策：Web / BFF 直接负责账户、租户、权限与通用配置等工程 CRUD；Agent 负责推理、Runtime 及其状态；Memory 管记忆。数据库按 app / 逻辑库独立拥有，可独立实例，跨 app 通过契约访问。迁移源、完整/增量 SQL 与 SDD 完成条件统一见 [数据库规范](../database-migrations.md)。本次仅同步规范和目标设计，未接入 Web 持久化或新增 SQL 导出工具，既有迁移与演示数据保持原状。

## 官方实现参考

- [Next.js 安装与命令](https://nextjs.org/docs/app/getting-started/installation)
- [Next.js standalone 输出](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
- [Turborepo 任务与缓存](https://turborepo.com/docs/crafting-your-repository/configuring-tasks)
- [uv workspace](https://docs.astral.sh/uv/concepts/projects/workspaces/)
- [FastAPI 测试](https://fastapi.tiangolo.com/tutorial/testing/)

访问日期：2026-10-14 / 2026-10-15。参考框架文档实现工程配置；具体可用性以本项目验证记录为准。
