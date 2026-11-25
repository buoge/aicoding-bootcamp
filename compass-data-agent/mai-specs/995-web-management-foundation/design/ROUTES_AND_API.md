# Feature 995 页面、权限与接口契约

> 状态：`review` · 全部为拟实现契约。[返回技术方案](TECH_DESIGN.md)

## 1. 页面与路由清单

用户明确 UI 参考原型系统。视觉与交互真源为 [原型](../../999-compass-product-course-landing-app/design/prototype/README.md)、[navigation.js](../../999-compass-product-course-landing-app/design/prototype/navigation.js)、[admin.js](../../999-compass-product-course-landing-app/design/prototype/admin.js)、[workspaces.js](../../999-compass-product-course-landing-app/design/prototype/workspaces.js)与 [UI/UX 规范](../../999-compass-product-course-landing-app/design/ui-ux-design-spec.md)。本清单只把其设计映射到工程页面，不重新设计一套后台外观。

路径简写：`T=/t/:tenantId`，`W=/t/:tenantId/w/:workspaceId`。真实 URL 使用服务端 UUID，文档中的 `:参数` 不直接注册为字面路径。tenant 级组织治理不依赖 workspace 存在；workspace 级业务入口先选择获权空间。首次租户无空间时仍能进入 T/admin/organization/workspaces 创建空间；无创建权限显示联系管理员。域导航根据页面 scopeKind 构造 URL，不能把上一租户的 workspaceId 带到新租户。

每行固定页面 id 与权限；kind=placeholder 时保留原型布局、标题、页签/选中态和说明，既不 fetch 未来服务，也不展示示例对象或可提交业务表单。管理子页使用标题+页签，原型三级详情抽屉只在本期真实 CRUD 需要时实现。

### 1.1 一级与业务二级导航

| 原型入口/分类        | 工程 URL                   | 页面 id / 权限                           | 内容                       |
| -------------------- | -------------------------- | ---------------------------------------- | -------------------------- |
| 分析 / 新建分析      | W/analysis                 | analysis-new / module.analysis           | 空页                       |
| 全部分析会话         | W/analysis/conversations   | analysis-list / module.analysis          | 空页；侧栏会话区域真实为空 |
| 分析案例             | W/analysis/scenarios       | analysis-scenarios / module.analysis     | 空页，无可执行案例         |
| 待我决定             | W/analysis/decisions       | analysis-decisions / module.analysis     | 空页，无审批操作           |
| 报告空间 / 全部产物  | W/reports                  | reports-all / module.reports             | 空页，最近产物区域为空     |
| 分析报告             | W/reports/reports          | reports-documents / module.reports       | 空页                       |
| 图表与视图           | W/reports/charts           | reports-charts / module.reports          | 空页                       |
| 数据结果             | W/reports/data             | reports-data / module.reports            | 空页                       |
| 插件 / 全部          | W/plugins                  | plugins-all / module.plugins             | 空页                       |
| Skill                | W/plugins/skills           | plugins-skills / module.plugins          | 空页                       |
| Prompt               | W/plugins/prompts          | plugins-prompts / module.plugins         | 空页                       |
| Agent                | W/plugins/agents           | plugins-agents / module.plugins          | 空页                       |
| 报告模板             | W/plugins/report-templates | plugins-templates / module.plugins       | 空页                       |
| 数据集               | W/plugins/datasets         | plugins-datasets / module.plugins        | 空页                       |
| 定时任务 / 全部      | W/automations              | automations-all / module.automations     | 空页；我的任务区域为空     |
| 新建定时任务         | W/automations/new          | automations-new / module.automations     | 空页说明，无提交表单       |
| 执行记录（规划入口） | W/automations/history      | automations-history / module.automations | 空页                       |
| 看板 / 经营总览      | W/boards/overview          | boards-overview / module.boards          | 空页                       |
| 渠道表现             | W/boards/channels          | boards-channels / module.boards          | 空页                       |
| 库存健康             | W/boards/inventory         | boards-inventory / module.boards         | 空页                       |

`W/boards` 重定向经营总览。原型的会话按时间/主题排列属于空列表框架，可以保留控件的静态选中态；没有会话时不执行排序/搜索 API。新建分析入口可点击到空页，不提供对话输入框。空页面不循环重试“尚未上线”的接口。

### 1.2 八个管理领域与 31 个原有页签

