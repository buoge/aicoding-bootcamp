import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Blocks,
  Brain,
  Braces,
  Check,
  Code2,
  Database,
  FileJson2,
  FolderGit2,
  Layers3,
  Monitor,
  Server,
  Terminal,
  Workflow,
} from "lucide-react";
import { Disclosure } from "@/components/ui/disclosure";
import { StoryPage } from "@/components/story-page";
import { DataPreparation } from "@/components/data-preparation";
import { EngineeringStandards } from "@/components/engineering-standards";
import { DevelopmentWorkflow } from "@/components/development-workflow";
import { CopyBlock, FAQ } from "@/components/learning-tools";
import s from "@/components/engineering-story.module.css";

export const metadata: Metadata = {
  title: "项目脚手架",
  description:
    "Compass 的技术选型、Monorepo 组织、工程规范、研发流程、my-ai-infra 资产、数据脚本与软件环境。",
};
const chapters = [
  ["stack", "技术栈选型"],
  ["code", "Monorepo"],
  ["standards", "工程规范"],
  ["workflow", "研发流程"],
  ["ai-infra", "AI Infra 资产"],
  ["data", "数据和脚本"],
  ["environment", "软件环境"],
] as const;
const skills = [
  ["my-create-feature", "立项"],
  ["my-create-prd", "产品规格"],
  ["my-create-design", "技术设计"],
  ["my-review-design", "方案评审"],
  ["my-create-test-plan", "测试规划"],
  ["my-implement-code", "实现"],
  ["my-review-code", "代码评审"],
] as const;

