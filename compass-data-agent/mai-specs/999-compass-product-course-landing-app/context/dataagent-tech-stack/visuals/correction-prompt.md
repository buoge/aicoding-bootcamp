# DataAgent 架构图定向纠错提示词

内置 image_gen；一轮编辑；无变体。

编辑目标：`dataagent-system-architecture.png`

风格参考：`.agents/skills/editorial-tech-infographic/assets/editorial-tech-infographic-style-reference.png`

```text
Use case: precise-object-edit.
Asset type: one corrected DataAgent system architecture infographic for a course landing page.

Input images:
1. The first image is the EDIT TARGET: the existing landscape 1536×1024 DataAgent diagram.
2. The second image is REFERENCE IMAGE — STYLE ONLY. Do not copy its wording, subject, topology, orientation, or numbered steps.

Make ONE precise corrective edit of the first image. Preserve the entire image composition, aspect ratio, title, subtitle, all module boxes, text labels, storage foundation, colors and clean navy / pale blue / mint editorial style. Do NOT redesign or rearrange the architecture.

PRIMARY REQUIRED FIX — CONNECTOR SEMANTICS:
The existing dark navy arrow from the lower edge of "FastAPI Agent API" currently bends left and points downward into the top of "Python Worker". This is WRONG.
Completely REMOVE the final vertical segment and arrowhead ending above Python Worker (near x884, y364). There must be NO direct connector of any kind from API to Worker, and no arrowhead above Worker.
Replace the API outbound connector with ONE continuous rounded orthogonal arrow ending at the TOP edge of "PostgreSQL Outbox" (near x134, y431).

Suggested exact routing, using the original 1536×1024 canvas coordinates:
- start at the existing lower edge of FastAPI Agent API, around x1087,y302;
- down to the white corridor around y329;
- run LEFT through that empty corridor;
- to avoid crossing the Chinese region title "异步编排与任务调度", turn downward around x635 to y410 (the empty band above the Outbox and Temporal cards);
- run LEFT in that empty band to x134;
- point DOWN at the TOP edge of PostgreSQL Outbox, around x134,y431.
All bends should use the same softly rounded corners as the original navy connectors. No line should cross any text or touch the Worker top border. The final arrowhead must touch the Outbox box, not float and not terminate on the region boundary. If needed, choose an equivalent clean route through whitespace that preserves these exact endpoints and avoids text. You may add one small label "事务提交" above the horizontal portion if it fits, otherwise omit the label.

The ONLY valid execution chain is:
"FastAPI Agent API" → "PostgreSQL Outbox" → "Temporal Service" → "Python Worker".
Keep the existing Outbox→Temporal arrow with "异步启动" and the existing Temporal→Worker arrow with "任务调度" completely unchanged.
The API must not connect directly to Worker, Temporal, Sandbox or Models.

SECOND MINOR REQUIRED FIX:
Remove the blue/yellow Python brand logo left of the "Python Worker" heading. Replace it in the same footprint with a small simple dark navy monoline code icon, such as < / >, with no brand color and no logo. Preserve the heading text "Python Worker".

ALL OTHER CONTENT IS INVARIANT:
Preserve "DataAgent 系统架构" and "参考部署 · 按阶段演进".
Preserve browser→Nginx→API top row and all their labels.
Preserve API/Worker shared Python core note.
Preserve Worker nesting of Harness, LLM Runtime / Provider Adapter, Query Gateway.
Preserve Worker→Sandbox Gateway→isolated DuckDB / pandas and the authorized-snapshot label.
Preserve Models and read-only retail-source endpoints and their correct connections.
Preserve Temporal independent-storage annotation, Platform PostgreSQL / pgvector, S3 Artifact Store, OpenTelemetry / Eval.
Do not add new architecture components. No Node BFF, Kafka or Redis.
No variants. Return exactly one corrected image.
```