| 原型 domain/tab         | 原型标题           | 工程 URL                        | 权限 / 本期内容                                                                                           |
| ----------------------- | ------------------ | ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| admin-overview          | 控制总览（无页签） | T/admin/overview                | module.admin.overview；Web 获权统计与近期操作，运行指标待接入                                             |
| data/sources            | 数据连接           | W/admin/data/sources            | module.admin.data；空页                                                                                   |
| data/catalog            | 数据目录           | W/admin/data/catalog            | 同上；空页                                                                                                |
| data/metrics            | 指标口径           | W/admin/data/metrics            | 同上；空页                                                                                                |
| data/queries            | 可信查询           | W/admin/data/queries            | 同上；空页                                                                                                |
| data/quality            | 数据质量           | W/admin/data/quality            | 同上；空页                                                                                                |
| capabilities/agent      | 主 Agent           | W/admin/capabilities/agent      | module.admin.capabilities；空页                                                                           |
| capabilities/tools      | 工具策略           | W/admin/capabilities/tools      | 同上；空页                                                                                                |
| capabilities/skills     | Skill 与流程       | W/admin/capabilities/skills     | 同上；空页                                                                                                |
| capabilities/models     | 模型路由           | W/admin/capabilities/models     | 同上；空页                                                                                                |
| capabilities/sandbox    | 代码环境           | W/admin/capabilities/sandbox    | 同上；空页                                                                                                |
| capabilities/hitl       | 协同策略           | W/admin/capabilities/hitl       | 同上；空页                                                                                                |
| runs/tasks              | 运行任务           | W/admin/runs/tasks              | module.admin.runs；空页                                                                                   |
| runs/queue              | 配额与队列         | W/admin/runs/queue              | 同上；空页                                                                                                |
| runs/budget             | 预算与成本         | W/admin/runs/budget             | 同上；空页                                                                                                |
| runs/schedules          | 定时与投递         | W/admin/runs/schedules          | 同上；空页                                                                                                |
| runs/triggers           | 主动监控           | W/admin/runs/triggers           | 同上；空页                                                                                                |
| quality/evaluations     | 质量门禁           | W/admin/quality/evaluations     | module.admin.quality；空页                                                                                |
| quality/datasets        | 评测集             | W/admin/quality/datasets        | 同上；空页                                                                                                |
| quality/releases        | 组合发布           | W/admin/quality/releases        | 同上；空页                                                                                                |
| quality/experiments     | 受控实验           | W/admin/quality/experiments     | 同上；空页                                                                                                |
| security/traces         | 执行追踪           | T/admin/security/traces         | module.admin.security；空页                                                                               |
| security/audit          | 审计日志           | T/admin/security/audit          | module.admin.security + audit.read；真实 Web 审计                                                         |
| security/policies       | 安全策略           | T/admin/security/policies       | module.admin.security；会话策略与默认模板说明只读，获权成员管理链接                                       |
| security/alerts         | 健康与预警         | T/admin/security/alerts         | module.admin.security；空页                                                                               |
| memory/memories         | 记忆治理           | W/admin/memory/memories         | module.admin.memory；空页                                                                                 |
| memory/artifacts        | 产物与传播         | W/admin/memory/artifacts        | 同上；空页                                                                                                |
| memory/templates        | 模板复用           | W/admin/memory/templates        | 同上；空页                                                                                                |
| organization/members    | 成员与组           | T/admin/organization/members    | module.admin.organization + members.read；直接成员/默认角色及个人权限配置真实，组区域待接入               |
| organization/roles      | 角色与权限         | T/admin/organization/roles      | module.admin.organization + roles.read；默认模板说明；按成员配置权限复用成员页编辑器，写入仅admin         |
| organization/identity   | 企业身份           | T/admin/organization/identity   | module.admin.organization；本地认证说明，SSO/服务身份区域待接入                                           |
| organization/workspaces | 租户与工作区       | T/admin/organization/workspaces | module.admin.organization +（workspaces.read 或 settings.read）；空间列表与租户配置分别按 read/write 授权 |

31 个原有页签按 5+6+5+4+4+3+4 计数；控制总览单列。域根 URL 重定向该域第一个获权页签，没有可进入页签则权限页；不能以强制打开无权的“首个页签”造成循环。

### 1.3 附加、个人与系统路由

