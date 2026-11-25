# DataAgent 企业级 LLM Runtime 基础架构设计

## 进程内薄 Python SDK · 一期三模型接入

版本：v1.0　｜　设计基准：2026-11-02　｜　状态：架构方案，待实现与验收

**架构决策：以 LiteLLM Python SDK 为通用模型适配底座，自有一个小而稳定的 `data_agent.llm` 模块；允许原生 Provider 并行接入，不部署 Gateway 或 Proxy。**

一期支持 DeepSeek V4 Pro、DeepSeek V4.1 Flash，以及一款 JEV 类型的决策模型。生成模型与决策模型分开建模，共用调用上下文、执行约束、错误、用量和观测契约。

本文依据官方文档、DeepSeek Harness 公开源码及包发布信息核对外部能力；标注 [Sxx] 的内容可追溯到文末来源。其余为本项目的设计建议。未使用真实 API 凭据进行模型联调，也未完成依赖安装、压测或故障注入；候选版本和验收标准不等于已验证的生产保证。

# 1. 目标与边界

## 1.1 本模块是什么

`data_agent.llm` 是运行在 DataAgent 服务或 Worker 进程中的 Python 库。它负责“一次模型能力调用”的接入、执行控制、结果表达与观测，不拥有独立服务进程、管理后台或业务数据库。

上层只依赖企业自有契约，不直接散落调用 LiteLLM 或厂商 SDK。底层模型、接口和供应商变化，优先通过配置与 Provider 适配处理。

| 范围 | 一期决定 |
| --- | --- |
| 生成调用 | 非流式、流式、Thinking、Tool Calling 参数与结果、JSON 输出校验 |
| 决策调用 | 独立 `decide()`，支持 predicate／choice／score 的类型化表达 |
| 执行治理 | 总时限、取消、本地并发、有限重试策略、稳定错误和部分输出语义 |
| 可观测与费用 | 标准调用事件、Usage、费用估算、OTel 埋点，向宿主应用输出 |
| 扩展能力 | 新模型配置、原生 Provider、企业策略与观测回调 |
| 明确不做 | Gateway／Proxy、模型管理平台、Agent Loop、SQL 执行、工具执行、Memory、任务调度与 Checkpoint |
| 不新增的设施 | 专属 Redis、PostgreSQL、消息队列、独立指标或 Trace 平台 |

**模型返回 Tool Call，不等于本模块执行工具。** SQL 权限、查询代价、审批和业务正确性由 DataAgent 的工具执行层与验证层负责；这里仅保证工具协议、参数完整性与调用结果状态可被准确理解。

## 1.2 企业级不等于平台化

本模块的企业级要求是：行为可约束、状态可解释、故障可诊断、费用可归因、依赖可替换、升级可回归。它不是一套面向所有团队的通用模型基础设施平台。

SDK 与宿主处于同一信任边界。它可以防止常规调用代码误用，却不能阻止恶意业务代码绕过 SDK 直连厂商。安全隔离、密钥权限、网络出口和租户身份可信性由宿主系统承担。

# 2. 借鉴 DeepSeek Harness：借边界，不照搬系统

## 2.1 已核实的参考结构

DeepSeek Harness 将提供方无关的 LLM 服务、DeepSeek 专有适配、pi-ai 通用适配和重试等包分开。当前公开代码的 pi-ai 适配依赖 `@earendil-works/pi-ai`，属于 TypeScript 生态；本项目借鉴其分层，不引入 Node.js 桥接。[S01][S02]

其 LLM 服务把一次流定义为一次 Provider 尝试，采用统一消息／内容块／事件词汇；重试执行位于另一个组件。DeepSeek 专有传输可与 pi-ai 适配并存。当前 DeepSeek 专有实现以 Messages 协议为基础，不能将它简单理解成一份通用 Chat Completions 包装。[S03][S04]

| 参考设计 | DataAgent 中的落地 |
| --- | --- |
| 提供方无关的模型服务 | 自有 `LLMRuntime` 门面和最小契约 |
| 通用库与专有适配并行 | LiteLLM-backed Provider 与原生 Provider 共存 |
| 一次适配调用对应一次尝试 | Provider 接口使用 `*_once`，隐藏重试必须禁用或被显式识别 |
| 专有协议状态由适配器解释 | 保留带版本与来源的 `provider_state`，不让业务解释厂商私有字段 |
| Harness 的持久化恢复 | 不复制进本 SDK；任务恢复仍属于上层 Agent |

