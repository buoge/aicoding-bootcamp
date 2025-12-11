<!--
Sync Impact Report
- Version change: 1.0.2 -> 1.0.3
- Modified principles: none (restored prior five principles)
- Added sections: none
- Removed sections: none
- Templates requiring updates: ⚠ .specify/templates/plan-template.md, ⚠ .specify/templates/spec-template.md, ⚠ .specify/templates/tasks-template.md (review alignment)
- Follow-up TODOs: none
-->

# db_query Constitution

## Core Principles

### I. Typed Contracts Everywhere
严谨的类型标注是非可选项：后端采用“Ergonomic Python”风格并要求显式类型，前端使用
TypeScript；所有 API 输入输出以 Pydantic 定义的模型为准，JSON 字段使用 camelCase，
避免混用 snake_case。类型/模型是唯一的契约来源，变更需同步更新前后端。

### II. Safe SQL Generation & Execution
任何进入执行路径的 SQL 必须先经过 sqlparser 校验，仅允许 SELECT；若无 LIMIT，自动追加
`LIMIT 1000`。基于 LLM 生成 SQL 时，必须将数据库 metadata 作为上下文并保留解析校验环节，
拒绝无法解析或潜在写操作的语句，并返回清晰错误。

### III. Metadata as First-Class Context
数据库连接信息与已解析的表/视图元数据持久化到 `~/.db_query/db_query.db`（sqlite），并
维护“最近拉取时间”。所有 LLM 生成/辅助功能都应优先复用本地 metadata，必要时再刷新，
以减少重复开销并保证上下文一致性。

### IV. Consistent API & UX
后端 FastAPI 必须开启 CORS 允许所有 origin；无需鉴权，任何用户可直接使用。所有响应为
结构化 JSON，错误也返回 JSON，字段名遵守 camelCase。前端交互应保持表格化结果展示、
易读的错误提示，并对长耗时操作提供加载状态。

### V. Testability & Observability
关键路径（SQL 校验、metadata 持久化、LLM 生成流程包装）需有可重复的自动化测试。记录
关键日志：连接/解析/生成/执行流程的输入输出与错误，用于排查问题；禁止在日志中写入敏感
凭据（如连接串和 API Key）。

## Additional Constraints
- 技术栈：后端 Python (uv) / FastAPI / sqlglot / openai sdk；前端 Vue3 + TypeScript
  + 代码须保持严格类型（mypy/pyright 友好）
- 数据模型：使用 Pydantic 定义并导出 JSON，字段名 camelCase
- 连接与存储：DB 连接与 metadata 持久化在 `~/.db_query/db_query.db`
- 交互要求：无鉴权；CORS 允许所有 origin；响应必须为 JSON
- SQL 规则：仅允许 SELECT；缺省追加 LIMIT 1000；解析失败返回结构化错误

## Development Workflow & Quality Gates
- 变更必须同步更新 Pydantic 模型与前端类型定义，避免契约漂移
- 新功能需覆盖：SQL 校验/解析、metadata 读取/刷新、LLM 生成包装的测试
- 对外响应需保持稳定字段命名（camelCase），变更需在 PR 中声明
- 运行依赖（OPENAI_API_KEY、DB 文件路径等）须在文档或样例 env 中明确

## Governance
- 本宪章高于其他实践文档；所有 PR/Review 需显式检查：类型契约、SQL 安全、camelCase、
  Pydantic 使用、CORS/无鉴权约束是否满足
- 修订流程：更新本文件并在 PR 说明版本变更与原因；通过后生效
- 版本策略：语义化
  - MAJOR：原则被移除/推翻或新增严格限制
  - MINOR：新增或强化原则/约束、增加节
  - PATCH：措辞澄清、非语义改进
- 日期要求：Ratified 为首次采纳日期；每次修订更新 Last Amended

**Version**: 1.0.3 | **Ratified**: 2025-12-11 | **Last Amended**: 2025-12-11

