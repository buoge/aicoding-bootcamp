// Teaching deliverables derived from course/curriculum/v5/course_outline.md (11–43).
// This is the Home display model, not an implementation-status ledger or a new outline.
export type Output = { assets: string[]; work: string };
export type LessonOutput = {
  number: number;
  title: string;
  engineering: Output;
  algorithm: Output;
  acceptance: string;
};
export type Supplement = {
  id: string;
  title: string;
  engineering: Output;
  algorithm: Output;
  acceptance: string;
};
export type CourseChapter = {
  number: number;
  id: string;
  ordinal: string;
  name: string;
  english: string;
  headline: string;
  description: string;
  entry: string;
  outcome: string;
  note: string;
  lessons: LessonOutput[];
  supplements: Supplement[];
  scenarios: { title: string; action: string; evidence: string }[];
};
const output = (assets: string[], work: string): Output => ({ assets, work });

export const courseChapters: CourseChapter[] = [
  {
    number: 4,
    id: "model",
    ordinal: "第四篇",
    name: "LLM 执行底座",
    english: "LLM Runtime",
    headline: "让每一次模型调用，都有可靠的执行边界。",
    description:
      "统一接入、模型路由、可靠执行与调用追踪。同步调优意图分流，为后续分析、闲聊与 PPT 任务准备模型入口。",
    entry: "M0 脚手架、基础会话与模型调用可运行。",
    outcome: "一个可切换模型、可控重试、可查成本的统一执行入口。",
    note: "任务分流决定走分析、闲聊还是 PPT；模型路由决定一个步骤使用哪个模型。已知 Step 类型优先走规则，语义判断按需引入。",
    lessons: [
      {
        number: 11,
        title: "统一模型执行边界",
        engineering: output(
          ["llm", "llm-adapter", "llm-registry"],
          "统一请求、响应、错误和能力契约，接入不同 Provider，保留结构化输出与工具调用差异。",
        ),
        algorithm: output(
          ["TaskProfile", "Prompt 输入输出契约"],
          "为规划、SQL、证据判断和报告定义任务类型、能力需求与输出规范。",
        ),
        acceptance: "同一任务通过统一入口切换 Provider，上层业务无需修改。",
      },
      {
        number: 12,
        title: "多模型路由与任务分流",
        engineering: output(
          ["llm-router", "logical-model", "fallback-policy"],
          "实现逻辑模型映射、能力过滤、租户策略与可解释的 Fallback 链。",
        ),
        algorithm: output(
          ["taskProfiler", "modelRouter（可选）", "路由评测集"],
          "调优任务能力识别和模型路由；比较固定模型、规则路由与语义路由的质量、成本和时延。",
        ),
        acceptance: "规划、SQL、验证、报告均选到符合能力、预算和租户限制的模型，并能解释原因。",
      },
      {
        number: 13,
        title: "高并发下的可靠执行",
        engineering: output(
          ["llm-retry", "llm-validator", "llm-stream", "llm-concurrency"],
          "实现 Logical Call / Attempt、Timeout / Deadline、限流、Schema 校验与流式最终提交。",
        ),
        algorithm: output(
          ["Output Schema", "outputRepair（可选）", "输出契约测试集"],
          "调优结构化输出；限定修复范围与次数，覆盖缺字段、错类型、错误工具参数和截断。",
        ),
        acceptance: "超时可恢复，非法输出不进入下游；流式中间内容不作为最终业务结果。",
      },
      {
        number: 14,
        title: "模型治理与运营",
        engineering: output(
          ["llm-trace", "llm-usage", "llm-budget", "llm-version"],
          "关联调用链与版本，统计租户用量和成本，执行预算限制并提供回放入口。",
        ),
        algorithm: output(
          ["模型对照基线", "降级策略", "路由质量评测"],
          "在固定任务集上比较模型与策略，验证降级后任务能力仍满足契约。",
        ),
        acceptance: "可定位某次调用的模型、路由和 Prompt 版本，查询失败原因与租户成本。",
      },
    ],
    supplements: [
      {
        id: "entry",
        title: "产品入口与意图分流",
        engineering: output(
          ["chat-api", "session", "task-dispatcher", "stream-protocol"],
          "接收用户输入，保存会话，将任务交给对应执行链，并统一返回进度事件。",
        ),
        algorithm: output(
          ["intentRouter", "taskClarifier", "casualChat"],
          "区分数据分析、报告、PPT 和闲聊；信息不足时澄清，闲聊采用轻量回应。",
        ),
        acceptance:
          "分析请求进入分析链，闲聊不启动数据查询，PPT 请求进入内容制作链；模糊请求先澄清。",
      },
    ],
    scenarios: [
      {
        title: "同一入口，按任务分流",
        action: "依次提交经营分析、闲聊与 PPT 请求，再查看各步骤选模。",
        evidence: "任务分类、模型路由理由、能力与租户策略记录。",
      },
      {
        title: "注入调用故障",
        action: "模拟超时、限流、非法输出和预算耗尽。",
        evidence: "Attempt、Fallback、停止原因、最终提交和成本记录。",
      },
    ],
  },
  {
    number: 5,
    id: "agent",
    ordinal: "第五篇",
    name: "Agent 核心与运行系统",
    english: "Agent Harness & Runtime",
    headline: "让分析自主推进，让长任务跨故障继续。",
    description:
      "以数据分析主 Prompt 驱动规划与验证，以持久化状态、Workflow 和 Worker 承接任务的执行、等待与恢复。",
    entry: "第四篇的统一模型入口、调用追踪与预算控制。",
    outcome: "能自主分析、等待审批、持久运行并在中断后接管的 Agent。",
    note: "dataAnalysisMain 定义主 Agent 的行为契约。Planner、Verifier 可以先作为同一 Harness 的决策步骤，按效果与成本决定是否独立调用。",
    lessons: [
      {
        number: 15,
        title: "任务契约与混合架构",
        engineering: output(
          ["task-contract", "agent-config", "autonomy-budget"],
          "定义目标、输入、完成标准和控制权；限制步骤、时间、调用次数与成本，记录架构 ADR。",
        ),
        algorithm: output(
          ["taskClarifier", "任务结构化提取", "完成标准"],
          "澄清指标、时间和范围，将自然语言需求变成可执行任务。",
        ),
        acceptance: "将“分析华东 GMV 下滑”转成目标明确、约束可执行的 Task Contract。",
      },
      {
        number: 16,
        title: "自主分析闭环",
        engineering: output(
          ["agent-harness", "analysis-state", "stop-condition"],
          "实现 Plan / Act / Observe / Verify 循环，记录假设、证据、未解决问题和停止原因。",
        ),
        algorithm: output(
          ["dataAnalysisMain", "planner", "replanner", "verifier", "completionJudge"],
          "提出假设、设计验证计划，根据结果重规划；证据充分或预算耗尽时结束。",
        ),
        acceptance: "自主完成一轮经营分析；证据不足时补查，无有效进展时正确停止。",
      },
      {
        number: 17,
        title: "统一执行模型",
        engineering: output(
          ["agent-runtime", "run-state", "event-store", "run-timeline"],
          "统一 Run / Step / Attempt / Event / Checkpoint 与状态迁移，关联父子任务。",
        ),
        algorithm: output(
          ["步骤结果契约", "分析状态契约", "下一步决策契约"],
          "约束结构化决策与状态更新，让执行状态可被程序验证。",
        ),
        acceptance: "每一步可追踪、可持久化，恢复所需状态无需从聊天记录中推断。",
      },
      {
        number: 18,
        title: "持久化流程与审批",
        engineering: output(
          ["agent-workflow", "checkpoint", "resume", "approval"],
          "包裹自主分析，支持外部等待、检查点、人工审批和副作用执行记录。",
        ),
        algorithm: output(
          ["actionProposer", "审批说明模板"],
          "把经营结论转成结构化行动提议，表达依据、范围和预期影响。",
        ),
        acceptance: "预算调整前暂停，批准后从正确位置继续；拒绝时不执行。",
      },
      {
        number: 19,
        title: "调度与分布式执行",
        engineering: output(
          ["scheduler", "queue", "worker", "lease", "heartbeat"],
          "实现异步执行、租约接管、多租户配额与资源公平调度，记录部署形态 ADR。",
        ),
        algorithm: output(
          ["调度规则", "资源配额策略"],
          "按任务与租户分配执行资源；这一步以确定性策略为主，无需新增独立 Prompt。",
        ),
        acceptance: "Worker 故障后可接管任务，已完成行动不重复提交，租户之间资源使用受控。",
      },
      {
        number: 20,
        title: "恢复与故障解释",
        engineering: output(
          ["fault-injection", "replay", "fork", "human-takeover"],
          "区分 Retry / Resume / Replay / Fork、补偿和人工接管，验证运行时不变量。",
        ),
        algorithm: output(
          ["Failure Taxonomy", "failureExplainer（可选）"],
          "基于结构化故障记录解释失败和下一步，不让模型猜测真实执行状态。",
        ),
        acceptance: "模型、工具和 Worker 故障均可定位；恢复前核对权限与已提交副作用。",
      },
    ],
    supplements: [],
    scenarios: [
      {
        title: "运行中中断，再继续",
        action: "启动分析，终止 Worker，接管后继续；关闭页面再回到任务。",
        evidence: "持久化状态、Checkpoint、租约、接管记录与完整 Timeline。",
      },
      {
        title: "人参与关键决策",
        action: "从分析产生预算建议，分别执行审批通过和拒绝流程。",
        evidence: "行动提议、审批记录、幂等回执与验真结果。",
      },
    ],
  },
  {
    number: 6,
    id: "context",
    ordinal: "第六篇",
    name: "Context、语义与证据",
    english: "Context & Evidence",
    headline: "每一步分析，都拿到充分、可信的依据。",
    description:
      "让指标语义、SQL、Python 分析与证据验证形成完整链路，再通过装配预算、摘要和交接支撑长任务。",
    entry: "第五篇的 Run / Step、分析状态与可观察执行链。",
    outcome: "有明确指标口径、权限边界和可追溯证据的经营分析。",
    note: "SQL 评测覆盖口径、Join、时间、粒度、空值和权限；Python 评测覆盖计算与图表；证据评测区分缺失、冲突、过期以及相关与因果。",
    lessons: [
      {
        number: 21,
        title: "面向决策的 Context 契约",
        engineering: output(
          ["context-schema", "context-provider", "decision-context"],
          "定义来源、版本、权限、可信度和生命周期，按步骤提供身份、任务、状态与知识。",
        ),
        algorithm: output(
          ["规划 Context 模板", "查询 Context 模板", "验证与建议模板"],
          "明确四类决策所需、可用和禁止输入的信息；缺少关键口径时澄清或停止。",
        ),
        acceptance: "四类步骤得到各自所需信息，关键输入缺失不会继续猜测。",
      },
      {
        number: 22,
        title: "经营语义与数据目录",
        engineering: output(
          ["metric-registry", "data-catalog", "data-connector"],
          "管理指标定义、别名、维度、时间、币种、血缘、数据质量及租户权限。",
        ),
        algorithm: output(
          ["metricResolver", "指标歧义识别"],
          "将用户表达映射到权威指标与维度，区分 GMV、净销售额等口径。",
        ),
        acceptance: "同义表达解析一致，租户口径差异可解释，数据新鲜度可检查。",
      },
      {
        number: 23,
        title: "动态上下文装配与预算",
        engineering: output(
          ["context-assembler", "context-budget", "context-ranker"],
          "先做权限与有效期硬过滤，再排序、去重、处理冲突和分配 Token；大结果使用 Artifact 引用。",
        ),
        algorithm: output(
          ["Context 选择与排序策略", "contextCompressor（可选）"],
          "优先保留必需口径、任务约束与证据，检验压缩后的充分性。",
        ),
        acceptance: "预算紧张时关键约束仍在，高相关性不能绕过权限过滤。",
      },
      {
        number: 24,
        title: "查询、分析与证据链",
        engineering: output(
          ["knowledge-ingestion", "query-gateway", "python-sandbox", "evidence-store"],
          "解析带版本与 ACL 的知识；受控查询、隔离计算，记录搜索预算与 Claim-Evidence 关联。",
        ),
        algorithm: output(
          [
            "queryDesigner",
            "sqlGenerator",
            "pythonAnalyst",
            "evidenceSearcher",
            "evidenceVerifier",
          ],
          "围绕信息缺口选源、生成查询与分析代码，验证假设，明确结论的证据支持和不确定性。",
        ),
        acceptance: "形成流量、转化、客单价、库存和退款的假设树，主要结论能回到证据。",
      },
      {
        number: 25,
        title: "长任务压缩与子任务交接",
        engineering: output(
          ["context-lifecycle", "artifact-store", "child-run", "context-drift"],
          "分离 History / State / Checkpoint / Summary；恢复时重装配，子任务限制上下文、权限与预算。",
        ),
        algorithm: output(
          ["stepSummarizer", "phaseSummarizer", "handoffSummarizer", "childTaskBrief"],
          "按用途生成摘要，保留目标、未完成任务、约束、失败记录和证据引用。",
        ),
        acceptance:
          "月度分析压缩恢复后不丢目标、不重复已完成工作，库存 Child Run 收到最小必要信息。",
      },
      {
        number: 26,
        title: "Context 安全与运营",
        engineering: output(
          ["context-trace", "context-policy", "context-replay"],
          "区分指令与外部数据，隔离候选池、缓存和日志，记录过滤、排序、压缩与注入决策。",
        ),
        algorithm: output(
          ["注入攻击测试集", "上下文充分性评测", "压缩保真评测"],
          "比较召回率、噪声、新鲜度、引用正确性与 Token 效率，归因装配失败。",
        ),
        acceptance: "恶意文档无法改变系统规则，过期指标和跨租户内容被拦截，策略变化可回归。",
      },
    ],
    supplements: [],
    scenarios: [
      {
        title: "解释 GMV 为什么下降",
        action: "确认口径，生成 SQL，运行 Python 分析并逐条核对证据。",
        evidence: "指标版本、查询记录、图表 Artifact 与 Claim-Evidence 关联。",
      },
      {
        title: "压缩、恢复与安全边界",
        action: "压缩月度分析，交接库存子任务，并注入过期指标和恶意文档。",
        evidence: "压缩保留项、Handoff、权限过滤原因和 Context Trace。",
      },
    ],
  },
  {
    number: 7,
    id: "capability",
    ordinal: "第七篇",
    name: "Tool、Skill 与行动",
    english: "Capabilities & Delivery",
    headline: "把分析方法，交付成可复用的能力。",
    description:
      "建设工具执行、经营诊断 Skill 与受控行动；补齐 finalAnswer、多类型 Writer 和 PPT 制作，将分析成果交到用户手中。",
    entry: "第五、六篇的执行状态、Context 契约、数据与证据能力。",
    outcome: "可复用的诊断 Skill、安全的业务行动，以及报告和 PPT 交付链。",
    note: "Skill 组合 Prompt、Tool、参考资源与 Validator。权限、预算和审批由工程机制执行；工具描述和参数示例同样属于需要调优的算法资产。",
    lessons: [
      {
        number: 27,
        title: "能力形态与职责边界",
        engineering: output(
          ["capability-registry", "capability-contract"],
          "明确 API / Tool / Skill / Workflow / SubAgent 的职责、版本和依赖，形成能力地图。",
        ),
        algorithm: output(
          ["能力描述规范", "任务到能力的选择规则"],
          "让查询、分析、报告与业务行动有清晰语义，缩小模型可见能力面。",
        ),
        acceptance: "每项能力有明确执行入口与治理责任，封装选择有 ADR 依据。",
      },
      {
        number: 28,
        title: "工具契约与动态供给",
        engineering: output(
          ["tool-registry", "tool-executor", "tool-set-compiler"],
          "统一参数、结果和错误语义；按租户、角色、步骤提供最小工具集，执行前再鉴权。",
        ),
        algorithm: output(
          ["toolDescriptions", "参数示例", "工具选择评测集"],
          "调优名称、描述、参数约束与示例，比较业务语义工具和底层通用工具。",
        ),
        acceptance: "选对工具、传对参数，理解失败后应重试、改参还是停止。",
      },
      {
        number: 29,
        title: "受控行动闭环",
        engineering: output(
          ["action-runtime", "action-preview", "action-verifier"],
          "实现提议、校验、授权、审批、幂等执行、结果验真和补偿，审批绑定具体参数。",
        ),
        algorithm: output(
          ["actionProposer", "行动风险说明模板"],
          "表达行动依据、影响与待确认事项；风险控制由策略和授权机制执行。",
        ),
        acceptance: "重复请求、审批后篡改、接口假成功和部分执行均被正确处理。",
      },
      {
        number: 30,
        title: "领域 Skill 工程",
        engineering: output(
          ["skill-registry", "skill-loader", "skill-validator"],
          "实现渐进式加载、依赖管理、版本与兼容性检查，用 Validator 验收完成标准。",
        ),
        algorithm: output(
          ["diagnosisSkill", "skillSelector（可选）", "领域规则与参考样例"],
          "固化指标确认、假设、取证、验证、排序、报告的诊断方法，评测技能变更。",
        ),
        acceptance: "经营异常诊断可复用、可版本化，缺少关键证据时不会判定完成。",
      },
      {
        number: 31,
        title: "MCP 与能力运营",
        engineering: output(
          ["mcp-host", "mcp-server", "credential-broker", "tool-trace"],
          "接入独立广告平台能力，提供认证、租户隔离、限流、凭据与审计，Host 控制工具可见与执行权限。",
        ),
        algorithm: output(
          ["远程工具描述", "能力一致性评测", "能力红队样例"],
          "校验本地与远程能力语义，覆盖伪造结果、跨租户访问、重复执行和版本漂移。",
        ),
        acceptance: "通过 MCP 查询广告并完成预算调整，调用与授权全程可追踪。",
      },
    ],
    supplements: [
      {
        id: "final-answer",
        title: "finalAnswer 与多类型 Writer",
        engineering: output(
          ["final-answer", "writer-registry", "artifact-renderer", "artifact-exporter"],
          "汇总已验证结果、证据、行动状态和未解决问题，按交付格式选择 Writer，保存并导出成果。",
        ),
        algorithm: output(
          [
            "finalAnswer",
            "defaultWriter",
            "analysisReportWriter",
            "executiveSummaryWriter",
            "actionProposalWriter",
          ],
          "分别支持直接回答、详细报告、管理摘要和行动提案；沿用已验证结论，保持引用与不确定性。",
        ),
        acceptance: "同一份分析可生成多种表达形式，数字、结论与引用保持一致。",
      },
      {
        id: "ppt",
        title: "PPT 制作能力包",
        engineering: output(
          ["ppt-generator", "ppt-template", "ppt-renderer", "layout-validator"],
          "装配模板、图表和素材，渲染导出 PPT，检查版面与文件可用性。",
        ),
        algorithm: output(
          ["pptSkill", "pptOutlineWriter", "pptPageWriter", "reportSkill"],
          "从受众和汇报目标出发，将已验证分析组织成大纲与单页内容，复用证据和图表。",
        ),
        acceptance: "分析结果 → 汇报大纲 → 单页内容 → 渲染 → 事实与版面校验 → 文件交付。",
      },
    ],
    scenarios: [
      {
        title: "复用方法，交付多种成果",
        action: "用诊断 Skill 分析同类问题，将结果输出为报告、摘要和 PPT。",
        evidence: "Skill 版本、Validator 结果、报告引用、导出文件与版面检查。",
      },
      {
        title: "从建议到真实行动",
        action: "预览预算调整，审批后经 MCP 执行，再模拟重复调用与假成功。",
        evidence: "审批绑定、幂等记录、实际业务状态与 Tool Trace。",
      },
    ],
  },
  {
    number: 8,
    id: "memory",
    ordinal: "第八篇",
    name: "Memory 长期记忆",
    english: "Governed Memory",
    headline: "记住有用的经验，也能纠正和遗忘。",
    description:
      "打通候选提取、验证写入、受控召回、修改和删除，让偏好跨任务延续，同时保持当前事实与权限的权威性。",
    entry: "可追踪的 Run 事件、Context Provider 与明确的数据权限。",
    outcome: "可写入、召回、修改、删除并证明有效的长期记忆闭环。",
    note: "记忆保存有复用价值的偏好与任务引用；实时经营数据、指标权威定义和当前权限仍从权威来源获取。",
    lessons: [
      {
        number: 32,
        title: "记忆必要性与边界",
        engineering: output(
          ["memory-policy", "memory-schema", "memory-scope"],
          "完成 Go / No-Go 决策，定义类型、范围、确认规则、保存期限与禁止写入内容。",
        ),
        algorithm: output(
          ["记忆分类标准", "允许与禁止样例集"],
          "区分偏好、任务引用、流程经验与实时事实，验证跨任务复用价值。",
        ),
        acceptance: "对需要记忆的场景给出收益、风险、替代方案和退出条件。",
      },
      {
        number: 33,
        title: "可信写入链路",
        engineering: output(
          ["memory-writer", "memory-store", "memory-candidate"],
          "从 Run 事件触发候选处理，校验、去重、幂等提交、冲突处理与版本失效。",
        ),
        algorithm: output(
          ["memoryExtractor", "memoryNormalizer", "memoryConflictJudge（可选）"],
          "提取并标准化候选，识别偏好更新，拒绝临时结论和模型猜测。",
        ),
        acceptance: "Run A 写入确认过的报告偏好与任务引用，重复消费不重复保存。",
      },
      {
        number: 34,
        title: "受控召回与注入",
        engineering: output(
          ["memory-recall", "recall-contract", "memory-context-provider"],
          "先过滤租户、权限、有效期和状态，再排序；按步骤和预算注入，记录使用过程。",
        ),
        algorithm: output(
          ["memoryRecallQuery", "召回排序策略", "步骤适用性判断"],
          "规划时引用历史任务，报告时使用偏好；召回、注入与行动权限分开。",
        ),
        acceptance: "Run B 延续有效偏好，经营数据与授权重新获取，其他租户无法召回。",
      },
      {
        number: 35,
        title: "记忆管理与效果证明",
        engineering: output(
          ["memory-console", "memory-delete", "memory-trace"],
          "支持查看、解释、修改、删除，向索引和缓存传播失效，审计管理操作。",
        ),
        algorithm: output(
          ["记忆污染测试集", "Memory Eval", "三方案对照"],
          "比较 Off、Blind Top-K 与 Governed Memory，评估写入、价值、过期、污染与删除有效性。",
        ),
        acceptance: "旧偏好退出默认召回，删除后全链路不可召回，恶意候选被拒绝或隔离。",
      },
    ],
    supplements: [],
    scenarios: [
      {
        title: "两次任务之间延续偏好",
        action: "Run A 保存确认偏好，Run B 使用偏好，再修改并检查新版本。",
        evidence: "候选来源、确认记录、版本关系、召回与注入 Trace。",
      },
      {
        title: "可删除、不可越权",
        action: "切换租户、注入恶意记忆，再删除已保存偏好并重新检索。",
        evidence: "隔离与污染测试，主库、索引和缓存的删除验证，三方案评测。",
      },
    ],
  },
  {
    number: 9,
    id: "eval",
    ordinal: "第九篇",
    name: "EvalOps 与受控发布",
    english: "Evaluation & Evolution",
    headline: "每一次优化，都有可复现的证据。",
    description:
      "为模型路由、Prompt、Tool、Skill、Memory 与 Writer 建立评测集，用诊断、回归门禁和版本回滚连接优化与发布。",
    entry: "可运行的业务链路、可追踪的版本和可复现的任务环境。",
    outcome: "候选版本可公平比较，退化可阻断，发布可灰度、可回滚。",
    note: "Prompt 调优统一交付：模板、输入输出契约、正常与异常样例、Eval 数据集、评分标准、版本对比报告。写操作回放使用隔离环境。",
    lessons: [
      {
        number: 36,
        title: "质量契约与硬门槛",
        engineering: output(
          ["eval-contract", "quality-gates"],
          "定义 Outcome / Trajectory / System 指标，把跨租户泄漏、未审批执行等设置为硬门槛。",
        ),
        algorithm: output(
          ["结果评分标准", "轨迹评分标准", "系统评测指标"],
          "将架构选型理由转成可验证假设，明确完成标准和直接判失败的情况。",
        ),
        acceptance: "GMV 诊断有结果、证据链、路径、成本与安全标准，平均分不能掩盖严重风险。",
      },
      {
        number: 37,
        title: "可复现数据与环境",
        engineering: output(
          ["eval-dataset", "fixture", "version-tuple"],
          "固定数据、时间、权限、工具和外部系统状态，管理数据集分层及完整资产版本。",
        ),
        algorithm: output(
          ["路由与 SQL 数据集", "分析与 Tool / Skill 数据集", "Memory 与 Writer 数据集"],
          "覆盖正常任务、缺失、故障、越权、审批拒绝和历史回归，保持调优与测试集隔离。",
        ),
        acceptance: "Baseline 与 Candidate 在同一环境公平比较，能够归因版本变化。",
      },
      {
        number: 38,
        title: "批量评测与多裁判",
        engineering: output(
          ["eval-runner", "multi-grader", "scorecard"],
          "实现批量执行、多次 Trial、代码 / 环境 / 轨迹 / 模型评分与多维对比。",
        ),
        algorithm: output(
          ["answerJudge", "evidenceJudge", "reportJudge", "PPT 内容评分", "裁判校准"],
          "用可验证规则做主裁判，语义质量按需由模型与人工校验，度量稳定性。",
        ),
        acceptance: "自动判断真实完成与表面回答正确的差异，输出质量、安全、成本和时延。",
      },
      {
        number: 39,
        title: "根因诊断与回归",
        engineering: output(
          ["trace-viewer", "replay", "fork", "ablation"],
          "关联失败 Case 与运行 Trace，用固定环境做对照实验，沉淀 Regression Case。",
        ),
        algorithm: output(
          ["failureClassifier（可选）", "根因假设与对照策略"],
          "辅助分类失败，通过实验验证问题来自模型、Context、Tool、Memory 或 Runtime。",
        ),
        acceptance: "错误指标口径的根因被证明，修复结果可复现且进入回归集。",
      },
      {
        number: 40,
        title: "发布门禁与完整回滚",
        engineering: output(
          ["regression-gate", "release-bundle", "canary", "kill-switch", "rollback"],
          "绑定代码与 Agent 资产版本，实现离线门禁、Shadow、灰度和完整行为回滚。",
        ),
        algorithm: output(
          ["optimizationProposal（可选）", "候选版本比较策略"],
          "提出 Prompt 或策略改进候选，经评测与发布规则验证；不自动修改授权和安全策略。",
        ),
        acceptance: "退化候选被拦截，修复后灰度，异常时能回退完整版本。",
      },
    ],
    supplements: [],
    scenarios: [
      {
        title: "证明一次 Prompt 优化",
        action: "固定环境比较两个 Prompt 版本，检查多次 Trial 与不同维度的表现。",
        evidence: "版本元组、Scorecard、评分器版本与失败 Case Trace。",
      },
      {
        title: "阻断退化并安全回滚",
        action: "引入退化候选，定位并修复，完成灰度和异常回滚。",
        evidence: "根因实验、回归样本、门禁记录、灰度监控与版本恢复。",
      },
    ],
  },
  {
    number: 10,
    id: "integration",
    ordinal: "第十篇",
    name: "系统集成与最终演示",
    english: "Integration & Architecture Review",
    headline: "把所有拼图，连成一个完整的系统。",
    description:
      "从业务、故障、安全和演进四条链路演示 Compass，核对架构决策与运行证据，并明确人的接管点和下一阶段演进条件。",
    entry: "第四至第九篇的工程模块、算法资产与专项验收证据。",
    outcome: "可启动、可演示、可解释设计取舍的 DataAgent 完整交付。",
    note: "这里展示建设任务与验收目标，不代表后台能力已实现。第 42、43 课以决策与责任收口，无需为每个概念额外建设服务。",
    lessons: [
      {
        number: 41,
        title: "业务闭环与架构答辩",
        engineering: output(
          ["demo-console", "demo-fixtures", "demo-reset", "交付包"],
          "集成工作台、任务详情、审批、租户、记忆和评测页面；准备固定数据、启动重置与演示脚本。",
        ),
        algorithm: output(
          ["固定演示问题", "预期证据与标准结果", "全链路验收集"],
          "验证主 Prompt、Skill、工具和 Writer 协同，核对正常、故障、安全和演进链路。",
        ),
        acceptance: "交付代码、运行说明、Prompt / Skill / Tool、数据与评测、Trace 和完整 ADR 链。",
      },
      {
        number: 42,
        title: "人与 AI 的责任边界",
        engineering: output(
          ["控制权矩阵", "审批与接管检查表"],
          "核对现有系统中人工执行、AI 辅助、Agent 代理与代码控制的边界和接管入口。",
        ),
        algorithm: output(
          ["责任边界案例", "人工验收标准"],
          "通过具体案例解释目标、判断、授权与责任，检验工程师能否理解和接管执行。",
        ),
        acceptance: "能说明每个关键决定由谁作出、如何验证、出错时由谁接管。",
      },
      {
        number: 43,
        title: "下一阶段演进判断",
        engineering: output(
          ["ADR 复盘", "演进触发条件", "能力路线图"],
          "核对假设与证据，明确何时扩展、简化、替换或回退当前架构。",
        ),
        algorithm: output(
          ["新模型与新方案对照方法", "采用 / 试点 / 观望标准"],
          "以真实任务评测判断技术变化是否改变约束，保留可验证的架构选择依据。",
        ),
        acceptance: "最终架构的复杂度有问题、取舍和证据支撑，下一步演进有触发条件。",
      },
    ],
    supplements: [
      {
        id: "operations",
        title: "周期任务与行动效果跟踪",
        engineering: output(
          ["scheduled-run", "anomaly-trigger", "action-followup"],
          "接入周期报告、异常触发、重复触发治理，将行动与后续观测关联。",
        ),
        algorithm: output(
          ["异常触发规则", "行动效果复盘策略"],
          "复用分析主 Prompt 与报告能力，比较行动前后的变化，说明归因局限。",
        ),
        acceptance: "定时生成报告，异常启动诊断，行动后的指标观测可回查到原提议和执行记录。",
      },
    ],
    scenarios: [
      {
        title: "业务闭环",
        action: "问题 → 分流 → 分析 → 报告 / PPT → 审批 → 执行 → 跟踪。",
        evidence: "任务、证据、交付文件、审批、回执与后续观测。",
      },
      {
        title: "故障恢复",
        action: "模拟超时、工具失败、进程崩溃和重复执行。",
        evidence: "恢复记录、停止原因、无重复副作用的状态证明。",
      },
      {
        title: "安全阻断",
        action: "尝试跨租户访问、恶意文档、审批篡改和记忆污染。",
        evidence: "策略拒绝、权限审计与隔离测试。",
      },
      {
        title: "版本演进",
        action: "完成一次 Prompt / Skill / 策略优化，从评测走到发布与回滚。",
        evidence: "版本对比、根因实验、门禁与回滚记录。",
      },
    ],
  },
];

