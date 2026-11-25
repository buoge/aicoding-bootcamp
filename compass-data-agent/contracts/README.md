# 网络契约

唯一源为 `apps/agent/src/compass_agent/schemas.py` 与 FastAPI 路由。`openapi.json` 和 `demo-overview.schema.json` 均由根 `pnpm contracts` 生成，禁止手改。Web 消费副本同时生成到 `apps/web/src/generated`，通过 `pnpm contracts:check` 验证无漂移。

当前只定义健康检查和合成数据概览；RunEvent 等契约随实际功能实现。生成过程串行运行 Python 导出与 openapi-typescript，无数据库或网络服务依赖。TypeScript 类型配合 JSON Schema 运行时校验使用。
