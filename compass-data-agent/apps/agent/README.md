# Agent

从原 `apps/agent-api` 迁入，定位为 Agent Runtime 与推理相关业务应用。FastAPI + SQLAlchemy + psycopg + Alembic，Python 包名 `compass-agent`，导入入口 `compass_agent`。`package.json` 仅将 Python 命令暴露给 Turbo；Python 依赖以 `pyproject.toml` / 根 `uv.lock` 为准。

从工程根运行 `pnpm dev -F agent`，统一加载根 `.env`。本目录 `turbo.json` 为构建和静态检查声明 Python 工具链缓存指纹；开发、迁移及 seed 不缓存。

- `/healthz`：进程存活，无数据库依赖。
- `/readyz`：数据库连接与初始表可用性，未迁移时返回 503。
- `/v1/demo/overview`：固定合成数据聚合；默认关闭，启用后仍只读。空数据或数据库故障返回 503。

目标业务为推理、工具执行、分析任务、Run / Step / Event、证据产物、执行预算和运行相关配置。账户、租户、权限与通用工程配置由 Web / BFF 拥有；Agent 校验委托身份，并通过 Web 契约核验当前权限，禁止直接访问 Web 的业务表。当前这些业务仍待对应需求实现。数据库所有权与 SQL 交付遵守 [全项目规范](../../docs/database-migrations.md)。

数据库迁移唯一源为 `migrations/`。从工程根运行 `pnpm db:migrate` / `pnpm db:seed`。seed 幂等写入三天虚构数据，不读取外部文件。API 迁移账号目前仅供本地演示，共享环境需引入分离账号与正式权限体系。

单元测试使用内存 SQLite 验证聚合、seed 幂等、开关和错误行为；PostgreSQL 差异通过真实迁移、seed 和根 `pnpm smoke` 验收。迁移与运行初始化分开，模块导入和 OpenAPI 导出不会连接数据库。

## 离线业务数据准备

完整零售业务数据由独立的 [tools/data-seed](../../tools/data-seed/README.md) 生成、校验和发布，使用 `pnpm data:seed`。工具及其零售迁移、测试已移出 Agent；Agent 包和运行镜像只携带自身代码。

普通分析 Runner、Dispatcher、Sandbox 控制与 Memory Tools 按后续切片接入；当前仍提供健康检查、演示查询及应用样本初始化。`AGENT_API_URL` 保留为 Web 的 HTTP 接口地址配置，Compose 内服务地址为 `http://agent:8000`。
