# 本机 Docker 确定性部署入口

> Feature：994 | Profile：simple | 状态：实施中
> 需求来源：2026-10-26 用户要求补齐根部署命令，确定性执行本机 Docker 部署。
> 模板：`.agents/skills/my-create-design/assets/templates/TECH_DESIGN.simple.tmpl.md`

[返回需求](../BRIEF.md)。基于当前未提交工作区的 Compose、任务入口和五应用结构增量实现。

## 需求依据与验收

- AC1：`pnpm run deploy` 默认部署五个应用；追加一个 app 名称只部署该应用。用户于同一会话明确确认该规则，支持 home/web/agent/memory/worker。pnpm 内置 deploy 重名，入口必须带 run。
- AC2：限定本机 Unix socket，固定 Compose 文件与项目名，隔离隐式 `.env` 和 Compose 覆盖环境；端口冲突、已有数据库不健康、构建失败时在停止服务前失败。
- AC3：构建成功后等待数据库就绪，停止所选应用，每次显式执行迁移与 Agent seed，成功后重建所选应用并等待健康检查。迁移失败停止发布，保留现场和数据。
- AC4：成功必须通过对应 HTTP smoke 与 Worker 存活检查；退出码反映失败。重复部署保留数据卷，不执行清卷、删库或自动数据库回滚。
- AC5：提供帮助、状态、日志和全项目 down；并发部署互斥；未知参数拒绝。通过隔离工具测试、项目 check/build 和真实容器验收验证，环境阻碍如实登记。

## 最小实现方案

复用 Compose 和现有 smoke。新增 `scripts/deploy.mjs` 编排，根 package.json 注册命令，部署不经过 Turbo 缓存。增加 home profile、standalone 镜像；在宿主机调用既有素材生成脚本，镜像消费生成 public 后直接 next build。Web 部署前检查契约漂移，提示通过 `pnpm contracts` 修复。

固定端口和本地凭据沿用 Compose；新 home 端口 3001，仅绑定 loopback。不新增数据库模型或迁移，复用已有所有者迁移入口。停止应用后迁移会有本机停机窗口；失败保留数据库及容器，修复后重跑。不承诺跨服务迁移原子性或自动降级。

## 供评审的代码设计

`deploy.mjs` 暴露可测试的参数解析、环境过滤、命令计划和部署函数；调用使用参数数组，避免 shell 插值。主要顺序如下（设计示意）：

```text
parse → resolve local socket → pin --host → validate Compose → acquire local lock
→ check daemon/current containers/ports
→ contracts:check (Web) / prepare-assets (home)
→ compose build selected services
→ compose up postgres --wait (if needed)
→ compose stop selected runtime services
→ compose run --rm --no-deps <migration> (each deployment)
→ compose up --no-deps --force-recreate --no-build --wait selected runtime services
→ smoke --local + selected checks → verify worker running → success
finally: release lock
```

任一步骤失败中止后续命令并返回非零；构建失败不停止旧应用，迁移失败不启动新应用。`down` 仅移除本 Compose 项目的容器和网络，保留数据卷和镜像。部署锁放在忽略的 `work/`，中断后遗留锁需人工核对进程后移除。

## 实施任务与验证

| 任务               | 文件                                                      | 验收                                |
| ------------------ | --------------------------------------------------------- | ----------------------------------- |
| 命令编排与失败测试 | scripts/deploy.mjs、deploy.test.mjs、package.json         | AC1–AC5                             |
| home 容器与 smoke  | deploy/、apps/home/next.config.ts、scripts/smoke.mjs      | AC1、AC4                            |
| 文档与入口同步     | README、deploy/README、scripts/README、manifest、项目规则 | AC1–AC5                             |
| 验证并记录         | IMPLEMENTATION.md                                         | 实际记录 check/build 与容器环境限制 |

## 已知环境限制

开始实施时 Docker PostgreSQL 容器 unhealthy，健康检查与日志读取出现 input/output error；本机 3000、3001 被已有 Node 开发进程占用。不得自动结束这些进程或删除已有数据库卷。真实容器验收依赖用户环境恢复；隔离测试可先完成。