export const promptDeliverables = [
  "Prompt 模板",
  "输入输出契约",
  "正常与异常样例",
  "Eval 数据集",
  "评分标准",
  "版本对比报告",
];
export const courseLanes = ["工程产出", "Prompt / 策略"] as const;
export type CourseLane = (typeof courseLanes)[number];
export type CourseTask = {
  id: string;
  chapterId: string;
  chapter: string;
  lesson: string;
  title: string;
  lane: CourseLane;
  assets: string[];
  work: string;
  dependency: string;
  evidence: string;
  supplement: boolean;
};

// The landing sections, search and CSV all read this same display model.
export const courseTasks: CourseTask[] = courseChapters.flatMap((chapter) => [
  ...chapter.lessons.flatMap((lesson) =>
    courseLanes.map((lane, index) => {
      const item = index === 0 ? lesson.engineering : lesson.algorithm;
      return {
        id: `L${lesson.number}-${index === 0 ? "ENG" : "ALG"}`,
        chapterId: chapter.id,
        chapter: `${chapter.ordinal} · ${chapter.name}`,
        lesson: String(lesson.number),
        title: lesson.title,
        lane,
        ...item,
        dependency: chapter.entry,
        evidence: lesson.acceptance,
        supplement: false,
      };
    }),
  ),
  ...chapter.supplements.flatMap((supplement) =>
    courseLanes.map((lane, index) => {
      const item = index === 0 ? supplement.engineering : supplement.algorithm;
      return {
        id: `C${chapter.number}-${supplement.id}-${index === 0 ? "ENG" : "ALG"}`,
        chapterId: chapter.id,
        chapter: `${chapter.ordinal} · ${chapter.name}`,
        lesson: "跨课集成",
        title: supplement.title,
        lane,
        ...item,
        dependency: chapter.entry,
        evidence: supplement.acceptance,
        supplement: true,
      };
    }),
  ),
]);

