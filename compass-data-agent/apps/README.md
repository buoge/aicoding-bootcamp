# 应用

每个目录对应可独立启动、检查和构建的应用。当前为 [产品官网](home/README.md)、[Web / BFF](web/README.md)、[Agent](agent/README.md)、[Memory](memory/README.md) 和 [Worker](worker/README.md)。从根目录使用 `pnpm dev -F <应用短名>` 统一经 Turbo 启动。应用之间通过 HTTP 契约通信，禁止跨应用源码导入。

五个应用均已有可启动、检查与构建的脚手架；Web / BFF 使用 Next.js + pnpm，Agent / Memory / Worker 使用 Python 3.13 + uv。agent 保留演示 API 与三天工程样本；离线业务数据工具由 [tools/data-seed](../tools/data-seed/README.md) 管理；memory 提供 FastAPI 健康检查；worker 提供 asyncio 进程生命周期。分派、记忆业务与持久任务按 [实施任务](../mai-specs/999-compass-product-course-landing-app/design/scaffold-design.md#8-部署收敛实施任务)继续交付。

## 数据与业务职责

Web / BFF 直接实现账户、租户、权限及通用配置等工程 CRUD，并拥有相应数据库；Agent 负责 Agent Runtime 推理、工具执行、分析状态与运行相关配置；Memory 独立管理记忆。管理界面的所在 app 与数据 owner 分别判断。Worker 的执行位置不改变业务数据所有者，默认通过所有者 API 提交状态。

每个 app 可拥有独立实例或逻辑数据库，按 `<app>/<database-key>` 管理迁移历史与凭据；跨 app 通过契约访问，禁止直接访问对方业务表和跨库外键。目录、SQL 交付、现有入口与 SDD 验收统一见 [数据库规范](../docs/database-migrations.md)。当前 Web 自有数据库尚未实现，Memory / Worker 仍为脚手架。

## 新增应用准入规范

- 先明确用户目标或部署边界，再登记 pnpm workspace 与容器入口。
- 目录使用 `apps/<短名>`，包名使用 `@compass/<短名>`；短名必须与目录名一致，并在全部 workspace 子包中唯一。
- 应用 `package.json` 必须提供可独立执行的 `dev` 脚本。开发者统一使用 `pnpm dev -F <短名>`，构建和检查使用相同筛选方式，例如 `pnpm build -F <短名>`。
- 编码规范继承根 [统一配置](../docs/coding-style.md)：前端使用 ESLint + Prettier，Python 使用 Ruff；提供 `lint`、`typecheck`、`test` 入口，禁止建立相互冲突的格式规则。
- 根入口通过 pnpm 自动发现 workspace 成员。新增 app 不得通过维护手工别名表或新增专用根脚本来满足启动要求。
- 新增 app 后运行 `pnpm test:tooling`；测试自动枚举全部应用，校验短名唯一性、目录一致性、dev 脚本以及真实 `pnpm dev -F <短名> --dry-run=json` 的任务选择。此测试已纳入 `pnpm check`。

完整包名与目录筛选仍可使用；存在短名冲突时必须修正命名，根入口会明确列出冲突包。

Web 基座及完整界面框架已接入独立 `web/main` 数据库，运行无需 Python 服务在线，见 [Web 运行入口](web/README.md)；Agent/Memory 业务页继续为空页。
