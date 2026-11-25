# 本机部署实施与验证

日期：2026-10-26。需求与验收真源见 [技术方案](design/TECH_DESIGN.md)，状态为 dev，真实 Docker 容器验收待完成。

## 已交付

- 根 `deploy`、`deploy:status`、`deploy:logs`、`deploy:down` 入口；部署使用 `pnpm run deploy` 避免 pnpm 内置命令冲突。不传参数全量，单个 app 参数只更新该应用。
- 本机 socket 固定、Compose 环境隔离、端口与数据库预检、部署锁、构建先于停机、每次执行所属迁移、健康检查与 smoke、失败退出和保留卷。
- home standalone 镜像与 profile，静态资源由规范源准备；CI 复用部署入口，根 README、部署说明、项目规则与 manifest 同步。
- 用户追加要求：官网项目脚手架“工程规范”的“测试与 CI”改为“测试与 CI/CD”，展示部署顺序、应用选择、状态日志与恢复边界；修正旧的 CI 浏览器验收和环境加载说明。

## 本次证据

| 检查                                   | 结果                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 部署编排与 smoke 隔离测试              | 25 项通过，覆盖五个应用选择、固定地址、失败退出、重复迁移、锁和保留卷                                             |
| `pnpm check`                           | 通过；Agent 37 passed、11 skipped，跳过项为缺专用环境的集成测试，不计通过                                         |
| `pnpm build`                           | 五应用及契约共 6 项任务通过                                                                                       |
| `HOME_STANDALONE=1 pnpm build -F home` | 通过                                                                                                              |
| 独立 home 产物运行与 smoke             | 将 standalone/static/public 复制到 work，端口 3101 启动；首页、scaffold、原型与系统 JSON 返回成功；测试进程已停止 |
| Compose 配置校验                       | 全部 profiles 的 `config --quiet` 通过                                                                            |
| 根课程仓库 `npm test`                  | 1 项通过                                                                                                          |
| `pnpm run deploy` 实际入口             | 正确返回非零，已有 PostgreSQL unhealthy，在构建与停机前停止                                                       |
| `pnpm run deploy home` 实际入口        | 正确返回非零，3001 被开发服务占用，在构建与停机前停止                                                             |

原始本次日志位于忽略目录 `work/deploy-*.log`，不作为分发资产。

## 未完成验收

Docker PostgreSQL 健康检查返回 `exec /bin/sh: input/output error`，Docker 容器日志读取也返回磁盘 I/O 错误。现有 3000、3001 端口被用户开发服务占用。未结束这些服务、未重置 Docker、未删除卷。

因此尚未验证新镜像在真实 Docker 中的构建和启动、PostgreSQL 上的重复部署、Worker 容器日志和信号退出、容器 HTTP smoke，以及修改后 CI 的远程执行。宿主机 standalone smoke 与隔离测试不能代替这些证据。恢复 Docker 并释放所需端口后运行 `pnpm run deploy`，重复部署并核对数据库保留，再完成 Worker 退出验收。