## 2.2 一期不应为了相似而重写 DeepSeek Provider

LiteLLM SDK 已支持 `deepseek/deepseek-v4-pro`、`deepseek/deepseek-flash`，也提供决策模型的异步 SDK 调用。[S07][S08]

因此，一期采用两种薄适配器：`LiteLLMChatProvider` 接两款 DeepSeek；`LiteLLMDecisionProvider` 接决策模型。DeepSeek 的差异先放入小型 `DeepSeekProfile` 做参数校验和专有字段保留，而不是另写一套 HTTP／SSE 客户端。

只有当合同测试证明当前 SDK 无法保留必要语义、最新接口尚未支持，或自研模型使用非兼容协议时，才增加 `NativeDeepSeekProvider`／`InternalModelProvider`。这条原生通道不再经过 LiteLLM，也不要求修改 Runtime Core。

# 3. 一期模型与能力绑定

## 3.1 模型目录

| 内部键 | 产品名称与用途标签 | API / SDK 标识 | 一期实现 |
| --- | --- | --- | --- |
| `ds_pro` | DeepSeek V4 Pro；分析模型候选 | API：`deepseek-v4-pro`；SDK：`deepseek/deepseek-v4-pro` | LiteLLMChatProvider |
| `ds_flash` | DeepSeek V4.1 Flash；快速交互候选 | API：`deepseek-flash`；SDK：`deepseek/deepseek-flash` | LiteLLMChatProvider |
| `decision_primary` | JEV 类型决策模型；分类、选择与评分 | 配置 `DECISION_MODEL_ID`；参考 TypeSafe System One | LiteLLMDecisionProvider |

截至核对日，官方页面将 `deepseek-v4-pro` 对应到 DeepSeek-V4-Pro-0813，将 `deepseek-flash` 对应到 DeepSeek-V4.1-Flash-1017。旧 Flash 名称仍可能被服务端重新路由；应使用官方推荐的当前 API 标识。[S06]

这些产品用途是项目标签，不是未经测试的性能排名。不要假定 Pro 在所有 DataAgent 任务上一定优于 Flash，也不默认两者可以无损互换。

决策模型尚未由用户指定具体厂商和版本。本文用 JEV／TypeSafe 作为参考实现，不将其写成已经确定的采购或上线决定。开发环境可用厂商别名；生产尽量使用可用的固定版本，并记录请求名、响应模型名与认证日期。服务端不暴露真实修订号时，不能声称已锁定模型权重。

## 3.2 一期必须认证的能力

| 能力 | DeepSeek 两模型 | 决策模型 |
| --- | --- | --- |
| 普通文本与流式 | 必测，包含空响应、截断、断流 | 不使用文本流伪装决策结果 |
| Thinking | 必测，显式开关与 effort | 不统一映射为 Thinking |
| Tool Calling | 必测，含片段拼装和后续工具结果回传 | 不执行工具，不模拟 Tool Call |
| JSON 输出 | 必测：合法 JSON 与业务 Schema 分别校验 | 按 question 类型校验答案 |
| Usage | 保留原始分类和来源 | 保留厂商计费单位与用量 |
| 图片输入 | Flash 可支持，Pro 不支持；一期默认不启用 | 一期不启用 |

DeepSeek 官方列出两模型的 JSON、工具调用等能力，Flash 还支持图像输入。[S06] 本期只认证实际需要的子集，不因文档列出了能力就宣布所有组合已兼容。

JSON 合法不等于满足业务 Schema。运行时不默认提供“自动修复到成功”的承诺；校验失败明确返回，由上层决定是否发起新的修复调用。

# 4. 总体架构与责任分配

## 4.1 进程内结构

```text
DataAgent 服务 / Worker（现有进程）
└─ data_agent.llm
   ├─ LLMRuntime：complete / stream / decide
   ├─ Contracts + ModelSpec + CallPolicy
   ├─ 执行控制：deadline / cancel / concurrency / retry
   ├─ 结果归一：events / errors / usage / provider_state
   ├─ LiteLLMChatProvider ───── litellm SDK ── DeepSeek
   ├─ LiteLLMDecisionProvider ─ litellm SDK ── 决策模型
   └─ Native Provider〔扩展位〕─ 厂商SDK / HTTPX ─ 自研模型

宿主注入：凭据解析、调用上下文、UsageSink、既有 OTel 配置
无 Proxy 进程；无 SDK 自带数据库；无独立管理服务
```

