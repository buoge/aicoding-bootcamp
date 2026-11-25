# Feature 995 供评审的代码设计

> 状态：`review` · 更新：2026-10-26 · 按 8 表方案融入 DDD、模块化单体与按用户配置权限；以下 TypeScript/SQL/伪代码未写入生产源码、未编译。[返回技术方案](TECH_DESIGN.md)

外围JSX、Zod字段展开和重复CRUD样板省略；核心权限、并发、密码校验、防重复与失效分支在下文展开。前次简化修订运行过Node scrypt内存探针；本次只验证文档，不以代码片段充当编译或集成证据。

## 2026-11-02 SPA 导航修订（当前有效）

用户要求保证基础 SPA 交互体验。本节替代下文 D01 对普通导航强制完整文档跳转的约束；权限范围、初始显示校验和失权清理要求继续有效。

- 使用 `(product)` 共享布局持有 AppShell；页面 RSC 继续调用原有查询用例，客户端通过页面载荷桥接到持久框架。Next Link/router 负责路由、历史和 RSC 请求，不另建路由引擎或页面 API。
- 每次接收页面载荷创建新的页面请求作用域，取消旧请求并清理旧页面草稿；候选载荷通过当前 session/version 探测后才显示。框架 DOM 在普通导航中保留；切页期间内容区可显示加载态，既有侧栏的展示期限沿用原作用域期限。
- 页面载荷、API 与探测都遵守当前身份、展示版本、URL 和请求世代。迟到响应只丢弃自身结果；已销毁作用域不能清屏或重定向新页面。Next 历史缓存的页面同样重新探测，旧版本拒绝显示。
- `reload()` 用于正常保存后的 router.refresh；退出、失权、离线/身份恢复使用独立完整文档恢复入口。初始 RSC 保持隐藏，首次校验后展示；后台/BFCache 恢复保持失权清理要求。
- 内部链接统一 Next Link，GET 表单、搜索、分页和空间切换走客户端导航。未保存草稿在 SPA 导航前确认，取消保留编辑；文档离开继续使用 beforeunload。
- 浏览器验收补齐：连续导航无 document 请求，侧栏/顶部 DOM 和 window 身份保持；前进后退、空间切换、移动抽屉关闭、取消草稿离开；原有撤权、迟到响应、离线与换身份回归保持。

实现位置：`components/shell/session-boundary.tsx` 持有框架和页面作用域，`components/product-page.tsx` 发布已查询载荷，`components/product-content.tsx` 渲染当前业务内容，`client/request-scope.ts` 区分客户端更新与失权恢复。`AppLink` 复用 Next Link 的 onNavigate；数据模型与服务端授权接口保持当前设计。

## 1. 代码组织与依赖

以下均为拟新增位置，现有 demo 页面/BFF/`server/agent-api.ts` 沿用原契约。目录按业务变化原因组织；复杂度集中在身份与组织访问，简单模块仅保留当前所需文件。类型、函数和接口都是设计示意，省略的外围实现不构成已交付入口。

```text
apps/web/src/
  app/                        页面和/api/web/v1；原demo API保留
  components/shell/           原型框架、导航、上下文与SessionBoundary
  components/ui/              原型外观的基础组件
  features/organization/      租户/空间/直接成员、默认模板与个人权限编辑
  features/settings/          本人资料、会话、安全事件与通知
  features/audit/             审计列表/过滤/导出
  lib/page-catalog.ts          安全页面元数据；纯浏览器可用
  contracts/                  Zod请求/响应DTO；引用纯权限ID定义，不含凭据
  client/api.ts               同源fetch、CSRF、版本/错误处理
  server/
    README.md                 业务边界、依赖规则和新增用例步骤
    composition.ts            组装公开用例、PG适配器与同事务协作接口
    http/                     Cookie、CSRF、Origin、输入/输出与错误映射
    platform/db/              pool、事务与只读快照；没有业务SQL
    modules/
      identity/
        public.ts             身份用例及最小协作契约
        domain/               user、session的纯状态规则
        application/          login、revoke-session、update-profile、ports
        infrastructure/       pg-users、pg-sessions、password、login-limit
      access/
        public.ts             组织用例和授权查询契约
        domain/
          permissions.ts      权限ID/适用范围/可授予标记/默认模板
          access-policy.ts    个人允许项合并、单对象/聚合页权限
          tenant-member.ts    成员状态及最后管理员规则
          workspace.ts        归档/恢复/写入条件
        application/
          change-tenant-member.ts
          replace-member-permissions.ts
          create-tenant.ts
          archive-workspace.ts
          list-workspaces.ts
          get-overview.ts
          ports.ts            实际用例需要的事务/存储/协作接口
        infrastructure/
          pg-members.ts       成员加载、版本更新与有效管理员计数
          pg-workspaces.ts    空间写入及授权查询SQL
          pg-access.ts        当前资格、固定scope谓词与总览查询
      audit/
        public.ts             审计协作契约和查询/导出入口
        service.ts            白名单事件、获权查询与有界CSV导出
        ports.ts              存储和授权读取接口
        pg-store.ts           audit_event读写
      notifications/
        public.ts             通知协作契约和本人查询/已读入口
        service.ts            收件人、偏好、可见性与已读规则
        ports.ts              存储和身份/访问读取接口
        pg-store.ts           notification读写
    agent-api.ts              现有显式demo客户端
apps/web/scripts/             迁移、SQL、provision、manage、fixture工具
apps/web/db/main/             一个初始SQL迁移与派生交付
```

目录随对应实现任务创建，不预建空目录。`application` 先按用例文件组织，数量增加后才分 commands/queries。偏好由 identity 更新 app_user，租户设置由 access 更新 tenant；无独立 preferences 配置框架。admin/member资格和空间模板使用有限字面量；个人授权是成员关系上的有限允许项，无动态 Role/Invitation 模型。

静态依赖为 `入口 → 组装后的应用用例 → domain / ports`，`infrastructure → ports`；组装入口注入具体实现。应用层接口只包含必要操作，不暴露 `PoolClient`、SQL字符串、NextRequest 或 Response。`public.ts`、HTTP/组装入口与PG适配器标记 `server-only`，domain/application 保持普通 TS；CLI 复用纯 domain，不导入 Web 的 server-only 入口。

