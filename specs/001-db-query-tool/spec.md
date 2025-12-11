# Feature Specification: Database Query & Metadata Assistant

**Feature Branch**: `001-db-query-tool`  
**Created**: 2025-12-11  
**Status**: Draft  
**Input**: 用户添加 DB URL，系统连接并抓取表/视图元数据展示；支持手写 SQL 与自然语言生成 SQL；连接串与元数据存至本地 sqlite；生成/输入 SQL 必经解析仅允许 SELECT，缺省追加 LIMIT 1000；响应为 JSON 供前端表格展示。

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 连接并查看元数据 (Priority: P1)

作为使用者，我可以提供数据库连接 URL，系统连接并拉取表/视图元数据，持久化后在界面展示，
便于了解可用数据结构。

**Why this priority**: 没有元数据就无法后续查询或生成 SQL，是整个工具的起点。

**Independent Test**: 仅输入合法连接串并查看元数据列表即可验证，无需依赖其他功能。

**Acceptance Scenarios**:

1. **Given** 提供有效连接串，**When** 连接成功并拉取元数据，**Then** 展示表/视图及字段信息，并记录上次同步时间。
2. **Given** 元数据已持久化，**When** 刷新页面，**Then** 仍能展示已有元数据且可识别是否需要刷新。

---

### User Story 2 - 运行受控 SQL 查询 (Priority: P2)

作为使用者，我可以提交自写 SQL，系统会解析校验仅允许 SELECT，并在缺省时自动添加
`LIMIT 1000`，返回 JSON 结果供表格展示。

**Why this priority**: 手写查询是核心需求，受控执行确保安全与性能。

**Independent Test**: 只需解析与执行本地可控 SQL，即可验证，不依赖 LLM。

**Acceptance Scenarios**:

1. **Given** 输入合法 SELECT 无 limit，**When** 系统解析并追加 limit，**Then** 返回被限制行数的 JSON 结果并标注已追加。
2. **Given** 输入含 DML/DDL 或非 SELECT，**When** 解析检测到，**Then** 返回结构化错误并拒绝执行。

---

### User Story 3 - 自然语言生成 SQL (Priority: P3)

作为使用者，我可以用自然语言描述查询意图，系统基于已存的元数据上下文调用 LLM 生成 SQL，
再按同样的解析/安全规则执行并返回 JSON。

**Why this priority**: NL → SQL 提升易用性，但依赖元数据与受控执行，应排在后面。

**Independent Test**: 验证生成、解析校验、执行和结果返回即可，不需额外外部依赖。

**Acceptance Scenarios**:

1. **Given** 存在最新元数据，**When** 用户输入自然语言，**Then** 系统生成仅含 SELECT 且带 limit 的 SQL 并执行返回结果。
2. **Given** LLM 生成的 SQL 含非 SELECT 或缺少 limit，**When** 解析发现风险或自动补全，**Then** 补全或拒绝执行并返回原因。

---

### Edge Cases

- 连接串无效或数据库不可达：提示具体错误，不写入本地存储。
- 元数据拉取超时或权限不足：标记失败状态，可重试。
- SQL 语法错误：解析失败返回可读错误，不执行。
- 非 SELECT 或包含写操作：直接拒绝并返回安全错误。
- 未提供 limit：自动追加 `LIMIT 1000` 后执行。
- LLM 生成 SQL 与元数据不一致导致执行失败：提示刷新元数据或调整查询。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统必须允许用户提交数据库连接 URL，并测试连接可达性。
- **FR-002**: 系统必须拉取表/视图元数据并持久化（含上次同步时间），供展示与复用。
- **FR-003**: 用户可输入自定义 SQL；系统在执行前必须解析校验仅允许 SELECT。
- **FR-004**: 若 SQL 未包含 limit 子句，系统必须自动追加 `LIMIT 1000` 再执行。
- **FR-005**: 查询结果与错误必须以结构化 JSON 返回，便于前端表格展示与提示。
- **FR-006**: 用户可用自然语言描述查询；系统利用元数据上下文生成 SQL，再按同样校验与安全限制执行。
- **FR-007**: 解析/生成失败时必须返回可读错误，指明语法、权限或风险原因。
- **FR-008**: 连接串与元数据存储在本地 sqlite（固定路径配置），避免重复拉取并支持复用。
- **FR-009**: 系统必须支持跨源 CORS；无需鉴权，默认所有用户可用。

### Key Entities

- **ConnectionProfile**: 用户提供的数据库连接信息（名称、URL、上次成功时间）。
- **DatabaseMetadata**: 某连接对应的表/视图清单、字段、类型、更新时间。
- **QueryRequest**: 用户输入的 SQL 或自然语言意图、关联的连接与元数据版本。
- **QueryResult**: 解析后执行的结果数据与列描述、行数上限提示、错误信息（若有）。

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 90% 的有效连接在 3 秒内完成并返回元数据概览。
- **SC-002**: 95% 的合法 SQL 请求在 1 秒内返回（不含远端 DB 延迟）。
- **SC-003**: 100% 未带 limit 的 SQL 会被自动追加 limit 并在结果描述中体现。
- **SC-004**: 非 SELECT 或风险 SQL 被拒绝执行的阻断率 100%，错误提示可读。

