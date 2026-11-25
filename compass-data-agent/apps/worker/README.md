# Worker

独立 Python 后台进程脚手架，分发包 `compass-worker`、导入包 `compass_worker`。从 Compass 根目录执行：

```bash
pnpm dev -F worker
pnpm lint -F worker
pnpm typecheck -F worker
pnpm test -F worker
pnpm build -F worker
```

当前进程启动后输出 `Worker scaffold ready; no task consumers configured`，等待 SIGINT / SIGTERM 并正常退出。使用 Python 标准库 asyncio 管理生命周期，不监听 HTTP 端口、不连接数据库或 Temporal。`pnpm dev -F worker -- --version` 可查看版本；开发时修改源码后重新启动。

本次提供 `src/compass_worker`、真实子进程信号测试、独立 Python 构建、Turbo 任务及容器入口。队列消费者、定时任务、Temporal Workflow / Activity、重试与恢复尚未实现；当前进程不领取业务任务。后续按 [持久执行设计](../../mai-specs/999-compass-product-course-landing-app/design/TECH_DESIGN.md#61-api执行与-ui-三条链) 接入，不跨 app 导入 agent / memory 源码。

业务数据所有权不随执行位置改变。Worker 默认通过 Web / Agent / Memory 的 owner API 提交状态，禁止直连其他 app 的业务表；出现独立持久化需求时按 [全项目数据库规范](../../docs/database-migrations.md)登记自有逻辑库、迁移和 SQL 交付。

运行容器：`docker compose -f deploy/compose/compose.yaml --profile worker up --build -d worker`。容器使用 init 转发信号、非 root 用户运行；`logs worker` 可查看生命周期，`stop worker` 验证正常停止。进程存活只代表脚手架已启动，不能作为任务消费就绪的证据。

运行环境为 macOS / Linux；Windows 使用 WSL2。根 `.env` 由统一任务入口加载，当前没有任务队列配置项。
