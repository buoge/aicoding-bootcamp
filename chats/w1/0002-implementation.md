## project-alpha 实现计划

---

## 一、整体实施思路

- **目标**：基于 `spec/w1/0001-spec.md` 中的需求与设计，交付一个可运行的、前后端分离的 
project-alpha 应用。

- **项目名称**: Project Alpha - Ticket 管理系统
- **项目路径**: `./w1/project-alpha`
- **技术栈**：
  - 后端：FastAPI + Postgres（本地 `projectalpha` 库，用户 `postgres`，密码 `postgres`）
  - 前端：TypeScript + Vite + Vue3
- **实施阶段**：
  1. 环境与基础项目初始化
  2. 数据库与后端 API 实现
  3. 前端项目搭建与基础页面
  4. 前后端集成与主功能完整打通
  5. 测试与质量保障
  6. 文档与后续扩展准备

每个阶段尽量保证**可运行、可验证**，采用小步迭代。

---

## 二、阶段一：环境和基础项目初始化

### 2.1 数据库准备（Postgres）

1. **创建数据库与用户（如尚未存在）**  
   - 数据库：`projectalpha`  
   - 用户：`postgres`  
   - 密码：`postgres`
2. 确认本地 Postgres 实例可用，并记录连接串：
   - `postgresql://postgres:postgres@localhost:5432/projectalpha`

### 2.2 后端项目初始化（FastAPI）

1. 在 `w1/project-alpha/backend`（或类似目录）初始化 Python 项目结构：
   - `app/__init__.py`
   - `app/main.py`
   - `app/api/`（路由）
   - `app/models/`（数据库模型）
   - `app/schemas/`（Pydantic 模型）
   - `app/services/`（业务逻辑）
   - `app/db/`（数据库连接与会话管理）
2. 创建 `pyproject.toml` 或 `requirements.txt`，包含依赖：
   - `fastapi`
   - `uvicorn[standard]`
   - `SQLAlchemy` 或 `SQLModel`（二选一）
   - `psycopg2-binary` 或 `asyncpg`（视同步/异步方案）
   - `pydantic`
   - `alembic`（数据库迁移）
3. 创建基础 `main.py`：
   - 初始化 FastAPI 应用实例；
   - 注册根路由（健康检查，例如 `/health` 返回 OK）。

### 2.3 前端项目初始化（Vite + Vue3 + TS）

1. 在 `w1/project-alpha/frontend` 目录中：
   - 使用 Vite 初始化 Vue3 + TypeScript 模板（例如 `npm create vite@latest`）。
2. 安装必需依赖：
   - `vue`、`vue-router`（如需要路由）
   - 开发依赖：类型定义等
3. 配置基础目录结构：
   - `src/main.ts`
   - `src/App.vue`
   - `src/components/`
   - `src/views/`（如 `TicketsView.vue`）
   - `src/api/`（封装后端请求）

---

## 三、阶段二：数据库与后端 API 实现

### 3.1 数据库模型与迁移（Postgres + ORM）

1. 在 `app/db/config.py` 中配置数据库连接：
   - 使用前述连接串 `postgresql://postgres:postgres@localhost:5432/projectalpha`。
2. 选择 ORM 方案：
   - 若使用 SQLAlchemy：
     - 定义 `Base`，初始化 `SessionLocal`。
3. 在 `app/models/ticket.py` 中定义 `Ticket` 模型：
   - 字段：`id`, `title`, `description`, `status`, `created_at`, `updated_at`
4. 在 `app/models/tag.py` 中定义 `Tag` 模型：
   - 字段：`id`, `name`, `created_at`
5. 在 `app/models/ticket_tag.py` 中定义多对多关联表：
   - 字段：`ticket_id`, `tag_id`，联合唯一约束。
6. 配置 Alembic（若使用）：
   - 初始化 Alembic；
   - 生成初始迁移脚本；
   - 执行迁移，在 `projectalpha` 数据库中创建上述三张表。

### 3.2 Pydantic 模型（Schemas）

1. 在 `app/schemas/ticket.py` 中定义：
   - `TicketBase`：`title`, `description`
   - `TicketCreate`：继承 `TicketBase`，可包含 `tag_ids`
   - `TicketUpdate`：所有字段可选，包括 `status`, `tag_ids`
   - `TicketOut`：包含 `id`, 时间字段以及 `tags`（嵌套标签信息）
2. 在 `app/schemas/tag.py` 中定义：
   - `TagBase`：`name`
   - `TagCreate`
   - `TagOut`：含 `id`、`name`，可选 `ticket_count`

