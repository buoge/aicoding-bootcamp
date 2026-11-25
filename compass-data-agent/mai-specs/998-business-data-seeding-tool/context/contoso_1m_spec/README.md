# Contoso 百万订单数据准备技术交付包

这是中国全渠道运动户外、多租户 Data Agent 课程的数据准备**技术方案与验证附件**。目标是 1,000,000 个已创建订单头（900,000/50,000/50,000），不是本次已生成的数据。

从 `docs/technical_design.md` 开始。完整可阅读版本为包内 `contoso_1m_full.html`；该 HTML 自带 ER 图及全部字段/生产/权限/评测附录，可以离线阅读。

## 核心内容

- 权威模型 `config/schema_contract.json`：63 表、643 字段、219 条外键（其中 154 条为复合外键）。
- `sql/01_schema.sql` 完整 PostgreSQL 17 DDL；`02_security.sql` 权限；`03_metrics.sql` 参考指标函数。
- `config/profile_1m.yaml`、`scenarios.yaml` 与 `contoso_patch_contract.json`：规模、经营参数、情节、有限 fork 的输入输出与实施验收。
- `docs/schema_dictionary.md` 与 `diagrams/`：完整字段字典和 9 组 ER 的 SVG、PNG、Mermaid、DOT。
- `docs/generation.md` 与 `generation_mapping.md`：实际生产 DAG、Contoso 复用、整数分/FIFO/五桶/身份/报告版本、检查点与发布。
- `validation/`：77 条全量 SQL 门禁、8 单独立金标、30 题评测目录，以及本次实际验证报告。

## 已运行与待实现

已运行的是模型/DDL 编译、PostgreSQL 17.5（PGlite）SQL 和受限身份验证、三个参考指标的小样检查、独立金标核对、14 项算法参考检查，以及 ER 绘制。确切检查数见 `validation/spec_validation_report.json`、`golden_fixture_report.json` 和 `reference_algorithms_report.json`。

尚待实现的是 Contoso 有限 fork、百万订单 Python 领域生成器、完整来源批次/文件发布运行器、AsOf 查询代理，以及全量压力与云端验证。23 条补丁验收按适用阶段分配，不将后续领域/恢复验收错误前置到第一次 C# 构建。

## 重新生成规格和执行验证

```bash
python3 tools/build_contract.py
python3 tools/build_acceptance.py
npm install
npm run validate:schema
npm run validate:gold
python3 tools/reference_algorithms.py
```

安装 Node 验证依赖需可访问包仓库；也可用 PGLITE_MODULE 指向已安装的 @electric-sql/pglite 目录。工具不创建百万条订单。

可选：`node tools/render_er.mjs` 重绘 ER，`node tools/render_flows.mjs` 重绘两个过程图；`python3 tools/build_asset_catalog.py` 重建逐资产目录（需要 PyYAML）；`python3 tools/build_report.py` 重建完整 HTML/技术包（需要 Pandoc；先刷新相关验证报告和目录指纹）。模型、patch 或 profile 变更后，应重新审核并更新其互相记录的指纹，不能自动声称旧审阅仍适用。

## 版本与使用边界

每个规范数据库装载一个不可变 release。租户是企业，不是品牌或大区；业务读取遵守 tenant/region/cost 权限与明确历史时点。Parquet 目录不是权限，PostgreSQL RLS 不会自动保护文件。

企业名称、概率和规模为课程合成设定。Contoso 固定源与许可证说明在生产文档中；本包不含上游源码、原始个人数据、生产登录凭证、已经构建的 fork 或百万数据文件。正式数据产物应标记为使用 Contoso 派生生成器生成的课程合成数据。
