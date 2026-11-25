# Feature 995：Web 工程基座与完整界面框架

> Feature Phase：`done` · Profile：`standard` · 本期实现、代码复评及 21 项 AC 验收：通过（2026-10-26）

已按用户连续授权完成 Web 基座与完整原型框架。高优问题已修复；最终证据见 [实施与验收记录](IMPLEMENTATION.md) 和 [代码评审](review/code_review.md)。启动步骤见 [Web README](../../apps/web/README.md)。PRD/设计保留评审时点及历史记录，Agent/Memory 业务仍为后续范围。

交付 Web 自有工程能力与原型的完整应用框架：本地账号/会话、租户/空间、直接成员、默认角色模板与个人权限、个人设置、通用配置及 Web 审计真实落地；分析、报告、看板及其他 Agent/Memory 业务提供空页面。用户于 2026-10-25 确认教学简化方案，本期采用 8 张业务表；文件上传、解析、OCR 与抽取只登记为 Memory 的目标职责。

| 入口                                                 | 职责与当前状态                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| [BRIEF](BRIEF.md)                                    | 需求摘要、范围与阶段记录                                                 |
| [context/_INDEX.md](context/_INDEX.md)               | 用户输入、已核验事实和上游来源链接；不复制其他 Feature 的规范正文        |
| [spec/PRD.md](spec/PRD.md)                           | 唯一需求与 AC 源；10 组本期功能、21 项验收；含八领域与 31 个原型页签清单 |
| [review/design_review.md](review/design_review.md)   | D01/D02 修订复评通过；保留原技术评审、R01–R07 及 PRD 历史记录            |
| [design/TECH_DESIGN.md](design/TECH_DESIGN.md)       | 模块边界、交付/部署、11项任务与AC映射；已补授权失效/恢复及导出事务       |
| [design/ROUTES_AND_API.md](design/ROUTES_AND_API.md) | 原型 UI 映射、完整页面清单、权限与 HTTP 契约                             |
| [design/DATA_DESIGN.md](design/DATA_DESIGN.md)       | 8 张业务表与领域模型映射、模块写入所有权、关系/状态/事务及首次迁移       |
| [design/CODE_DESIGN.md](design/CODE_DESIGN.md)       | 目录/依赖、规则、用例、事务、HTTP与客户端失效示意；不作为运行证据        |
| [IMPLEMENTATION.md](IMPLEMENTATION.md)               | T01–T11 完成，21 项 AC 对照与实际执行证据                                |
| [review/code_review.md](review/code_review.md)       | C01–C07 修复后复核通过，无未关闭 P0/P1                                   |

导航图标、控件尺寸及交互的逐项映射见 [导航 UI 对照规范](design/NAVIGATION_UI.md)。

整体产品基线继续见 [999](../999-compass-product-course-landing-app/README.md)。本 Feature 只落地 `web/main`；按 [数据库规范](../../docs/database-migrations.md)保持 app 所有权，Agent/Memory 的接口、存储和任务在后续业务 Feature 实现。

## 2026-11-02 交互修复

普通导航、空间切换、筛选和保存刷新已改为 SPA，共享布局保留侧栏/顶部；权限复验与异常清理保持。Web 静态检查、19 项单元测试、生产构建和 17 项浏览器回归通过，本地 3000 端口服务已恢复。详见 [实施记录](IMPLEMENTATION.md#2026-11-02-spa-体验修复验收)。

## 设计阶段历史

以下记录各次设计阶段的范围与当时状态；当前交付状态见上方验收入口。

前次按 `my-create-prd` 与 `my-create-design` 同步简化需求、四份设计及 11 项实施任务，UI 继续以原型的布局、配色、控件与交互为准。已移出企业 SSO、组、自定义角色/委派、邀请、服务身份登记与通用回执，相关原型入口保留明确说明。

2026-10-26 前次按用户要求将 DDD 与代码组织融入这版方案：identity/access/audit/notifications 四个应用内模块，纯领域规则、具名用例和 PG 适配各有归属；个人偏好归 identity，租户设置归 access。当次保持 8 表、固定角色、单库单服务及原 FR/AC，补齐 API 到用例、事务协作和测试责任。未修改生产实现；文档 `review`、Phase `draft`。随后用户要求支持按用户配置具体权限，Web登录会话继续存数据库。本次同步PRD与四份设计：角色模板填充初始值，租户/空间成员行各存permission_keys，按当前清单鉴权；扩展FR-995-06与AC-995-08，新增AC-995-44，当前共21项AC。下一步使用 `my-review-design` 复评，重点核对个人权限范围与继承、管理员边界、并发冲突、同事务审计、SQL交付及完整页面覆盖。

2026-10-26 最新设计修订与复评已完成：D01补齐200局部撤权、迟到心跳/数据、旧文档退役、完整文档导航及RSC默认隐藏/恢复门禁；D02明确普通查询与导出的事务模式，先提交generated审计再返回CSV。四份设计及T07/T09/T11、V05已同步，设计复评结论为通过；PRD、八表字段及21项AC保持。此结论来自同一Agent的修订后复核，不代表运行验收。本轮未写生产代码；工作区的并行实施进度以IMPLEMENTATION为准，Phase与文档状态未推进。

## 2026-11-02 分析界面与地址

分析侧栏按原型调整为新建按钮及时间/主题分组，主区提供聊天输入框架；三个旧分析导航入口移除。一级菜单标题与侧栏同步，图标统一为线性风格。页面使用稳定的租户/空间短标识，旧 UUID 链接继续兼容；新增 `web/main` 0002 迁移保留全部业务 ID。当前实现和验证以 [实施记录](IMPLEMENTATION.md) 最新修订为准。
