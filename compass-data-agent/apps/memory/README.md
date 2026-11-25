# Memory

独立 Python 记忆服务脚手架，使用 FastAPI / Uvicorn；分发包 `compass-memory`、导入包 `compass_memory`。从 Compass 根目录执行：

```bash
pnpm dev -F memory       # http://127.0.0.1:8001/docs
pnpm lint -F memory
pnpm typecheck -F memory
pnpm test -F memory
pnpm build -F memory
```

`/healthz` 与 `/readyz` 标明 `stage=scaffold`，只验证当前进程入口；无需数据库、agent、worker、模型密钥或 Temporal。根 `.env` 由统一任务入口加载，当前服务没有业务配置项。

本次提供 `src/compass_memory`、测试、独立 Python 构建、Turbo 任务与容器入口。记忆抽取、确认、持久化、检索、修改、删除和 Runtime 工具接口尚未实现；相关路由保持不存在，不返回模拟成功。启用持久化时，由本 app 管理独立 schema、账号及迁移，不读取其他 app 的数据库配置，按 [全项目数据库规范](../../docs/database-migrations.md)交付完整与增量 SQL。身份权限向 Web 核验，Run / Evidence 等来源向相应所有者核验；BFF 可直接调用记忆管理 API，Agent / Worker 通过 Runtime 工具使用记忆。

运行容器：`docker compose -f deploy/compose/compose.yaml --profile memory up --build -d --wait memory`。镜像只安装本服务生产依赖，默认以非 root 用户运行。

业务边界与验收见 [Memory 服务设计](../../mai-specs/999-compass-product-course-landing-app/design/TECH_DESIGN.md#71-独立-memory-服务与-runtime-工具)。

2026-10-25 目标职责补充：通用文件上传、原件与派生文件的存储/版本、正文/表格/元信息解析、OCR，以及用户主动发起的结构化字段/记忆候选抽取与确认，统一归 Memory。知识文档和记忆由 Memory 管理；Agent 保留报告、看板等业务对象，按文件 ID/版本引用内容。当前这些能力均未实现，存储、解析器、任务及接口随后续业务 Feature 设计。

[Feature 995](../../mai-specs/995-web-management-foundation/spec/PRD.md)本期只交付 Web 工程基座与完整界面框架，对 Memory 仅登记职责；相关 Web 页面先为空页。995 不新增 Memory 业务代码、数据库或处理任务，也不以启动 Memory 作为 Web 基座验收前提。