## 4.2 模块职责

| 模块 | 应承担 | 不承担 |
| --- | --- | --- |
| Runtime 门面 | 解析模型键、验证能力、调用生命周期、统一结果 | 动态业务规划、自动选择 SQL 执行策略 |
| ModelSpec / Profile | 模型与适配器绑定、默认参数、能力约束、认证版本 | 全行业模型目录、复杂配置中心 |
| Provider | 单次请求翻译、流与结果翻译、私有状态处理 | 业务预算、Agent 重试、跨模型静默降级 |
| ExecutionPolicy | 总时限、局部并发、允许的重试条件 | 分布式任务调度、持久执行 |
| Hooks / Sinks | 既有企业系统集成、记录调用事实 | 内置账务平台或 APM 平台 |

模型配置在启动时验证并形成只读快照；每次调用绑定一个快照版本。一期通过应用发布更新配置，不引入热更新控制平面。

## 4.3 生命周期

宿主在启动时创建 Runtime 和 Provider 客户端，在同一事件循环内复用连接资源；关闭时执行 `aclose()`。每个 Worker 有自己的实例，不跨进程共享客户端。

流式接口必须使用异步上下文管理器，调用方提前退出迭代时仍能关闭上游连接。SDK 不自行运行另一个事件循环，不默默创建常驻调度服务，也不让业务模块操作底层连接池。

# 5. 第三方组件：最终选型与复用边界

## 5.1 依赖清单

| 类别 | 选型 | 一期用法与边界 |
| --- | --- | --- |
| 多模型 SDK | `litellm-core` | 复用模型协议、异步调用、流解析、错误映射、基础 Usage 和费用工具 |
| 类型与校验 | `pydantic` v2 | 请求、事件、模型配置和决策结果；限制为实际支持的能力 |
| 异步执行 | Python 3.12+ / `asyncio` | 取消、总时限、Semaphore、资源生命周期 |
| 有限重试 | `tenacity` | 仅由 Runtime 策略启用，复用退避机制，不让 Provider 重复重试 |
| 遥测 | `opentelemetry-api` | 库内埋点；SDK／Exporter 由宿主统一配置 |
| 日志 | 标准库 `logging` | 复用 DataAgent 的日志配置与脱敏策略 |
| 配置 | `tomllib` + Pydantic | 本地 TOML，不引入配置中心；格式也可与宿主现有规范一致 |
| 开发验收 | pytest、pytest-asyncio、HTTP Mock | 合同、并发、取消、错误、真实接口冒烟测试 |
| 原生扩展〔按需〕 | 厂商异步 SDK，或 HTTPX | 只有原生 Provider 落地时才成为本模块的直接依赖 |

`litellm-core` 保留 `import litellm` 命名空间，去掉部分必选依赖及打包的网关入口；不能与 `litellm` 同装。它仍是 LiteLLM 共享 SDK，不是零依赖库。[S05]

以已发布的 `litellm-core==1.106.6` 作为本次 PoC 候选基线，而不是宣称它已通过本项目生产验收。其余依赖由同一锁文件固定；若宿主其它库强依赖 `litellm`，先解决发行包冲突，必要时统一使用标准 `litellm`，但仍只导入 SDK、不启动 Proxy。[S05][S09]

## 5.2 直接复用与自有薄层

| 事项 | 复用部分 | 自有部分 |
| --- | --- | --- |
| 模型协议 | LiteLLM 已有转换和 Provider | 两种业务侧薄适配器；特殊模型才新增原生实现 |
| 模型目录 | SDK 能力／价格信息作参考 | 仅三条 ModelSpec、已通过的能力组合与配置版本 |
| Streaming | SDK 的网络与协议解析 | 小型事件转换、终态、部分输出、清理契约 |
| Retry | 库的退避机制与错误分类参考 | 何时允许重试、总尝试数、唯一重试责任方 |
| 费用 | SDK Usage 与计算工具 | DataAgent 归因、来源标签、业务价格覆盖与未知费用 |
| 观测 | OTel 和宿主日志设施 | invocation／attempt、业务关联字段和质量状态 |
| 企业系统接入 | 现有认证、凭据、账本、APM | 小型注入接口，不复制这些系统 |

LiteLLM SDK 本身也提供 Router、重试和 Fallback。[S05][S10] 一期不叠加 Router：只有三个明确模型绑定，没有实例级负载均衡需求。统一执行策略需要同时覆盖未来原生 Provider，因此由 Runtime 保留策略责任，底层自动重试默认关闭。

