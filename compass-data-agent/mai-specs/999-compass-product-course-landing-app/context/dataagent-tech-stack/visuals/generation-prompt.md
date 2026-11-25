# DataAgent 架构图首次生成提示词

内置 image_gen；单张生成；以下为实际传入的完整提示词。

风格参考：`/Users/guomeiqing/Documents/geektime-course/.agents/skills/editorial-tech-infographic/assets/editorial-tech-infographic-style-reference.png`

原始输出：`/Users/guomeiqing/.codex/generated_images/01a0a9b0-fe73-7042-8159-f17134058e84/exec-fc6fe924-9ac3-473d-85d7-89bfbaeedb36.png`

工作区副本：`dataagent-system-architecture.png`

```text
Use case: infographic-diagram.
Create exactly ONE high-resolution landscape 3:2 editorial system architecture infographic for a Chinese DataAgent engineering course landing page. Aim for 2400×1600 or higher, crisp legible Chinese and English labels, generous white space. This is a new image. Input image is REFERENCE IMAGE — STYLE ONLY, not an edit target: inherit only premium editorial typography hierarchy, white background, dark navy monoline icons, restrained pale blue/cyan/mint accents, rigorous spacing; do NOT inherit subject, microservices claim, text, numbered steps, vertical orientation or topology.

TITLE verbatim: "DataAgent 系统架构"
SUBTITLE verbatim: "参考部署 · 按阶段演进"

CORE ARGUMENT: one shared Python core powers an API process and an independently running Worker; durable asynchronous orchestration connects them; model invocation stays inside the Worker, with independent isolated code execution and read-only access to source data.

INFORMATION DESIGN: visually organize into about SIX meaningful major regions, not a uniform card grid. Main focus is the larger Python Worker container. Keep the primary path simple and traceable, use rounded orthogonal navy arrows. Place the browser-entry row near top; asynchronous orchestration feeds the worker below; independent sandbox to worker's right; external endpoints and two platform storage cylinders below; a slim observability line at the bottom. Group small related modules within larger meaningful regions. There must be no tangled or crossing connections. All connectors must terminate on the correct component, not float in blank space. Omit arrow connections to storage if they would clutter; placement and a short label suffice.

EXACT COMPONENTS AND SEMANTICS:
Top entry band:
"浏览器工作台" with "React + TypeScript"
→ "Nginx" with "同域入口 · / 静态资源 · /api"
→ "FastAPI Agent API" with "会话 · 授权 · REST / SSE".
A small browser boundary note: "浏览器无模型密钥".
Nginx handles same-origin route split; a browser to nginx to API chain is appropriate.

Asynchronous dispatch region:
The API writes "PostgreSQL Outbox".
From Outbox an arrow labeled "异步启动" goes to "Temporal Service".
Temporal Service → "Python Worker", arrow label "任务调度".
Do not show a direct synchronous API→Worker long request. The main durable chain must visibly be API → PostgreSQL Outbox → Temporal Service → Python Worker.
Under Temporal Service a tiny independent-storage note: "Temporal 自有存储独立". Do not merge Temporal's persistence with application state database.

Python Worker region, largest central region, contains:
"自研薄 Harness"
"Plan / Act / Verify"
"Context · Tool · Memory"
nested module "LLM Runtime" with smaller "Provider Adapter".
A small second module "Query Gateway".
Runtime must be INSIDE Worker, not a separate microservice.
A short shared-code note connecting the idea of API and Worker without an arrow: "API 与 Worker 分进程 · 共享 Python 核心包".

To the side / below Worker:
LLM Runtime / Provider Adapter → small external endpoint "外部 Models".
Worker's Query Gateway → external endpoint "零售数据源", short label "只读账号".
Keep Models and retail data distinct. Do not draw Models connected through Query Gateway.

Independent isolation region, to the right of Worker:
Worker → "Sandbox Gateway" → a clearly bounded "隔离执行环境"
inside isolation: "DuckDB / pandas", with "仅授权快照".
Sandbox Gateway is outside and separate from Worker. Neither sandbox code nor pandas nor DuckDB are part of Worker or API. Independent boundary label "Sandbox 独立隔离".
No Sandbox access arrow to live retail sources. The source data access is from Query Gateway, using read-only credentials.

Bottom platform data region:
"Platform PostgreSQL / pgvector" — "业务状态与读模型"
"S3 Artifact Store" — "证据与产物"
These are shared platform backing resources shown as a quiet foundation, separate from Temporal's own storage.

Slim bottom cross-cutting annotation:
"OpenTelemetry / Eval"
"可观测性与评测"

Visual language: pure white or warm white; deep navy text and outlines; only very pale blue, cyan, mint region washes. Modern clean sans serif Chinese typography; title substantially larger than module headings. No giant step numbers. Elegant small geometric monoline technical icons. No shadows, no gradients, no glow, no faux 3D, no logos, no watermark, no random labels, no tiny paragraphs, no decorative metrics. No Node BFF, Kafka, Redis, or any other invented infrastructure. This is a reference deployment that evolves by stages, NOT a mandatory microservice topology. Render all technology names accurately. Use short labels listed here, not explanatory prose.
```
