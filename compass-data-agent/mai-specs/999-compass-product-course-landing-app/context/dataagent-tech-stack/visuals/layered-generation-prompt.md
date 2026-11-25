# 完整分层架构图生成记录

生成日期：2026-09-16。工具：内置 image_gen。

内容唯一源：learner-kit/code/dataagent/technical-architecture.md 第 4.1 节；覆盖八层逻辑职责与跨层治理，目标图包含后续能力，不表示 M0 已交付。

以下为实际首次请求。内置参考仅用于编辑型信息设计，绿色配色沿用用户要求。

```text
Use case: infographic-diagram
Asset type: detailed, publication-quality system architecture map for a Chinese enterprise Agent engineering course. This is the final full layered architecture, not a simplified request-flow sketch.

Primary request: Design a comprehensive DataAgent enterprise Agent layered architecture diagram covering frontend applications down to infrastructure, including business services, agent components, all data stores and external integrations, with cross-cutting governance. Make the contents readable and exact. A clear layered architecture with nested containers is essential; do not collapse this into 5 generic boxes.

Reference image: supplied image is STYLE REFERENCE ONLY for white background, crisp technical editorial typography, disciplined alignment, precise thin borders and icons. Do not copy its text, topology, huge numbers, tall ratio, or navy palette. USER OVERRIDE: use emerald green #006b46 text and accents, pale mint fills, white background, subtle warm orange only for isolated or optional boundaries. Flat clean engineering drawing: no 3D, no shadow, no glow, no decorative robot.

Canvas: spacious landscape 2560 x 2048 (5:4), high resolution and sharp Chinese typography, generous margins. The primary diagram occupies 84% width; a slim right column occupies 16% width with two stacked cross-cutting panels spanning all runtime layers. Eight clearly separated horizontal layers run top to bottom. Left-hand label rail names each layer without huge numbers. The layers themselves are WHITE or alternating extremely pale mint, not saturated solid bands. Emphasize nested runtime/app ownership. Exact labels below, shorter lines allowed but do not invent components. Headings Chinese, technology names English.

Header, restrained:
Title "DataAgent 企业级 Agent 分层架构"
Subtitle "从前端应用到数据与执行基础设施"
Small note "逻辑分层 ≠ 独立微服务 · 后续能力按阶段引入"

LAYER 1, left label "应用体验层":
One broad container labeled "Next.js · apps/web", with three internal columns:
"经营分析工作台" / "任务 · 报告 · 证据"
"租户管理" / "数据源 · 成员 · 配额"
"平台运营" / "审计 · 成本 · 评测"
At the right within this layer, a small separate DASHED container "扩展 Apps（按需）" / "管理端 · 业务应用".
The three current role views are one web app, not three apps.

LAYER 2, left label "接入与 BFF":
Small left box "Nginx / Ingress" / "TLS · 同域路由"
An arrow to a large box "Next.js BFF · apps/web" / "OIDC 会话 · 页面聚合 · 命令转发 · SSE"
Inside small note "与前端同一 Node 应用". Do not depict BFF as a separate new app.
Small downward arrow from BFF to the FastAPI container in layer 3, label "领域 API".

LAYER 3, left label "领域服务层":
One broad outer container header "FastAPI · apps/agent-api". Five compact columns inside:
"租户与授权" / "身份 · RBAC"
"Run / Timeline" / "状态 · 持久事件"
"数据源与指标" / "口径 · 权限"
"报告与产物" / "元数据 · 引用"
"审批命令" / "Action 写入：后续"
All five are internal business modules, NOT separate services.

LAYER 4, left label "持久调度层":
Draw precise horizontal row: [Outbox / 平台库命令表] → [Dispatcher / apps/dispatcher] → [Temporal Service / 历史 · 任务队列] ↔ [Python Worker / Workflow · Activity].
Keep Outbox explicitly a table, not a broker. No Kafka.
Small label near the Temporal-Worker bidirectional connection "轮询 / 完成".
Small note "Workflow 与 Activity 代码运行在 Worker".
Thin downward arrow from Python Worker to Worker-owned runtime in layer 5.

LAYER 5, left label "Agent Runtime":
Single outer boundary "apps/worker · 进程内模块".
Prominent full-width inner strip "Harness" then "Plan → Act → Verify" and short small text "预算 · 停止条件 · 重规划".
Below it four compact internal modules:
"Context" / "组装 · 裁剪"
"Knowledge" / "检索 · Evidence"
"Memory" / "召回 · 失效"
"能力与 Action 策略" / "选择 · 授权 · 验证"
No outer model services or sandbox inside this Worker boundary.

LAYER 6, left label "能力接入与隔离":
Three modest boxes with header above them "Worker 内适配模块":
"LLM Runtime" / "Provider Adapter · 路由 · 重试"
"Query Gateway" / "SQLGlot · 只读 · 限额"
"Tool / Skill / MCP" / "工具契约 · 调用适配"
Beside them, a clearly SEPARATE outer container "apps/sandbox-gateway" / "创建 · 限额 · 回收".
Arrow from that gateway to a distinctly dashed ORANGE containment box "隔离 Sandbox" / "DuckDB · pandas · PyArrow" and small text "授权快照 · 无平台凭据".
Do not put sandbox-gateway inside the Worker-owned border. It is an independent app.
Below these modules a slim external dependencies strip divided into four clearly named parts, header "外部依赖":
"模型 Provider / Embedding / Reranker" ; "零售业务数据源（只读）" ; "企业工具 / MCP（按需）" ; "OIDC 身份服务".
No need to draw numerous arrows to this external strip; its label explicitly distinguishes external dependencies.

LAYER 7, left label "数据与存储层":
Five distinct storage-shaped groups, under one faint layer band with no suggestion they share accounts:
"平台 PostgreSQL" / "Run · 审批 · Outbox · 审计"
"Web 会话存储" / "独立 schema / 账号"
"pgvector" / "Knowledge · Memory 索引"
"S3 / ArtifactStore" / "快照 · 证据 · 报告"
"Temporal 存储" / "Workflow 历史"
Small note across this layer "平台库 / 会话 / 业务数据源 / Temporal 分离账号与职责；pgvector 可与平台库同实例".
Avoid picturing pgvector as a mandatory separate cluster. This row represents data responsibilities and can use simple cylinder line icons.

LAYER 8, left label "部署基础设施":
One horizontal foundation strip with four groups:
"Node / Python 容器"
"Docker Compose"
"网络隔离 · Secret · 资源配额"
"备份恢复 · Kubernetes（后期）"
This row supports the runtime but has NO request-flow arrows passing through it.

RIGHT CROSS-CUTTING COLUMN:
Top panel "安全与治理" with separate horizontal readable small lines:
"身份委托 / OIDC"
"租户隔离 / RBAC"
"执行策略 / 审批"
"配额 / 密钥 / 脱敏"
"业务审计"
Bottom panel "可观测与评测" with separate horizontal readable lines:
"OpenTelemetry"
"Trace / Metrics / Logs"
"Run / Step / Attempt"
"成本 / 告警"
"Case / Trial / Grader"
"回归 / 发布门禁"
Use braces or subtle tall lines to imply these apply across layers, not chains in the main request path. No tool brand invented.

BOTTOM OUTSIDE ALL RUNTIME LAYERS:
Clearly separated engineering band "工程组织与交付（非运行时）"
"Turborepo + pnpm + uv" ; "apps：独立应用" ; "packages：至少两个 app 复用" ; "CI：契约校验 · 测试 · 镜像"
No arrows from this band into runtime.
Small legend/footer: "实线容器：当前职责边界    虚线容器：扩展或隔离区域（见标签）    M0 只读分析，真实写入为后续候选"

Constraints: precise legible Simplified Chinese, exact technology spellings. Layer labels must appear once each, all eight layers included, no missing data layer. Correct relationships and ownership are more important than decoration. Use larger text with adequate breathing space, align boxes, no tiny paragraphs. Do not add Redis, Kafka, Celery, vector cluster, service mesh, extra LLM framework or fictitious metrics. Do not place external services within Worker ownership. Do not claim all features already delivered. Only sparse meaningful arrows, no tangled full mesh.
```


## 成图检查

- 八层完整呈现：应用体验、接入与 BFF、领域服务、持久调度、Agent Runtime、能力接入与隔离、数据与存储、部署基础设施。
- FastAPI 业务模块和 Worker 内模块分别归组；Sandbox Gateway 与隔离执行器不在 Worker 边界内。Next.js BFF 标注与前端同一 Node 应用。
- Outbox → Dispatcher → Temporal 与 Worker 轮询 / 完成关系正确；Outbox 明确标记为平台库命令表。
- 平台库、Web 会话、pgvector、S3、Temporal 存储分别呈现；模型、只读业务源、企业工具和 OIDC 属于外部依赖。
- 安全治理与可观测评测侧栏独立；Turborepo / pnpm / uv 在“非运行时”底栏。
- 扩展 Apps 虽与当前角色视图同处应用体验层，使用虚线与“按需”标识，不属于当前 apps/web 的已实现角色视图；它们未来各有独立 app。
- Action 写入、Kubernetes、扩展 Apps 的阶段标识可读；完整方案不代表 M0 已实现。
- 本次只生成一次，无定向修图。架构图是逻辑总览，未绘出所有存储访问和事件回传线；实际事务、调用与状态权威仍以技术架构文档为准。