### 3.3 服务层与数据访问层

1. 在 `app/services/ticket_service.py` 中实现：
   - `create_ticket(db, ticket_create)`：
     - 插入 `tickets`；
     - 处理 `tag_ids` 关联；
   - `update_ticket(db, ticket_id, ticket_update)`：
     - 更新基础字段；
     - 若提供 `tag_ids`，重建关联关系；
   - `delete_ticket(db, ticket_id)`：
     - 删除对应记录（及关联记录）；
   - `get_ticket(db, ticket_id)`：
     - 查询单条，带标签；
   - `list_tickets(db, filters)`：
     - 支持标签筛选、多标签 AND 逻辑；
     - 标题搜索（LIKE `%search%`）；
     - 状态过滤与排序、limit/offset。
2. 在 `app/services/tag_service.py` 中实现：
   - `get_tags(db, search)`：支持按名称模糊查询；
   - `create_tag(db, tag_create)`：处理重名错误；
   - 可选：统计 `ticket_count`（使用聚合查询）。

### 3.4 API 路由实现（FastAPI）

1. 在 `app/api/tickets.py` 中定义路由：
   - `POST /api/tickets` → 创建 Ticket
   - `GET /api/tickets/{id}` → 获取详情
   - `GET /api/tickets` → 列表与筛选
   - `PUT/PATCH /api/tickets/{id}` → 更新 Ticket
   - `DELETE /api/tickets/{id}` → 删除 Ticket
2. 在 `app/api/tags.py` 中定义路由：
   - `GET /api/tags` → 标签列表
   - `POST /api/tags`（可选） → 创建标签
3. 在 `app/main.py` 中：
   - 挂载路由（使用 `APIRouter`，前缀 `/api`）；
   - 添加 CORS 中间件（允许前端开发地址，如 `http://localhost:5173`）。

### 3.5 基础自测

1. 使用 `uvicorn app.main:app --reload` 启动后端。
2. 通过 Swagger UI（`/docs`）验证：
   - 创建 Ticket（无标签、有标签）；
   - 更新 status、修改标签；
   - 删除 Ticket；
   - 按标签与标题搜索。

---

## 四、阶段三：前端页面与组件实现（Vue3）

### 4.1 基础布局与状态管理

1. 在 `src/App.vue` 中定义主布局：
   - 顶部标题区域（项目名、简单说明）
   - 中部内容区（筛选/搜索 + 列表 + 新建按钮）
2. 在 `src/views/TicketsView.vue` 中实现主页面容器：
   - 本地状态（使用组合式 API）：
     - `tickets`：Ticket 列表
     - `tags`：标签列表
     - `selectedTagIds`：选中的标签 ID 数组
     - `searchKeyword`：搜索关键字
     - `statusFilter`：状态筛选
     - `isLoading` / `errorMessage` 等
3. 如后续状态变复杂，可在后期引入 Pinia；初期使用组件内状态即可。

### 4.2 API 封装（前端）

1. 在 `src/api/http.ts` 中封装基础请求：
   - 使用 `fetch` 或 `axios`；
   - 配置基础 URL（如 `http://localhost:8000/api`）。
2. 在 `src/api/tickets.ts` 中实现：
   - `fetchTickets(params)`：包含标签、搜索、状态、分页参数；
   - `createTicket(payload)`；
   - `updateTicket(id, payload)`；
   - `deleteTicket(id)`；
3. 在 `src/api/tags.ts` 中实现：
   - `fetchTags(params?)`；
   - `createTag(payload)`（若需要）。

### 4.3 UI 组件实现

1. `AppHeader` 组件：
   - 显示项目名与一句话描述。
2. `FilterBar` 组件：
   - Props：
     - `tags`、`selectedTagIds`、`searchKeyword`、`statusFilter`
   - Emits：
     - `update:selectedTagIds`
     - `update:searchKeyword`
     - `update:statusFilter`
   - 包含：
     - 标签多选下拉或标签 Chip 列表；
     - 标题搜索输入框；
     - 状态筛选下拉（全部/未完成/已完成）。
3. `TicketList` 组件：
   - Props：`tickets`
   - Emits：
     - `edit(ticket)`、`delete(ticket)`、`toggle-status(ticket)`
   - 内部循环渲染 `TicketItem`。
4. `TicketItem` 组件：
   - 显示标题、状态、标签、创建时间；
   - 提供：
     - 完成/取消完成按钮或复选框；
     - 编辑按钮；
     - 删除按钮。