跨模块只使用公开契约及注入接口，禁止直接调用对方私有 repository。同库只读 JOIN 的有限字段契约见数据附录；写入始终由所属模块实现，成功审计/通知加入调用方事务。无跨请求授权缓存；应用用例逐次验证会话与当前资格，layout 只展示外框。

拟在 Web ESLint 增加定向导入约束：domain 不导入 Next/pg/node I/O/contracts/infrastructure；application 不导入 pg/Next/具体适配器；模块内部不导入 composition 或其他模块私有路径；Client Components 不导入 server。`contracts/authorization.ts` 可单向引用纯 `access/domain/permissions.ts` 的类型/常量，其他 server 导入仍禁止。实现同时覆盖 `@/`、相对路径、re-export 与动态导入；现有规则只检查跨 app，以上门禁尚未实现。

### 1.1 模型与类型

```ts
type Version = string;
type TenantRole = "admin" | "member";
type WorkspaceRole = "analyst" | "viewer" | "auditor";
type Permission = (typeof IMPLEMENTED_PERMISSION_IDS)[number];
type ResolvedScope =
  | { kind: "tenant"; tenantId: string }
  | { kind: "workspace"; tenantId: string; workspaceId: string };
type CurrentAccess = {
  userId: string;
  sessionId: string;
  tenantId: string;
  tenantRole: TenantRole;
  tenantMemberId: string;
  authzVersion: Version;
  tenantPermissions: ReadonlySet<Permission>;
  workspacePermissions: ReadonlyMap<string, ReadonlySet<Permission>>;
};
```

ResolvedScope必须由服务端加载并核对资源归属后构造，不能把请求body直接断言成该类型。CurrentAccess仅在用户/会话/租户/租户成员有效时产生。IMPLEMENTED_PERMISSION_IDS取路由附录的有限目录，无通配权限。

状态：user/tenant/member active↔disabled；workspace active↔archived；session active→expired/revoked；workspace_member存在→解除关系；notification unread→read。没有邀请/授权审批状态机。权限编辑器在当前数据上计算直接、继承和有效权限，不持久化预览。恢复tenant_member明确恢复其保留的个人清单和空间分配，不隐式改角色或权限。

`CurrentAccess` 是当前请求的派生视图，不持久化成权限聚合；`ResolvedScope` 是核验后的范围值。领域只持有所需状态与 ID，不持有用户的全部会话/租户成员集合或租户的全部空间。版本在存储边界比较并递增，HTTP 中保持十进制字符串。

模型转换在边界显式完成：Zod 请求 DTO → 用例输入 → 领域状态/变化 → PG row；查询投影 → 安全响应 DTO。密码哈希保留在身份模块的认证路径，其他模块只收到最小用户摘要。HTTP 错误映射集中在 `server/http`；领域错误码不依赖 HTTP 状态码，框架 redirect/notFound 不被吞成通用 500。

## 2. 密码与登录

拟文件 `server/modules/identity/infrastructure/password.ts`；登录编排在 `identity/application/login.ts`，会话有效性规则在 `identity/domain/session.ts`，Cookie/CSRF 在 `server/http`。固定scrypt-v1参数，避免从数据库哈希串读取任意成本。以下调用是Node24真实API形态；输入验证、dummy记录与错误映射由相邻模块承担。

```ts
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
const profile = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const prefix = "scrypt$v1$131072$8$1$";

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, profile, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

async function encodePassword(password: string): Promise<string> {
  assertNewPasswordLength(password); // 12–128字符、UTF-8≤512字节，不trim。
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${prefix}${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  assertLoginPasswordByteLimit(password);
  if (!encoded.startsWith(prefix)) throw unavailable("密码记录格式不可用");
  const fields = encoded.slice(prefix.length).split("$");
  if (fields.length !== 2) throw unavailable("密码记录格式不可用");
  const [saltText, keyText] = fields;
  const salt = Buffer.from(saltText, "base64url");
  const expected = Buffer.from(keyText, "base64url");
  if (
    salt.length !== 16 ||
    expected.length !== 64 ||
    salt.toString("base64url") !== saltText ||
    expected.toString("base64url") !== keyText
  ) {
    throw unavailable("密码记录格式不可用");
  }
  return timingSafeEqual(await derive(password, salt), expected);
}
```

格式错误对外用通用503，详细分类只进脱敏日志。未知账号使用固定成本、有效格式的dummy记录走同样校验；不把真实用户密码哈希送往客户端。限速在哈希前检查，最多2个并行计算，无无界队列；body/密码长度有界。Node探针已验证正确/错误口令，不等于本片段全部异常分支已运行。

登录的决定顺序（伪代码）：

```text
同源Origin/Fetch Metadata/JSON/长度检查 → 解析规范化loginName
申请按loginName和实例的限速/并发名额，超限429
查询用户最小认证记录；不存在则使用dummy hash
在事务外verifyPassword；未知/停用/不匹配统一401并安全审计
事务开始：共享锁该user，重查active及password_hash与刚验证的一致
  如hash已改变 → 拒绝本次旧密码登录
  用当前成员/个人权限解析安全returnPath；不能解析时回退合法入口
  撤销此浏览器原有的同用户session（如存在），其他设备保留
  插入新session：32字节随机token仅返回cookie，DB存SHA-256，expires_at=now+TTL
  同事务登录审计及原会话撤销通知
提交 → 设置cookie并返回安全redirectTo
任何事务失败 → 回滚、不设置有效cookie；finally释放哈希名额
```

读取session先由token hash定位user，再校验user active、session未撤销/未到期。受保护写事务先按UUID顺序锁涉及user，再锁session并复查，之后才锁tenant；密码重置对user排他锁并撤销sessions，确保与登录/写入有明确先后。

CSRF使用HMAC-SHA256(key=原始随机session token,message=compass-csrf-v1)，base64url值仅从同源no-store的GET/session返回。请求头与重新派生值在长度检查后常量时间比较；无需DB csrf_hash或额外加密密钥。过期/无效cookie仍允许同源logout清cookie，不重复记录成功撤销事件。

受管命令不接受口令命令行参数。重置在哈希计算后锁user，写新hash/version，撤销所有会话并审计/通知后提交；旧请求不能用原密码校验结果创建新会话。全站停用需锁所属tenant并保留最后admin；受管恢复不自动创建任何新成员关系。