不将 SDK 版与 Proxy 版混为一谈：不部署 Proxy，就不会自动得到它的 Virtual Key、管理后台、团队账本与全局多副本治理。这些也不是本 DataAgent 模块的默认建设目标。

# 6. 对外契约与 Provider 扩展接口

## 6.1 三个调用入口

| 接口 | 语义 |
| --- | --- |
| `complete(ChatRequest, CallContext)` | 一次生成调用，返回完整结果或抛出稳定类型异常 |
| `stream(ChatRequest, CallContext)` | 返回可关闭的异步流会话；模型事件与终态分离 |
| `decide(DecisionRequest, CallContext)` | 类型化决策，不强制转换成聊天消息或文本 |

模型选择由调用方显式传入内部模型键。一期不实现 LLM 选择 LLM 的智能路由，也不因一次错误自动从 Pro 换到 Flash。上层可以在了解失败原因后显式选择另一个模型发起新调用。

## 6.2 最小数据类型

| 类型 | 关键字段与约束 |
| --- | --- |
| CallContext | invocation_id、tenant_id、run_id、step_id、purpose、trace；租户身份由宿主注入 |
| ModelSpec | model_key、adapter_id、upstream_model、api_base、credential_ref、capabilities、config_version |
| ChatRequest | messages、工具定义、输出约束、generation_options；不接收可执行工具对象 |
| DecisionRequest | state、带稳定 question_id 的问题、候选项／分值范围、允许的专有选项 |
| ModelEvent | attempt 开始、文本／推理／工具片段、Usage、结束；包含 attempt_id 与序号 |
| ChatResult | assistant 消息、tool_calls、finish_reason、usage、provider_state |
| DecisionResult | 按问题键组织的类型化答案、原始评分语义、usage、响应模型标识 |
| CallRecord | 执行状态、交付状态、计量来源、耗时、策略版本；交给宿主记录 |

消息采用少量可扩展的内容块：Text、Reasoning、ToolCall、ToolResult；图片类型仅保留扩展空间。一期不实现一个覆盖所有厂商、所有模态的巨大消息框架。

## 6.3 Provider 接口草图

下面是本项目拟定接口，不是 LiteLLM 的现有类；省略的数据类型按上表定义。

```python
from collections.abc import AsyncIterator
from contextlib import AbstractAsyncContextManager
from typing import Protocol

class ChatProvider(Protocol):
    async def complete_once(
        self, request: ChatRequest, context: AttemptContext
    ) -> ChatResult: ...

    def stream_once(
        self, request: ChatRequest, context: AttemptContext
    ) -> AbstractAsyncContextManager[AsyncIterator[ModelEvent]]: ...

    async def aclose(self) -> None: ...

class DecisionProvider(Protocol):
    async def decide_once(
        self, request: DecisionRequest, context: AttemptContext
    ) -> DecisionResult: ...

    async def aclose(self) -> None: ...
```

不用一个包含大量 `supports_xxx` 和可选方法的超级 Provider。生成与决策是独立接口，只有公共调用事实共用。注册表一期使用普通 Python 字典／工厂即可，不需要完整插件框架。

## 6.4 私有状态不丢失，也不无限传播

`provider_state` 至少包含 adapter_id、format_version、来源模型和 opaque payload。它用于保存后续请求所需的协议状态，不包含密钥，也不是通用“恢复执行”的凭证。

只有声明兼容的适配器可读取并回传该状态。跨 Provider／跨协议切换时，不自动转发私有内容：适配器能够安全转换才转换；否则明确返回不兼容，由上层决定重建上下文。不得静默丢失必需状态后继续声称等价执行。

# 7. 一期 Provider 实现设计

## 7.1 LiteLLMChatProvider：两款 DeepSeek 共用

基础调用复用 `litellm.acompletion()`，由 model_key 解析成带 `deepseek/` 前缀的 SDK 模型名。统一传入凭据与连接选项，不在每次请求中修改进程级环境变量、全局模型名或全局回调。

`DeepSeekProfile` 只增加四件事：校验参数组合；保留 `reasoning_content`；检查工具消息历史的必要字段；保存 DeepSeek 特有 Usage 和原始结束原因。

当前官方语义需要重点处理：思考模式默认开启；Thinking 开关与 effort 应显式配置；部分采样参数在思考模式下不生效，且两款模型的 `top_p` 行为不同。请求带 tools 时，历史 reasoning_content 的回传规则也与不带 tools 不同。[S11]

