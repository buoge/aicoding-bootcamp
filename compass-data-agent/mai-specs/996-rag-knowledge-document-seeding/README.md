# 996：RAG 业务知识文档数据生产

本目录维护基于 998 合成经营数据的业务文档证据。Feature Phase 为 `review`，Profile 为 `standard`；首批 23 篇正文、来源目录、206 条原句引用、101 个章节片段及 14 个演示案例已生成，离线内容检查通过，等待业务审阅。向量接入尚未执行。

| 入口 | 职责 |
|---|---|
| [BRIEF.md](BRIEF.md) | 需求简报、阶段记录与后续入口 |
| [spec/PRD.md](spec/PRD.md) | 当前需求、业务规则、交付边界和验收标准的唯一维护源 |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | 已交付文档与用户故事索引、生产记录、核验结果及使用边界 |
| [corpus/README.md](corpus/README.md) | 23 篇冻结正文的唯一维护源、元数据和校验导出命令 |
| [演示清单](../../work/rag-documents/996/rag-documents-996-20261024/validation/DEMO.md) | 14 个问题的可引用原句、必要查询与禁止推断；本地派生产物 |
| [review/README.md](review/README.md) | 修订前的评审结论与生产建议快照；有效清单和验收已纳入 PRD |
| [context/_INDEX.md](context/_INDEX.md) | 创建时的来源、发现及输入索引；原始输入保持只读 |

业务基线引用 [998](../998-business-data-seeding-tool/BRIEF.md)，产品场景与生产 RAG 接入引用 [999 PRD](../999-compass-product-course-landing-app/spec/PRD.md)。这里不复制上述规格，不修改已有业务库。

用户已授权按 PRD 直接生产，未单独创建技术设计。当前可阅读正文、演示案例及引用索引；后续向量接入只消费导出包的 `chunks.jsonl`，实际召回与在线权限另验。生成数据包、压缩包和运行输出保存在忽略 Git 的 `work/rag-documents/996/`，可由冻结正文重建。
