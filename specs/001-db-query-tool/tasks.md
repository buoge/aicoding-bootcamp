# Tasks: Database Query & Metadata Assistant

**Input**: Design documents from `/specs/001-db-query-tool/`  
**Prerequisites**: plan.md (required), spec.md (required); research/data-model/contracts/quickstart to be produced in later phases

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 项目初始化、依赖安装、环境配置

- [ ] T001 Prepare backend env with uv/venv and install deps (`w2/db_query/backend/requirements.txt`)
- [ ] T002 Prepare frontend env and install deps (Vue3 + element-ui + monaco) (`w2/db_query/frontend/package.json`)
- [ ] T003 [P] Create sample env file with `DEEPSEEK_API_KEY`, sqlite path `~/.db_query/db_query.db`, and default API base (`w2/db_query/.env.example`)
- [ ] T004 [P] Scaffold backend FastAPI app layout (`w2/db_query/backend/app/{api,core,models,services,db}`)
- [ ] T005 [P] Scaffold frontend project layout with axios client and global error handler (`w2/db_query/frontend/src`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 核心基础设施，完成后才能进入各用户故事

- [ ] T006 Define backend settings/config loader (deepseek key, sqlite path, CORS all origins) (`backend/app/core/config.py`)
- [ ] T007 Setup sqlite engine/session for metadata store (`backend/app/db/session.py`)
- [ ] T008 [P] Define shared Pydantic response/error schemas (camelCase) (`backend/app/models/schemas.py`)
- [ ] T009 [P] Implement sqlglot-based validator/enforcer: allow only SELECT, auto-append LIMIT 1000 (`backend/app/services/sql_guard.py`)
- [ ] T010 [P] Wire FastAPI app with CORS all origins and error handling (`backend/app/main.py`)
- [ ] T011 Setup frontend base theme/layout and API client with base URL + JSON camelCase handling (`frontend/src/services/api.ts`, `frontend/src/main.ts`)

**Checkpoint**: 基础完成，开始用户故事开发。

---

## Phase 3: User Story 1 - 连接并查看元数据 (Priority: P1) 🎯 MVP

**Goal**: 接收 DB URL，连接并抓取表/视图元数据，持久化 sqlite 并在前端展示。
**Independent Test**: 通过提交连接串→成功拉取并展示元数据（含上次同步时间），不依赖其他故事。

### Implementation for User Story 1

- [ ] T012 [US1] Define Pydantic models for connection request/metadata records (`backend/app/models/connection.py`)
- [ ] T013 [US1] Implement metadata DAO for sqlite (tables: connections, metadata, last_synced) (`backend/app/db/metadata_store.py`)
- [ ] T014 [US1] Implement service to connect to Postgres and fetch tables/views/columns (`backend/app/services/metadata_service.py`)
- [ ] T015 [US1] Add API endpoints: test connection & sync/list metadata (`backend/app/api/metadata.py`)
- [ ] T016 [US1] Frontend: connection form + sync trigger; display metadata table with last synced (`frontend/src/pages/MetadataPage.vue`)
- [ ] T017 [P] [US1] Frontend: service hooks to call metadata APIs and manage loading/error (`frontend/src/services/metadata.ts`)

**Checkpoint**: 能通过 UI 添加连接并看到表/视图元数据。

---

## Phase 4: User Story 2 - 运行受控 SQL 查询 (Priority: P2)

**Goal**: 用户手写 SQL，经解析仅允许 SELECT，缺省加 limit 1000，返回 JSON 供表格展示。
**Independent Test**: 在已有连接/元数据下提交 SQL，收到受控结果或结构化错误。

### Implementation for User Story 2

- [ ] T018 [US2] Implement SQL request/response schemas (include applied limit info) (`backend/app/models/query.py`)
- [ ] T019 [US2] Implement guarded query executor reusing sql_guard and connection info (`backend/app/services/query_service.py`)
- [ ] T020 [US2] API endpoint to run manual SQL with validation (`backend/app/api/query.py`)
- [ ] T021 [US2] Frontend: add Monaco SQL editor, run button, result table, error banner (`frontend/src/pages/QueryPage.vue`)
- [ ] T022 [P] [US2] Frontend service for query execution and showing applied limit notice (`frontend/src/services/query.ts`)

**Checkpoint**: 手写 SQL 可受控执行，非 SELECT/无效 SQL 返回清晰错误。

---

## Phase 5: User Story 3 - 自然语言生成 SQL (Priority: P3)

**Goal**: 用自然语言生成 SQL（携带元数据上下文），再按同样规则校验并执行。
**Independent Test**: 输入 NL → 得到安全的 SELECT SQL（或被拒绝），返回结果/错误。

### Implementation for User Story 3

- [ ] T023 [US3] Implement prompt/context builder using cached metadata (`backend/app/services/nl2sql_prompt.py`)
- [ ] T024 [US3] Integrate deepseek client; handle missing/invalid key errors (`backend/app/services/nl2sql_service.py`)
- [ ] T025 [US3] API endpoint for NL → SQL → guarded execution, returning generated SQL + result (`backend/app/api/nl_query.py`)
- [ ] T026 [US3] Frontend: NL input + “生成并执行”按钮，显示生成的 SQL 与结果/错误 (`frontend/src/pages/NLQueryPage.vue`)
- [ ] T027 [P] [US3] Frontend service for NL generation call and reuse query executor display (`frontend/src/services/nl_query.ts`)

**Checkpoint**: NL→SQL 流程可独立演示，错误安全可控。

---

## Phase 6: Polish & Cross-Cutting

- [ ] T028 Add logging/redaction to avoid persisting secrets (mask connection strings) (`backend/app/core/logging.py`)
- [ ] T029 Add README/quickstart with setup, deepseek key, sqlite path, sample curl (`specs/001-db-query-tool/quickstart.md`)
- [ ] T030 [P] Add minimal integration smoke scripts (metadata fetch, guarded query, NL→SQL) (`backend/tests/integration/`)
- [ ] T031 [P] Frontend polish: loading states, error toasts, empty states (`frontend/src/components/feedback/`)
- [ ] T032 Final manual QA: run through three user stories end-to-end, note issues (`specs/001-db-query-tool/tasks.md`)

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 → US2 → US3 → Polish
- US2 依赖 US1 的连接/元数据结构，但可在 US1 完成后独立验证
- US3 依赖 US1 元数据与 US2 的受控执行链路

## Parallel Opportunities

- Phase 1: T003/T004/T005 可并行
- Phase 2: T008/T009/T011 可并行
- US1: T016 与 T017 可并行；T014 依赖 T012/T013
- US2: 前后端（T019/T020 与 T021/T022）可并行；均依赖 sql_guard 完成
- US3: 前后端（T024/T025 与 T026/T027）可并行；依赖元数据与查询执行链路

## Implementation Strategy

- MVP: 完成 US1（连接+元数据展示）后即可演示；随后 US2 受控查询，再 US3 NL→SQL。
- 每个故事完成后独立验证其 acceptance 场景；保留 JSON/错误输出截图用于验收。