因此不能在 Runtime 中无条件删除推理字段，也不能把“调用没有报错”理解为参数已生效。对已知无效参数，本项目默认本地拒绝或清晰告警，不默认开启 `drop_params`。

工具参数按 call_id／index 独立拼装；只有参数完整并通过 JSON 与约定 Schema 校验后，才形成可交给上层的 ToolCall。长度截断、工具参数半截、无正常结束等情况不能被表示为可执行工具结果。

## 7.2 LiteLLMDecisionProvider：独立决策语义

参考 JEV 路径使用 `litellm.asystemone()`；其它决策协议可通过相同接口映射。官方 SDK 文档确认可以不经过 Proxy 调用决策模型，并且当前决策接口不提供 Streaming。[S08]

一期采用 predicate／choice／score 三类问题。TypeSafe 的 `noul` 映射成 predicate 的“为真概率”，但保留原字段名和来源：例如 0.02 表示很倾向“否”，不能被误解为“置信度很低”。choice 的候选分布与 score 的数值也不统一伪装为一个 confidence。[S12]

校验 question_id 与 answer_id 一一匹配、返回类型、数值范围及候选集合；拒绝 NaN／Infinity 和未知候选。缺答案、额外答案、范围外得分按协议错误处理，不默默补默认值。

决策阈值、误报／漏报成本及低置信处理属于业务策略。Runtime 只返回可解释的数值，不默认规定 0.5 或 0.8 是普适的正确阈值，也不把决策结果当作数据库授权。

## 7.3 原生 Provider 的启用条件

只有三类情况触发新实现：SDK 缺少必需接口；合同测试证明语义损失；自研模型不兼容已有协议。启用时配置绑定到一个确定实现，不在同一次请求里偷偷从 SDK 实现切换为原生实现。

原生 Provider 优先复用厂商异步 SDK；无合适 SDK 时使用 HTTPX。若未来使用 OpenAI Python 客户端接兼容接口，应显式检查并关闭其默认重试；官方客户端默认会重试部分错误。[S13]

# 8. 企业级执行控制：薄而明确

## 8.1 重试责任与预算

Provider 的一次调用必须可对应到一次上游尝试。Runtime 默认 `max_attempts=1`；经合同测试认证后，特定 Profile 才可开启最多两次的有限重试。Tenacity 仅用于退避、抖动与尝试计数，不替代重试安全性判断。

生成 SDK 路径应禁用自身重试；决策路径须按锁定版本核实参数与实际行为，不能把 `acompletion()` 的选项盲目套到 `asystemone()`。若某路径无法关闭隐藏重试，就禁用外层重试并把该限制写入认证记录。

| 场景 | 一期策略 |
| --- | --- |
| 确认请求未发出、连接建立失败 | 可在时限内有限重试 |
| 明确拒绝的 429 | 按策略及 Retry-After 等待，不能越过总时限 |
| 5xx／请求已发出但响应未知 | 默认失败并记录未知费用；允许再次付费尝试须显式开启 |
| 参数、鉴权、能力不支持、上下文超限 | 不盲目重试；交由调用方修正 |
| 已交付任何模型内容片段 | 本次流不自动重试，不拼接新生成内容 |
| 用户取消 | 不重试，传播取消并清理资源 |
| 安全拒答或 JSON 校验失败 | 不静默换模型；修复应为显式的新调用 |

同一逻辑调用使用 invocation_id，不同尝试使用 attempt_id。重试费用按尝试累计；不得把重试后的成功当作只调用过一次。

## 8.2 三类时限

连接／读取时限由底层客户端执行；总时限由 Runtime 使用单调时钟控制，覆盖本地等待、请求、退避和流消费；流空闲时限只在等待下一个上游事件时计时，避免把下游处理慢误判为 Provider 卡死。

HTTPX 的 connect／read／write／pool 时限是不同概念，read timeout 不等于整次调用的总时间。[S14] 配置不能只保留一个语义含糊的 `timeout`。

一期给不同模型配置独立时限。具体数值通过真实 DataAgent 负载校准，不根据模型名猜测统一 SLA。

## 8.3 终态、取消与部分结果

执行状态使用 COMPLETED／INCOMPLETE／FAILED／CANCELLED；输出交付状态另记 NONE／PARTIAL／COMPLETE；费用来源另记 REPORTED／ESTIMATED／UNKNOWN。三个维度不能相互替代：本地取消不代表上游没有执行，HTTP 200 不代表完整成功。