| 入口               | 工程 URL                  | 行为与权限                                                             |
| ------------------ | ------------------------- | ---------------------------------------------------------------------- |
| 知识文档           | W/admin/data/documents    | 规划空页 1，module.admin.data                                          |
| 文件               | W/admin/memory/files      | 规划空页 2，module.admin.memory                                        |
| 处理记录           | W/admin/memory/processing | 规划空页 3，module.admin.memory                                        |
| 记忆候选           | W/admin/memory/candidates | 规划空页 4，module.admin.memory                                        |
| 头像/个人信息      | /settings/profile         | 已登录本人，真实显示名与偏好                                           |
| 本人会话           | /settings/sessions        | 已登录本人，真实会话列表与撤销                                         |
| 通知/偏好          | /settings/notifications   | 已登录本人，真实获权站内通知和已读                                     |
| 我的记忆           | /settings/memory          | 已登录本人，空页                                                       |
| 设计体系与体验指南 | /guide                    | 已登录；沿用原型控件规范的工程版说明，无合成业务演示                   |
| 工作空间选择       | /workspaces               | 已登录，列当前获权租户/空间，授权后导航                                |
| 平台租户管理       | /platform/tenants         | app_user.is_platform_admin；租户生命周期和首管理员，不自动访问租户业务 |
| 根入口             | /                         | 按主方案解析默认入口；匿名进入 login                                   |
| 登录 / 无成员资格  | /login、/access           | 登录页面可匿名；access 不展示其他租户信息                              |
| 工程演示           | /demo                     | COMPASS_DEMO_ENABLED；关闭时 404，样式独立，原 API 契约保留            |
| 就绪/存活          | /readyz、/healthz         | 最小部署状态，不含凭据、schema 详情或成员数量                          |

404 显示通用未找到；无权显示 PRD 文案和回到获权入口；不重定向到可能无权的分析页造成循环。个人入口保持原型头像菜单形态，内容页使用应用同一布局。未登录时原型“体验身份”选择器完全移除。