## 3. 个人权限、默认模板和范围SQL

需求依据为[权限目录](ROUTES_AND_API.md#2-权限目录默认模板与个人授权)，唯一代码源在 `access/domain/permissions.ts`。目录逐项登记label、scopes、personalGrantable；members.write只供admin，平台/self能力不在目录中。空间analyst/viewer/auditor预设仅在创建或显式应用模板时填充完整清单；服务端授权不读取模板标签。下列示意引用该有限目录，不省略运行时未知ID校验。

### 3.1 纯规则与读取

```ts
type GrantScope = "tenant" | "workspace";

function normalizePersonalPermissions(
  input: readonly string[],
  scope: GrantScope,
): readonly Permission[] {
  if (input.length > IMPLEMENTED_PERMISSION_IDS.length) throw invalidPermissions();
  for (const id of input) {
    const rule = PERMISSION_CATALOG.get(id);
    if (!rule || !rule.personalGrantable || !rule.scopes.has(scope)) {
      throw invalidPermissions();
    }
  }
  return [...new Set(input)].sort() as Permission[];
}

function allowed(access: CurrentAccess, permission: Permission, scope: ResolvedScope): boolean {
  const rule = PERMISSION_CATALOG.get(permission);
  if (!rule || !rule.scopes.has(scope.kind) || access.tenantId !== scope.tenantId) return false;
  if (access.tenantRole === "admin") return true;
  if (!rule.personalGrantable) return false;
  if (access.tenantPermissions.has(permission)) return true;
  return (
    scope.kind === "workspace" &&
    (access.workspacePermissions.get(scope.workspaceId)?.has(permission) ?? false)
  );
}

function mayOpenAggregatePage(access: CurrentAccess, permission: Permission): boolean {
  const tenantScope = { kind: "tenant", tenantId: access.tenantId } as const;
  if (allowed(access, permission, tenantScope)) return true;
  return [...access.workspacePermissions.keys()].some((workspaceId) =>
    allowed(access, permission, { ...tenantScope, kind: "workspace", workspaceId }),
  );
}

function mayExportEvent(access: CurrentAccess, eventScope: ResolvedScope): boolean {
  return allowed(access, "audit.read", eventScope) && allowed(access, "audit.export", eventScope);
}
```

数组shape、字符串类型、长度上限由strict DTO先检查，纯规则再次验证目录与范围。空数组合法且永不回退模板；personalGrantable=false即使误出现在普通成员记录中也不能生效。返回CurrentAccess前先核验有效user/session/tenant/tenant_member；ResolvedScope先核验真实资源归属，归档空间业务写入再经领域规则拒绝，成员权限治理按接口契约处理。admin只拥有本租户、相应范围的已登记Web动作。

mayOpenAggregatePage只用于总览/安全框架，内容继续按read动作筛选；组织页要求tenant范围module.admin.organization，成员和权限写入保留给admin。module入口与动作分别校验，导出按同一事件scope同时满足read/export；不能组合A空间的read和B空间的export。

空间列表固定SQL示意：

```sql
SELECT w.id, w.name, w.status, w.version
FROM web.workspace w
WHERE w.tenant_id = $tenant
  AND ($tenant_grants_action OR EXISTS (
    SELECT 1 FROM web.workspace_member wm
    JOIN web.tenant_member tm
      ON tm.tenant_id = wm.tenant_id AND tm.id = wm.tenant_member_id
    WHERE wm.tenant_id = w.tenant_id AND wm.workspace_id = w.id
      AND tm.user_id = $user AND tm.status = 'active'
      AND wm.permission_keys @> ARRAY[$permission]::text[]
  ))
ORDER BY w.name, w.id
LIMIT $limit OFFSET $offset;
```

`$tenant_grants_action`由当前admin资格或租户个人清单计算，`$permission`是服务端为查询固定的workspaces.read，不能从客户端注入授权布尔值或任意动作。适配器只为已核验目录/适用范围的动作构造谓词；参数实际映射为pg位置参数。无空间关系且无租户授权的普通成员不返回该空间；租户授权明确覆盖全部当前及未来空间。

`listWorkspaces`在同一只读快照内取得当前身份/成员清单，再用同一授权和搜索谓词查询items/count。审计查询额外限制tenant_id：租户audit.read允许全租户事件；否则workspace_id必须非空且在获权集合。导出对每条事件计算read/export的范围交集，count也使用同一条件。读取适配器直接返回DTO投影，无需为查询重建写入模型。

行为测试以PRD为预期：同模板两人的结果不同、同人两空间不同、租户授权无空间行仍生效、清空不回退、跨租户和停用拒绝、空间授权不返回tenant-only事件、不同scope的read/export不能拼接；SQL与纯策略各自验证这些预期。

### 3.2 替换个人权限用例

拟文件 `access/application/replace-member-permissions.ts`，租户与空间两个PUT入口调用同一具名用例，scope由服务端核验目标后构造。管理GET返回直接项、租户继承项、有效项、目标状态与两个版本；admin目标editable=false。目标账号/租户成员停用时有效项为空，直接/继承项作为待生效配置显示，不构造有效CurrentAccess。模板仅填充客户端草稿，保存提交明确permissionKeys。

```text
replaceMemberPermissions(sessionToken, target, permissionKeys, expectedVersion, expectedAuthzVersion):
  定位actor与target用户；按UUID升序共享锁用户 → 锁session并验证 → 锁active tenant
  重新取得actor资格；members.write且实际tenant admin才继续
  在tenant内锁目标tenant_member；workspace目标另核验空间归属并锁workspace_member
  目标不存在/跨tenant → 404；归档空间仍允许治理其既有成员权限
  验证目标version及tenant.authz_version；不匹配 → 409，返回可重读的冲突
  目标tenant_member.role_key=admin → 409；必须先显式调整管理员资格
  normalizePersonalPermissions(permissionKeys, target.scope.kind)
  规范化结果与原直接清单相同 → 返回当前权限DTO，无新版本/成功事件
  替换permission_keys、递增目标version、递增tenant.authz_version
  同连接追加scope/目标/addedKeys/removedKeys白名单审计与受影响用户通知
  在同一事务读取新直接/继承/有效结果 → commit → 返回权限DTO
  任何业务/审计/必需通知失败 → rollback；拒绝按统一安全失败路径记录
```

该用例复用下节的同事务ports模式，不建立通用授权引擎。目标停用时允许保存清单，保持停用状态；操作者必须有效。两个版本一起校验，防止空间编辑期间租户继承项已变更却覆盖旧预览。权限清单属于access写入；identity只提供用户/session协作，audit/notifications负责自己的写入。权限修改下一请求生效，session不保存授权快照。

## 4. 直接成员变更与最后管理员

领域规则在 `access/domain/tenant-member.ts`，业务用例在 `access/application/change-tenant-member.ts`，存储在 `access/infrastructure/pg-members.ts`。这个用例覆盖现有 PATCH 的角色/状态修改；输入为严格解析后的有限字段，恢复确认仍由现有 UI/HTTP 契约承载。

### 4.1 纯领域行为

```ts
type TenantMember = Readonly<{
  id: string;
  tenantId: string;
  userId: string;
  role: TenantRole;
  permissionKeys: readonly Permission[];
  status: "active" | "disabled";
  version: Version;
}>;
type MemberChange = Readonly<{
  role?: TenantRole;
  permissionKeys?: readonly string[]; // 仅与显式角色调整一起提交。
  status?: TenantMember["status"];
}>;

class MemberRuleError extends Error {
  constructor(readonly code: "inactive_user" | "last_admin" | "explicit_permissions_required") {
    super(code);
  }
}

function reviseMember(
  member: TenantMember,
  change: MemberChange,
  targetUserActive: boolean,
): TenantMember {
  const status = change.status ?? member.status;
  if (change.status === "active" && !targetUserActive) {
    throw new MemberRuleError("inactive_user");
  }
  const role = change.role ?? member.role;
  if (member.role === "admin" && role === "member" && change.permissionKeys === undefined) {
    throw new MemberRuleError("explicit_permissions_required");
  }
  const permissionKeys =
    role === "admin"
      ? []
      : change.permissionKeys === undefined
        ? member.permissionKeys
        : normalizePersonalPermissions(change.permissionKeys, "tenant");
  return { ...member, role, status, permissionKeys };
}

function requireRemainingAdministrator(activeAdminCount: number): void {
  if (activeAdminCount < 1) throw new MemberRuleError("last_admin");
}
```

领域函数不取数据库、不更新version，也不写通知。DTO schema 负责非空patch、合法枚举和字段长度；permissionKeys只允许随显式roleKey提交，admin输入必须为空，应用层负责操作者资格与预期版本；`reviseMember` 在显式启用时要求账号有效，不阻止管理员处理已停用账号保留的成员角色；`requireRemainingAdministrator` 表达最后管理员不变量。跨成员的事实由事务内有效账号/成员查询提供。全站停用与租户成员修改复用同一条最后管理员规则。升级admin清空租户直接清单；降为member必须给出明确清单并在UI确认保留空间分配会重新生效。空间分配记录保留，不能以角色标签重新生成权限。

### 4.2 用例所需接口与事务组装

接口位于 `access/application/ports.ts`；下面展示成员存储及事务形状。Identity 协作对象只提供身份定位/锁/复验，AuditWriter 与 NotificationWriter 只追加当前事件。各方法在下一节调用处给出顺序与输入语义；HTTP凭据只传入应用层，不传给领域函数。

```ts
interface TenantMemberStore {
  lockInTenant(tenantId: string, memberId: string): Promise<TenantMember | null>;
  saveWithVersion(next: TenantMember, expectedVersion: Version): Promise<TenantMember>;
  countActiveAdminsWithActiveUsers(tenantId: string): Promise<number>;
}

type MemberChangeScope = {
  identity: MemberChangeIdentity;
  access: MemberChangeAccess; // 包含上面的members及租户/当前资格操作。
  audit: MemberChangeAuditWriter;
  notifications: MemberChangeNotificationWriter;
};
type MemberChangeDependencies = {
  transaction<T>(work: (scope: MemberChangeScope) => Promise<T>): Promise<T>;
  recordSafeFailure(context: TrustedFailureContext, error: unknown): Promise<void>;
};
```

`saveWithVersion` 的 SQL 包含 tenant/id/version 条件，只更新 role_key/status/permission_keys、updated_at 并递增 version；零行抛版本冲突，不执行无条件 upsert。`countActiveAdminsWithActiveUsers` 只计 active app_user + active tenant_member(admin)，使用既有租户锁保护读取与写入。上述引用类型为接口形状示意，非完整可编译声明。

Web 组装入口的示意：

```ts
const changeTenantMember = createChangeTenantMember({
  transaction: (work) =>
    withPgTransaction((client) =>
      work({
        identity: bindIdentityForMemberChange(client),
        access: bindAccessForMemberChange(client),
        audit: bindMemberChangeAudit(client),
        notifications: bindMemberChangeNotifications(client),
      }),
    ),
  recordSafeFailure: auditPublic.recordSafeFailure,
});
```

bind函数由各 owner 的适配器实现，全部绑定同一个 `client`；没有全局可变事务对象或运行时服务定位器。`withPgTransaction` 在回调失败时先回滚，再把错误交给调用者；仅对已确认回滚的死锁/序列化冲突最多重试2次。结果未知的连接故障不得重放成功事件。

### 4.3 应用用例

```ts
function createChangeTenantMember(deps: MemberChangeDependencies) {
  return async function changeTenantMember(input: ChangeTenantMemberInput) {
    const failureContext = trustedFailureContext(); // 初始无主体；仅服务端复验后填充。
    try {
      return await deps.transaction(async ({ identity, access, audit, notifications }) => {
        const actorRef = await identity.locateSessionUser(input.sessionToken);
        const targetUserId = await access.locateMemberUser(input.tenantId, input.memberId);
        // targetUserId可空；定位信息不对外返回，也不作为授权结果。
        const users = await identity.lockUsersSharedInUuidOrder(
          [actorRef.userId, targetUserId].filter(isPresent),
        );
        const actor = await identity.lockAndRequireLiveSession(input.sessionToken);
        failureContext.confirmActor(actor.userId);
        const tenant = await access.lockActiveTenant(input.tenantId);
        const current = await access.loadCurrent(actor, tenant.id);
        if (!allowed(current, "members.write", { kind: "tenant", tenantId: tenant.id })) {
          throw forbidden();
        }
        failureContext.confirmTenant(tenant.id);
        const member = await access.members.lockInTenant(tenant.id, input.memberId);
        if (!member) throw notFound();
        assertVersion(member.version, input.expectedVersion);
        assertVersion(tenant.authzVersion, input.expectedAuthzVersion);
        const targetUser = users.require(member.userId); // 未锁到/映射改变则整笔拒绝。
        const next = reviseMember(member, input.change, targetUser.status === "active");
        const saved = await access.members.saveWithVersion(next, input.expectedVersion);
        requireRemainingAdministrator(
          await access.members.countActiveAdminsWithActiveUsers(tenant.id),
        );
        await access.incrementAuthzVersion(tenant.id);
        const event = await audit.appendMemberChanged({ actor, before: member, after: saved });
        await notifications.addMemberChangeForUser(event, member.userId);
        return { resourceId: saved.id, version: saved.version };
      });
    } catch (error) {
      await deps.recordSafeFailure(failureContext, error);
      throw error;
    }
  };
}
```

`locateSessionUser` 无效返回未认证错误；`locateMemberUser` 限定请求tenant，仅返回内部锁需要的用户ID。锁后 session/user/member/tenant 仍重验，缺目标在授权完成后返回通用404。`recordSafeFailure` 在回滚后另开写入，失败则只记录脱敏进程日志并保留原错误；不接收客户端传入的 trusted/authorized 标记。`members.write` 是保留动作，只能由tenant admin资格满足；个人清单无法获得授权分配能力。

`appendMemberChanged` 只构造白名单安全摘要，使用成员ID/新版本组成event_key；`addMemberChangeForUser`按已登记通知来源、受影响用户和当前偏好决定是否插入，必须插入时失败整笔回滚。两者通过同事务接口协作，领域状态不携带HTTP请求、Cookie或原始载荷。

所有角色/个人权限/启停/解除空间操作先取tenant锁，更新和有效管理员计数在同事务。两名admin同时降权时，后取得锁者看到最新结果；可能因自身已失权而拒绝，也可能因最后管理员规则回滚。管理员数不能归零。领域对象保持小范围，数据库承担本用例跨成员、账号事实、审计与通知的原子性。

受管全站停用/平台资格修改先取固定平台advisory锁，再排他锁目标user、按UUID升序锁其所属tenant；模拟变更后校验最后平台admin和每个tenant的有效admin，任一不满足整笔拒绝。账号关系添加先锁目标user再锁tenant，防止检查期间出现新关系。仅重置密码不改成员和admin数量，不需要锁所有tenant。锁有超时，死锁整笔回滚最多重试2次；事务中不执行网络请求或密码哈希。

### 4.4 HTTP 与 RSC 的接入

PATCH handler在 `app/api/web/v1/tenants/[tenantId]/members/[memberId]/route.ts`：校验Origin/CSRF和strict DTO，从Cookie取凭据，将 `roleKey` 显式映射为 `change.role`，将随角色调整提交的permissionKeys映射为直接清单，调用组装后的 `changeTenantMember`，再校验MutationResult DTO。`inactive_user`/`last_admin` 映射为409，缺少降级清单和非法权限映射为422，身份/授权错误为401/403，不可见为404；数据库不可用为503。用例自身仍重新核验身份、权限、状态和version，HTTP预检不代替事务内检查。

RSC 成员页通过组装后的页面查询，在同一只读事务内调用成员查询与导航/展示版本查询，返回安全用户摘要及 §6.1 的页面载荷；HTTP 成员列表复用相同查询能力。禁止页面读PG store或自行fetch本机API。成员编辑UI只消费DTO和capabilities，不导入领域实体或模板来决定最终权限。教学阅读顺序为：路由契约 → 用例 → 纯规则 → ports → PG适配 → 行为测试。

## 5. 简单防重复与事件

```text
createWorkspace(actor, stableId, tenant, name):
  当前会话与tenant范围workspaces.write校验；进入有界事务
  按锁序复验actor、tenant，参数验证
  INSERT workspace(id=stableId, tenant_id=tenant, ...)
    PK或(tenant,name)冲突 → rollback并返回409；无权目标不暴露
  不创建操作者空间分配、不隐式授予其他权限
  插入success audit和通知 → commit → 返回201/id/version

客户端遇到超时：
  保持同一stableId，不自动换ID
  先GET该scope下id：存在则展示真实当前记录；无权/不存在按对应状态处理
  再次POST仍用原ID；若409则提示核对现有记录，不能自动覆盖或直接报成功

update：按expectedVersion更新，零行→404或409，不自动换新version重试
read notification：UPDATE ... WHERE recipient=self AND read_at IS NULL
logout/revoke：只对revoked_at IS NULL的有效目标作状态转换并生成一次事件
```

PK/唯一冲突在应用层分类，整笔业务/审计/通知回滚；不得在已中止的PG事务中继续写成功审计。事务重试只针对可确认回滚的数据库冲突；网络断线造成提交结果未知时，回到查询确认路径。稳定ID不是权限凭证，客户端指定ID仍受scope和当前动作校验。

event_key使用资源ID/新版本或唯一事件ID，通知UNIQUE(event_key,recipient,kind)去重；版本冲突/重复创建没有新成功事件。不保存原请求哈希或回执；普通CRUD不承担未来外部工具的Exactly-once承诺。审计生成CSV是每次独立读取/生成事件，无实体回执。

### 5.1 查询快照与审计导出

普通查询入口使用 `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`；身份、权限、items/count、近期审计和展示版本都使用同一个连接/快照，嵌套模块查询不另开事务。普通管理写入使用 `READ COMMITTED READ WRITE`，按 §4 锁后重新读取当前状态；不把查询隔离设置隐式沿用到写用例。事务参数由 `platform/db` 的具名入口固定，浏览器不能选择。

`audit/exportAudit` 是需要追加审计的查询用例，采用单独的 `REPEATABLE READ READ WRITE` 入口。以下为设计伪代码，尚未执行 PostgreSQL 验证：

```text
HTTP：检查 Origin/CSRF/strict 过滤条件，不创建 CSV 响应或开始流式输出
exportAudit：BEGIN ISOLATION LEVEL REPEATABLE READ READ WRITE
  核验当前用户/session/tenant；按每个事件的 scope 同时约束 audit.read 与 audit.export
  按固定顺序查询最多 10001 行；超过 10000 行 → 限制错误，ROLLBACK
  在内存编码完整 UTF-8 CSV（含表头、引号/公式前缀转义）
  编码后超过 10 MiB → 限制错误，ROLLBACK；不截断，不生成成功审计
  在同一快照计算 viewRevision；生成唯一 event_key
  同连接追加 outcome=generated 审计：安全过滤摘要、行数、字节数、actor/scope
  COMMIT 确认成功后，向 HTTP 层返回 buffer 与 viewRevision
HTTP：此时才返回文件和 X-Compass-View-Revision，private,no-store
任一步失败：丢弃 buffer，按错误契约返回；拒绝/失败审计沿用独立安全失败路径
COMMIT 结果未知：丢弃 buffer、返回 503，不自动重试；不声称事务确定回滚
```

查询、编码和事务均受服务端有界超时约束；事务中不等待浏览器下载、不调用网络服务。`generated` 仅表示文件已生成且审计提交，提交后连接断开不追加“已送达”事件；用户再次明确导出会生成独立事件。导出开始后的并发撤权按请求起始快照处理，后续新请求重新鉴权；不承诺取消已开始的下载。浏览器须在当前页面世代仍有效、响应展示版本匹配时才能创建下载链接，清屏时撤销已创建的 Blob URL。

T09/T11 验证普通查询在插入并发数据时仍保持 count/items 同快照；导出审计插入失败、COMMIT 失败/结果未知均不发送 CSV；10001 行或编码后超限不截断；正常导出能查到对应 generated 事件。事务模式依据 [PostgreSQL 17 SET TRANSACTION](https://www.postgresql.org/docs/17/sql-set-transaction.html)，不能把 `READ ONLY` 当成快照隔离级别。

## 6. 原型框架与客户端失效

拟文件：`lib/page-catalog.ts`、`components/shell/session-boundary.tsx`、`client/request-scope.ts`。本节落实 D01；下列类型、伪代码和状态机供评审，尚未编译或进行浏览器验收。目录条目示意：

```ts
const examplePages = [
  {
    id: "reports-all",
    title: "报告空间",
    scopeKind: "workspace",
    path: "reports",
    requiredPermissions: ["module.reports"],
    kind: "placeholder",
  },
  {
    id: "organization-members",
    title: "成员与组",
    scopeKind: "tenant",
    path: "admin/organization/members",
    requiredPermissions: ["module.admin.organization"],
    readPermission: "members.read",
    kind: "implemented",
  },
] as const;
```

完整目录逐行落实路由附录，不以这两个示例替代 31 页签验收。Server page 先调用当前身份与页面权限查询，再取相应数据；ModulePlaceholder 只接收安全 title/description，无业务 API 客户端依赖。AppShell 接收允许显示的导航 DTO，视觉 Token 引用原型，不导入 Home 的组件源码。

### 6.1 展示版本与一次页面读取

`tenant.authz_version` 继续用于成员编辑的乐观并发。新增的 `viewRevision` 是服务端即时派生、仅供客户端判断是否需要清屏的字符串；不入库、不放 Cookie、不作为授权凭证。其唯一计算入口位于 access 的会话上下文查询，复用 identity 提供的可信身份，固定输入为：

```ts
type ViewRevisionFacts = {
  userId: string;
  sessionId: string; // 数据库会话 ID，不使用 token/hash。
  platformAdmin: boolean;
  permissionCatalogVersion: string;
  activeTenants: readonly { tenantId: string; authzVersion: Version }[];
};
function buildViewRevision(facts: ViewRevisionFacts): string {
  const tenantVersions = [...facts.activeTenants]
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId))
    .map(({ tenantId, authzVersion }) => [tenantId, authzVersion]);
  return sha256Hex(
    JSON.stringify([
      "view-v1",
      facts.userId,
      facts.sessionId,
      facts.platformAdmin,
      facts.permissionCatalogVersion,
      tenantVersions,
    ]),
  ); // sha256Hex 在服务端使用 Node crypto，非密码哈希或授权凭证。
}
// activeTenants 仅包含本人 active 成员关系且 tenant active 的租户；输出只返回摘要。
// 不读取时间、个人偏好或显示名，不造成每次心跳/保存普通偏好都变化。
```

服务端先验证用户/session 当前有效，再在同一快照读本人有效租户的版本；任何这些租户的权限相关变化都会保守地改变摘要。用户切换、会话更换、平台资格变化、成员/租户停用也会改变摘要或直接拒绝请求。这样个人通知、租户选择等跨本人多个租户的页面也能感知失权，不需新增用户级授权版本列。所有影响访问的租户/空间状态与成员变化必须同事务递增所属 tenant.authz_version，具体写入覆盖见数据设计 §4。目录语义变更更新代码中的目录版本。只读摘要不暴露其他租户的 ID 或权限。

RSC 页面由一次有界页面查询返回 `{ viewRevision, navigation, pageData }`；其中身份、页面权限、导航和敏感投影共享一个 `REPEATABLE READ READ ONLY` 快照。页内多个模块通过同连接协作，禁止分别查询后拼接不同时点的版本与数据。查询完成并结束事务后才进入渲染，不在网络发送期间保持事务，也不让后续流式子组件另查敏感数据。DTO 作为初始页面载荷交给边界，服务端组件不在边界外显示用户名、租户名、通知或其他敏感片段。Route Handler 在自己查询/写入的事务中取得响应版本，经 `X-Compass-View-Revision` 返回；普通 DTO 形状保留。GET/session 在 body 中返回同算法的 viewRevision，仍返回当前租户的 authzVersion 和 CSRF。

### 6.2 本期页面导航与 RSC 恢复选择

受保护的产品、个人和平台页面使用 Next Link/router 导航，共享 `(product)` 布局持有框架。页签、空间切换、搜索与筛选分页均局部更新；正常保存调用 router.refresh。AppLink 的 onNavigate 和程序式入口处理未保存草稿确认。登录与失权恢复使用完整文档导航。

每次接收 RSC 载荷创建新的请求作用域，销毁旧作用域并取消旧请求。身份与展示版本一致时保留侧栏/顶部 DOM，内容区等待当前权限探测；框架沿用原展示期限。前进后退的缓存载荷同样重新探测，通过后显示内容。已退役应用拒绝后续迟到的 RSC 载荷；已销毁作用域的结果和错误都不能操作新页面。

每份新文档的敏感根节点在服务端 HTML 中默认 `hidden`/`inert`，首个绘制及 hydration 前均保持遮蔽；只显示不含个人数据的加载状态。不得只用 hydration 后的 useEffect 再遮蔽。初始复验有效、版本与本次 RSC 载荷相同、页面权限仍满足且期限有效后，才开放敏感子树与写入；初始复验失败/版本不匹配保持遮蔽，提供完整文档重新加载的安全重试或回到获权入口，不自动连续 reload。

已显示页面发生权限变化或恢复事件时，先不可逆地清理该文档的敏感状态，再重新加载完整文档；旧文档不重新开放。新文档继续执行初始门禁。新页面加载或复验失败只保留安全错误/重试入口，不能回显旧 children 或草稿。每份 RSC 载荷必须同时满足当前身份、页面权限、展示版本和有效期限。

### 6.3 请求世代与复验状态机

边界仅保留以下内存状态；不写浏览器持久化存储：

```ts
type DisplayState = {
  phase: "boot" | "active" | "retired";
  generation: number; // 每次失效增加；覆盖数据请求、心跳、错误及保存回调。
  viewKey: string; // 当前规范化本地 URL，含 tenant/workspace/page/过滤与分页。
  viewRevision: string | null;
  probeSequence: number;
  deadline: number; // performance.now() 的期限；另受 session expiresAt 限制。
};
type RequestTicket = { generation: number; viewKey: string; viewRevision: string };
type ProbeTicket = { generation: number; viewKey: string; sequence: number; sentAt: number };
```

`retire(reason)` 的统一顺序是：同步设置敏感根节点 hidden/inert 并禁写 → phase=retired、generation++、probeSequence++ → abort 所有数据请求及心跳 → 清 DTO、草稿、旧 CSRF、游标、通知浮层及 Blob URL → 卸载敏感子树。安全事件触发时不弹出“保留草稿”阻止清理。旧 generation 的成功、失败、finally 回调全部失效，不得改 DOM、显示 toast、续期或重定向。当前文档进入 retired 后只允许安全重试/整页导航。

```text
boot：只启动一次初始复验；初次 pageshow(persisted=false) 不重复启动第二条链路
startProbe：同一文档最多一个在途复验；记录 generation/viewKey/sequence/sentAt，5秒超时
  超时先作废 sequence 并 abort；晚到响应即使成功也丢弃；不续期
onProbeResult：先比对 generation/viewKey/sequence、abort 状态及当前文档可见/在线
  任一不符 → 丢弃；此规则同样用于旧 401/403/网络错误
  当前 401/403 → retire，按安全登录/获权入口完整文档回退
  boot 中 503/网络错误 → 保持遮蔽，只显示安全重试
  active 中临时失败 → 不延长原 deadline；到期必须 retire，离线则立即 retire
  成功但返回时已超过 sentAt+30秒或 session 已到期 → 不开放/不续期
  boot 且响应版本 == 本次 RSC 载荷版本、页面仍获权 → active，安装 CSRF 与 deadline
  active 且响应版本 == 当前 viewRevision → 只更新安全上下文及 deadline，不恢复已清内容
  active 且响应版本不同（即使 HTTP 200）→ retire，重新加载当前安全 URL
  retired → 丢弃所有复验结果；恢复必须经过新文档 boot

数据请求/保存回调：仅 active 且未到期/在线时发出，捕获 RequestTicket
  返回后先比对 generation/viewKey/phase、abort、deadline，失配直接丢弃
  当前 401/403 → retire；当前其他错误按既有表单错误规则处理
  成功且 X-Compass-View-Revision 缺失/不同 → 不安装结果，retire 并重新载入
  成功且版本相同 → 仍属当前世代时才显示 DTO、保存反馈或创建下载链接
  响应不得直接覆盖边界版本、延长 deadline 或自动重放写操作
```

有效心跳从发起时间计算最多 30 秒的期限，前台每 15 秒复验；专用到期定时器负责清屏，所有异步回调和写入入口也检查期限。成功心跳只有仍处 active 时才能续期；一次失效后的新成功响应无法恢复旧子树。新 revision 不比较字符串大小，也不由任意数据响应“升级”；通过新文档当前服务端查询重新建立上下文。

`visibilitychange(hidden)`、pagehide、offline、本地身份/撤权广播都先 retire。visibility 返回 visible、online 或 pageshow(persisted=true) 时保持旧根节点遮蔽并完整重新加载当前 URL；重复事件每份文档只发起一次 reload。正常首次 pageshow 只走 boot。意外发生同文档 popstate 也 retire 并重载，不能在旧文档直接恢复敏感路由。重新加载不增加历史条目；正常链接导航增加条目，前进/后退与深链仍可用。

同步遮蔽使用显式 DOM hidden/inert 配合 React 同步清理，下一次 React 提交不得解除 retired 文档的遮蔽。默认隐藏和 visibility/pagehide 双入口共同处理恢复；浏览器生命周期事件的实际时序仍须 V05 证明。依据 [pageshow](https://developer.mozilla.org/en-US/docs/Web/API/Window/pageshow_event) 与 [pagehide](https://developer.mozilla.org/en-US/docs/Web/API/Window/pagehide_event) 的事件语义设计，不依赖 pagehide 在所有移动场景必达，也不宣称能撤回已经获得的截图或信息。

### 6.4 D01 的实施反例

以下并入既有 T07/T11、V05 和 AC-995-35/42/44，无新增业务 AC：

| 场景                                                                | 必须观察到的结果                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 聚合审计只撤 B，保留 A 与模块入口，session 返回 200                 | viewRevision 改变后先清屏、退役旧文档；新页面仅含 A                |
| 旧数据晚于新复验/新数据、旧心跳晚于超时后的新心跳                   | 旧 generation/sequence 无法安装数据、退回版本或续期                |
| 新页面加载/初始复验失败，或权限在 RSC 与初始复验之间改变            | 敏感根节点持续隐藏，显示安全重试，不恢复旧 children、不循环 reload |
| 另一标签页换用户/会话；平台资格变化；本人退出某个租户后查看个人通知 | revision 变化或身份拒绝触发清理；无前一身份/租户信息回填           |
| 当前页权限丢失、失效响应为 401/403、旧请求错误迟到                  | 当前失权立即清理；旧错误不干扰新文档                               |
| hidden、离线、BFCache、浏览器前进/后退、窄屏恢复                    | 恢复前遮蔽；重新加载和核验通过后才开放，无失权闪现                 |
| 心跳失败、数据请求持续挂起、保存回调延迟                            | 原 deadline 到期仍清屏，禁止写入；不靠请求未结束延长展示           |
| 普通切页/带过滤分页/新标签页/取消脏表单离开                         | 导航入口一致；取消不离开，确认后完整导航；无 Next SPA 缓存捷径     |

以上为待实施验证清单，不能以状态机文字或定时器单测替代真实浏览器证据。

## 7. SQL 交付与固定工具适配

本版只有0001_web_foundation一个初始revision；首次增量清单直接引用原生SQL，不预建历史区间包。下列薄适配保留项目SQL/源校验契约，V03仍需真库等价验证。

拟文件：`apps/web/scripts/db-sql.mjs`、`db-migrate.mjs`。沿用前轮对 node-pg-migrate 9.0.0 包源码和类型的只读检查，尚未执行迁移。其 MigrationLoaderStrategy 支持 extensions 和 loader，MigrationUnit 包含 id/filePaths/actions。以下伪代码明确原生与离线打包复用点：

```ts
type SqlRevision = { id: string; path: string; sha256: string; up: string };

function parseRevision(path: string, bytes: Uint8Array): SqlRevision {
  const text = decodeUtf8Strict(bytes);
  const id = basenameWithoutExtension(path);
  if (!/^\d{4}_[a-z0-9_]+$/.test(id)) throw new Error("Invalid revision name");
  const upMarker = "-- Up Migration";
  const downMarker = "-- Down Migration";
  const boundaries = locateUniqueWholeLineMarkers(text, upMarker, downMarker);
  if (boundaries.up >= boundaries.down) throw new Error("Invalid SQL sections");
  const up = text.slice(boundaries.upEnd, boundaries.down).trim();
  if (!up) throw new Error("Empty up migration");
  return { id, path, sha256: hashBytes(bytes), up };
}

function sourceRecordSql(r: SqlRevision): string {
  // id 和 hash 已由固定格式约束；实际实现仍用库的 SQL literal quoting。
  return sqlLiteralTemplate(
    "INSERT INTO web_meta.migration_source(revision, sha256) VALUES (?, ?);",
    [r.id, r.sha256],
  );
}

function nativeUnit(r: SqlRevision) {
  return {
    id: r.id,
    filePaths: [r.path],
    actions: {
      up(pgm: MigrationBuilder) {
        pgm.sql(r.up);
        pgm.sql(sourceRecordSql(r));
      },
      down: false, // 本期恢复走备份切库，不能把 DROP 当数据恢复。
    },
  };
}

function offlineBody(revisions: readonly SqlRevision[]): string {
  return revisions
    .map((r) =>
      [
        r.up,
        sourceRecordSql(r),
        sqlLiteralTemplate("INSERT INTO web_meta.pgmigrations(name, run_on) VALUES (?, NOW());", [
          r.id,
        ]),
      ].join("\n"),
    )
    .join("\n");
}
```

外层打包器加入 `BEGIN`、固定项目 advisory lock、目标/前置版本检查；empty 包加入与 9.0.0 一致的 pgmigrations 表定义，增量包不建第二份账本；结尾核验目标版本后 COMMIT。每份 SQL有 owner/key/from/to/tool/source 信息，manifest 存文件 hash，文件不自含自己的 hash。没有时间戳装饰造成反复生成差异，run_on 的 NOW 是 SQL语义，不在生成时展开。

受管执行顺序：

```text
校验 CLI 明确 owner/from/to 与目标 URL（不打印 secret）
连接迁移专用账号，持有 web/main 专用 advisory lock，超时则失败
读取 database/schema/实际权限和当前版本、已应用源 hash
拒绝未知对象、错误起点、历史 hash 漂移或包摘要不一致
若已是目标且 hash 完全一致：返回 already_applied，不执行 SQL
原生模式：调用 runner(dbClient, singleTransaction=true, noLock=true,
                     checkOrder=true, migrationsSchema=web_meta,
                     migrationsTable=pgmigrations, 自定义 SQL loader)
    noLock=true 仅因外层已持有同一项目锁；不得公开绕过外层的入口
SQL 模式：在同连接执行经核验的整包 SQL，不按分号切割
验证版本与 source 表一致；报告应用成功
失败：rollback，并报告可查询的实际版本；finally 释放锁/连接
```

原生工具会在迁移事务外准备版本表；首次失败后可能只留下已知空账本。这是允许的工程准备状态，下一次必须核验其精确结构与空版本，再继续；其他未知对象一律拒绝。业务 DDL和 source 行与 pgmigrations 版本写入仍在迁移事务内。

**评审点：** 项目只维护 SQL 分段与固定工具账本的小适配，不另建通用迁移框架；SQL 与原生共用 parseRevision/up/sourceRecordSql。V03 必须比较所有表/索引/FK/check/权限/版本与源记录，并验证 SQL 执行后原生工具识别已到目标。任何工具升级先执行这些等价性验证；检查失败就暂停迁移交付。

## 2026-11-02 分析界面与短地址实现

`AnalysisComposer` 提供问题编辑及快捷填入；`AppShell` 持有列表分组选择，并使用统一的模块图标映射。`page-catalog` 识别 slug/旧 UUID，查询用例将页面引用解析为 UUID 后执行现有授权；SessionView 中的 scope 保持 UUID，tenant/workspace 投影附带 slug 用于导航。页面入口在载荷通过鉴权后重定向到规范路径。旧分析子路由跳转到新建分析，未实现的执行/上传按钮保持禁用。短标识在创建输入中校验，持久层唯一约束保证并发创建的一致性；改名不更新 slug。数据库与发布约定见 [技术方案最新修订](TECH_DESIGN.md#2026-11-02-分析框架与可读地址修订)。
