export const navigation = [
  { href: "/", label: "首页" },
  { href: "/product", label: "产品" },
  { href: "/architecture", label: "技术架构" },
  { href: "/scaffold", label: "项目脚手架" },
  { href: "/course", label: "课程任务" },
  { href: "/learning", label: "学习指南" },
] as const;

export const courseName = "企业级Agent工程架构实战营";
export const prototypeUrl = "/prototype/index.html#analysis";

export const roles = [
  {
    id: "executive",
    name: "经营管理者",
    english: "Business leaders",
    question: "增长背后，利润和现金流跟上了吗？",
    description: "用统一口径看清渠道与区域变化，把经营复盘变成下一步决策。",
    scope: "经营总览 · 战略复盘 · 结果追踪",
    outputs: ["经营周报", "渠道贡献拆解", "决策依据"],
    nodes: ["管理层", "区域负责人", "渠道负责人"],
  },
  {
    id: "operator",
    name: "业务运营者",
    english: "Business operators",
    question: "哪些商品、库存和投放需要我现在行动？",
    description: "从异常信号开始，结合商品、渠道与履约事实，产出可审阅的行动草案。",
    scope: "商品运营 · 库存协同 · 投放分析",
    outputs: ["缺码诊断", "补货建议", "预算调整草案"],
    nodes: ["商品运营", "供应链", "投放运营"],
  },
  {
    id: "analyst",
    name: "数据分析师",
    english: "Data analysts",
    question: "这个结论经得起口径核对和反证吗？",
    description: "把多源查询、分析方法与证据关联起来，沉淀团队可以复用的报告和分析能力。",
    scope: "指标对账 · 原因诊断 · 方法验证",
    outputs: ["分析报告", "证据包", "可复用 Skill"],
    nodes: ["数据分析师", "财务分析", "业务专家"],
  },
  {
    id: "admin",
    name: "平台管理者",
    english: "Platform operators",
    question: "谁在使用什么能力，系统是否可靠可控？",
    description: "在同一 Web 系统中管理数据、能力与权限，观察运行质量、预算消耗和发布风险。",
    scope: "平台运营 · 权限治理 · 审计追踪",
    outputs: ["运行追踪", "质量回归", "权限与审计"],
    nodes: ["系统管理员", "部门负责人", "审计人员"],
  },
] as const;

export const analysisCases = [
  ["01", "快速问数", "一个问题，得到有口径的答案"],
  ["02", "多维下钻", "沿区域、渠道、商品逐层定位"],
  ["03", "文件分析", "清洗、关联并解释上传的数据"],
  ["04", "指标对账", "说明两份报表为何不一致"],
  ["05", "经营诊断", "建立假设，寻找支持与反证"],
  ["06", "深度研究", "跨来源组织复杂问题的证据"],
  ["07", "预测分析", "呈现区间、假设与适用边界"],
  ["08", "实验分析", "评价实验设计与结果可信度"],
  ["09", "因果分析", "区分相关性与可支持的因果"],
  ["10", "报告生产", "将分析沉淀为可复用产物"],
  ["11", "主动监控", "从持续信号触发新的分析"],
  ["12", "分析应用", "把分析变成可交互的工具"],
] as const;

export const journey = [
  {
    title: "理解问题",
    text: "确认时间、区域、渠道和业务目标。信息不足时先澄清。",
    code: "CLARIFY",
    evidence: "问题契约 · 数据范围",
  },
  {
    title: "规划与取证",
    text: "确认指标口径，分解假设，使用获权数据和工具验证。",
    code: "INVESTIGATE",
    evidence: "查询记录 · 证据与反证",
  },
  {
    title: "形成结论",
    text: "说明主要原因、证据强度与不确定性，生成可复算的报告。",
    code: "SYNTHESIZE",
    evidence: "分析报告 · 来源引用",
  },
  {
    title: "审阅行动",
    text: "把补货、预算等建议转为行动草案，由具备权限的人作出决定。",
    code: "DECIDE",
    evidence: "行动范围 · 审批记录",
  },
  {
    title: "追踪结果",
    text: "记录执行回执，监控后续指标；失败后恢复，重复请求保持幂等。",
    code: "FOLLOW THROUGH",
    evidence: "执行回执 · 效果追踪",
  },
] as const;

export const requirements = [
  ["结论可信", "口径契约、证据引用、结果校验", "Context / Query Gateway / Eval"],
  ["任务可恢复", "持久化状态、超时与接管", "Run / Temporal / Worker"],
  ["行动受控", "风险分级、人工审批、幂等回执", "Action Contract / Workflow"],
  ["数据不越权", "身份、范围与工具权限贯穿链路", "BFF / Policy / Query Gateway"],
  ["问题可定位", "调用链、上下文清单、版本回放", "Trace / Replay / Observability"],
  ["质量可持续", "成本预算、回归门槛、受控发布", "LLM Runtime / EvalOps"],
] as const;

export const codeMap = [
  {
    path: "apps/home/",
    role: "官网与课程入口",
    detail: "当前页面所在的独立 Next.js App；端口 3001，无数据库或模型密钥依赖。",
    status: "已实现",
  },
  {
    path: "apps/web/",
    role: "产品界面与 BFF",
    detail: "Next.js App Router、Route Handlers、生成类型和响应校验。当前提供 M0 链路验收页面。",
    status: "已实现",
  },
  {
    path: "apps/agent/",
    role: "Agent 主后端",
    detail:
      "FastAPI，端口 8000；已具备接口契约、应用库迁移和三天演示样本。普通执行、分派与 Sandbox 控制待在内部实现。",
    status: "已实现",
  },
  {
    path: "apps/memory/",
    role: "独立记忆服务",
    detail:
      "Python / FastAPI，端口 8001；当前提供健康检查，无数据库依赖，记忆业务与工具接口待实现。",
    status: "脚手架",
  },
  {
    path: "apps/worker/",
    role: "后台任务进程",
    detail: "Python / asyncio 脚手架，无 HTTP 端口，支持信号退出；任务队列、定时与持久恢复待实现。",
    status: "脚手架",
  },
  {
    path: "tools/data-seed/",
    role: "离线业务数据准备",
    detail:
      "独立 Python 工具，按需生成、校验、导出与发布零售数据；无需启动 Agent，已验收数据存放在 data/retail/。",
    status: "已实现",
  },
  {
    path: "contracts/",
    role: "跨语言接口契约",
    detail: "Python DTO 是契约源，生成 OpenAPI、JSON Schema 与 TypeScript，检查漂移。",
    status: "已实现",
  },
  {
    path: "deploy/",
    role: "容器与服务启动",
    detail:
      "Compose app profile 启动数据库、迁移与 seed、Agent 和 Web；memory / worker 按 profile 启用，home 独立启动。",
    status: "已实现",
  },
  {
    path: "scripts/",
    role: "工作区工具与检查",
    detail: "工具链检查、契约生成、依赖边界、数据库任务与端到端 smoke。",
    status: "已实现",
  },
  {
    path: "packages/",
    role: "按需提取共享能力",
    detail: "达到两个 App 消费时再提取共享包；当前保持清晰的应用边界。",
    status: "准入规则",
  },
  {
    path: "mai-specs/999-…/",
    role: "产品、设计与交互原型",
    detail: "spec 维护 PRD，design 维护技术和体验设计，test 维护验收证据。",
    status: "评审稿",
  },
  {
    path: "packages/agent-core/",
    role: "按需提取执行能力",
    detail: "待 agent 与 worker 实际复用执行与领域逻辑时再提取；当前尚未创建此共享包。",
    status: "计划",
  },
] as const;