export default function ScaffoldPage() {
  return (
    <StoryPage chapters={chapters} label="项目脚手架章节">
      <section
        id="stack"
        data-chapter
        className={`${s.screen} ${s.mist}`}
        aria-labelledby="stack-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>项目脚手架 · 技术栈选型</p>
            <h1 id="stack-title">
              AI 编程的两位一等公民，
              <br />
              <em>TypeScript + Python</em>
            </h1>
            <p className={s.lead}>
              贴合工程开发者的主流选型，让熟悉的技术栈成为构建 Agent 的起点。
              <br />
              TypeScript 承载产品交互与 BFF，Python 连接模型、数据与分析生态。
            </p>
          </header>
          <div className={s.stackFlow}>
            <article>
              <Monitor aria-hidden="true" />
              <span>界面与接入</span>
              <h2>Next.js + React</h2>
              <p>TypeScript · App Router · BFF</p>
              <small>home 官网 / web 产品工作台</small>
            </article>
            <ArrowRight className={s.flowArrow} aria-hidden="true" />
            <article>
              <Braces aria-hidden="true" />
              <span>Python 服务</span>
              <h2>FastAPI + Python</h2>
              <p>Pydantic · SQLAlchemy · Uvicorn</p>
              <small>agent / memory HTTP · worker 后台进程</small>
            </article>
            <ArrowRight className={s.flowArrow} aria-hidden="true" />
            <article>
              <Database aria-hidden="true" />
              <span>数据与迁移</span>
              <h2>PostgreSQL</h2>
              <p>psycopg · Alembic</p>
              <small>固定合成数据与迁移记录</small>
            </article>
          </div>
          <div className={s.stackSupport}>
            <span>
              <Layers3 size={17} />
              官网界面 <strong>shadcn/ui · Tailwind CSS</strong>
            </span>
            <span>
              <Check size={17} />
              基础检查 <strong>pytest · Vitest · Node test</strong>
            </span>
          </div>
          <Disclosure className={s.details} title="后续 Agent 能力的技术方向">
            <div className={s.targetStack}>
              {[
                ["模型接入", "薄 LLM Runtime + PydanticAI Direct 适配器"],
                ["持久执行", "在 worker 中接入 Temporal"],
                ["查询与隔离计算", "SQLGlot · DuckDB · pandas · PyArrow"],
                ["检索、产物与观测", "pgvector · S3 兼容存储 · OpenTelemetry"],
              ].map(([a, b]) => (
                <div key={a}>
                  <strong>{a}</strong>
                  <p>{b}</p>
                </div>
              ))}
            </div>
            <p className={s.footnote}>
              以上为目标选型，随实际需求引入并验证。当前 M0 尚未实现真实模型、Run /
              SSE、租户权限或隔离执行。
            </p>
          </Disclosure>
        </div>
      </section>

      <section
        id="code"
        data-chapter
        className={`${s.screen} ${s.white}`}
        aria-labelledby="code-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>项目组织 · Monorepo</p>
            <h2 id="code-title">
              同一个仓库，<em>清晰的应用边界。</em>
            </h2>
            <p className={s.lead}>让 AI 读懂跨服务上下文，让团队共享工程规范与交付流程。</p>
          </header>
          <div className={s.repoDiagram}>
            <div className={s.repoRoot}>
              <FolderGit2 />
              <strong>compass /</strong>
              <span>一个工作区，五个独立 App</span>
            </div>
            <div className={s.appBranches}>
              {[
                {
                  path: "apps/home",
                  title: "产品官网",
                  text: "Next.js · 3001",
                  detail: "独立展示，无后端依赖",
                  icon: Monitor,
                },
                {
                  path: "apps/web",
                  title: "工作台与 BFF",
                  text: "Next.js · 3000",
                  detail: "通过 HTTP 调用 Agent",
                  icon: Code2,
                },
                {
                  path: "apps/agent",
                  title: "Agent 主后端",
                  text: "FastAPI · 8000",
                  detail: "已具备 API、应用迁移与三天样本",
                  icon: Server,
                },
                {
                  path: "apps/memory",
                  title: "独立记忆服务",
                  text: "FastAPI · 8001",
                  detail: "健康检查已就绪，记忆业务待接入",
                  icon: Brain,
                },
                {
                  path: "apps/worker",
                  title: "后台任务进程",
                  text: "asyncio · 无 HTTP 端口",
                  detail: "进程启停已就绪，任务消费待接入",
                  icon: Workflow,
                },
              ].map(({ path, title, text, detail, icon: Icon }) => (
                <article key={path}>
                  <Icon aria-hidden="true" />
                  <code>{path}</code>
                  <h3>{title}</h3>
                  <p>{text}</p>
                  <small>{detail}</small>
                </article>
              ))}
            </div>
            <div className={s.repoFolders}>
              {[
                ["contracts/", "生成的网络契约"],
                ["packages/", "共享包准入"],
                ["scripts/", "检查与任务入口"],
                ["tools/data-seed/", "离线业务数据准备"],
                ["data/retail/", "已验收数据包"],
                ["deploy/", "容器与 Compose"],
              ].map(([path, text]) => (
                <div key={path}>
                  <code>{path}</code>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={s.repoReasons}>
            <article>
              <h3>完整上下文，支持 AI 跨服务协作</h3>
              <p>
                各服务的代码、接口契约与需求设计集中在同一仓库，AI
                可以关联检索、理解依赖并联动修改，减少上下文割裂。
              </p>
            </article>
            <article>
              <h3>统一工程治理，提高团队协同效率</h3>
              <p>
                集中管理
                CI/CD、工程化规范与编码规范，让各服务遵循一致的检查和交付流程，降低团队协作与维护成本。
              </p>
            </article>
          </div>
        </div>
      </section>

      <section
        id="standards"
        data-chapter
        className={`${s.screen} ${s.sage}`}
        aria-labelledby="standards-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>工程规范</p>
            <h2 id="standards-title">
              规范、配置、检查，<em>逐项对应。</em>
            </h2>
            <p className={s.lead}>四类十二项，覆盖五个 App 的配置与执行入口。</p>
          </header>
          <EngineeringStandards />
        </div>
      </section>

      <section
        id="workflow"
        data-chapter
        className={`${s.screen} ${s.white}`}
        aria-labelledby="workflow-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>研发流程</p>
            <h2 id="workflow-title">
              从明确需求，<em>到交付运行证据。</em>
            </h2>
            <p className={s.lead}>
              用 Skill 推进 Feature，用工程脚本启动应用、检查质量与验证交付。
            </p>
          </header>
          <DevelopmentWorkflow />
        </div>
      </section>

      <section
        id="ai-infra"
        data-chapter
        className={`${s.screen} ${s.dark}`}
        aria-labelledby="infra-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>AI Infra 资产 · my-ai-infra</p>
            <h2 id="infra-title">
              让工作方法，<em>成为可复用的资产。</em>
            </h2>
            <p className={s.lead}>用项目配置选择 Skill，让规格、评审和实现沿着同一套方法推进。</p>
          </header>
          <div className={s.assetFlow}>
            <div>
              <Blocks aria-hidden="true" />
              <h3>资产库</h3>
              <p>内置资产 + 个人资产</p>
              <code>my-ai-infra</code>
            </div>
            <ArrowRight className={s.flowArrow} aria-hidden="true" />
            <div>
              <FileJson2 aria-hidden="true" />
              <h3>项目选择</h3>
              <p>声明工具和启用的 Skill</p>
              <code>.my-ai-infra.json</code>
            </div>
            <ArrowRight className={s.flowArrow} aria-hidden="true" />
            <div>
              <Terminal aria-hidden="true" />
              <h3>工具入口</h3>
              <p>通过项目入口复用资产</p>
              <code>Codex · Cursor</code>
            </div>
          </div>
          <div className={s.skillList}>
            {skills.map(([name, label]) => (
              <div key={name}>
                <span>{label}</span>
                <code>{name}</code>
              </div>
            ))}
          </div>
          <div className={s.infraFoot}>
            <p>Compass 当前配置启用 7 个 SDD Skill；UI 设计资产另由课程共享入口维护。</p>
            <a href="https://github.com/shanggqm/my-ai-infra" target="_blank" rel="noreferrer">
              了解 my-ai-infra <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      <section
        id="data"
        data-chapter
        className={`${s.screen} ${s.mist}`}
        aria-labelledby="data-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>数据和脚本</p>
            <h2 id="data-title">
              数据放哪里，<em>按步骤初始化。</em>
            </h2>
            <p className={s.lead}>
              找到准备好的 SQL 数据包，查看源文件目录，复制对应的初始化命令。
            </p>
          </header>
          <DataPreparation />
        </div>
      </section>

      <section
        id="environment"
        data-chapter
        className={`${s.screen} ${s.white}`}
        aria-labelledby="environment-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>软件环境</p>
            <h2 id="environment-title">
              准备好环境，<em>再开始第一轮验证。</em>
            </h2>
            <p className={s.lead}>macOS / Linux；Windows 使用 WSL2。M0 无需模型账号。</p>
          </header>
          <div className={s.environment}>
            {[
              ["Node.js", "24.12.0", ".node-version"],
              ["pnpm", "11.3.0", "packageManager"],
              ["uv", "0.13.0", "Python 工具链"],
              ["Python", "3.13.16", ".python-version"],
              ["Docker", "Desktop / Compose", "完整链路需运行"],
            ].map(([name, version, source]) => (
              <div key={name}>
                <span>{name}</span>
                <strong>{version}</strong>
                <small>{source}</small>
              </div>
            ))}
          </div>
          <div className={s.homeStart}>
            <div>
              <Monitor />
              <h3>先单独运行这个官网</h3>
              <p>安装 Node 与 pnpm 即可；在 Compass 根目录执行。</p>
            </div>
            <CopyBlock title="启动官网" code={"pnpm install --frozen-lockfile\npnpm dev -F home"} />
          </div>
          <Disclosure id="start" className={s.details} title="启动完整工程与数据库">
            <div className={s.setupGrid}>
              <CopyBlock
                title="安装与环境检查"
                code={
                  "cp -n .env.example .env\npnpm install --frozen-lockfile\npnpm setup\npnpm doctor"
                }
              />
              <CopyBlock title="初始化数据库" code={"pnpm db:up\npnpm db:migrate\npnpm db:seed"} />
              <CopyBlock
                title="启动五个应用并验收"
                code={"pnpm dev\n# 另一个终端运行\npnpm smoke --memory"}
              />
            </div>
            <p className={s.footnote}>
              已有 .env 时保留本地配置。home 3001 · Web 3000 · Agent 8000 · Memory 8001 · PostgreSQL
              55432；Worker 无 HTTP 端口，通过启动日志与退出状态检查。启动后在 Web
              点击“查看示例数据”，Agent 的接口文档位于 8000 端口的 /docs。
            </p>
          </Disclosure>
          <div className={s.faq}>
            <FAQ
              items={[
                {
                  question: "工具版本或依赖安装不匹配？",
                  answer:
                    "对照 .node-version、.python-version 和 packageManager，运行 pnpm doctor。确认依赖仓库可访问，保留原始报错，沿用锁文件安装。",
                },
                {
                  question: "数据库连接或示例数据加载失败？",
                  answer:
                    "确认 Docker 已启动、55432 端口可用、.env 中 COMPASS_DEMO_ENABLED=true，并完成迁移和 seed。按 Web → BFF → API → 数据库逐段检查；pnpm smoke 验证全链路。根任务加载 .env，直接运行子服务时需显式注入环境。",
                },
                {
                  question: "需要同时启动 Memory 和 Worker 吗？",
                  answer:
                    "基础示例链路可用 pnpm dev -F home -F web -F agent 启动，再运行 pnpm smoke。pnpm dev 会启动全部五个应用，pnpm smoke --memory 额外检查 Memory 就绪。Memory 和 Worker 当前仅提供健康检查与进程生命周期脚手架，独立运行无需数据库或 Temporal；记忆业务和持久任务仍待接入。",
                },
              ]}
            />
          </div>
          <div className={s.next}>
            <p>工程基线就绪，选择你的第一个增量。</p>
            <Link href="/course">
              查看课程任务 <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <a href="/prototype/index.html#design" target="_blank" rel="noreferrer">
              产品设计规范 <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </StoryPage>
  );
}