消费者正常读取时，流至多产生一个终态事件。消费者提前关闭或取消任务时，不承诺还能向已关闭迭代器发送终态；由 finally 清理并形成一次终结记录，随后继续传播 `CancelledError`。不得吞掉取消异常，也不得在异步生成器清理阶段强行 yield。

正常 finish 后的 Usage 片段仍须处理。不能见到 finish_reason 就立刻关闭连接而丢掉尾部 Usage；意外 EOF 则不能伪造为正常完成。

# 9. 性能、费用、观测与安全

## 9.1 性能：先做进程内资源治理

复用异步客户端与连接；用 `asyncio.Semaphore` 按 Provider／模型限制本进程并发；队列等待计入总时限。流式消费保持背压，避免为所有请求无界缓冲完整输出；不在每个 token 事件上写数据库、重建 Pydantic 大对象或导出一个 Span。

这不是全局限流。多 Worker 的并发上限大致会相加，应由应用部署预算分配。只有实际需要跨 Worker 的强全局配额时，才注入宿主现有配额接口；不为此默认增建 Redis。

一期不做结果缓存和语义缓存。厂商 Prompt Cache 的命中信息可观测，但不得与应用结果缓存混同。对于 DataAgent 的实时数据与权限上下文，默认不缓存最终模型响应。

## 9.2 计量：SDK 提供事实，宿主保存

每次尝试输出 CallRecord，至少包含 tenant／run／step、请求模型与响应模型、输入／输出／缓存用量、耗时、终态、错误、费用估计和 pricing_version。

| 计量规则 | 设计要求 |
| --- | --- |
| 原始用量 | 保留 provider_usage；字段未知时不编造 0 |
| 重复计数 | cached input 是输入子集时不重复相加；reasoning 已包含于输出时不再另加 |
| 来源 | 区分厂商报告用量、SDK 本地估算、未知；用量也不等于最终账单 |
| 货币与价格 | 保存币种、有效期和计算规则；不在代码内散落单价 |
| 取消与异常 | 没有最终 Usage 时标 UNKNOWN 或可说明的估算，不记为零成本 |
| 持久化 | 注入 UsageSink，写宿主已有账本／存储；本模块无数据库依赖 |

DeepSeek 当前价格还受时段和缓存命中影响；LiteLLM 文档说明其内置分时估算未覆盖中国法定节假日的全部规则。[S06][S07] 因而一期将费用明确标记为估算；需要准确账单时由宿主对账，或提供业务价格覆盖，不把 SDK 计算值冒充发票金额。

SDK 可以限制单次输出和估算成本，也可在调用前执行宿主提供的准入回调；但普通回调不能宣称实现了多进程严格预算。严格预算需要宿主原子预留和结算，不在本期默认范围。

## 9.3 遥测：库埋点，应用配置后端

库仅依赖 `opentelemetry-api`。TracerProvider、Exporter、采样、批量导出和后端由 DataAgent 宿主配置；这是 OTel 对应用与被插桩库的职责划分。[S15]

建议一条 invocation Span 包含若干 attempt Span。指标覆盖成功／失败／取消／截断、首个模型事件时间、首段可见文本时间、总时长、队列等待、重试次数、Usage 缺失率和观测记录失败率。

请求号和大量租户 ID 放 Trace／日志，不默认作为高基数指标标签。账务记录不依赖 Trace 采样。运行时观测回调失败通常不覆盖模型结果；若宿主要求强审计，必须显式启用不同的失败策略。

## 9.4 企业扩展点只保留四类

CredentialResolver：读取宿主凭据，不在请求间修改全局环境；BeforeCall：授权、模型白名单与已有预算准入；UsageSink：记录用量与费用事实；Observer：接入既有诊断和审计。

回调的调用顺序、是否可阻断、超时和异常处理必须确定。BeforeCall 在发送前阻断；Observer 默认只观察。不要把模糊的“任意中间件链”变成另一个框架。

默认不记录完整 Prompt、推理文本和 SQL 结果集；错误与调试日志也脱敏。`provider_options` 采用命名空间与白名单，不能通过它覆盖任意 api_base、密钥或关键安全配置。模型输入来自 DataAgent 已授权的数据处理流程，Runtime 不替代数据库行列权限。

# 10. 工程组织与配置

## 10.1 目录建议

