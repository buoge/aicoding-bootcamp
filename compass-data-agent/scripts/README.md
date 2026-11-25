# 工程脚本

- `deploy.mjs`：`pnpm run deploy [app]` 本机 Docker 部署入口，省略 app 部署全部五个应用。固定本地 socket、Compose 文件和项目名；预检端口与已有数据库健康，构建后停止所选应用，显式执行所属迁移，再启动并验证。使用 `work/local-deploy.lock` 互斥，失败保留现场和卷。`deploy:status` / `deploy:logs` 支持 app，`deploy:down` 停止整个项目并保留卷。参数和执行顺序由 `deploy.test.mjs` 验证，详见 [部署说明](../deploy/README.md)。

- `format-hook.test.mjs`：用隔离目录和真实格式化器验证 [共享编辑 Hook](../.agents/hooks/README.md) 的 Claude Code / Codex 输入、文件范围、排除规则、错误反馈和配置入口；由 `pnpm test:tooling` 自动发现。

- `tasks.mjs`：透传任务和筛选参数至 Turbo；运行时任务加载根 `.env` 并跳过版本探测，构建和检查不加载本地密钥。缓存使用 Node / pnpm 指纹及独立的 Python 指纹；缺少 Python 工具时记录 `unavailable`，由实际 Python 任务报告缺失，home 可独立运行。
- `workspace-filters.mjs`：将 `-F home` 等简单短名解析为完整包名；通过 `pnpm --recursive list --depth -1 --json` 自动发现成员，遵循 workspace 的 glob 与排除规则，无需维护 app 列表。完整包名、目录、复合 Turbo 选择器及 `--` 后的应用参数保持原样；未知短名和重名均明确报错。
- `workspace-filters.test.mjs`：验证各类筛选参数、排除、冲突与新增 app 自动发现；自动遍历真实 app 检查 [应用准入规范](../apps/README.md)，覆盖原始命令 `pnpm dev -F <短名>`。
- `tasks.test.mjs`：用无 Python 的隔离目录验证参数透传、环境加载与工具链指纹，并通过真实 Turbo dry-run 验证 home / Web 任务依赖及 agent / memory / worker 独立构建与检查。运行 `pnpm test:tooling`，根 `pnpm check` 自动包含此检查。
- `export-contracts.py` / `contracts.mjs`：串行生成及检查网络契约。
- `check-workspace.py`：检查 Python / pnpm 内部依赖图与 Python 跨 app 导入。
- `doctor.mjs`：检查 Node、pnpm、uv、Docker Compose 和 Docker daemon。
- `smoke.mjs`：访问实际运行的 Web、BFF、Agent、PostgreSQL 合成数据链路，不缓存；`pnpm smoke --web` 仅验证 Web 存活、就绪和登录门禁；`pnpm smoke --memory` 同时检查独立 Memory 脚手架的 readiness。

部署入口使用 `smoke --local --apps <逗号分隔的应用名>`，固定 loopback 地址且不加载根 `.env`；按所选应用检查 home 页面/素材、Web 登录门禁、Agent seed 或 Memory 就绪。Worker 由部署脚本检查容器运行状态。

开发环境为 macOS / Linux；Windows 使用 WSL2。脚本入口以根 package.json 为准。契约生成登记为不缓存的根 `//#contracts` 任务，由 Web 的 build / typecheck 显式依赖；单独执行 `pnpm contracts` 也可更新生成文件。

- `data-seed.mjs`：`pnpm data:seed` 的无缓存运行入口，加载根 `.env` 后调用 `tools/data-seed` 的独立 `compass-data-seed` Python 包。只使用显式 `COMPASS_RETAIL_*` 凭据；业务包生成不需要数据库连接。详见 [操作说明](../docs/data-seeding.md)。

- `prepare-data.mjs`：`pnpm data:prepare` 使用 Node.js 标准库校验 `data/retail/` 的 Git LFS 压缩包，流式解压并校验后生成忽略 Git 的 SQL；重复执行校验现有文件，拒绝覆盖内容不符的文件。只准备数据，不访问数据库。`prepare-data.test.mjs` 覆盖解压、重复执行、LFS 指针、缺失文件、两层校验失败和解压失败清理，由 `pnpm test:tooling` 自动执行。

Web 数据库任务通过相同短名发现机制转发，入口在 [apps/web/scripts](../apps/web/README.md)：`db:provision`、`db:migrate`、`db:apply-sql`、`db:manage`、`seed` 及专用 `test:setup` / `test:integration` / `test:e2e` 为非缓存运行任务；`db:sql` / `db:sql:check` 不加载本地凭据。

显式声明 `interactive: true` 的一次性任务要求单个 workspace filter，由根入口直接透传 stdin 给 pnpm 子进程；不经 Turbo 的终端 UI。这使受管密码的隐藏 TTY/管道输入可用，仍加载根环境、复用 workspace 发现并且不缓存。
