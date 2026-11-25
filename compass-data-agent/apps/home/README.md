# Compass Home

Compass 独立产品官网与课程项目指南，包名 `@compass/home`。React 19.3 + TypeScript + Next.js 16.4 App Router，shadcn/ui（Radix）+ Tailwind CSS 4。默认由 Next.js 服务端提供页面，端口 **3001**。

首版预览：[Compass Home](https://compass-home-20261020.guomeiqing1984.chatgpt.site)，仅当前 Sites 账号所有者可见。

## 运行

在 Compass 根目录完成 `pnpm install --frozen-lockfile` 后：

```bash
pnpm dev -F home
# http://127.0.0.1:3001

pnpm lint -F home
pnpm typecheck -F home
pnpm test -F home
pnpm build -F home
pnpm run deploy home # 本机 Docker 部署，需先停止占用 3001 的开发服务
pnpm --filter @compass/home start
```

运行 `start` 前停止占用 3001 的开发服务。官网只需 Node.js 和 pnpm，无需 uv、Python 虚拟环境或 `pnpm setup`，不依赖数据库、API 服务、模型密钥或用户登录；根 `pnpm dev` 也会通过 Turborepo 启动它。`pnpm dev:home` / `pnpm build:home` 是上述 Turbo 命令的快捷入口。

## 页面与交互

Docker 入口先从规范源准备 public 素材，再在镜像内以 `HOME_STANDALONE=1` 构建，复制 standalone、static 和 public。默认开发/构建与静态导出入口保持原行为；部署流程见 [部署说明](../../deploy/README.md)。

| 地址                    | 内容与交互                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                     | 产品营销首页；绿色 GhostFibers 首屏、五步经营调查、口径与证据、决策方法、成果复用与持续跟进、企业管控及体验入口                                                                                     |
| `/product`              | 七屏纵向介绍：企业经营、商品渠道、经营挑战、岗位需求、课程情节、iframe 原型首页、Agent 挑战；右侧浮动导航、四类挑战切换、六个情节与 12 类分析案例                                                   |
| `/architecture`         | 六屏纵向介绍：架构挑战、业务数据结构、Runtime / Harness 与核心目标、架构选型、指定架构原图、Compass DataAgent 系统数据结构；业务九域与系统十二域均支持完整 Mermaid ER、表字段、缩放、拖动与按表定位 |
| `/scaffold`             | 七屏纵向介绍：技术栈、Monorepo、工程规范、研发流程、my-ai-infra、数据文件与初始化、软件环境；可展开选型 / 完整启动步骤、复制命令与排障 FAQ                                                          |
| `/course`               | V5 七篇独立 Landing 模块（11–43 课）：工程 / 算法产出地图、逐课任务、演示验收、工程补齐；搜索与 CSV 导出                                                                                            |
| `/learning`             | 五屏学习指南：授课模式、课前准备、随课资料、四次作业检查点、待定提交方案；准备清单本地保存                                                                                                          |
| `/prototype/index.html` | Feature 999 HTML 原型的生成分发副本                                                                                                                                                                 |

课程任务依据 V5 正式大纲第 11–43 课与课程负责人确认的工程 / 算法产出地图整理；工程补齐和可选算法单独标注，任务清单不表示后台功能已实现。产品原型使用本地合成状态，真实 Agent 能力按课程后续建设。

## 源码与素材边界

- `src/app/`：服务端页面、统一布局、语义 Token 与响应式样式。
- `src/app/page.tsx` / `home.module.css` / `investigation.tsx`：首页七段产品叙事，以“把经营问题，追查到有据可依”为主张；服务端正文与局部五步调查 Tabs 分离，复用品牌背景、按钮、标签和全站翻屏。案例摘录来源为 Feature 999 原型 S05 / S11，明确合成数据与规划边界；课程入口收于页尾。
- `src/app/learning/`：学习指南的五屏叙事与独立 CSS Module；复用全站章节导航、翻屏、折叠与复制组件。课前清单覆盖硬件、软件、AI Coding、my-ai-infra、DBeaver、Compass 链路与最小 SDD 练习；学习打卡工具作为学员练习描述，当前页面提供准备清单。
- `src/app/architecture/decisions.tsx`：架构目标与方案图之间的三页选型说明；第一页用关系图展示 Autonomous First 的 Hybrid 主控、Plan and Execute / ReAct / Multi-agent 混合 Loop，以及下沉为 Tool / Skill 的局部 Workflow；第二页呈现业务适配、工程可控、产品扩展和持续演进四大理由。第三个 Tab 比较 Monorepo、双语言 BFF / API、FastAPI、Agent 框架与 Temporal 的收益、代价和边界；正文依据 [技术设计](../../mai-specs/999-compass-product-course-landing-app/design/TECH_DESIGN.md)，外部框架能力链接官方文档。
- `src/app/product/`：产品页的七屏内容、客户端场景切换及独立 CSS Module；企业设定来自 Feature 999 行业定义，数值演示复用原型 S05。
- `src/app/scaffold/page.tsx`：项目脚手架七屏叙事；依据 [当前应用结构](../README.md) 展示 home、web、agent、memory、worker 五个 App 的职责、端口及实施状态。Memory 为健康检查脚手架，Worker 为无 HTTP 端口的进程脚手架。Monorepo 同时标注 `tools/data-seed/` 离线数据工具与 `data/retail/` 交付数据，保持五个 App 的服务边界。Monorepo 模块说明两项选择理由：集中跨服务上下文，支持 AI 关联检索与联动修改；统一 CI/CD、工程化规范和编码规范，提高团队协同治理效率。
- `src/components/`：共享章节导航、交互模块与服务端图示；`data-scale.tsx` 展示 Feature 998 已交付诊断版的实际数据规模、库存快照及八类来源，架构与脚手架复用，数值依据 [998 正式交付记录](../../mai-specs/998-business-data-seeding-tool/IMPLEMENTATION.md#诊断增量正式交付2026-10-23)；`engineering-standards.tsx` 按代码类型、契约边界、环境数据、测试 CI/CD 四类索引十四项实际规范，覆盖五个 App 与 data-seed 离线工具，逐项列出规则、配置文件、执行命令及覆盖范围，CI/CD 包含本机五应用部署、按 App 更新、迁移顺序、健康检查与失败恢复，规范以原配置为准；`ui/` 为 shadcn CLI 安装的基础组件与本地 `Disclosure` 封装。
- `src/components/business-data.tsx` / `mermaid-diagram.tsx`：技术架构页的一屏业务结构浏览器，九个领域覆盖当前 71 表、748 字段与 247 条外键；完整字段、可空性、复合主键与唯一键、跨域引用均可查看；点击表清单放大并定位图中对应表，手机端在关系图与表清单间切换。Mermaid 按需加载，字段精简模式保留全部关系。
- `src/components/system-data.tsx` / `schema-explorer.tsx`：页尾 `#system-data` 展示系统领域总览与十二域 ER，覆盖 94 张目标系统表、1,091 字段、344 条关联（330 条外键、14 条跨服务逻辑引用），标注 M0–M5 建表阶段（M0 30 表）。与业务模块共用浏览器交互，补充通用约束、领域设计理由、表约束与 MVP 必要性，支持下载完整设计文档。数据源为 [系统设计](../../mai-specs/999-compass-product-course-landing-app/design/data-model.md)，当前状态为待评审，图中表不表示已实施。
- `src/components/development-workflow.tsx`：项目脚手架“研发流程”的两个 Tab，分别展示 SDD 八阶段及 Skill 原文直链、Feature 完整目录，以及本地启动和可复制的工程脚本。区分 `pnpm dev -F home -F web -F agent` 基础链路、`pnpm dev` 五个应用与各应用独立启动；`pnpm smoke --memory` 额外检查 Memory 就绪，Worker 通过日志与退出状态检查。阶段与路径依据 [my-ai-infra 默认布局](../../../my-ai-infra/assets/skills/my-create-feature/template/FEATURE_LAYOUT.json)；测试规划与执行验收复用 `my-create-test-plan`，代码附录与本项目实施记录注明按需创建。
- `src/components/data-preparation.tsx`：脚手架页“数据和脚本”的三个入口，默认展示 `data/retail/` 的 4 个仓库文件与 1 个解压生成文件、Git LFS 获取、`pnpm data:prepare` 校验解压与 PostgreSQL 导入命令；另列独立 `tools/data-seed/` 业务生成器、profile、冻结素材、分析 SQL、发布配置和应用库迁移 / seed 文件。区分完整业务 SQL 与三天工程样本，生成命令写入新的本地目录。清单依据 [数据操作说明](../../docs/data-seeding.md) 和现有 CLI；大体积 SQL、压缩包及私有状态不复制到官网 `public/`，克隆仓库后通过 Git LFS 读取正式数据包，生成器供需要重建数据的读者使用。
- `src/lib/content.ts`：页面使用的产品与脚手架结构化内容；业务与架构事实以 Feature 999 和当前工程为依据。
- `src/lib/course-map.ts`：课程页唯一展示数据，按 V5 第四至第十篇组织 33 课的工程与算法产出、4 组工程补齐、前置依赖、演示与验收；派生 74 条任务记录供页面、搜索与 CSV 共用。模块名为建设任务名，不承诺服务拆分或实施状态。课程范围仍以 [V5 正式大纲](../../../../../course/curriculum/v5/course_outline.md) 为准。
- `src/app/course/page.tsx` / `course.module.css`：全景入口、七篇独立纵向 Landing 模块及搜索导出区；复用 StoryPage、Tabs、Disclosure、Accordion 与全站翻屏。`src/components/course-explorer.tsx` 搜索全部模块、Prompt、策略和验收内容，组合篇章与产出类型筛选，导出当前结果。
- `scripts/prepare-assets.mjs`：在 dev / build 前从 Feature 999 的 `design/prototype/` 生成 `public/prototype/`，从 `context/dataagent-tech-stack/visuals/system-architecture.png` 生成 `public/resources/system-architecture.png`。同时调用 `scripts/business-schema.mjs`，从 [998 技术设计](../../mai-specs/998-business-data-seeding-tool/design/TECH_DESIGN.md) 及其唯一结构源 [business-schema.sql](../../mai-specs/998-business-data-seeding-tool/design/business-schema.sql) 派生 `public/resources/business-schema.json`；不访问数据库。分发副本不进入课程仓库；Turborepo 构建与测试输入包含对应源文件，SQL 新增未分域的表会阻止素材生成。
- `tests/content.test.mjs`：验证页面与场景链接；`tests/course-map.test.mjs` 验证 11–43 课覆盖、任务契约、补充能力、组合查询与 CSV。`tests/business-schema.test.mjs` 验证全表/字段/外键覆盖、复合键基数、增量表归属及结构解析失败保护。
- `scripts/system-schema.mjs` 从系统设计的领域章节、Mermaid 与表说明派生 `public/resources/system-schema.json`；`prepare-assets.mjs` 同时分发 `system-data-model.md`。支持表格对齐空白和显式/简写 REF，简写目标必须来自唯一 ER 关系；字段、表、引用和领域无法解析时构建失败；`tests/system-schema.test.mjs` 验证全量覆盖、复合租户引用、可空/一对一基数与失败保护。源文档纳入 Turbo 构建/测试输入，JSON 和文档下载副本仍为忽略的派生产物。
- `react-bits.lock.json`：所安装 GhostFibers 注册表源码的 SHA-256；用户指定 JS-CSS 版本通过 TS 客户端组件使用。第三方许可见 [licenses/react-bits.md](licenses/react-bits.md)。本地只将 ref 更新移入 effect，以兼容当前 React 检查。

统一墨绿 `#1c5145`、暖白 `#f8f9f6` 与浅绿 `#dceab8`。叙事标题使用系统宋体，正文使用系统无衬线；没有远程字体依赖。导航在滚动距离超过自身实际高度后切换为半透明玻璃，回到阈值以内恢复实色；桌面与手机分别按 80 px、68 px 的当前高度触发。产品、技术架构、脚手架和学习指南页采用一屏一个主题的纵向叙事，共用 `components/story-page.tsx` 的右侧圆点导航；工程两页的图示与排版由 `engineering-story.module.css` 维护。课程页采用同样的逐屏叙事，每篇有独立锚点与任务视图，完整任务查询收于页尾；学习指南按授课、准备、资料、作业与提交顺序阅读，长清单与展开内容可自然增高。动画支持 Reduced Motion；首页背景可以暂停，不可见时停止渲染，无 WebGL 时保留渐变背景和全部正文。

全站六个页面通过 `components/page-scroll.tsx` 共用滚轮翻屏：一次连续滚轮或触控板手势只前进 / 后退一屏，惯性尾段不连跳；普通章节落在导航下沿，超出一屏的内容按视口逐段翻阅，展开内容始终可读。切换约 640 ms，标题与正文使用不同位移形成视差；锚点与右侧圆点导航使用同一动效。表格、滚动面板、ER 图和 iframe 保留原生交互，表单与对话框不触发翻屏。键盘翻屏即时完成，Reduced Motion 关闭位移与视差，触摸滑动保持原生。路由切换、缩放或触摸介入会取消当前动画；不锁定文档高度，页脚和浏览器查找仍可访问。手势与长章节边界由 `tests/screen-scroll.test.mjs` 验证。

按钮统一采用项目定义的 ghost：`Button` 默认使用 `variant="ghost"`；标签页、筛选、步骤选择和折叠触发器复用 `ghost-control`。默认透明背景并保留 1 px 实线边框，浅色区域使用 `--ghost-border: #789181`，深色区域使用 `#86a38b`；hover 加深边框并以鼠尾草绿 → 浅青绿的邻近色渐变淡入。深色区域通过 `data-ghost-theme="dark"` 或现有深色容器继承对应 Token。选中项使用文字同色边框和下划线标记，键盘焦点使用独立描边，禁用项保留边框并降低整体透明度，Reduced Motion 关闭按压缩放。折叠组件的边框由外层容器绘制，标题保留相同的文字、渐变反馈与焦点配色，具体规则见下文。该规范只作用于 home 页面，独立原型及 iframe 内样式保持原样。

## 展开折叠组件规范

独立的补充内容使用 [Disclosure](src/components/ui/disclosure.tsx)，任务列表和 FAQ 使用 [Accordion](src/components/ui/accordion.tsx)。二者共用 [globals.css](src/app/globals.css) 的 `disclosure` 样式契约；原生 `details` 保留服务端页面在脚本加载前的展开能力，Radix 保留分组和键盘导航。

| 项目       | 统一规则                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 容器       | 单层 1px `--ghost-border` 边框；`--disclosure-radius` 引用全局 10px 圆角；列表项间距 `--disclosure-gap: 12px`               |
| 标题与正文 | 共用 `--disclosure-inset: 20px` 左右留白；手机端 16px；正文上留白 16px、下留白 20px                                         |
| 标准密度   | 标题至少 56px 高，上下留白 16px、字号 14px；用于独立说明、任务列表与 FAQ                                                    |
| 紧凑密度   | `density="compact"`，标题至少 44px 高、上下留白 11px、左右 16px、字号 12px；用于会话预览及工程规范内嵌说明                  |
| 展开状态   | 保留完整外框，标题使用浅色渐变，正文顶部一条分隔线；统一右侧 16px 下箭头，展开后转向上方                                    |
| 交互       | 整行可点击；键盘焦点内缩描边；长标题换行且箭头不压缩；折叠标题按压时保持尺寸；键盘切换即时生效，Reduced Motion 关闭箭头运动 |
| 窄屏       | 任务编号和范围标签在首行，标题与课次各占一行；任务详情、会话证据转单列；数据表格在自身容器内处理溢出                        |

页面只负责外部间距和正文排版，不重写触发器的 padding、边框、圆角或箭头。需要分栏的展开正文放入子容器；`contentClassName` 只用于正文布局。新增折叠项直接复用上述组件，不在页面编写独立的 `summary.ghost-control`。

覆盖首页分析过程与依据、产品案例、架构数据规模、脚手架选型与启动步骤、工程规范、课程任务与统计、学习及排障 FAQ。

## 静态预览分发

```bash
pnpm --filter @compass/home build:static
```

静态导出写入 `out/`，会刷新 `.next/` 构建状态；切回服务端运行前重新执行 `build`。默认 `build` / `start` 仍是 Next.js 服务端模式。Sites 项目 ID 仅维护在 [.openai/hosting.json](.openai/hosting.json)，已有 ID 必须复用。静态预览不改变产品后端部署方式。

Sites 使用课程 `work/` 下隔离的发布副本，只包含此 App、必要原型与架构图源文件；`reference/` 保存这些发布素材快照，其中 `reference/business-data/` 必须包含同版本的 `TECH_DESIGN.md` 和 `business-schema.sql`，`reference/design/data-model.md` 必须包含当前系统设计；常规工作区继续读取 Feature 原件。发布副本的 build 脚本调用 `build:static`，原始源码不在发布副本中编辑。

需求与验收见 [Feature 999 PRD](../../mai-specs/999-compass-product-course-landing-app/spec/PRD.md#21-home-官网首版)，实现方案见 [home App 设计](../../mai-specs/999-compass-product-course-landing-app/design/home-app-design.md)，验证见 [home 验收记录](../../mai-specs/999-compass-product-course-landing-app/test/home-verification.md)。

## 架构选型配图

Agent 决策权标签页使用 `public/resources/agent-authority-architecture.png`，由内置 image-gen 生成，支持打开原图查看。配图采用暖白、浅绿和深绿，呈现自主主控、混合 Agent Loop、下沉为 Tool / Skill 的局部 Workflow 及工程约束。

四大理由的装饰图为同目录下 `architecture-reason-{exploration,guardrails,reuse,evolution}.png`，分别表达动态探索、工程保障、能力复用和持续演进，均由内置 image-gen 生成。理由正文通过语义化 strong 与浅绿底色突出关键判断。

## 正文强调规范

全站复用 `src/app/globals.css` 的两级强调，使用语义化 `<strong>`，允许自然换行，背景随每行文字连续绘制：

- 弱强调：`className="emphasis-weak"`，主色文字、650 字重、浅绿局部渐变底色；用于辅助术语、次级要点。
- 强强调：`className="emphasis-strong"`，主色至深绿渐变背景、白色文字、700 字重、轻微圆角与内边距；用于关键判断、核心结论。正文建议每段一处短语，避免整段高亮。

四大选型理由的核心判断采用强强调。强调保持正文行内排版，无交互与悬停效果。
