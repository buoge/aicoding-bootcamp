# 素材索引 — 999

| 文件 | 类型 | 来源与原名 | 关键内容摘要 | 收集日期 | 派生自 |
|---|---|---|---|---|---|
| [行业定义](product_definition_industry.md) | Markdown | 用户提供，原名保留 | 行野运动集团、岗位场景、全渠道经营与合成数据 | 2026-10-20 | — |
| [系统功能](product_definition_system2.md) | Markdown | 用户指定 system2 为有效材料 | 主 Agent、12 类任务、108 项能力、HITL、Artifact 与治理 | 2026-10-20 | — |


## 关键发现

- 用户于 2026-10-19 提出创建立项 Landing Page App 需求，范围包含 Compass 电商 DataAgent 的产品需求定义、原型开发，以及面向课程的多个 Landing Page 开发。
- 产品定义与原型沿用现有资产并完善：[DataAgent 设计入口](../README.md)、[产品定义](../spec/product-definition.md)、[PRD](../spec/PRD.md)、[UI/UX 规范](../design/ui-ux-design-spec.md)、[交互原型](../design/prototype/index.html)。这些产物处于 review；2026-10-20 按用户要求将所有产物迁入本 Feature，按 spec/design/test 分区维护，迁移不代表已获批准。
- Compass 当前为 M0 工程脚手架，现有 Web 页面承担链路验收。见 [工程入口](../../../README.md)。本需求应明确原型体验与真实 Agent 能力的交付边界。
- 课程正式名称为《企业级Agent工程架构实战营》，以[课程登记](../../../../../../course/README.md)为准；课程页面范围后续通过[当前课程大纲入口](../../../../../../course/curriculum/README.md)核对。
- 已有[技术栈宣传页](../../../../../../marketing/copy/dataagent-tech-stack/index.html)可作为后续页面盘点入口，其复用方式待需求定义阶段确定。

## 2026-10-20 范围澄清

- 用户确认一个 Web 系统，菜单与动作按权限配置；角色可以同时使用业务分析和管理功能。
- 本次原型完整覆盖材料范围，数据与运行采用本地模拟；生产能力按 PRD 规划交付。
- 产品定义、PRD 和设计规范统一维护在当前 Feature；当前交付链接在 [BRIEF](../BRIEF.md)。
- 以下为初始立项问题的历史记录。单一 Web 与本次原型方式已由本节澄清；课程页面清单、真实部署和生产数据接入留待后续。

## 初始开放问题（保留记录）

- 课程 Landing Page 的具体清单、数量、目标受众、核心内容和期望用户行动分别是什么？
- 立项 Landing Page App 的信息架构是什么？Compass 产品介绍、交互原型和课程页面如何组织及互相导航？
- 现有 Compass 产品定义、PRD 和原型哪些内容沿用，哪些需要调整？本次产品需求与原型应覆盖哪些关键用户任务？
- App 在现有 apps/web 中扩展还是作为独立应用承载？部署地址与发布要求在技术设计阶段确定。
- 原型采用模拟数据还是需要接入现有接口？哪些交互必须真实可操作，页面适配与验收标准是什么？
- 各交付项的优先顺序、目标日期和课程页面所需文案、视觉素材的有效来源是什么？

## 目录迁移说明

产品与设计材料已统一迁入本 Feature，入口为 [产物索引](../README.md)。`dataagent-tech-stack/` 是既有宣传页的素材快照，其原文与历史路径保留用于来源追溯；当前维护版本为[营销区宣传页](../../../../../../marketing/copy/dataagent-tech-stack/README.md)，有效技术方案为 [TECH_DESIGN.md](../design/TECH_DESIGN.md)，产品规格为 [PRD](../spec/PRD.md)。

## home 官网页面素材

- [landing_page_prd.md](landing_page_prd.md)：用户提供的后五页内容要求；六页路由和验收现已归入 [PRD 第 21 节](../spec/PRD.md#21-home-官网首版)。
- 当前用户已明确 App 名称 home、React / TypeScript / Next.js / shadcn/ui 和绿色 GhostFibers 首屏；上述初始开放问题中的应用形态和页面清单已收敛。
