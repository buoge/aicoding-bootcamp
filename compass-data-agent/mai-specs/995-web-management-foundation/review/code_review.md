# Feature 995 代码评审

> 2026-10-26 · Profile standard · 按 my-review-code 阶段契约执行；同一主 Agent 的代码审查与修复后复核。

## 2026-11-02 SPA 修订复核

**建议合并本次修复，无未关闭 P0/P1。** 按用户要求将普通导航更新为 SPA，范围限定 Web 页面、布局、请求生命周期、内部链接和配套测试。由同一主 Agent 对照用户交互要求及当前有效设计完成修复后复核。

HEAD 仍为 `0972e2959095cb22b72b212beba356e020ccdffc`；当前相关 staged 为空，工作区包含初次实施的未跟踪文件。本轮比较 `work/995-spa-baseline/` 与当前内容，纳入新增布局/错误页、页面移动及删除旧路径，代码/测试/配置/README 共 19 个路径。逐项指纹见 `work/995-spa-review-manifest.json`，清单 SHA-256 为 `8c28e8325f3b2b6f155ba3556d42306190e6bff6e4577cd3c1069318a797174a`。不把初次实施和父仓库其他变更纳入本轮归因。

已处理的关键路径：

- `apps/web/src/components/shell/session-boundary.tsx:36`：共享布局保留框架，RSC 页面只发布载荷；同身份/展示版本的过渡沿用原显示期限。普通导航、回退/前进、空间切换与筛选的浏览器断言验证框架 DOM 身份稳定且无文档请求。
- `apps/web/src/client/request-scope.ts:116`、`:249`：旧作用域先销毁和取消请求，迟到成功/错误不能清屏或重定向新页面；对应延迟搜索回归通过。
- `apps/web/src/components/shell/session-boundary.tsx:51`：退役后拒绝尚在途的页面载荷，离线后迟到 RSC 回归确认受保护内容保持关闭。缓存历史载荷复验当前权限，撤权后回退保持隐藏。
- `apps/web/src/components/shell/app-link.tsx:6`：内部链接统一处理未保存确认；取消后草稿保留，保存后刷新保持 SPA。原架构测试的完整文档限制同步改成内部链接经过 AppLink 的检查。
- `apps/web/src/app/globals.css:1`：开发态反复热更新导致登录无法完成；收窄样式扫描范围后开发/生产登录及导航均通过。

