# 业务数据生产

Feature 998 的单源合成零售生成、校验、候选库装载和清单发布。
设计与唯一 SQL 源见 [技术方案](../../../../mai-specs/998-business-data-seeding-tool/design/TECH_DESIGN.md)。
`profiles/` 定义工程配额或诊断机会预算；生成文件和私有预期写入调用者指定的 `work/`，不进入源码。

`catalogs/retail/` 保存模型编写并冻结的业务素材；`semantic.py` 与 `semantic_workflow.py` 提供有预算、缓存和修复上限的模型工具及离线导入。`world.py` 编译主数据、生命周期、客户与价格成本时间线，`demand.py` 驱动条件购物篮、机会流量、地址和履约差异，`simulation.py` / `inventory.py` 维护事实与守恒。

`quality.py` 与 `sql/diversity*.sql` 独立检查多样性，`sql/course_questions.sql` 提供可读业务分析。`schema_environment.py` / `namespace.py` 支持同库新 schema；原候选库发布路径继续可用。`schema.dictionary()` 从唯一 DDL 派生字段字典。

命令与配置见 [操作说明](../../../../docs/data-seeding.md)。素材补充产生新的冻结版本，生成中缺覆盖会留下 `NEEDS_EXPANSION` 请求；新版本通过验收前，旧数据库和旧活动清单保留。

`diagnostic.py` 冻结访问计划、采购/价格/门店情节与平台获客队列；成交不回填到固定单量。`export_sql.py` 把已校验的公开业务包导出为可独立执行的 PostgreSQL 文件，并内嵌公开材料。诊断 SQL 位于 `sql/diagnostic_checks.sql`，公开参考位于 `sql/reference.sql`。
