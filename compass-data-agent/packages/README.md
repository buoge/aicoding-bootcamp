# 共享包

当前 M0 尚无两个 app 共同消费的业务代码，因此只有准入说明。新增包须有至少两个独立应用消费者，并记录公开入口、维护人、兼容策略与测试命令。Next.js 的 UI 与 BFF 计为一个 app。

目标 agent 内部先保留 Harness、状态、预算与适配器；引入 worker 后，再把实际共同使用的执行代码提取为 `agent-core`。memory 独立拥有记忆实现；双方只共享实际复用的工具客户端与契约。Python workspace 与 package.json 的内部依赖必须同步声明，根 `pnpm check` 会验证依赖图和跨 app 导入边界。单 app 的 UI、客户端和配置留在 app 内。