受保护页面、页签及范围/过滤/分页 URL 使用 Next Link/router 客户端导航，应用框架由共享布局持续保留；保存后使用 router.refresh。每份候选载荷含历史缓存恢复均须经过当前身份与版本校验再显示。登录、退出和失权恢复采用安全的完整文档跳转。详细分支以[代码设计的 SPA 修订](CODE_DESIGN.md#2026-11-02-spa-导航修订当前有效)为准。

### 1.4 原型 UI 到工程的映射与验证

| 原型元素              | 工程载体                                         | 必须保持的设计                                                      |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| 一级窄栏/二级栏/顶栏  | AppShell、PrimaryRail、SecondaryNav、Topbar      | 60/260 px，原有分组/顺序/图标语义，hover/focus/固定交互和上下文位置 |
| admin 页签与页面 head | AdminLayout、PageHeader、RouteTabs               | 原型页面密度、标题层级、页签顺序与选中样式；真实页面替换模拟内容    |
| 列表/表单/确认弹层    | EntityTable、EditorDialog、ConfirmDialog         | 原型边框、圆角、按钮主次、字段标签和错误位置；没有框架默认配色覆盖  |
| 搜索、通知、头像菜单  | NavigationSearch、NotificationPanel、ProfileMenu | 原型交互入口及快捷键；搜索限定本期页面和获权 Web 对象               |
| 空态/失败/无权        | ModulePlaceholder、EmptyState、ErrorState        | 保留原型语气和视觉；四种业务状态分别表达                            |
| 窄屏导航              | NavigationSheet                                  | ≤900 浮层、≤720 菜单抽屉，44 px 触点、关闭/焦点恢复和独立滚动       |

Token 直接映射 `--canvas #F8F9F6`、`--surface #FFFFFF`、`--ink #202B27`、`--muted #62716A`、`--primary #1C5145`、`--primary-soft #E5EEE7`、`--border #DCE2DA`；完整色阶仍从原型规范取值。系统字体、页面标题 29/1.35（移动 25）、正文 14/1.65（移动基础 16）、间距 4/8/12/16/24/32/48，圆角按原型。Tailwind semantic tokens 引用这些变量；Radix/shadcn 提供行为，外观按原型校准。

视觉验收在相同视口、同导航展开状态下对照原型与工程截图；至少覆盖分析空页、报告空页、看板空页、组织成员、角色、审计、个人设置及窄屏。逐项检查结构/字号/间距/配色/控件/焦点，而非以截图像素完全相同掩盖真实业务内容差异。未实现业务的内容区域按 PRD 空态处理；外围框架仍需完整。新增真实表单沿用原型已有控件语言，不另造主题。

## 2. 权限目录、默认模板与个人授权

本期保留tenant admin/member资格与空间analyst/viewer/auditor模板。权限目录、默认模板唯一代码源为 `src/server/modules/access/domain/permissions.ts`；请求DTO从纯常量推导有限ID，服务端依当前个人清单判定。下表只定义初始模板，保存后的个人权限可以偏离模板；模板更新不改变已有用户。admin资格提供完整权限，其他角色标签不参与授权计算。

| 权限集合                                                                                      | 租户admin        | 空间analyst  | 空间viewer   | 空间auditor            |
| --------------------------------------------------------------------------------------------- | ---------------- | ------------ | ------------ | ---------------------- |
| module.analysis / module.plugins / module.automations                                         | 所有本租户空间   | 当前分配空间 | 无           | 无                     |
| module.reports / module.boards                                                                | 所有本租户空间   | 当前分配空间 | 当前分配空间 | 无                     |
| module.admin.data / capabilities / runs / quality / memory（每项完整前缀module.admin）        | 所有本租户空间   | 无           | 无           | 无                     |
| module.admin.overview / module.admin.security                                                 | 本租户聚合页面   | 无           | 无           | 自身获权空间的聚合页面 |
| module.admin.organization                                                                     | 本租户           | 无           | 无           | 无                     |
| workspaces.read                                                                               | 全部本租户空间   | 当前分配空间 | 当前分配空间 | 当前分配空间           |
| workspaces.write / members.read / members.write / settings.read / settings.write / roles.read | 本租户治理       | 无           | 无           | 无                     |
| overview.read / audit.read                                                                    | 本租户及全部空间 | 无           | 无           | 当前分配空间           |
| audit.export                                                                                  | 本租户及全部空间 | 无           | 无           | 无                     |

`module.admin.capabilities`等ID由目录显式列出；没有未来report.generate/memory.upload或任意通配符。权限同时登记适用范围与能否个人配置：

| 权限类别                                                                                   | 适用范围                                       | 个人配置                                                                    |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------- | --------------------------------------------------------------------------- |
| members.write                                                                              | 仅tenant；成员、管理员资格、空间分配及权限编辑 | 保留给tenant admin，不能存入个人清单                                        |
| module.admin.organization、members.read、workspaces.write、settings.read/write、roles.read | 仅tenant                                       | 可为普通成员授予；workspaces.write可管理空间，不允许借创建/编辑操作分配权限 |
| 其余上表已登记module、workspaces.read、overview.read、audit.read/export                    | tenant或workspace                              | tenant覆盖全租户全部空间；workspace仅覆盖指定空间                           |
| 平台资格、账号/口令管理、本人资料/会话                                                     | 独立平台或self入口                             | 不进入个人权限目录                                                          |

普通member在scope上的有效权限为tenant_member.permission_keys与对应workspace_member.permission_keys的允许项并集；admin具完整已登记Web权限。没有空间关系时，只能使用租户清单明确授予的空间能力；空清单不回退模板。用户/会话/tenant/tenant_member状态须先有效，归档状态规则照常执行。固定岗位名称、浏览器capabilities和role_key标签都不能替代当前后端清单。

总览/安全进入条件为对应module在tenant或任一空间有效，查询按相应read动作过滤。组织页可以授予只读进入及具体读写动作；成员/权限分配只有admin可写。tenant级audit.read覆盖本租户全部事件；空间audit.read只允许该空间事件。导出每条事件同时满足audit.read和audit.export，须对同一scope取交集，不能拼接不同空间的两项权限。仅勾选导出不会获得读取权。

空间编辑器显示租户继承项为只读；删除空间直接项不覆盖租户允许项。清空本范围只清直接项，保存响应展示当前最终结果。新增权限ID以后默认无人获授；只有admin受保护资格自动覆盖已登记Web管理能力，新增业务执行权限仍须后续Feature单独设计。

## 3. HTTP 通用契约

基址 `/api/web/v1`，Node runtime；所有DTO在app内Zod strict schema维护。输入默认64KiB，ID为UUID；body中的操作者、tenant归属、平台资格、hash字段拒绝；权限数组只在本节登记的管理DTO中接收，未知或保留权限拒绝。所有私有成功/失败响应private,no-store，不开放跨源CORS。

```ts
type Version = string;
type ListPage<T> = { items: T[]; total: number; page: number; limit: number };
type AuditPage<T> = { items: T[]; total: number; nextCursor: string | null };
type MutationResult = { resourceId: string; version: Version | null };
type ApiError = {
  error: {
    code:
      | "unauthenticated"
      | "forbidden"
      | "not_found"
      | "conflict"
      | "validation_failed"
      | "rate_limited"
      | "unavailable";
    message: string;
    requestId: string;
    fields?: Record<string, string>;
    currentVersion?: Version;
  };
};
```

普通列表page≥1，limit默认20最大100，q≤80，排序白名单name/createdAt；审计用时间/id游标。授权在分页前，count和items同一只读快照。错误游标422，不能将其视为授权。版本用字符串避免bigint精度问题。

展示版本协议：受保护数据查询和管理写入的成功响应在 `X-Compass-View-Revision` 头返回同一事务内计算的viewRevision，包含有上下文的204响应及CSV；JSON数据DTO形状不变。GET/session在body返回该值。它是失效提示，不是客户端提交的授权条件；服务端始终重新鉴权。匿名登录、退出、healthz/readyz和既有demo不使用此头；退出先清理客户端状态。错误响应不安装展示版本。前端仅在当前请求世代、URL、展示版本与期限均匹配时处理结果；缺少/变化的版本触发清理和完整文档重新加载，不直接安装新版本或重放写操作。具体摘要算法与RSC载荷约定唯一维护在代码设计§6.1。

登录及写入检查固定Origin、Fetch Metadata、JSON类型；受保护写入再核验session-CSRF。取消通用Idempotency-Key契约：创建body带稳定id，PK/业务唯一约束冲突409后客户端重取；更新/删除带expectedVersion。相同创建ID的不同请求也返回409，不更新既有实体，不复用无权对象回执；不支持通用回执重放。重复提交不产生第二条记录，不能仅靠按钮禁用实现。

201创建，200更新，204自然幂等操作；对象不存在/跨租户ID返回404，模块无权403，版本/唯一键/最后管理员冲突409，校验422，限速429附Retry-After，依赖不可用503。API不返回登录HTML，错误隐藏内部详情。

## 4. 接口清单

### 4.1 登录、本人和导航

| Method / URL                | 输入→输出                                                                                                  | 行为                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| POST /auth/login            | loginName、password、returnPath? → 安全redirectTo                                                          | 无需既有会话；同源JSON、限速、安全密码校验、新session cookie；密码不进入日志 |
| GET /session                | tenantId?/workspaceId?/pageId? → 本人摘要、capabilities、authzVersion?、viewRevision、csrfToken、expiresAt | 当前身份/scope核验；pageId存在时按目录重验页面权限；只复验不续期             |
| POST /auth/logout           | 无body→204                                                                                                 | 有效会话需CSRF，原子撤销并清cookie；cookie已失效时只清理，不重复审计         |
| GET /me                     | → ProfileDto                                                                                               | self；显示名、loginName只读、偏好、version，不含hash或平台标记的可写字段     |
| PATCH /me                   | displayName?/preferences?、expectedVersion → MutationResult                                                | self固定字段，不改密码或安全资格                                             |
| GET /me/sessions            | 分页 → ListPage<SessionDto>                                                                                | 本人安全会话字段，无token/hash                                               |
| DELETE /me/sessions/:id     | →204                                                                                                       | 本人会话，revoked_at空时才撤销/通知；已撤销无重复事件                        |
| GET /me/audit               | 时间游标 → AuditPage<AuditDto>                                                                             | 本人tenant为空的登录/退出/重置等安全事件，展示在会话页                       |
| GET /me/notifications       | 分页/read过滤 → ListPage<NotificationDto>                                                                  | self且当前可见tenant                                                         |
| PATCH /me/notifications/:id | read:true →204                                                                                             | 自然幂等，只允许标已读                                                       |
| POST /context               | tenantId、workspaceId?、returnPageId? → 安全URL                                                            | 当前scope校验；只原子修改本人最近两个偏好并递增version，不改变其他标签页     |
| GET /navigation             | tenantId?/workspaceId? → 获权目录和上下文摘要                                                              | 同一个page-catalog，不返回其他tenant对象                                     |
| GET /search                 | q、tenantId?/workspaceId?、limit≤20 → 安全摘要                                                             | 仅页面/获权成员/空间名称；角色名称来自固定目录，无组或全文业务搜索           |

/auth/login、/auth/logout均在API基址下；不存在/auth/callback、/session/activity或邀请入口。无self密码修改/找回邮件，本期通过db:manage受管重置并撤销会话。认证成功后的跳转由客户端按安全URL导航，保留cookie；网络中断后先GET/session核对状态，不重复创建用户。

受保护页面初始复验和心跳必须传登记pageId及其URL范围；未知pageId/不合法scope组合422，无页面权限403。范围仍获权且仅部分操作/空间收窄时可返回200，此时viewRevision改变也必须清屏。无context的session用于本人入口，authzVersion为空；viewRevision仍覆盖本人有效租户版本和平台资格，支持个人通知失权与账号切换。请求序号和generation仅在客户端用于丢弃迟到响应，不参与服务端授权。平台和个人页面同样使用页面目录中的明确ID。

### 4.2 平台、租户与直接成员

简写 `U=/tenants/:tenantId`。服务端核验URL tenant、目标实体归属与角色，平台资格不能借普通tenant接口绕过成员检查。

| Method / URL                                         | 输入→输出                                                                                                                    | 权限与规则                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| GET /tenants                                         | 分页 → 可进入租户摘要                                                                                                        | 本人active tenant_member；平台全量另走专用接口                                                           |
| GET /platform/tenants                                | 分页 → 租户控制面摘要                                                                                                        | is_platform_admin；不附业务数据                                                                          |
| POST /platform/tenants                               | id、name、timezone、initialAdminLoginName → MutationResult                                                                   | 平台资格；目标为已有active用户，租户+首管理员同事务；初始空间后续创建                                    |
| GET/PATCH /platform/tenants/:id                      | 无 / name?/status?、expectedVersion → DTO / MutationResult                                                                   | 平台资格；只读控制面摘要；停用/恢复不改变成员授权                                                        |
| GET/PATCH U/settings                                 | 无 / name?/timezone?、expectedVersion → DTO / MutationResult                                                                 | settings.read/write；无defaultWorkspace或任意配置字段                                                    |
| GET/POST U/workspaces                                | 分页 / id、name、description → ListPage / MutationResult                                                                     | read按当前个人权限过滤；create需tenant范围workspaces.write                                               |
| GET/PATCH U/workspaces/:id                           | 无 / name?/description?/status?、expectedVersion → DTO / MutationResult                                                      | read按对象scope；编辑/归档/恢复需tenant范围workspaces.write                                              |
| GET/POST U/members                                   | 分页 / id、loginName、roleKey(admin/member)、permissionKeys → ListPage / MutationResult                                      | GET需tenant members.read；POST需admin，按精确登录名添加已有active用户，无全站列表；重复/disabled关系冲突 |
| GET/PATCH U/members/:id                              | 无 / roleKey?/status?、permissionKeys（admin降为member时必填）、expectedVersion、expectedAuthzVersion → DTO / MutationResult | GET需tenant members.read；PATCH需admin；保护最后有效admin，恢复/降级确认保留清单与空间关系               |
| GET/POST U/workspaces/:id/members                    | 分页 / id、tenantMemberId、roleKey、permissionKeys → ListPage / MutationResult                                               | GET需tenant members.read；POST需admin，同租户active成员/空间，唯一关系；admin目标不可新配个人权限        |
| GET/PATCH/DELETE U/workspaces/:id/members/:bindingId | 无 / PATCH:roleKey+permissionKeys、expectedVersion、expectedAuthzVersion；DELETE:expectedVersion → DTO / MutationResult      | GET需tenant members.read；PATCH/DELETE需admin；admin目标不可修改个人清单；解除关系不删用户，重复删除404  |
| GET U/roles                                          | → 默认角色模板与权限说明                                                                                                     | roles.read；没有自定义角色CRUD；按用户配置走permissions接口                                              |
| GET U/identity-status                                | → mode:local、会话策略、安全说明                                                                                             | module.admin.organization；无内部地址/hash/secret，无外部探测                                            |

新增权限管理接口如下；读取/保存他人个人清单只给tenant admin，普通成员通过session读取自己的capabilities。

| Method / URL                                            | 输入→输出                                                                         | 权限与规则                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| GET U/permission-catalog                                | → 有限权限ID/名称/适用scope/可配置标记/默认模板                                   | roles.read；目录不含未来执行权限或平台管理项                            |
| GET/PUT U/members/:id/permissions                       | 无 / permissionKeys、expectedVersion、expectedAuthzVersion → MemberPermissionsDto | members.write且实际tenant admin；替换本用户租户直接清单                 |
| GET/PUT U/workspaces/:id/members/:bindingId/permissions | 无 / permissionKeys、expectedVersion、expectedAuthzVersion → MemberPermissionsDto | members.write且实际tenant admin；替换指定空间直接清单，不能覆盖租户授予 |

MemberPermissionsDto含targetMemberId、targetStatus、scope、templateKey、directPermissionKeys、inheritedPermissionKeys、effectivePermissionKeys、editable、version、authzVersion；只返回目录中的ID和安全摘要。admin目标editable=false，PUT返回409并提示先调整成员资格。targetStatus由账号/租户成员/空间状态派生；有效身份的effectivePermissionKeys按并集计算，账号或租户成员停用时为空，直接/继承清单继续展示为待生效配置。成员详情含authzVersion供角色/状态PATCH使用，普通列表无需暴露其他人的权限清单。普通成员自己的权限仍从session获得，不暴露其他用户清单。

数组有界、去重排序，未知ID/错误scope/保留members.write返回422；越权操作者403、不可见对象404、目标或authz版本冲突409。PUT接受空数组；同内容在版本核验后无新增事件。修改不隐式启用停用成员，不改变role_key来源；成员角色/状态PATCH同样携带expectedAuthzVersion，admin降为member必须给出明确租户清单，升为admin的租户清单必须为空。切换空间模板通过现有成员PATCH显式同时提交roleKey和permissionKeys。两类写入都在同事务更新成员version、tenant.authz_version、审计与通知。归档空间允许调整/解除既有成员权限，业务禁写规则保留。编辑器为未分配空间的成员保存时，使用既有POST空间成员接口一次创建关系和显式permissionKeys；已有关系才调用PATCH/PUT，不先写默认权限再补第二次修改。

平台用户/密码/平台资格只能通过受管工具管理。新租户表单默认首管理员填当前操作者登录名，也可填写另一个已受管创建的精确登录名；不提供公开注册或全站人员检索。

### 4.3 总览与审计

| Method / URL          | 输入→输出                                            | 权限与范围                                                                          |
| --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------- |
| GET U/overview        | workspaceId? → 获权统计、近期事件、可用功能          | overview.read按scope；成员计数还需members.read，无权卡片不可用                      |
| GET U/security-policy | → 固定会话策略和权限目录版本说明                     | 在tenant或任一空间有module.admin.security；内容不含任何凭据                         |
| GET U/audit           | action/actor/from/to/workspaceId?/cursor → AuditPage | 当前个人audit.read约束tenant或空间范围，admin可读全租户                             |
| POST U/audit/export   | 同过滤 → CSV或限制错误                               | 同一事件scope具audit.read/export；读写一致快照、有界生成、generated审计提交后才响应 |

导出读取业务记录并追加自身generated审计，仍需Origin/CSRF和当前权限。使用 `REPEATABLE READ READ WRITE`：最多读取10001行探测10000行上限，完整编码后的CSV最多10MiB；限制错误422、不截断、不返回文件。buffer和审计同用例处理，确认COMMIT后才发送CSV及展示版本头，数据库故障或提交结果未知返回503并丢弃buffer。每次明确导出均重新鉴权并生成独立事件，不承诺下载送达；不存可绕过授权下载的文件。普通列表使用 `REPEATABLE READ READ ONLY`，身份、范围和items/count共用快照，详见[代码设计 §5.1](CODE_DESIGN.md#51-查询快照与审计导出)。无业务/api/reports、boards、memory、files、runs，以及groups、invitations、service-identities和authorization/preview接口；未知API返回404。空页不轮询未来接口。

## 5. DTO 与界面差异

WorkspaceDto为id/name/description/status/version；MemberDto为id/userId/loginName/displayName/roleKey/status/version；WorkspaceMemberDto为id/tenantMemberId/安全用户摘要/roleKey/version；ProfileDto不返回password_hash；SessionDto只含id/deviceLabel/createdAt/expiresAt/revokedAt；AuditDto只含安全动作/主体/对象摘要/结果/时间，禁止原始请求或凭据。

成员与组页保留原型页签标题，主体是直接成员列表和空间分配，组区域为待接入说明。角色与权限页展示默认模板及按成员配置入口；复用PRD §4.3.1的权限编辑器，不提供自定义角色/显式拒绝/委派控件。企业身份页显示本地登录方式，SSO和服务身份区域说明后续接入。现有导航尺寸、页签顺序与视觉Token不变。

服务端handler登记method/schema/action/scope，测试覆盖越权直接请求；隐藏按钮不算授权证据。权限目录、默认模板和个人清单按当前契约校验；后续改变目录需同步PRD与正反例，不以新增未来模块自动授予执行权限。

## 6. HTTP 契约与应用用例映射

本轮个人权限更新新增以下permissions接口并扩展成员DTO；其余URL沿用，原只按角色的授权条件改为当前个人权限。handler 解析请求与凭据，调用 `server/composition.ts` 组装的用例；用例在当前事务/只读快照内核验身份、角色与目标归属。RSC 调相同查询用例，页面和路由不直接访问 SQL 或跳过授权入口。

| 现有接口族                                                  | 应用用例示例                                                                      | 责任模块与必要协作                                                                       |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| auth/login、logout、me/sessions                             | login、logout、revokeOwnSession                                                   | identity；登录跳转所需资格由access查询接口提供，审计/通知同事务                          |
| session、navigation、search                                 | getSessionContext、getNavigation、searchAccessibleObjects                         | identity提供可信身份，access计算viewRevision和当前scope/页面资格；查询载荷与版本共用快照 |
| me、context                                                 | updateProfile、selectContext                                                      | identity维护app_user；selectContext先通过access验证目标，事务内记录切换审计              |
| platform/tenants                                            | createTenant、setTenantStatus                                                     | access；identity复验平台资格和首管理员账号，租户与首管理员原子创建                       |
| tenants/settings、workspaces                                | updateTenantSettings、createWorkspace、archiveWorkspace、listWorkspaces           | access；查询投影与写入模型分开，沿用归档/恢复契约                                        |
| tenants/members、workspace/members                          | addTenantMember、changeTenantMember、assignWorkspaceMember、removeWorkspaceMember | access；身份摘要/锁由identity接口提供，最后管理员与版本约束在应用/领域层落实             |
| roles、permission-catalog、identity-status、security-policy | getRolePresets、getPermissionCatalog、getIdentityStatus、getSecurityPolicy        | access/identity各自提供安全摘要；默认模板只读；个人清单可编辑，无角色CRUD                |
| overview                                                    | getOverview                                                                       | access聚合获权统计，通过audit查询接口读取近期事件，保持同一快照                          |
| audit、me/audit、audit/export                               | listAuditEntries、listOwnSecurityEvents、exportAudit                              | audit；注入身份/access范围接口；列表用只读快照，导出单独读写事务且提交后才响应           |
| me/notifications                                            | listOwnNotifications、markNotificationRead                                        | notifications；身份与当前tenant可见性仍校验，标已读不产生新事件                          |

个人清单PUT统一由access的 `replaceMemberPermissions` 用例执行，先校验操作者与scope，再调用纯策略校验目录和计算最终结果；SQL适配器只替换目标关系行，审计/通知通过同事务接口加入。

请求DTO只携带该操作允许的字段；`roleKey → role` 等映射在入口显式进行，领域模型/PG row不直接返回浏览器。角色和动作ID的代码定义在 `access/domain/permissions.ts`，Zod契约引用允许的纯常量；本节是权限目录与默认模板的设计说明，需求以PRD为准。客户端消费capabilities和角色说明DTO，不维护第二份授权算法。

错误分为领域/用例错误和技术错误：例如最后管理员、停用账号激活或版本冲突在HTTP边界映射409；会话无效401、动作无权403、不可见对象404，其他既有错误沿用§3。编排层与领域层不返回NextResponse；原demo错误结构保持独立。

## 2026-11-02 分析交互与可读地址修订

用户要求分析侧栏顶部随模块显示标题，新建分析使用按钮打开聊天输入界面；移除全部分析会话、分析案例、待我决定入口；时间/主题作为会话列表分组选项。空列表不生成模拟会话，分析执行和上传保持后续范围。页面路径使用持久化租户/空间 slug，旧 UUID 和已移除分析入口兼容重定向。一级及二级导航的图标、描边、选中/悬停/焦点样式对齐原型。此修订覆盖前文对应的四个分析页面及 UUID 页面路径描述。数据库仍为 8 表，新增两列和唯一/格式约束；API、外键、权限使用 UUID。具体迁移、发布和恢复约定见 [技术方案](TECH_DESIGN.md#2026-11-02-分析框架与可读地址修订)。

### 2026-11-02 导航视觉与交互逐项对照

一级/二级菜单图形、尺寸、状态与浮层交互统一按 [导航 UI 对照规范](NAVIGATION_UI.md) 维护，覆盖前文与该规范冲突的视觉描述。导航图形使用原型的 SVG 路径。新建分析及新建定时任务采用同一导航按钮规格；分析移除的三个入口继续保持移除。