5. `TicketFormModal` 组件：
   - Props：
     - `visible`、`mode`（create/edit）、`ticket`（编辑时）
     - `allTags`
   - Emits：
     - `submit(payload)`、`cancel`
   - 表单字段：
     - 标题（必填）；
     - 描述（可选）；
     - 标签选择（多选，可支持新建标签）。

### 4.4 与后端的交互流程

1. 页面加载时：
   - 调用 `fetchTags` 获取标签列表；
   - 调用 `fetchTickets` 获取初始 Ticket 列表。
2. 新建 Ticket：
   - 打开 `TicketFormModal`（mode = create）；
   - 表单提交 → 调用 `createTicket` → 成功后：
     - 关闭弹窗；
     - 将新 Ticket 插入 `tickets` 列表顶部。
3. 编辑 Ticket：
   - 打开 `TicketFormModal`（mode = edit）并传入当前 Ticket；
   - 表单提交 → 调用 `updateTicket` → 成功后：
     - 更新 `tickets` 列表中的对应项。
4. 完成/取消完成：
   - 点击复选框/按钮 → 调用 `updateTicket(id, { status })`；
   - 成功后更新本地 `tickets` 中该项的状态与样式。
5. 删除 Ticket：
   - 弹出确认框 → 调用 `deleteTicket`；
   - 成功后从列表中移除该项。
6. 筛选与搜索：
   - `selectedTagIds`、`searchKeyword` 或 `statusFilter` 变化时：
     - 使用防抖（前端实现）；
     - 调用 `fetchTickets`（附带对应 query 参数）；
     - 更新列表。

---

## 五、阶段四：前后端集成与功能完善

### 5.1 本地联调

1. 后端：`uvicorn app.main:app --reload`（默认 8000 端口）。
2. 前端：`npm run dev`（默认 5173 端口）。
3. 确认 CORS 配置正确，前端请求可成功访问 `http://localhost:8000/api`。

### 5.2 逐功能验证

1. **创建 Ticket**
   - 无标签、新标签、已有标签三种情况；
2. **编辑 Ticket**
   - 修改标题、描述、标签；
3. **完成/取消完成**
   - 状态变化与 UI 样式同步；
4. **删除 Ticket**
   - 确认弹窗与删除后列表更新；
5. **标签筛选**
   - 单标签、多标签（AND 逻辑），与标题搜索组合；
6. **标题搜索**
   - 边界情况：中文、大小写、空字符串等。

---

## 六、阶段五：测试与质量保障

### 6.1 后端测试

1. 使用 `pytest` 编写基础测试：
   - Ticket 创建/更新/删除/查询；
   - 多标签筛选与标题搜索；
   - 标签列表与（可选）`ticket_count` 统计。
2. 使用测试数据库或事务回滚，避免污染真实数据。

### 6.2 前端测试（可选但推荐）

1. 对关键组件编写单元测试（如使用 Vitest）：
   - `TicketList` 渲染正确；
   - 状态切换与回调触发；
   - `FilterBar` 响应输入与筛选。
2. 简单的端到端手动测试：
   - 按阶段四中的功能点逐项操作。

### 6.3 错误处理与用户体验

1. 后端：
   - 统一异常处理，返回 `{ detail, code }` 格式；
   - 常见错误：400 参数错误、404 资源不存在。
2. 前端：
   - 全局捕获接口错误，展示易懂的提示（如 toast / message）。
   - 对表单校验错误在对应字段附近显示提示。

---

## 七、阶段六：文档与后续扩展准备

### 7.1 使用说明与开发文档

1. 在项目根目录或 `w1/project-alpha` 下添加 `README.md`：
   - 环境要求（Python 版本、Node 版本、Postgres）；
   - 后端启动步骤；
   - 前端启动步骤；
   - 基础使用说明（如何创建、筛选 Ticket）。
2. 在 `spec/w1` 下补充或引用：
   - 当前实现计划（本文件）；
   - 若有变更，更新 `0001-spec.md`。

### 7.2 为后续扩展预留空间

1. 后端：
   - 数据模型设计时预留扩展字段空间（例如不使用过短的字段类型）；
   - 路由与服务逻辑保持清晰分层、便于未来增加字段（优先级、截止日期等）。
2. 前端：
   - 在组件设计中避免将所有逻辑堆在单一组件；
   - 为后续增加字段（如优先级）预留布局与数据结构扩展点。

---

通过以上分阶段的实现计划，可以在较为可控的节奏下，从零开始完成 project-alpha 的后端、前端实现与集成，确保核心功能（Ticket 的创建/编辑/删除/完成/取消完成、标签管理、标签筛选、标题搜索）按设计文档落地，并具备后续扩展与维护的良好基础。


