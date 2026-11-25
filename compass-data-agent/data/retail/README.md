# 学员数据库导入

《企业级Agent工程架构实战营》Compass 合成零售业务数据。交付文件为 **compass-retail.sql**，UTF-8 编码，包含完整表结构、数据与公开场景材料；导入只需要这一个文件，不依赖项目源码、Python、CSV 或教师账号。

## 克隆后准备数据

正式目录为 Compass 根下的 `data/retail/`。压缩包通过 Git LFS 随仓库分发；两份校验清单和本说明由普通 Git 保存。`compass-retail.sql` 为本地解压产物，不提交 Git。

先安装 [Git LFS](https://git-lfs.com/)，运行 `git lfs install`，再克隆课程仓库。若已经 clone 或跳过了大文件下载，在 **Compass 根目录**执行下列命令；路径前缀会自动适配课程仓库与独立 Compass 仓库：

```bash
git lfs install
git lfs pull --include="$(git rev-parse --show-prefix)data/retail/compass-retail.sql.gz" --exclude=""
pnpm data:prepare
```

`pnpm data:prepare` 使用 Node.js 标准库，执行前无需安装 npm 依赖、Python 或启动数据库；也可直接运行 `node scripts/prepare-data.mjs`。它校验压缩包 SHA-256，解压并校验 SQL SHA-256，最后生成 `data/retail/compass-retail.sql`。重复执行只校验已有文件，保留原压缩包。下载到 LFS 指针、文件损坏或已有 SQL 内容不匹配时明确失败；失败不会覆盖已有 SQL。新版本 SQL 校验冲突时先将旧 SQL 改名保存，再重新执行。解压需约 1 GiB 可用空间，Git LFS 缓存另占压缩包空间。

| 文件                           | 用途                       | 存储方式               |
| ------------------------------ | -------------------------- | ---------------------- |
| `compass-retail.sql.gz`        | 约 117 MiB 的完整数据包    | Git LFS                |
| `compass-retail.sql.gz.sha256` | 压缩包校验                 | 普通 Git               |
| `compass-retail.sha256`        | 解压后 SQL 校验            | 普通 Git               |
| `README.md`                    | 获取、导入、查询和来源说明 | 普通 Git               |
| `compass-retail.sql`           | 约 973 MiB 的完整 SQL      | 本地解压生成，忽略 Git |

## 导入

1. 准备 PostgreSQL 数据库，并使用有该数据库 CREATE 权限的账号连接。脚本不会创建数据库或账号。
2. 执行整个文件。默认目标 schema 为 `retail_course`，应不存在同名 schema。
3. 成功后刷新数据库对象，在 `retail_course` 下查询。

建议使用 PostgreSQL 自带的 psql，密码由客户端提示输入：

```bash
pnpm db:up  # 使用项目 Compose 数据库时执行
psql -X -h 127.0.0.1 -p 55432 -U YOUR_USER -d YOUR_DATABASE \
  -v ON_ERROR_STOP=1 -f data/retail/compass-retail.sql
```

项目 Compose 的数据库端口为 **55432**，请按实际服务填写。脚本已包含 BEGIN/COMMIT；导入失败会回滚，重复导入不会覆盖现有 schema。不要忽略报错继续执行剩余语句。

DBeaver 可在 SQL Editor 菜单选择 **Execute SQL Script natively**，配置 PostgreSQL 本地客户端执行整个文件；大文件优先使用原生执行入口或 psql。若客户端提示需要本地 PostgreSQL 工具，先配置其客户端路径。参见 [DBeaver 官方说明](https://dbeaver.com/docs/dbeaver/SQL-Execution/)与 [psql 官方说明](https://www.postgresql.org/docs/current/app-psql.html)。

## 从哪里开始查询

结构为 71 张关系表加 1 张公开材料表；原逻辑 core/ops/sec 统一映射到 `retail_course`。金额使用人民币分，业务日期采用北京时间，数据库时间字段为带时区时间。客户、商品、地址、交易均为合成数据。

主案例租户为 `101`，`102/103` 用于隔离与小样本练习。导入账号可见全部租户；参考查询中沿用受限连接假设的部分，需要显式加 `tenant_id=101` 条件，避免把不同企业合并统计。诊断专题查询已固定主租户范围。

```sql
SET TIME ZONE 'Asia/Shanghai';
SELECT tenant_id, count(*) FROM retail_course.order_header GROUP BY tenant_id;
SELECT tenant_id, spu_id, spu_name FROM retail_course.spu ORDER BY tenant_id, spu_id;
SELECT asset_path, logical_asset_id FROM retail_course.course_asset ORDER BY asset_path;
SELECT content FROM retail_course.course_asset WHERE asset_path = 'reference.sql';
SELECT content FROM retail_course.course_asset
WHERE asset_path = 'scenarios/diagnostic-bindings.json';
SELECT content FROM retail_course.course_asset WHERE asset_path = 'dictionary.md';
```

经营下单窗口为 2023-01-01 至 2025-12-31，2026 年第一季度为履约与售后尾期。按历史时点分析时，必须过滤 `available_at`；报表可用性同时检查 `asset_period_status`，平台归因区分 KNOWN/UNKNOWN。参考查询由 `course_asset` 取出后再执行，避免混用原逻辑 schema。

本包支持同店/新店分解、采购延期与调拨、迟到完整度、实验退款护栏、价格队列及平台获客回报。普通经营数据保留自然分钟样本；每分钟百次的 S11 压力样例使用教师侧独立 demo profile。价格与平台归因题需要报告替代、同期变更及识别限制。

公开附件和数据字典已内嵌；教师私有答案、潜在客群参数、构建源码与数据库密码没有放入脚本。导入账号拥有数据表，岗位权限实验需使用教师另行部署的受限连接。

## 文件校验

`pnpm data:prepare` 自动检查两份摘要。手工校验时，从 Compass 根目录执行：

```bash
(cd data/retail && shasum -a 256 -c compass-retail.sql.gz.sha256 && shasum -a 256 -c compass-retail.sha256)
```

也可分发 `compass-retail.sql.gz`，解压后得到同一 SQL 文件；压缩版约 117 MiB，解压后约 973 MiB。压缩与解压文件各有 SHA-256 校验文件。

`course_asset.sha256` 对应实际内嵌文本；其中 manifest 仍记录原公开业务包的文件摘要。SQL 参考内容已经替换为 `retail_course` 命名空间，因此它的内嵌摘要可以与原业务包不同。

## 已验证版本

release `diagnostic-v3-20261019`，111,055 单、160 SPU、1,280 SKU。PostgreSQL 17.10 使用普通账号在空库完整导入，耗时 345.021 秒；66 张业务/来源表指纹与发布库一致，27 份材料摘要正确，全部 15 条内嵌参考查询执行成功。重复导入安全拒绝且71张表内容不变。实际验证使用psql；DBeaver原生执行入口使用同一本地客户端机制。

SQL SHA-256：`8e346ada16611941df2bc5d6e96dd57121d1f0cf70e9df10bf21505fca6b11c9`。首次测试为同机实测，耗时随数据库资源变化。

## 来源与维护

本资产迁自 `work/data-seed/delivery/` 中已验收的公开学员数据包，release 与文件字节保持不变。生成器维护在 [data_seed](../../tools/data-seed/src/compass_data_seed/README.md)，生产与再生成流程见 [数据操作说明](../../docs/data-seeding.md)，历史实库验证见 [998 实施记录](../../mai-specs/998-business-data-seeding-tool/IMPLEMENTATION.md#诊断增量正式交付2026-10-23)。私有答案、部署账号与运行现场留在本地工作区。

这是项目专用的合成课程数据，沿用 Compass 的使用与分发约定；当前项目未授予开源许可证。
