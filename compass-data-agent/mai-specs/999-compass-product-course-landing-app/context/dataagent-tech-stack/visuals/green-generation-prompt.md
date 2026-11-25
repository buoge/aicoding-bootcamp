# 绿色课程页图像生成记录

生成日期：2026-09-16。工具：内置 image_gen。每个资产各生成一次。

设计依据：用户本轮提供的绿色课程宣传页截图，仅参考配色、层级与材质，不复制肖像、品牌或招生承诺。截图未纳入发布目录。

## 主视觉：project-hero.png

```text
Use case: stylized-concept
Asset type: original raster hero illustration for a Chinese DataAgent engineering course landing page.
Primary request: polished restrained architectural 3D still life, landscape 3:2, high resolution.
Scene/backdrop: uniform deep emerald green backdrop, darker upper left and softly illuminated emerald at lower right, with exceptionally subtle circuit traces fading into the background. No visible horizon, no UI screenshot.
Subject: right-weighted connected luminous architectural blocks made from translucent mint glass, conveying a real modular software system. A prominent square emerald processor tile on the front reads exactly "DataAgent" in bold clean white sans-serif. Three smaller tasteful connected glass tiles read exactly "Web", "API", and "Worker". All four labels are legible and distinct. A few warm orange micro accents on connection points. Broad stepped glass platforms beneath the modules, precise fine circuit lines connecting modules.
Composition/framing: 3:2 landscape crop; architectural cluster occupies the right two thirds, extending slightly towards center; left third remains dark emerald negative space with only faint circuit lines. Keep all objects inside frame with breathing room. Elevated isometric camera, understated perspective, no fish-eye.
Lighting/mood: premium calm enterprise software education visual, softly luminous glass edges, plausible shadows, subtle white reflections, bright mint highlights, carefully restrained glow.
Color palette: deep emerald #006B48 and #034D3B background, clear mint #A5F1CF glass, jade and teal green, small warm orange #FF9A30 accents. No blue or purple.
Text (verbatim): "DataAgent", "Web", "API", "Worker" only.
Constraints: generate only the illustration as a standalone asset. No webpage chrome, no navigation, no buttons, no marketing copy, no Chinese, no extra labels, no watermark, no logos from other brands, no robot faces, no dense wire mesh, no visual noise. Avoid ornamental ambiguity; look like well-structured engineering modules, beautiful and professional.
```

## 架构图：system-architecture.png

```text
Use case: infographic-diagram
Asset type: standalone system architecture diagram for a DataAgent engineering educational landing page.
Primary request: generate a meticulous readable landscape architecture diagram, 3:2 or slightly wider. White background, spacious grid, emerald green headings and strokes, very pale mint containers, restrained warm orange highlights. Crisp polished mostly flat technical illustration with only subtle glass depth. The exact directional flow and all English labels below are mandatory. No page title or page chrome.
Layout: three clear runtime levels, then a completely separate pale footer band. High legibility with generous whitespace. Use consistent softly rounded rectangular modules, precise orthogonal connectors with visible arrowheads, clean sans-serif typography. Large labels, no body paragraphs. Do not use pictograms in place of text.
Top runtime row, left to right, exact nodes and arrows: [Browser] → [Next.js / Web + BFF] → [FastAPI / Agent API]. Inside each node use two lines at slash, except Browser. FastAPI has one downward connector routed through whitespace to the TOP of PostgreSQL below; this connector points toward PostgreSQL, never reverse. Route it cleanly without entering other modules.
Second runtime row, left to right, exact nodes and arrows: [PostgreSQL / Commands + Outbox] → [Dispatcher] → [Temporal] → [Python Worker]. Use two lines at slash inside PostgreSQL. The Temporal-to-Python Worker arrow may have the tiny label "Tasks". Arrow direction must be left to right for all four.
Execution area under right half: Python Worker points DOWN to [Harness / Plan / Act / Verify]. Use "Harness" as bold main label and "Plan / Act / Verify" as secondary line. From Harness, fan out into three parallel clearly separated horizontal rows, all arrows point to the right: [Harness] → [LLM Runtime] → [Models]; [Harness] → [Query Gateway] → [Read-only Data]; [Harness] → [Sandbox Gateway] → [Isolated Sandbox]. Draw Harness only ONCE as a taller module at the left of these three rows with three independent outgoing arrows. Do not duplicate Harness labels or blocks. Keep Python Worker, Harness, LLM Runtime, Query Gateway, and Sandbox Gateway within one very pale green grouped boundary. The destination Models and Read-only Data are to its right. Put Isolated Sandbox to its right inside a separate thin dotted emerald boundary, visibly isolated. Python Worker also has a separate direct connector to [S3 / Evidence + Artifacts] placed to the left of the execution group; arrow points from Python Worker toward S3. No arrow from S3 to Harness or any gateway.
Footer: a pale mint band separated by ample whitespace from the runtime system. Exact centered text in two lines: "Turborepo + pnpm + uv" and "Build & workspace tooling". Absolutely no arrows into or out of this footer band. It is workspace tooling, not a runtime service.
Exact labels allowed: Browser; Next.js; Web + BFF; FastAPI; Agent API; PostgreSQL; Commands + Outbox; Dispatcher; Temporal; Tasks; Python Worker; Harness; Plan / Act / Verify; LLM Runtime; Models; Query Gateway; Read-only Data; Sandbox Gateway; Isolated Sandbox; S3; Evidence + Artifacts; Turborepo + pnpm + uv; Build & workspace tooling.
Constraints: all labels in English verbatim with perfect spelling. No other text. Architecture flow correctness takes precedence over decoration. No additional arrows, no loops, no double-headed arrows. No direction inversion. No duplicated blocks. No arrows connecting footer tooling into runtime. No fake UI, no brand logos, no dark background, no robots, no dense illustration. Leave room around all labels. No cropped edges, no watermark.
```

## 图像检查

主视觉的 DataAgent / Web / API / Worker 标签清晰。架构主链与构建工具分离正确；Worker 向下箭头落到协作区域顶部，未直连 Harness；浅绿框包含外部服务，不能解读为 Worker 进程或安全边界。页面已用邻近文字明确 Worker 内部模块与外部服务，图作为概览使用，精确边界以技术架构的 Mermaid 与正文为准。

此前的 generation-prompt.md 与 correction-prompt.md 保留为旧方案生成记录，不是当前图片的生成来源。当前图片校验值登记于 manifest.yml。


## 后续替换记录

2026-09-16：本记录中的简版架构图由完整八层架构图替换，当前架构图来源见 [layered-generation-prompt.md](layered-generation-prompt.md)。本记录的主视觉仍在使用；此前架构图的 QA 仅对当时成图有效。