```text
src/data_agent/llm/
  __init__.py              # 稳定公开入口
  runtime.py               # 门面与调用生命周期
  contracts.py             # 请求、结果、事件、上下文
  errors.py                # 稳定错误与可重试事实
  models.py                # ModelSpec 与只读模型目录
  execution.py             # 时限、并发、有限重试
  hooks.py                 # 凭据、准入、计量、观测端口
  providers/
    protocols.py
    litellm_chat.py
    litellm_decision.py
    deepseek_profile.py
  telemetry.py

tests/llm/
  unit/  contract/  fault/  integration/
```

一期先作为 DataAgent 仓库内模块，不急于发布多个包。只有另一产品实际复用时，再抽为独立 wheel。原生 Provider 出现时才增加相应文件，不预建一堆空模块。

## 10.2 模型配置示例

下面是本模块拟定的 TOML 格式，不是 LiteLLM Proxy 配置。凭据只存引用；决策模型未配置时启动校验失败，不能偷偷换成通用聊天模型。

```toml
[models.ds_pro]
adapter = "litellm_chat"
upstream_model = "deepseek/deepseek-v4-pro"
credential_env = "DEEPSEEK_API_KEY"
profile = "deepseek_text_v1"

[models.ds_flash]
adapter = "litellm_chat"
upstream_model = "deepseek/deepseek-flash"
credential_env = "DEEPSEEK_API_KEY"
profile = "deepseek_text_v1"

[models.decision_primary]
adapter = "litellm_decision"
upstream_model_env = "DECISION_MODEL_ID"
credential_env = "DECISION_API_KEY"
protocol = "systemone"

[execution]
max_attempts = 1
automatic_model_fallback = false
response_cache = false
```

`deepseek_text_v1` 还需按具体模型区分能力和参数，不能把两款模型的差异抹平。默认输出上限、Thinking、总时限和每进程并发均通过模型 Profile 显式配置并测试。

依赖使用锁文件及包哈希；离线构建或受控镜像安装。运行时使用受控的价格／能力快照，不依赖请求途中下载并改变规则；升级同时记录 SDK、配置、模型别名映射及测试版本。

# 11. 新模型与企业功能的扩展方式

## 11.1 自研模型兼容既有接口

先新增 ModelSpec，绑定允许的内网地址和凭据，复用 LiteLLM 支持的兼容协议。跑完合同测试即可启用。只是增加一个模型 ID，不应该要求修改 Runtime Core。

## 11.2 自研模型使用特殊接口

实现 ChatProvider 或 DecisionProvider，处理请求、响应、流、用量与错误，再注册到本地 Provider 工厂。原生适配器绕开 LiteLLM 但不绕开 Runtime 的时限、并发、计量和观测。

只有新能力确实需要公共语义时才修改契约。不要为了一个厂商的专有参数给所有 Provider 增加字段，也不要把不可比较的评分硬塞进通用 confidence。

## 11.3 对接企业现有系统

需要审计时接 Observer／UsageSink；需要密钥轮换时换 CredentialResolver；需要预算准入时接 BeforeCall 与宿主账本；需要按业务场景选择模型时由 DataAgent 显式提供 model_key。

CRM、业务数据库、Notebook、MCP、工作流和权限审批不放进 LLM Runtime。它们可能通过上层影响请求内容，但不是模型调用 SDK 的内置职责。

# 12. 一期建设计划与验收

## 12.1 分步交付

| 步骤 | 交付物 | 退出条件 |
| --- | --- | --- |
| A：冻结边界与依赖 | 契约 v1、三条 ModelSpec、锁文件、参考请求 | 不引入服务部署；确认决策模型账户与版本配置 |
| B：打通三模型 | 两种 LiteLLM 适配、DeepSeekProfile、非流式与流式 | 三模型真实冒烟通过，关键原始字段不丢失 |
| C：补企业执行语义 | 取消、时限、错误、部分结果、本地并发、用量事件 | 关键故障测试通过；无隐藏重试倍增 |
| D：接宿主与试运行 | 现有日志／OTel／用量存储适配、配置发布与回滚 | 同 DataAgent 真实任务对照评估；成本与延迟可解释 |

一期完成标准不是“支持很多 Provider”，而是这三款模型在同一套调用契约下稳定运行，并能新增一个测试用原生 Provider 而不修改核心调用逻辑。

## 12.2 最小合同测试矩阵

