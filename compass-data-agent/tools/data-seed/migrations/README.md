# 零售候选库迁移

仅由 `compass_data_seed.importer` 向已登记的新候选库传入连接。
与 Agent 应用 `apps/agent/migrations/` 使用独立 Alembic 版本表和入口，禁止复用应用 DATABASE_URL。
完整 SQL 真源为 Feature 998 的 `design/business-schema.sql`；发布回切使用旧清单。
