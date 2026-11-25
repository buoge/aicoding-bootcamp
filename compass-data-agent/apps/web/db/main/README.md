# Web 主数据库

Owner 为 `apps/web`，key 为 `web/main`；PostgreSQL 17，业务 schema `web`，版本 schema `web_meta`。8 张业务表及两张迁移元数据表；历史 SQL 在共享后不可修改。

迁移唯一源为 [migrations](migrations/)：0001 工程基座保持不可变，0002 添加租户和空间的稳定地址短标识。当前目标版本为 `0002_readable_routes`；[交付清单](sql/manifest.json)登记源与完整 SQL 摘要，[增量 SQL](sql/upgrades/0001_web_foundation__0002_readable_routes.sql)支持旧库升级。派生文件统一由生成命令维护。

运行连接使用 `WEB_DATABASE_URL`；迁移/受管账号工具使用 `WEB_MIGRATION_DATABASE_URL`，仅本地供应使用 `WEB_PROVISION_DATABASE_URL`。owner 为 NOLOGIN 的 `compass_web_owner`，迁移登录角色为 `compass_web_migrator`，应用为 `compass_web_runtime`。运行进程不持有管理连接。

从 Compass 根执行：

```bash
pnpm db:provision -F web
pnpm db:migrate -F web
pnpm db:sql -F web
pnpm db:sql:check -F web
pnpm db:apply-sql -F web -- --from empty --to 0002_readable_routes
```

供应仅操作明确登记的本地目标，拒绝未知既有库/角色；不会操作 Agent 或零售库。迁移对目标持有独占 advisory lock，检查数据库标记、角色、源摘要与实际版本。已经达到目标且校验一致时返回 already_applied；拒绝未知起点和对象。应用启动不会迁移。

恢复使用 `pg_dump` 备份到受控位置，向新供应的同所有权数据库执行 `pg_restore`，核对数据、版本与运行权限，撤销恢复库全部会话后切换运行连接并重启。保留旧库供复核；不使用 down 或 DROP 代替数据恢复。实际验证见 [995 实施记录](../../../../mai-specs/995-web-management-foundation/IMPLEMENTATION.md)。

新增 slug 不修改主键、成员关系和现有权限。租户全局唯一、空间在租户内唯一；教学数据回填可读标识，其他旧记录分配短标识。发布顺序为备份、迁移、启动新 Web；旧版本仍可使用保留的 UUID 主键。版本链、迁移源摘要在每次执行前后检查。
