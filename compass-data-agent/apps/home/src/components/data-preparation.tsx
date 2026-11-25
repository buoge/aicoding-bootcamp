import { Database, FolderCode, PackageOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disclosure } from "@/components/ui/disclosure";
import { CopyBlock } from "@/components/learning-tools";
import { DataScaleDetails } from "@/components/data-scale";
import s from "./data-preparation.module.css";

const seedRoot = "tools/data-seed/src/compass_data_seed";
const deliveryFiles = [
  ["compass-retail.sql", "由 pnpm data:prepare 解压生成；约 973 MiB，直接导入，不提交 Git。"],
  ["compass-retail.sha256", "SQL 文件的 SHA-256 校验清单。"],
  ["compass-retail.sql.gz", "已验收数据的正式压缩包，约 117 MiB；通过 Git LFS 随仓库分发。"],
  ["compass-retail.sql.gz.sha256", "压缩包的 SHA-256 校验清单。"],
  ["README.md", "导入步骤、查询入口、文件校验与已验证版本。"],
] as const;
const sourceGroups = [
  {
    title: "数据生成、校验与导出",
    directory: seedRoot,
    files: [
      ["__main__.py", "CLI 子命令与参数入口，由 scripts/data-seed.mjs 调用。"],
      ["generator.py", "按 profile、seed 与冻结素材生成业务包。"],
      ["contracts.py / validation.py", "文件完整性校验与数据库业务校验。"],
      ["export_sql.py", "导出单文件 SQL 和对应 .sha256 校验清单。"],
    ],
  },
  {
    title: "生成规模配置",
    directory: `${seedRoot}/profiles/`,
    files: [
      ["fixture.json", "17 单边界样本，用于快速检查。"],
      ["dev.json", "10,000 单，适合本地开发。"],
      ["demo.json", "100,000 单，工程演示与高密度监控样例。"],
      ["diagnostic.json", "固定访问机会，业务过程产生订单，适合诊断练习。"],
    ],
  },
  {
    title: "分析与验收 SQL",
    directory: `${seedRoot}/sql/`,
    files: [
      ["reference.sql", "问数、实验、监控、留存等参考查询。"],
      ["course_questions.sql", "季节、缺货、连带、会员队列等课程分析。"],
      ["assertions.sql / diagnostic_checks.sql", "业务守恒与诊断场景检查。"],
      ["diversity.sql / diversity_metrics.sql", "数据多样性与分布检查。"],
    ],
  },
  {
    title: "冻结的业务素材",
    directory: `${seedRoot}/catalogs/retail/`,
    files: [
      ["manifest.json / README.md", "素材版本、摘要与使用说明。"],
      ["products.jsonl / families.json", "具体商品与商品族素材。"],
      ["customers.json / geography.json", "客户原型与地理素材。"],
      ["business.json / commerce.json / language.json", "经营、交易与文案素材。"],
    ],
  },
] as const;

