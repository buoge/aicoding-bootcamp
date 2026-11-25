# Feature 999 设计与原型

- [TECH_DESIGN.md](TECH_DESIGN.md)：技术架构与选型入口；数据对象语义已由下列附录同步，完整运行实现仍按阶段推进。
- [data-model.md](data-model.md)：Compass DataAgent 系统专属数据库结构；12 个业务域及总关系图、94 张目标系统表的完整 ER/字段/约束、逐表设计理由与 MVP 必要性。M0 为 30 张表，其余按 M1–M5 启用；保留 108 项功能映射及 §5 的通用平台初始化/数据源接入，不包含行业业务事实表。待评审，平台实施暂缓。
- [scaffold-design.md](scaffold-design.md)：项目脚手架与工程组织方案，包含 agent 名称迁移、内置执行、按需 worker 与独立 memory 的实施任务。
- [ui-ux-design-spec.md](ui-ux-design-spec.md)：信息架构、设计体系与交互约定。
- [prototype/index.html](prototype/index.html)：可离线运行的完整 HTML 原型；[运行说明](prototype/README.md)。

需求与验收唯一源为 [PRD](../spec/PRD.md)。本次迁移不代表技术方案已通过评审，也不推进 Feature Phase。

- [home-app-design.md](home-app-design.md)：独立 home 官网六页的实现、素材分发、组件与验收方案。

2026-10-25 目标部署收敛为 home / web / agent / memory，worker 按后台持久需求启用；memory 三表与迁移独立拥有，Runtime 通过工具调用。用户后续要求先建立 Python 脚手架，已完成 agent 名称迁移和 memory / worker 工程入口；领域执行、记忆存储与持久编排仍按本目录目标设计后续实施，Feature 保持评审状态。
