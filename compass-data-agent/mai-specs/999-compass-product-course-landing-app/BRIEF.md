# 999: Compass 产品立项与课程 Landing Page App

| 项 | 值 |
|---|---|
| Phase | draft |
| Profile | standard |
| 优先级 | P1 |
| 负责人 | andy |
| 目标日期 | 待填 |
| 涉及子系统 | Compass 产品需求定义、交互原型、Landing Page App、课程展示页面 |

## 一句话描述

完成 Compass 电商 DataAgent 的产品需求定义与交互原型开发，并开发面向《企业级Agent工程架构实战营》的多个 Landing Page。

## 背景

Compass 是课程贯穿的电商经营分析 DataAgent，当前运行工程为 M0 脚手架，已有产品定义、PRD、UI/UX 规范与 HTML 原型处于评审状态。本需求统筹产品需求完善、原型开发和课程 Landing Page App 交付，支撑产品立项展示与课程讲解。产品文档与原型按职责统一维护在本需求目录；页面清单、关键交互及发布方式在后续需求定义和设计阶段明确。

## 关键决策

- 2026-10-20：用户明确最终为一个 Web 系统，岗位、角色与用户权限共同决定可见功能和可执行动作。日常工作以 AI Native Data Agent 为入口，部门管理与后台治理共用系统框架。
- 本次连续授权交付完整 PRD、设计体系和可运行 HTML 交互原型；覆盖两份用户材料中的 12 类分析任务、108 项功能与管理领域。
- 2026-10-20：按用户要求将原 DataAgent 目录全部迁入本 Feature；产品正文统一维护在 spec/PRD.md，设计与原型归入 design/，测试与证据归入 test/。原始素材保留原文，不再保留平行设计目录。
- HTML 使用合成数据与本地状态演示。生产后端、真实模型、数据库、认证与外部投递等待后续技术设计和实施。
- 2026-10-20：用户追加实施独立 home 官网，采用 React / TypeScript / Next.js / shadcn/ui，六页清单与验收见 PRD 第 21 节；首页使用指定 GhostFibers 绿色全屏背景。
- 2026-10-25：用户要求控制 app 数量。普通分析集中到目标 `agent`，Dispatcher / Sandbox 控制逻辑内置，定时、离线及持久恢复由按需 `worker` 执行；同轮追加独立 `memory` app，负责抽取落盘、检索、持久化与个人记忆修改，并通过 Runtime 工具调用。本轮维护架构、脚手架与数据所有权设计，名称迁移与运行实现待实施。
- 2026-10-25 后续实施：用户明确要求先创建 agent / memory / worker 的 Python 目录、脚手架与根工程配置。已完成 agent 名称迁移、三个 Python app 的启动 / 检查 / 构建入口、workspace 锁文件及容器配置；记忆业务、分析执行与队列接入仍待后续实现。
- 产物状态为 review；Feature Phase 保持 draft，未代替负责人批准。

## 上下文索引

- [素材索引](context/_INDEX.md)

## 本次交付

- [完整 PRD](spec/PRD.md)：产品规格与验收条件的唯一正文，保留原有需求编号并扩充 108 项功能与场景验收。
- [产品定义](spec/product-definition.md)
- [设计体系](design/ui-ux-design-spec.md)
- [HTML 原型](design/prototype/index.html)
- [运行与功能说明](design/prototype/README.md)
- [验证证据](test/prototype-verification.md)
- [技术设计](design/TECH_DESIGN.md)与[脚手架设计](design/scaffold-design.md)
- [系统数据库结构设计](design/data-model.md)：2026-10-24 按用户要求重构为 Compass DataAgent 专属模型，参考 998 的领域组织格式；覆盖 12 个域、94 张目标系统表的完整 ER/字段/约束，逐表说明设计理由与 MVP 必要性（M0 30 张表）。保留功能映射、通用平台初始化与 Query Gateway 设计，不包含行业业务事实表；平台实施暂缓。
- [目录与产物索引](README.md) · [机器可读清单](manifest.yml)

## 有效需求来源

用户材料及 2026-10-20 会话是本次需求依据；可维护 FR/AC 的唯一位置为 [DataAgent PRD](spec/PRD.md)。2026-10-21 按用户授权完成数据模型完整性设计，补齐角色权限、会话/任务、决定与产物、后台治理的数据责任；生产运行逻辑和接口按对应切片继续设计与实现。Feature Phase 保持 `draft`，文档状态为 `review`。

2026-10-24 用户要求系统数据设计独立于电商业务数据，按业务域给出总关系、完整 ER、表结构、设计原因与 MVP 必要性；本次只重构数据设计及索引，不修改产品需求和实施阶段。

## home 官网增量

- [App 运行入口](../../apps/home/README.md) · [实施方案](design/home-app-design.md) · [验收记录](test/home-verification.md)。
- 页面内容依据 context/landing_page_prd.md 和当前工程事实；首版课程任务为建议拆解，正式教学安排待核定。
