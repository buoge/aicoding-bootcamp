# Implementation Plan: Database Query & Metadata Assistant

**Branch**: `001-db-query-tool` | **Date**: 2025-12-11 | **Spec**: `specs/001-db-query-tool/spec.md`  
**Input**: 用户添加 DB URL，系统连接并抓取表/视图元数据展示；支持手写 SQL 与自然语言生成 SQL；连接串与元数据存至本地 sqlite；生成/输入 SQL 必经解析仅允许 SELECT，缺省追加 LIMIT 1000；响应为 JSON 供前端表格展示。

**Note**: 按 `/speckit.plan` 流程生成；后续 Phase 2 任务由 `/speckit.tasks` 完成。

## Summary

构建“数据库查询与元数据助手”：后端 FastAPI + sqlglot（Python/uv），前端 Vue3 + element-ui +
monaco editor，使用 deepseek LLM（用户稍后提供 API key）。

连接与元数据持久化到
`~/.db_query/db_query.db`（sqlite）

；LLM 生成 SQL 时携带元数据上下文；

所有 SQL 解析校验仅允许 SELECT，缺省自动追加 `LIMIT 1000`；

返回 JSON（camelCase）供表格展示；

CORS 允许所有 origin，无鉴权。

## Technical Context

**Language/Version**: Python 3.11+ (uv)、TypeScript (Vue3)  
**Primary Dependencies**: FastAPI, sqlglot, pydantic, deepseek SDK（待 key）, Vue3, element-ui, monaco editor  
**Storage**: 

* Local: sqlite (`~/.db_query/db_query.db`) 持久化连接与元数据；查询针对用户指定外部 DB  
- Remote: PostgreSQL (user-provided) for query execution

**Testing**: 

    pytest（后端）；前端 Vitest/组件测试可选；类型检查 mypy/pyright + tsc  
**Target Platform**: 

- Backend: Cross-platform (Linux/macOS/Windows), runs as local web server
- Frontend: Modern browsers (Chrome, Firefox, Safari, Edge)

**Project Type**: 前后端分离 Web  
**Performance Goals**: 95% 合法 SQL 请求 <1s（不含远端 DB 延迟）；连接+metadata 拉取 90% <3s  
**Constraints**: 仅允许 SELECT；缺省 limit 1000；JSON camelCase；无鉴权但需安全拒绝写操作  
**Scale/Scope**: 单用户/小团队；表/视图中等规模（千级以内假设）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- Typed contracts：后端 Ergonomic Python + 类型标注，前端 TS；Pydantic 定义 API 模型；JSON camelCase。
- SQL 安全：仅 SELECT，sqlparser 校验；默认追加 limit 1000；拒绝写操作。
- 元数据上下文：连接/metadata 持久化 sqlite，LLM 使用上下文，必要时刷新。
- API/UX 一致性：FastAPI 开启 CORS（允许所有 origin），无鉴权；响应/错误 JSON 结构化。
- 可测/可观测：关键路径需自动化测试；日志避免敏感信息。

GATE 结果：通过（当前计划遵守上述约束）。后续如有偏离需记录 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/001-db-query-tool/
├── plan.md          # 本文件
├── research.md      # Phase 0 输出
├── data-model.md    # Phase 1 输出
├── quickstart.md    # Phase 1 输出
├── contracts/       # Phase 1 输出
└── tasks.md         # Phase 2 (/speckit.tasks)
```

### Source Code (repository root)

```text
backend/
├── app/
│   ├── api/         # 路由
│   ├── core/        # 配置
│   ├── models/      # Pydantic/ORM 模型
│   ├── services/    # 业务逻辑：连接、metadata、SQL 校验/执行、LLM 包装
│   └── db/          # sqlite 访问
└── tests/
    ├── unit/
    ├── integration/
    └── contract/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/
```

**Structure Decision**: 采用前后端分离结构，上述 backend/frontend 目录为主要交付，tests 覆盖单元/集成/契约。

## Complexity Tracking

> 当前无违反宪章的设计，无需记录。如后续新增违反项，请在此表登记。

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |

## Phase 0: Outline & Research

### Unknowns / NEEDS CLARIFICATION

1) deepseek API key 由用户提供，具体模型/endpoint/限额：等待用户输入。  
2) 目标 DB 类型：默认 Postgres（因为要用 pg 元数据），是否需要兼容其他类型？  
3) 前端 UI 细节（表格分页/排序、错误提示样式、主题）：如无指定按基本方案实现。  

### Research Tasks

- 调研 deepseek 在 Python 的调用方式与速率/超时最佳实践（等待 key 后验证）。
- PostgreSQL 系统 catalog/信息_schema 拉取表/视图/列的推荐查询与性能注意事项。
- sqlglot 解析与安全过滤（仅 SELECT）以及自动注入 limit 的实现方式。
- 前端 monaco editor 集成/高亮/只读模式与 element-ui 表格展示的搭配。

### research.md (to be produced)

汇总决策、理由与备选方案；解决上述 unknowns；确认 deepseek 使用方式与限流策略；确认 pg 元数据拉取 SQL；确认 sqlglot 解析与 limit 注入的稳健做法。

## Phase 1: Design & Contracts

### data-model.md (to be produced)

- Entities：ConnectionProfile、DatabaseMetadata、QueryRequest、QueryResult（与 spec 对齐）  
- 字段、约束（类型、必填、默认）、状态/时间戳（如 lastSynced）  
- 关系：连接 → 元数据；请求 → 连接 + 元数据版本  
- 验证规则：URL 校验，限制 SQL 仅 SELECT，limit 注入逻辑说明

### contracts/ (to be produced)

- REST API（FastAPI）：连接创建/测试、元数据拉取/读取、SQL 提交、NL→SQL 生成并执行  
- 契约示例：请求/响应 JSON（camelCase），错误结构；CORS 允许所有 origin  
- 可用 OpenAPI 片段或 JSON schema（重点字段/约束/示例）

### quickstart.md (to be produced)

- 环境准备：Python/uv、Node、deepseek key、sqlite 路径  
- 后端启动步骤，前端启动步骤  
- 示例：添加连接、查看元数据、执行 SQL、NL→SQL 示范

### Agent Context Update

- 运行 `.specify/scripts/bash/update-agent-context.sh cursor-agent`（Phase 1 完成后）  
- 仅追加当前计划中新技术：deepseek, sqlglot, monaco, element-ui（如未记录）

### Constitution Re-check (post design)

- 确认类型、SQL 安全、CORS/无鉴权、JSON camelCase、日志不含敏感信息等仍符合宪章。

## Complexity Tracking (Re-evaluate)

> 如设计阶段引入额外复杂度，记录于此。

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
