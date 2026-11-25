# 合成零售业务数据

生成器由 [tools/data-seed](../tools/data-seed/README.md) 独立管理，Python 包为 `compass-data-seed`，导入入口为 `compass_data_seed`；保留根 `pnpm data:seed` 命令。常规检查运行离线测试，真实 PostgreSQL 发布与权限验收使用 `pnpm test:integration -F data-seed`，缺少专用凭据时明确跳过。

Feature 998 为独立 PostgreSQL 零售业务库生成业务事实、场景附件和受限只读连接。默认 single-source；当前交付覆盖技术方案 P0–P5，三源布局与百万配置属于 P6 可选扩展。

全部客户、身份和订单均为合成记录。现有 `pnpm db:seed`、三天示例接口及应用数据库继续使用原有入口。新工具不读取 `DATABASE_URL`。

## 学员克隆后的初始化入口

已验收快照正式保存在 [`data/retail/`](../data/retail/README.md)。`compass-retail.sql.gz` 使用 Git LFS；两份 SHA-256 和说明使用普通 Git。先安装 Git LFS 并运行 `git lfs install`，再克隆仓库；已有克隆在 Compass 根执行：

```bash
git lfs pull --include="$(git rev-parse --show-prefix)data/retail/compass-retail.sql.gz" --exclude=""
pnpm data:prepare
pnpm db:up
psql -X -h 127.0.0.1 -p 55432 -U YOUR_USER -d YOUR_DATABASE \
  -v ON_ERROR_STOP=1 -f data/retail/compass-retail.sql
```

替换用户名和已有数据库名，目标 `retail_course` schema 应不存在。`data:prepare` 无需 Python 和依赖安装；校验压缩包、解压并校验 SQL，可重复执行。SQL 为忽略 Git 的派生产物，不再重复存入 LFS。`work/` 只保留生成试验、候选包和私有记录。下列 `data:seed` 命令用于重建或教师侧发布，学员使用已交付快照可直接按上述入口导入。

## 诊断数据与学员单文件交付

`diagnostic` 使用事先冻结的访问机会，订单与支付数量由业务过程产生，规模门禁为 7 万至 14 万。三个登记 seed 均须检查；`demo` 的严格 10 万配额与 9,000 单高密度监控案例继续独立使用。普通诊断数据在分钟样本不足时只能报告不足。

新增 7 张表：`store_operating_day`、`procurement_revision`、`price_exposure`、`intervention_definition`、`intervention_cohort`、`campaign_attribution_daily`、`asset_period_status`。它们分别支持营业日分母、采购修订、真实价格观察、固定客户队列、平台归因和报表完整度。平台全租户汇总不对仅有区域权限的账号开放。

```bash
pnpm data:seed generate --profile diagnostic --seed 20261019 \
  --output work/data-seed/diagnostic --release diagnostic-20261019
pnpm data:seed export-sql work/data-seed/diagnostic \
  --output work/data-seed/diagnostic-export/compass-retail.sql --schema retail_course
```

`export-sql` 先校验包完整性；生产交付还须通过数据库业务门禁。输出为一个 UTF-8 PostgreSQL 脚本，包含 71 张关系表、全部数据及交付专用 `course_asset` 表。后者保存同版本公开场景材料、参考查询、字典和 manifest；其中 SQL 已映射到 `retail_course`，`sha256` 校验实际内嵌文本。manifest 保留原业务包的文件摘要。每次导出另写同名 `.sha256` 文件。

导入前连接一个已有 PostgreSQL 数据库，账号需要该库的 CREATE 权限。脚本自行创建 `retail_course`，已有同名 schema 会报错并回滚；不包含数据库创建、账号、密码、外部 CSV 或客户端专用命令。不带源侧演示角色，教师需要五种受限账号时使用 `publish-schema` 发布。

```bash
psql -X -h localhost -p 5432 -U YOUR_USER -d YOUR_DATABASE \
  -v ON_ERROR_STOP=1 -f compass-retail.sql
```

