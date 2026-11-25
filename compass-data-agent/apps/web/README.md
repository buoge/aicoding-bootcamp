# Web / BFF

Next.js App Router + React + TypeScript。UI 与 BFF 在一个 Node 服务中部署。当前交付 [Feature 995](../../mai-specs/995-web-management-foundation/README.md)：本地账号、数据库会话、租户与工作区、直接成员、固定模板和个人权限、个人设置、通知与审计，以及原型完整导航框架。分析页提供聊天输入框架和会话分组空状态；分析执行、文件上传仍待接入。报告、看板、插件、定时及 Agent/Memory 管理保留明确空页。

## 启动与账号

从 Compass 根目录复制 `.env.example` 到 `.env`，安装依赖后执行：

```bash
pnpm db:up
pnpm db:provision -F web
pnpm db:migrate -F web
pnpm db:manage -F web -- create-user --login-name local.admin --display-name 本地管理员 --platform-admin true
pnpm dev -F web
```

账号工具从隐藏终端输入读取密码（12–128 字符），流水线须显式使用 `--password-stdin`；密码不作为命令参数。打开 <http://127.0.0.1:3000/login>，平台管理员创建租户时指定已有账号为初始租户管理员。平台资格不自动获得租户数据权限。

本地演示可显式设置 `WEB_FIXTURE_PASSWORD` 后执行 `pnpm db:seed -F web -- --fixture teaching`，初始化 `teaching.platform/admin/analyst/viewer/auditor/outsider` 六个合成账号及两租户三空间；重复执行不重置账号或覆盖业务修改。默认 seed 不写演示数据。禁止在共享环境使用此 fixture。

`WEB_DATABASE_URL` 仅供服务端运行；`WEB_MIGRATION_DATABASE_URL` 供迁移和受管账号工具；`WEB_PROVISION_DATABASE_URL` 仅供本地数据库供应。迁移与完整 SQL、权限、恢复见 [web/main](db/main/README.md)。`WEB_PUBLIC_ORIGIN` 必须与浏览器来源完全一致；正式环境使用 HTTPS，本地 HTTP 必须显式设置 `WEB_AUTH_ALLOW_LOCAL_HTTP=true` 并使用 loopback。会话固定有效期默认 12 小时，上限 12 小时。

受管工具另支持 `reset-password --login-name ...`、`set-status --login-name ... --status disabled|active`、`set-platform-admin --login-name ... --platform-admin true|false`，安全变更撤销该用户全部会话并保护最后有效管理员。`cleanup-sessions` 清理过期或撤销超过 30 天的会话。审计不自动清理；部署方须安排受控备份、容量监测和保留策略，普通运行角色不能修改或删除历史。

开发启动 `pnpm dev -F web` 会先停止目标端口的监听进程及当前 Web 目录的旧 Next 开发实例，再启动自身；先正常退出，5 秒后仍未退出则强制结束。默认端口 3000，支持 `PORT` 或 `-- --port 3002`。该入口依赖 macOS / Linux / WSL2 的 `lsof` 和 `ps`，会终止占用目标端口的其他应用。

页面地址使用稳定短标识，例如 `/t/yuanshan/w/huadong/analysis`。创建租户或空间时填写地址短标识；改名保持地址不变。旧 UUID 链接自动跳转，API 与权限上下文继续使用 UUID。分析侧栏仅保留新建按钮及按时间/主题的会话分组选项；侧栏顶部仅在分析模块显示“Compass / 分析空间”；其他模块直接显示一级导航标题，正文不重复标题。导航图标直接使用原型 SVG 图形，一级与二级菜单逐项映射；按钮、菜单行、浮层和移动抽屉按 [导航 UI 对照规范](../../mai-specs/995-web-management-foundation/design/NAVIGATION_UI.md) 维护。

## 工程边界

[服务端模块](src/server/README.md) 按 identity/access/audit/notifications 划分，运行时 SQL 和连接使用 `server-only`。受保护页面通过 Next App Router 局部导航，共享布局保留侧栏与顶部框架；搜索、分页、空间切换及保存后刷新保持 SPA 交互。首次进入与每次切页均校验当前权限后显示内容；断线、身份变化、超时立即清屏，恢复时重新加载文档。业务写入、审计与通知共用一个事务，普通查询使用可重复读快照，审计导出提交记录后才返回 CSV。

`GET /healthz` 检查进程，`GET /readyz` 检查配置及 Web 迁移版本；`/api/web/v1/*` 是严格校验的本地业务 API，响应 `private, no-store`。Web 基座运行只依赖自己的 PostgreSQL。Agent、Memory、Worker、IdP、模型和文件服务无需在线。

`/demo` 与 `/api/demo/overview` 保留原工程演示，需要 `COMPASS_DEMO_ENABLED=true`；后者经服务端 `AGENT_API_URL` 调用 Agent，超时或契约不兼容返回 503、始终 no-store。演示类型由根 `pnpm contracts` 生成，禁止直接修改 `src/generated`。Web build/typecheck 的静态契约生成仍需 Python 工具环境。

样式扫描限定在 `src/`，避免开发日志、测试产物与缓存变化触发热更新。

## 验证

```bash
pnpm lint -F web
pnpm typecheck -F web
pnpm test -F web
pnpm build -F web
pnpm db:sql:check -F web
```

数据库与浏览器测试必须提供专用的 `WEB_TEST_DATABASE_URL`、`WEB_TEST_MIGRATION_DATABASE_URL`，库名限定 `compass_web_test_*`；迁移与恢复另需 `WEB_TEST_ADMIN_URL`。测试会重置专用测试库，绝不使用日常库。`WEB_TEST_PG_CONTAINER` 可指定同一测试 PostgreSQL 容器执行 17 版 pg_dump/pg_restore；未设置时使用宿主对应工具。

```bash
pnpm test:setup -F web
pnpm test:integration -F web
# 浏览器使用另一专用测试库，并设置 WEB_TEST_PASSWORD
pnpm test:setup -F web -- --fixture teaching
pnpm --filter @compass/web exec playwright install chromium
pnpm test:e2e -F web
```

浏览器测试自行启动 3010 端口 Web，截图与失败 trace 放入忽略 Git 的 `work/995-playwright/`。只在已明确启动对应测试服务器时设置 `WEB_TEST_EXTERNAL_SERVER=true`。实际运行结果与验收映射见 [实施记录](../../mai-specs/995-web-management-foundation/IMPLEMENTATION.md)。