function FileList({
  directory,
  files,
}: {
  directory: string;
  files: readonly (readonly [string, string])[];
}) {
  return (
    <div className={s.files}>
      <p className={s.directory}>
        <FolderCode size={16} aria-hidden="true" />
        <code>{directory}</code>
      </p>
      <dl className={s.fileList}>
        {files.map(([name, description]) => (
          <div key={name}>
            <dt>
              <code>{name}</code>
            </dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function DataPreparation() {
  return (
    <Tabs defaultValue="delivery" className={s.root}>
      <TabsList variant="line" className={s.tabs} aria-label="数据文件与初始化方式">
        <TabsTrigger value="delivery">
          <PackageOpen aria-hidden="true" />
          现成数据包
        </TabsTrigger>
        <TabsTrigger value="source">
          <FolderCode aria-hidden="true" />
          生成与校验脚本
        </TabsTrigger>
        <TabsTrigger value="fixture">
          <Database aria-hidden="true" />
          工程样本初始化
        </TabsTrigger>
      </TabsList>

      <TabsContent value="delivery" className={s.panel}>
        <p className={s.intro}>
          已准备好 <strong>111,055 笔订单、71 张关系表</strong>的合成业务数据。 单文件 SQL
          还包含公开材料表 <code>course_asset</code>，导入无需 Python 或外部 CSV。
        </p>
        <div className={s.deliveryGrid}>
          <div>
            <h3>4 个仓库文件，1 个生成文件</h3>
            <FileList directory="data/retail/" files={deliveryFiles} />
            <p className={s.note}>
              路径均以 Compass 根目录为基准。安装 Git LFS 后克隆仓库，获取已验收压缩包；
              两份校验清单与 README.md 使用普通 Git。SQL 由初始化命令校验、解压生成。
            </p>
            <Disclosure density="compact" title="已经克隆但只有 LFS 指针时">
              <CopyBlock
                title="获取完整数据文件"
                code={
                  'git lfs install\ngit lfs pull --include="$(git rev-parse --show-prefix)data/retail/compass-retail.sql.gz" --exclude=""'
                }
              />
              <p className={s.note}>在 Compass 根目录执行；课程仓库与独立 Compass 仓库均适用。</p>
            </Disclosure>
          </div>
          <div className={s.commands}>
            <CopyBlock title="① 校验、解压并启动数据库" code={"pnpm data:prepare\npnpm db:up"} />
            <p className={s.note}>
              数据准备只需 Node.js 与 pnpm，重复执行会校验已有 SQL；预留约 1 GiB 解压空间。
              使用现有数据库时可跳过 db:up。导入账号需有 CREATE 权限，目标
              <code> retail_course</code> schema 应尚未存在。
            </p>
            <CopyBlock
              title="② 导入完整业务数据"
              code={`psql -X -h 127.0.0.1 -p 55432 \\
  -U YOUR_USER -d YOUR_DATABASE \\
  -v ON_ERROR_STOP=1 \\
  -f data/retail/compass-retail.sql`}
            />
            <p className={s.note}>
              替换用户名与数据库名，密码由客户端提示输入；55432 为项目 Compose 端口。
              脚本自行建表并装载数据，重复导入会拒绝覆盖已有 schema。
            </p>
            <Disclosure density="compact" title="③ 导入后检查订单与公开材料">
              <CopyBlock
                title="数据库中执行"
                code={`SELECT count(*) AS orders FROM retail_course.order_header;
SELECT asset_path FROM retail_course.course_asset ORDER BY asset_path;
SELECT content FROM retail_course.course_asset WHERE asset_path = 'reference.sql';`}
              />
              <p className={s.note}>
                本次诊断版订单数应为 111,055。参考 SQL 从 course_asset 取出后执行，已使用
                retail_course 命名空间。DBeaver 可通过 Execute SQL Script natively 导入完整文件。
              </p>
            </Disclosure>
          </div>
        </div>
        <DataScaleDetails />
      </TabsContent>

      <TabsContent value="source" className={s.panel}>
        <p className={s.intro}>
          根命令 <code>pnpm data:seed</code> 经 <code>scripts/data-seed.mjs</code> 调用独立的
          <code> tools/data-seed/</code> Python 工具。用于准备和重建业务数据，按需执行，无需启动
          Agent。 下列目录保存可复用源码；生成结果写入指定的 <code>work/</code> 目录。
        </p>
        <div className={s.sourceGrid}>
          {sourceGroups.map(({ title, directory, files }) => (
            <section key={title} aria-label={title}>
              <h3>{title}</h3>
              <FileList directory={directory} files={files} />
            </section>
          ))}
        </div>
        <Disclosure className={s.details} title="从源码生成、校验，再导出 SQL">
          <div className={s.commandGrid}>
            <CopyBlock
              title="① 安装工具并生成开发数据"
              code={`pnpm install --frozen-lockfile
uv sync --locked --package compass-data-seed
pnpm data:seed generate --profile dev --seed 20261019 \\
  --output work/data-seed/local-dev --release retail-local-dev`}
            />
            <CopyBlock
              title="② 校验文件并导出学员 SQL"
              code={`pnpm data:seed validate work/data-seed/local-dev
pnpm data:seed export-sql work/data-seed/local-dev \\
  --output work/data-seed/local-dev-delivery/compass-retail.sql \\
  --schema retail_course`}
            />
          </div>
          <p className={s.note}>
            dev 生成 10,000 单；需要诊断数据时选 diagnostic，并使用新的输出目录与 release。 业务包含
            manifest.json、tables/、scenarios/、reference.sql、dictionary.md。 SQL 导出目录另含
            compass-retail.sha256。输出目录须为新路径；validate 检查文件完整性，
            正式发布还需数据库业务与权限校验。上述生成与导出步骤无需运行数据库。
          </p>
        </Disclosure>
        <Disclosure className={s.details} title="建表源、发布配置与教师侧初始化">
          <FileList
            directory="Compass 根目录"
            files={[
              [
                "mai-specs/998-business-data-seeding-tool/design/business-schema.sql",
                "零售业务表结构的唯一 DDL 源。",
              ],
              [
                "tools/data-seed/migrations/versions/0001_retail.py",
                "工具所属的零售候选库迁移，发布时显式执行。",
              ],
              ["deploy/retail-local.example.json", "新建候选零售库的发布配置模板。"],
              ["deploy/retail-schema.example.json", "在既有零售库创建新 schema 的配置模板。"],
              ["docs/data-seeding.md", "发布、权限、失败重试与版本回切的完整操作说明。"],
            ]}
          />
          <CopyBlock
            title="发布到本地独立零售库"
            code={`pnpm db:up
cp -n deploy/retail-local.example.json work/data-seed/local-config.json
# 先在根 .env 设置专用 COMPASS_RETAIL_ADMIN_URL
pnpm data:seed publish work/data-seed/local-dev \\
  --config work/data-seed/local-config.json \\
  --state work/data-seed/local-state`}
          />
          <p className={s.note}>
            先完成上方业务包生成。管理员连接指向本机 PostgreSQL 的 postgres 管理库； publish
            创建候选库、迁移、装载、验证并登记活动版本。已有活动版本时需按操作说明提供
            --expected-active；同库新 schema 使用 publish-schema。部署凭据与私有运行记录留在本机。
          </p>
        </Disclosure>
      </TabsContent>

      <TabsContent value="fixture" className={s.panel}>
        <p className={s.intro}>
          工程样本用于跑通 <strong>Web → Agent → PostgreSQL</strong>。<code> db:seed</code>{" "}
          写入三天聚合数据；完整零售业务数据使用前两个入口。
        </p>
        <div className={s.deliveryGrid}>
          <div>
            <h3>应用库初始化涉及的文件</h3>
            <FileList
              directory="Compass 根目录"
              files={[
                [".env.example", "应用数据库连接与演示开关模板。"],
                ["deploy/compose/compose.yaml", "本地 PostgreSQL 服务，宿主机端口 55432。"],
                ["apps/agent/alembic.ini", "应用数据库 Alembic 配置。"],
                [
                  "apps/agent/migrations/versions/0001_demo_fixture.py",
                  "创建 demo_daily_sales 样例表。",
                ],
                [
                  "apps/agent/src/compass_agent/seed.py",
                  "幂等写入 2026-10-01 至 10-03 三条汇总记录。",
                ],
                ["scripts/smoke.mjs", "检查 HTTP 契约、样例汇总与数据库链路。"],
              ]}
            />
            <p className={s.note}>
              验收值：收入合计 ¥40,000，汇总订单量 397；该样本不含逐笔订单明细。
            </p>
          </div>
          <div className={s.commands}>
            <CopyBlock
              title="① 准备环境并初始化应用数据"
              code={`cp -n .env.example .env
pnpm install --frozen-lockfile
pnpm setup
pnpm db:up
pnpm db:migrate
pnpm db:seed`}
            />
            <p className={s.note}>
              保留已有 .env，确认 COMPASS_DEMO_ENABLED=true。db:seed 可重复执行。
            </p>
            <CopyBlock
              title="② 启动应用并检查链路"
              code={`pnpm dev -F web -F agent
# 应用启动后，另一个终端运行
pnpm smoke`}
            />
            <p className={s.note}>
              Web 端口 3000，Agent 端口 8000。停止数据库使用 pnpm db:down，数据卷会保留。
              本页官网单独运行时无需初始化数据库。
            </p>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