本项目 Compose 端口为 **55432**，自行安装 PostgreSQL 时按实际端口填写。脚本已有事务边界。DBeaver 可使用 **SQL Editor → Execute SQL Script natively**，配置 PostgreSQL 本地客户端执行完整文件；大文件优先使用这一入口或上面的 psql 命令。参考 [DBeaver 官方说明](https://dbeaver.com/docs/dbeaver/SQL-Execution/)及 [psql 错误处理](https://www.postgresql.org/docs/current/app-psql.html)。

导入后可查询公开材料：

```sql
SELECT asset_path, logical_asset_id FROM retail_course.course_asset ORDER BY 1;
SELECT content FROM retail_course.course_asset WHERE asset_path = 'reference.sql';
SELECT content FROM retail_course.course_asset
WHERE asset_path = 'scenarios/diagnostic-bindings.json';
```

经营下单窗口为 2023–2025 年，售后尾期至 2026-03-31。所有经营记录为合成数据。结果可用于分解、归因规则、完整度与识别边界练习，不能把仿真中的机制解释当作真实市场因果结论。当前交付实测见[实施记录](../mai-specs/998-business-data-seeding-tool/IMPLEMENTATION.md)。

## 语义版本与旧数据对照

当前生成器使用 `compass-retail-3`：71 表、748 字段；物理约束与外键数见[派生字典](../mai-specs/998-business-data-seeding-tool/design/business-data-dictionary.md)。已发布的语义版 `retail_v2` 保留原 64 表结构。160 个具体商品、1,280 个合法 SKU、16 类客户原型和 22 个城市来自冻结的 [业务素材](../tools/data-seed/src/compass_data_seed/catalogs/retail/README.md)。素材由当前会话模型编写，来源记录为 `codex_conversation`，付费 API 调用数为 0。未配置模型服务时，生成与重放可离线执行。

`demo` 保留 100,000 单和 160 / 1,280 商品配额；`dev` 使用 40 个具体 SPU、215 个合法 SKU 和 10,000 单；`fixture` 为 17 单边界金标。主键和业务编号保持稳定，商品名、规格、偏好、入会时间、价格版本与履约关系由业务输入和条件过程决定。订单总数是预定配额，转化分布只解释这套条件仿真。

本次用户要求保留旧库，使用 `publish-schema` 在现有零售库创建新 schema。先复制 [配置模板](../deploy/retail-schema.example.json)，将 `database` 填为需要对照的既有 `compass_retail_*` 数据库，保留独立的 `state_directory`：

```bash
pnpm data:seed generate --profile demo --output work/data-seed/semantic-demo --release retail-semantic-demo
pnpm data:seed publish-schema work/data-seed/semantic-demo \
  --config work/data-seed/semantic-config.json --state work/data-seed/semantic-state
```

上述历史语义版把逻辑 `core`、`ops`、`sec` 的 64 张表映射到 `retail_v2`；当前诊断版将 71 张表映射到新 `retail_v3`。装载账号只拥有新 schema，导入前检查其无权写旧表；验证只查询新 schema。目标 schema 已存在且没有对应成功登记时会拒绝覆盖。失败候选保留供检查，改用新的 schema 和独立状态目录重试。此入口不修改旧活动清单，也不自动删除任何旧数据。

新 schema 状态目录包含 `candidate.json`（含本机账号，0600）、无密码的 `active.json`、`business-report.json` 和 `access-report.json`。DBeaver 连接现有数据库后刷新 schema 列表；原 `core` 与 `retail_v2` 可以并列查看。公开业务角色不能读取收件人姓名和完整街道地址；管理员可查看合成收件快照。

## 模型素材修订与重放

模型工具的任务是补齐有具体含义的素材。程序负责状态转换、金额、时间先后和库存。修订保留既有商品 key、租户及 SKU 配额，1–20 个槽位一批；每批最多 3 次调用，最多 2 轮素材扩充。冻结后禁止在同一次经营运行中热改字典。

```bash
# 导入会话模型写出的 {"candidates": [...完整商品记录...]}。
pnpm data:seed semantic-revise \
  --catalog tools/data-seed/src/compass_data_seed/catalogs/retail \
  --key 101-p001 --response work/product-response.json --output work/catalog-revision

# 新字典生成新包；默认冻结字典保持原样。
pnpm data:seed generate --profile dev --catalog work/catalog-revision \
  --output work/semantic-revised --release semantic-revised
pnpm data:seed validate work/semantic-revised --catalog work/catalog-revision
```

当前 CLI 的结构化修订入口聚焦 1–20 个既有商品槽位，保持租户与 SKU 配额。客户、地理、活动等素材已由当前会话模型编写并冻结；这些域的后续缺口需要先整理为新的候选语义包，当前没有通用的无人值守扩充流程。

自动模型调用使用根 `.env` 的 `COMPASS_SEED_MODEL_URL`（OpenAI 兼容 `/v1` 根地址）、`COMPASS_SEED_MODEL_NAME`、`COMPASS_SEED_MODEL_API_KEY`。调用 `semantic-revise` 时提供 `--cache work/model-cache`，省略 `--response`。适配器使用 Python 标准库 HTTP，无额外 SDK；仅接受 HTTPS 或显式本机服务。响应缓存、失败记录和预算账本留在私有工作目录，密钥不写入日志。默认请求上限 60 次、保守预留 token 总量 900,000、单次输出 12,000 token；真实费用取决于配置的服务和账单，本次没有付费接口费用实测。

指定外部字典发布时，在部署配置中同时设置 `semantic_catalog` 为该冻结目录。语义包缺少覆盖时，候选运行进入 `NEEDS_EXPANSION`，私有目录留下缺口请求，业务包不生成正式 manifest。修订后使用新输出目录重跑；不生成占位商品补数。

离线重放条件为代码、SQL、profile、字典 hash、seed、release 一致。预登记 seed 为 `20261019`、`20261117`、`20261213`，通过 `generate --seed` 选择。真实运行时间和随机部署凭据仅留在私有记录，不进入逻辑内容摘要。

新增验证从落库事实检查商品语义、生命周期、客户与地址、价格成本区间、首付时延、售后适用性和漏斗退化，并重算自有渠道 PV / UV / 加购。课程分析 SQL 见 [course_questions.sql](../tools/data-seed/src/compass_data_seed/sql/course_questions.sql)，包括季节、缺货、连带、会员队列、物流成本和迟到等问题；业务报告保存实际分母，不能由合成关系直接推出真实市场因果结论。

## 从生成到发布

在 Compass 根目录执行，先确保 `pnpm db:up` 已成功：

```bash
pnpm data:seed generate --profile fixture --output work/data-seed/fixture --release retail-fixture
pnpm data:seed validate work/data-seed/fixture
cp deploy/retail-local.example.json work/data-seed/local-config.json
# 在根 .env 中设置 COMPASS_RETAIL_ADMIN_URL，指向本机 Compose PostgreSQL 的 postgres 管理库。
# 凭据沿用 deploy/compose/compose.yaml 的本地配置，禁止填入应用 DATABASE_URL。
pnpm data:seed publish work/data-seed/fixture \
  --config work/data-seed/local-config.json --state work/data-seed/local-state
```

`generate`、`validate`、`publish` 分别执行。`publish` 完成完整包检查、候选库创建、独立 Alembic 迁移、COPY、业务 SQL/场景断言、真实受限连接验证和活动清单切换。首次发布期望没有活动版本。已有版本时加 `--expected-active <active.json 中的 content_hash>`；版本不符时拒绝操作。

选择 `--profile dev` 生成 10,000 单，选择 `--profile demo` 生成 100,000 单。三个租户 demo 配额为 90,000 / 5,000 / 5,000；SKU 1,280、会员 36,000、渠道身份 72,000。fixture 包含明确的边界用例，不声明统计样本充分。

生成目录必须是新路径，工具不覆盖已有业务包或私有工件目录。失败的生成目录保留用于排查，重试选择新的输出路径。包的 release、profile、schema 和生成器内容摘要随清单冻结。

## 输出与参考时间

| 位置                     | 内容                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `<output>/manifest.json` | 业务包版本、模型/配置/代码摘要、字段顺序、逐文件行数/hash、三个时钟                     |
| `<output>/tables/`       | 全部 71 表的 CSV，按表/月分块；空表也有表头                                             |
| `<output>/scenarios/`    | 清洗名单、对账快照、原始候选行与合并映射、预测训练切片、干预人群和业务材料              |
| `<output>/reference.sql` | 问数、实验、监控、留存等参考 SQL；按业务使用受限连接                                    |
| `<output>/dictionary.md` | 从当前规范字典派生的发布副本                                                            |
| `<output>-private/`      | 私有金标、未来标签、生成器源码快照和真实耗时/内存/字节报告；权限 0700，不分发给业务读者 |
| `<state>/active.json`    | 当前已发布的不可变业务环境清单副本，无明文凭据                                          |
| `<state>/releases/`      | 历次发布清单，回切入口                                                                  |
| `<state>/candidates/`    | 本机部署记录和随机账号凭据，权限 0600；不得分享                                         |
| `<state>/reports/`       | 实际业务断言与源权限验证结果                                                            |

下单窗口为 2023-01-01 至 2025-12-31，2026 Q1 为只继续履约/售后的尾窗。参考时钟固定为 **2025-12-15 09:00 Asia/Shanghai**；包内另有明确的知识截止。业务日采用上海时区，CSV 数据库时间使用 UTC，区间左闭右开。原型中的 2026 年秋季日期需要消费方显式适配。

生产控制元数据与事实分开处理：`dataset_release`、`generation_run`、`file_manifest`、`principal`、`principal_region` 的 CSV 是空模板，由候选库装载与授权过程填入真实运行时间、文件和登录记录。可复现的业务包摘要不混入本机密码或运行耗时；实际操作记录保存在部署侧。单库发布后只有一条 dataset_release。

采集批次的 `source_from/source_to` 定义业务时间窗口，`received_at` 表示原批次到达，事实的 `available_at` 还须等待父证据。父证据较晚到达时，记录仍归原业务批次。水位按上海自然日统计实际应到/已到批次；原批次已到而关联证据尚缺时，完整性水位仍保持延迟。fixture/diagnostic 只登记被引用批次；dev/demo 登记完整连续排程和空批。

默认仅物化 2025-10-01 至 2026-03-31 的库存与估值日快照，覆盖各版本中已生效的经营地点 SKU 组合，数量由具体商品目录和门店经营范围决定。更早日期通过流水重放。零库存保留为零，未经营组合不造行。

## 场景与边界

- S03 原始名单 2,000 行，合法唯一 1,700、重复 100、缺键 100、格式错误 100；合法名单含 50 个未知会员键。原件与规范客户表分离。
- S04 两份 9 月快照分别采用完整财务口径与 9 月 29 日的经营观察时点；桥接拆开退款、源迟到、重复关联、现金口径和业务截止差异，私有预期逐项守恒。
- S05/S06 有缺货、活动、售后、迟到、恢复等八份带时间和来源的合成业务材料。结论需要与事实核对。
- S07 有完整 36 月历史，三个 12 周回测窗；每个训练切片只使用当时已可知事实，未来标签单独保管。预测效果需由消费方实际回测。
- S08 正常实验 A/B 各 3,000，异常分流样例实际 3,200/800，预注册均为 50/50。包含未转化者及零/多次曝光；异常分流应阻止默认效果结论。
- S09：原触达附件保留为独立教学样例；diagnostic 的正式价格题使用 `intervention_definition` / `intervention_cohort`，2,000 个预先确定会员，处理/对照各 1,000，12 周前期与 8 周后期；两组机会流延续到第 9 周以覆盖 60 日结果窗，并联查真实价格曝光、替代与跨渠道购买。平台同期调价和投放变化作为无法识别独立价格效应的反例。
- S10 固定连续八周，其中一周数据延迟后补齐，保留不同观察时点。
- S11（工程 demo 专用）2025-11-10 10:00–11:30 小程序每分钟 100 次尝试；三段成功率分别为 98% / 90% / 98%，合计 9,000 次、8,580 次成功。这是定向样例，全库成功率需另算。
- S12 以首次交付月划分会员队列，输出 0–12 月龄；零活跃为 0，未成熟单元为 NULL，分母小于 100 标为不足。未知会员排除，退款不撤销已发生的交付购买事件，退款率与净收入另算。区域/渠道条件同时限定分母与活跃人群。

业务生产负责输入数据、参考 SQL 和数据验收。Agent 页面、任务调度、预测模型、因果识别结论、平台账号及产品接入由 Feature 999 负责。

## 权限、失败与回切

部署管理员、候选装载账号与只读账号分离；受限查询按 `session_user` 绑定租户和区域。提供 `a_all`、`a_east`、`a_marketing`、`a_finance`、`b_east` 五种配置。业务身份不能写入、切换装载角色、读取完整身份映射或生产控制表；成本权限不足直接拒绝，不能将不可见成本当成零。

所有业务目标从受控配置的 `compass_retail_*` 前缀与包摘要生成。未知既有库、同 release 异内容、文件损坏、版本冲突和并发操作均拒绝。活动清单通过独占锁、期望版本和原子替换保护。发布不自动删除旧库。

已登记的失败候选可显式清理重试：

```bash
pnpm data:seed retry work/data-seed/demo \
  --config work/data-seed/local-config.json --state work/data-seed/local-state
# 随后重新执行 publish，仍提供原活动版本的 expected-active。
```

回切只选择已保留且源内 release/hash 仍匹配的旧清单：

```bash
pnpm data:seed rollback --release retail-fixture \
  --config work/data-seed/local-config.json --state work/data-seed/local-state \
  --expected-active <当前活动版本的content_hash>
```

状态目录须与部署配置 `state_directory` 一致。示例路径以 Compass 根目录为基准。受限源间 CONNECT 拒绝在工具管理的数据库上验证；同实例仍共享 PostgreSQL 管理员与资源边界。

## 验证命令

```bash
pnpm test -F data-seed
# 显式设置 COMPASS_RETAIL_TEST_ADMIN_URL 后运行真实 PostgreSQL 集成测试。
pnpm test:integration -F data-seed
pnpm check
```

独立断言覆盖金额分摊、退款现金上限、履约与财务来源、FIFO、库存/估值重放、时间可知性、渠道汇总、实验/监控密度及场景附件。集成测试包含坏文件、非法目标、幂等、锁冲突、中断重试、受限连接和回切。没有测试数据库凭据时，集成测试明确标记跳过。

同 release、同 profile、相同源码和规范 SQL 应得到相同 `content_hash`。生成器把本次源码保存在私有目录的 `source/`；生成期间源码变化会中止生产。保留源码快照后，可在同一 Compass 工作区通过 `PYTHONPATH=<output>-private/source uv run --locked python -m compass_data_seed generate ...` 复现，使用新输出路径、相同 release 和 profile。规范 DDL 必须仍与清单中的摘要一致。2026-10-25 之前的私有源码快照仍使用 `compass_api` 目录，重放这些快照时保持 `python -m compass_api.data_seed`；新快照使用 `compass_agent`。不要修改已有快照。完整业务包及私有目录约需两份空间；重复验证输出单独保管，不自动删除。

当前实现与验收进度见 [998 实施记录](../mai-specs/998-business-data-seeding-tool/IMPLEMENTATION.md)。

## 本次本地交付

2026-10-22，release `retail-semantic-20261022` 已在 `127.0.0.1:55432` 的 `compass_retail_local_e0b65e1ddb84` 数据库发布，schema 为 `retail_v2`。DBeaver 连接后刷新 Schemas；原 `core/ops/sec` 与旧活动清单保留。不要使用截图中的默认 5432 端口。

新版有 100,000 单、160 SPU、1,280 SKU；[新旧对照 SQL](../work/data-seed/semantic-upgrade/compare-in-dbeaver.sql)、[商品册](../work/data-seed/semantic-upgrade/catalog-preview.md)和[业务分析](../work/data-seed/semantic-upgrade/course-analysis.md)可直接阅读。完整门禁、重放与旧数据保护证据见[实施记录](../mai-specs/998-business-data-seeding-tool/IMPLEMENTATION.md#语义版本正式交付2026-10-22)。

## 诊断版交付（2026-10-23）

同一数据库已新增 **retail_v3**，release `diagnostic-v3-20261019`，111,055单、71表；原retail_v2/core/ops/sec保留，127张旧表内容指纹一致。DBeaver使用原连接 `127.0.0.1:55432`，刷新Schemas后选择retail_v3。

学员数据现已迁至 [data/retail/](../data/retail/README.md)，使用 Git LFS 获取[压缩包](../data/retail/compass-retail.sql.gz)，运行 `pnpm data:prepare` 得到单文件 SQL。导入目标为 retail_course；[操作说明与校验](../data/retail/README.md)随仓库提供。实际普通账号空库导入、94项数据门禁、74项权限检查和独立诊断结果见[最终实施记录](../mai-specs/998-business-data-seeding-tool/IMPLEMENTATION.md#诊断增量正式交付2026-10-23)。

迁移前保存的源码快照保留 `compass_agent.data_seed` 布局，历史重放使用快照对应入口；新快照使用 `compass_data_seed`。目录迁移改变生成器源码摘要，新生成使用新的输出目录，已发布数据包及活动清单保持原样。
