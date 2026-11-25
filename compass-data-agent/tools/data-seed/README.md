# 零售业务数据准备工具

Feature 998 的独立离线工具；Node workspace 名为 `@compass/data-seed`，Python 包名为 `compass-data-seed`，导入入口为 `compass_data_seed`。负责可复现合成业务包、校验、SQL 导出、候选库 / schema 发布与回切。无需启动 Agent，不进入 Agent 运行包或镜像。

## 入口与检查

在 Compass 根目录执行：

```bash
uv sync --locked --all-packages
pnpm data:seed --help
pnpm lint -F data-seed
pnpm typecheck -F data-seed
pnpm test -F data-seed
pnpm build -F data-seed
# 显式配置专用 COMPASS_RETAIL_TEST_ADMIN_URL 后执行
pnpm test:integration -F data-seed
```

根 `pnpm check` / `pnpm build` 包含本工具；常规测试仅执行离线用例。真实 PostgreSQL 集成测试单独运行，不缓存；缺少专用凭据时明确跳过。`pnpm data:seed` 和集成测试入口加载根 `.env`，静态检查不加载。仅安装工具运行依赖可使用 `uv sync --locked --package compass-data-seed`。

## 源与产物

- [src/compass_data_seed](src/compass_data_seed/README.md)：CLI、生成与发布逻辑、profiles、冻结 catalogs 和校验 SQL。
- [migrations](migrations/README.md)：`data-seed/retail` 候选库迁移；保留既有 `retail_0001` revision 与独立版本表，只在显式发布时运行。
- `tests/`：离线包契约、复现、语义与 SQL 导出；`tests/integration/` 验证真实 PostgreSQL 权限、发布及恢复。
- [规范 DDL](../../mai-specs/998-business-data-seeding-tool/design/business-schema.sql)：继续作为唯一结构源，工具要求完整 Compass 工作区；迁移目录变化不改变 DDL 或数据库版本。构建的 wheel 不代表可脱离工作区独立发布。
- [data/retail](../../data/retail/README.md)：已验收公开数据包。候选数据、私有答案、源码快照和凭据写入 `work/`。

生成源码快照使用 `source/compass_data_seed/`；历史快照保留原模块布局，重放时使用对应版本的入口。迁移会改变源码摘要，新生产使用新输出目录与 release，现有已发布包保持原字节与校验值。

完整命令和发布边界见 [操作说明](../../docs/data-seeding.md)，数据所有权见 [数据库规范](../../docs/database-migrations.md)。Agent 的三天工程样本继续使用 `pnpm db:seed -F agent`。