export function filterCourseTasks(query = "", chapterId = "all", lane = "all") {
  const normalized = query.trim().toLowerCase();
  return courseTasks.filter(
    (task) =>
      (chapterId === "all" || task.chapterId === chapterId) &&
      (lane === "all" || task.lane === lane) &&
      [
        task.id,
        task.chapter,
        task.lesson,
        task.title,
        task.lane,
        ...task.assets,
        task.work,
        task.dependency,
        task.evidence,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
  );
}

export function courseTasksCsv(tasks: CourseTask[]) {
  const rows = [
    [
      "编号",
      "篇章",
      "课次",
      "任务",
      "类别",
      "模块 / 算法资产",
      "具体工作",
      "前置依赖",
      "验收证据",
      "范围",
    ],
    ...tasks.map((task) => [
      task.id,
      task.chapter,
      task.lesson,
      task.title,
      task.lane,
      task.assets.join(" / "),
      task.work,
      task.dependency,
      task.evidence,
      task.supplement ? "工程补齐" : "课次产出",
    ]),
  ];
  // Neutralize formula-leading text when a CSV is opened in a spreadsheet.
  const cell = (value: string) =>
    `"${(/^[=+@\-\t\r]/.test(value) ? `'${value}` : value).replaceAll('"', '""')}"`;
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