| 测试主题 | 必须证明 |
| --- | --- |
| 模型身份与参数 | API 名正确；不支持的能力／参数显式失败；不假装固定服务端别名版本 |
| DeepSeek Thinking | 开关、effort、推理字段及带 tools 历史可正确往返 |
| 工具参数流 | 多 call_id 不串线；半截 JSON、截断或断流不形成可执行结果 |
| 正常结束与 Usage | finish 后尾部用量不丢；EOF／length／refusal 不被误报为普通成功 |
| 决策模型 | noul／choice／score 类型与范围正确；缺答案／错键被发现 |
| 重试唯一性 | Mock 上游收到的实际请求数符合 max_attempts，费用按每次尝试记录 |
| 部分输出后失败 | 不自动拼接新响应，不无声换模型 |
| 取消与提前退出 | 首包前／首包后／break 均清理连接；取消异常不被吞掉 |
| 时限与背压 | 等待、退避、慢消费者均有定义；无无界事件缓冲 |
| 并发隔离 | 同进程多租户凭据、metadata、回调与模型配置不串用 |
| 费用与观测异常 | Usage 未知不记零；回调故障符合策略；计量不依赖 Trace 采样 |
| 升级与原生扩展 | 锁定版本回归通过；原生测试 Provider 能复用相同策略与测试套件 |

故障场景由可控制的 Mock Provider 产生，再辅以真实接口测试。没有真实凭据时只能完成 Mock 验收，不能把它等同于模型兼容性认证。

## 12.3 与 DataAgent 真实任务一起验收

使用实际的 SQL 生成、异常原因分析、经营摘要和任务分类样本，分别测调用成功率、结构合规率、工具调用完整性、延迟分布与任务总费用。评测逻辑属于项目测试，不内置成 Runtime 服务。

性能测试对照“直接调用同版本 LiteLLM SDK”与“经过薄 Runtime”，保持模型参数、输入和并发一致；分别记录本地额外延迟、CPU、内存和连接释放。通过实测确定可接受门槛，不先写未经验证的性能承诺。

## 12.4 暂缓事项与风险

暂不建设全局智能路由、通用结果缓存、分布式硬预算、持久化流重放、多模态全覆盖、网关管理面、独立 SDK 数据库。

关键剩余输入是决策模型的实际厂商、账户权限与固定版本，以及 DataAgent 对超时和费用的业务容忍度。它们通过配置与验收确定，不阻塞公共接口和 Mock 实现，但会阻塞对应模型的正式上线。

**最终形态：一个嵌入 DataAgent 的薄模型调用模块。底层大部分协议工作交给 LiteLLM SDK；企业只维护自己的调用语义、必要的 Provider 扩展，以及可持续回归的测试资产。**

# 参考来源与核验说明

以下为本次实际查阅的官方资料。GitHub master 与在线文档可能继续变化；文档所述能力以 2026-11-02 查询可见内容为准，生产行为仍应在锁定版本上验证。

[S01] [DeepSeek Harness：LLM 包组与职责](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/README.md)

[S02] [DeepSeek Harness：pi-ai 适配包依赖](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-pi-ai/package.json)

[S03] [DeepSeek Harness：LLM 核心调用契约](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/README.md)

[S04] [DeepSeek Harness：DeepSeek 专有适配](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm-deepseek/README.md)

[S05] [LiteLLM Core：发行包、命名空间与能力](https://docs.litellm.ai/docs/litellm_core)

[S06] [DeepSeek：模型、API 名称、能力和价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)

[S07] [LiteLLM：DeepSeek Provider 与分时估算说明](https://docs.litellm.ai/docs/providers/deepseek)

[S08] [LiteLLM：决策接口与 Python 异步 SDK](https://docs.litellm.ai/docs/decisions)

[S09] [PyPI：litellm-core 1.106.6 发布页](https://pypi.org/project/litellm-core/1.106.6/)

[S10] [LiteLLM：SDK 重试与 Fallback](https://docs.litellm.ai/docs/completion/reliable_completions)

[S11] [DeepSeek：Thinking 参数和历史回传规则](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)

[S12] [TypeSafe：System One 请求与结果语义](https://docs.typesafe.ai/api/system-one)

[S13] [OpenAI Python SDK：异步客户端和重试配置](https://developers.openai.com/api/reference/python)

[S14] [HTTPX：连接、读写、连接池时限](https://www.python-httpx.org/advanced/timeouts/)

[S15] [OpenTelemetry：Python 应用与库的埋点职责](https://opentelemetry.io/docs/languages/python/instrumentation/)