Web lint、typecheck、19 项单元测试、生产构建和 17 项 Chromium 生产浏览器回归全部通过。最终运行的本地开发服务也完成真实登录和零文档导航检查。检查范围未涉及数据库结构、其他应用或容器发布；本次未重跑这些检查。完整执行记录见 [实施记录](../IMPLEMENTATION.md#2026-11-02-spa-体验修复验收)。下文为初次完整实施的历史评审。

## 2026-10-26 最终结论

**建议合并，代码评审与本期验收通过。** 原结论为“修改后重新审查”；下列 C01–C07 已逐项修复并取得当前复验依据，无未关闭 P0/P1。Web 19 项单元/边界测试、15 项真实 PostgreSQL 集成测试、12 项生产容器浏览器测试通过，全仓 check/build 与容器 smoke 通过。[实施记录](../IMPLEMENTATION.md)登记 21 项 AC 对照、环境、日志与运行边界。

该结论针对本次 Web 基座与界面框架，不包含 Agent/Memory 业务、零售库新发布、远程 CI 或共享环境上线。未提交、推送或自动合并。

## 范围与基线

有效需求为 [PRD](../spec/PRD.md) 的 21 项 AC，技术依据为 [技术方案](../design/TECH_DESIGN.md)及数据、代码、API 附录；D01/D02 已完成设计复评。重点不变量为当前个人权限、平台与租户隔离、最后有效管理员、写入/审计/通知原子性、导出先提交、文档失权后不可复活与完整原型入口。

基线 HEAD `0972e2959095cb22b72b212beba356e020ccdffc`，包含实施开始时已有的 staged、unstaged 与 untracked 修改。比较依据为本地 `work/995-implementation-baseline/`；当前 104 个受审文件逐项 SHA-256 登记在 `work/995-review-manifest.json`，清单 SHA-256 为 `9d504733b9e5d433c07225a3b7a7fb2e7e32f3cca0cf669c9621bf7965918810`。父课程仓库无关变更保留；首次新增文件纳入当前内容审查，未将整个 HEAD diff 归于 995。

审查沿 Web 路由 → DTO → 用例 → SQL/事务，以及 CLI/迁移、客户端状态机、UI 编辑/导航、测试、Compose/根任务/CI 追踪调用。既有缺口仅在阻断当前交付时处理。原设计评审和人工输入保留；本次由同一 Agent 复核，未声称独立审查。

## 已关闭发现

| ID  | 级别 / 归因                                        | 原触发条件与影响                                                                      | 最小修复、当前位置与复核依据                                                                                                                                            |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C01 | P1 / 已有工作区缺口，原阻断                        | `scripts/format-hook.test.mjs:84` 读取缺失的 `.claude/settings.json`，全仓 check 失败 | 恢复相对软链接至既有 hooks 真源并补目录说明；31 项工具测试、最终 check 通过                                                                                             |
| C02 | P2 / 本次新增实现                                  | 已有空间关系应用新模板后仅 PUT 清单，来源岗位保留旧值                                 | `apps/web/src/features/organization/permissions-editor.tsx:141` 使用 PATCH 同时提交 roleKey/permissionKeys，普通勾选仍用 PUT；浏览器第 10 项验证来源与显式授权均落库    |
| C03 | P1 / 根编排既有能力缺口，本次 CLI 接入暴露，原阻断 | 实际 `db:manage --password-stdin` 管道内容被 Turbo 消耗，首次账号创建失败             | `scripts/tasks.mjs:52` 按 interactive 声明对单个明确 workspace 直接透传 stdin；保留发现机制与 dry-run；根任务 7 项测试及真实根命令创建 → 生产登录/session/退出通过      |
| C04 | P1 / 已有解析器与当前规范源不兼容，原阻断          | Home 只接受单空格表格与旧 REF 语法，构建报 unowned entity；旧测试反例引用过时 FK      | `apps/home/scripts/system-schema.mjs:51`、`:72` 接受对齐空白与显式关系对应的 REF，保持全量覆盖验证；Home 17 项测试及生产构建通过；94 表/1,091 字段/344 关系保持         |
| C05 | P2 / 本次新增实现                                  | 管理侧栏显示首个页签名，原型八领域名称被替换                                          | `apps/web/src/components/shell/app-shell.tsx:173` 改用 sectionTitle；浏览器逐一断言八领域，1440/375px 截图与原型复核                                                    |
| C06 | P2 / 本次新增实现                                  | 侧栏提前乐观切换，用户连续点击可能携带旧版本并与刷新竞争，偏好未按最终操作保存        | `apps/web/src/components/shell/app-shell.tsx:78` 等待保存、禁重复提交并提供失败反馈；浏览器延迟 PATCH 验证 pending 按钮禁用、保存后固定状态落库；取消离开仍保留权限草稿 |
| C07 | P1 / 当前依赖基线风险，已修复                      | Web/Home 原 Next.js 16.4.0 处于公开受影响区间                                         | 两 app 的 Next.js 与 eslint-config-next 升级到 16.4.1、同步锁文件；check/build、重建镜像与生产浏览器全部通过；来源见下方依赖说明                                        |

实现自检修复并经复核的路径：异步 HTTP 错误统一处理、自撤销会话提交后不再因复验而回滚、CLI UUID/text 参数推断、个人安全审计包含受管重置、移动导航焦点恢复、权限范围切换的脏表单状态。均为本次新增实现中的缺陷，当前 PG / 浏览器正反例已通过。

## 关键不变量与测试有效性

- 授权读取当前 active 账户/会话/租户/成员和个人清单，角色模板仅初始化；租户/空间允许项合并，清空无回退，平台资格不自动获取租户权限。服务端查询先按授权范围过滤再计数；普通成员不能写管理员保留项或修改他人权限。
- 普通查询为 RR 只读，普通写入 RC 按 user → session → tenant → target 加锁，导出为独立 RR 读写事务。PG 触发器注入审计/通知失败，验证业务整笔回滚；延迟约束在 COMMIT 时失败，验证没有 CSV 返回。事务单测验证 COMMIT 开始后不自动重放。
- 真实 PG 并发管理员降级得到一成功一冲突，最后有效管理员保留；受管重置与登录竞争后旧 session 均不可用。迁移测试验证空库原生/完整 SQL 等价、并发/漂移/未知目标拒绝、runtime 权限、pg_dump/restore 新库恢复及恢复后 session 撤销。
- D01 用例对真实受保护页面注入延迟/失败，检查 DOM 隐藏、portal 消失和旧响应不可恢复；200 局部撤权仍退役旧文档，重连/历史/换身份以新文档复验。原始 RSC 默认隐藏；普通导航使用完整文档，不恢复旧权限下的客户端缓存。
- 浏览器最终对生产 standalone 镜像运行全部 12 项；覆盖完整页面目录、真实编辑/模板/平台租户与偏好保存、五视口布局/焦点、双标签页与离线。运行时三 Python 服务停止，排除隐藏依赖。原型对照实际检查成员页与业务空页截图。
- 测试缺省拒绝日常数据库，仅接受 `compass_web_test_*` 与显式连接；DDL 故障注入在 finally 清理。最后补充的 PG 场景验证设置版本冲突、通知已读重登、过期 session、统一认证失败及站内回跳，15 项全部通过。

## 非阻断事项与未执行边界

- 远程 GitHub CI 未触发，配置已加入专用 Web PG/恢复/浏览器步骤，本地对应命令通过。默认 Agent 的 11 项零售 PostgreSQL 测试缺专用凭据而跳过；本次未改零售业务，未借用历史结果计为通过。浏览器仅验证 Chromium，未宣称全浏览器矩阵完成。
- Next.js 修复依据为 [GHSA-2464-fhr4-w9xw](https://github.com/advisories/GHSA-2464-fhr4-w9xw)、[GHSA-p3m5-59mp-jv5r](https://github.com/advisories/GHSA-p3m5-59mp-jv5r)、[GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr)。本次本地 `pnpm audit --prod` 仍有 1 high、2 moderate、2 low；未宣称零漏洞。
- 剩余 high 为 Home `shadcn → MCP SDK → express → body-parser` 的[压缩请求尾部字节拒绝服务问题](https://github.com/advisories/GHSA-27r3-jxmh-p828)。当前 `apps/home/src/app/globals.css:3` 仅导入 shadcn 样式，源码未启动该 CLI 的 Express/MCP 服务；据此判断当前 Web/Home HTTP 路径不触发该问题，作为后续工具依赖升级事项保留。
- fast-uri 告警涉及 URI 规范化/主机判断（[scheme](https://github.com/advisories/GHSA-w74x-v6f9-j3xg)、[host](https://github.com/advisories/GHSA-wjr9-j795-jxcr)）。`apps/web/src/lib/overview.ts:7` 只用 Ajv 编译仓库生成的静态 schema，不接受客户端 schema/$ref、不把解析结果用于网络目标授权；Home 相关路径属于 CLI 依赖。当前调用链未发现相应攻击入口，此判断限于现有使用方式。
- 没有新增要阻断本期交付的业务测试缺口。未来接入 Agent/Memory、外部身份、远程 schema、MCP 服务或共享环境时，应按具体需求重新核对边界；本报告不追加当前无消费者的通用平台建设。

## 收尾

复评从原阻断状态收敛到通过；全部 21 项 AC 的当前证据和测试运行命令见 [实施记录](../IMPLEMENTATION.md)。Feature 产物路径、格式和内部引用已由主编排者统一核对，Phase 与 ROADMAP 已结项；没有提交或发布动作。

## 2026-11-02 分析交互与可读地址复核

结论：本轮修改复核通过，无未关闭 P0/P1。范围为分析 UI、导航图标、页面短地址、Web 两列表结构变更、迁移工具及对应测试；HEAD 仍为 `0972e2959095cb22b72b212beba356e020ccdffc`，叠加既有工作区。22 个本轮源码/测试/迁移文件当前指纹登记于 `work/readable-review-manifest.json`；此前 SPA 基线见 `work/995-spa-review-manifest.json`。同一主 Agent 完成当前代码审查与修复复核，未将父仓库其他变更纳入范围。

复核重点及结果：

- 新增 slug 仅负责页面定位；`query-service.ts` 在解析后使用 UUID 调用原有授权，`pg-access.ts` 的空间解析绑定 tenant_id。跨租户与错误空间组合的浏览器请求均关闭业务内容，API 继续接收 UUID。
- 页面导航、登录回跳、空间切换及搜索指向规范短地址，旧链接保留查询参数后重定向；SPA 保留框架和失权清理。版本摘要更新为 v2，使旧客户端载荷及时失效。
- 0001 源摘要保持；0002 独立迁移增加约束。原生迁移和 SQL 均验证版本前缀和源摘要，测试覆盖空库、v1 升级、恢复和 runtime 权限。名称变更不修改 slug，创建冲突由数据库唯一约束处理。
- 分析 UI 不写入模拟会话或结果，不请求 Agent/Memory 执行业务；问题输入和快捷填入参与未保存确认，重新开始清空草稿。时间/主题控件仅切换当前会话列表展示状态，待会话接口接入后填充数据。
- 本轮 19 项 Web 单测、16 项 PG 集成、19 项生产浏览器回归及 build/lint/typecheck/SQL 一致性检查通过。详情与执行边界见 [实施记录](../IMPLEMENTATION.md#2026-11-02-分析交互短地址与导航样式验收)。
