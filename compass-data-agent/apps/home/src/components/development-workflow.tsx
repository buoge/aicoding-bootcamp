"use client";

import { ArrowUpRight, FolderGit2, GitBranch, Terminal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disclosure } from "@/components/ui/disclosure";
import { CopyBlock } from "@/components/learning-tools";
import s from "./development-workflow.module.css";

const assetRoot = "https://github.com/shanggqm/my-ai-infra/blob/main/assets/skills";
// Skill ownership and paths follow my-ai-infra's stage contracts and FEATURE_LAYOUT.json.
const steps = [
  ["需求立项", "背景、范围与输入素材", "my-create-feature"],
  ["产品规格", "业务场景与验收条件", "my-create-prd"],
  ["技术设计", "实现边界与任务拆解", "my-create-design"],
  ["方案评审", "核对风险与设计取舍", "my-review-design"],
  ["测试规划", "业务用例与验收路径", "my-create-test-plan"],
  ["编码实现", "按方案实现并验证增量", "my-implement-code"],
  ["代码评审", "核对需求契约与质量", "my-review-code"],
  ["测试验收", "执行业务用例，记录证据", "my-create-test-plan"],
] as const;

const featureTree = `mai-specs/
├── ROADMAP.md                    # Feature 总索引
└── NNN-feature-slug/
    ├── BRIEF.md                  # 目标、范围、阶段与依据
    ├── context/
    │   └── _INDEX.md             # 输入素材与来源索引
    ├── spec/
    │   └── PRD.md                # 产品规格与验收条件
    ├── design/
    │   ├── TECH_DESIGN.md        # 技术方案与实施任务
    │   └── CODE_DESIGN.md        # 代码设计附录，按需
    ├── review/
    │   ├── design_review.md      # 方案评审
    │   └── code_review.md        # 代码评审
    ├── test/
    │   └── TEST_PLAN.md          # 业务用例与执行结果
    └── IMPLEMENTATION.md         # 本项目实施记录，按需`;

export function DevelopmentWorkflow() {
  return (
    <Tabs defaultValue="sdd" className={s.root}>
      <TabsList variant="line" className={s.tabs} aria-label="研发流程内容">
        <TabsTrigger value="sdd">
          <GitBranch aria-hidden="true" /> SDD 研发流程
        </TabsTrigger>
        <TabsTrigger value="local">
          <Terminal aria-hidden="true" /> 本地启动与脚本
        </TabsTrigger>
      </TabsList>

      <TabsContent value="sdd" className={s.panel}>
        <p className={s.intro}>
          以 my-ai-infra 的 Skill 资产推进一个 Feature；点击下方指令查看对应 Skill 原文。
        </p>
        <ol className={s.steps}>
          {steps.map(([title, description, skill], index) => (
            <li key={title}>
              <div className={s.stepHeading}>
                <span>{index + 1}</span>
                <h3>{title}</h3>
              </div>
              <p>{description}</p>
              <a href={`${assetRoot}/${skill}/SKILL.md`} target="_blank" rel="noreferrer">
                <code>/{skill}</code>
                <ArrowUpRight aria-hidden="true" />
              </a>
            </li>
          ))}
        </ol>
        <div className={s.feature}>
          <div className={s.featureCopy}>
            <FolderGit2 aria-hidden="true" />
            <h3>一个 Feature 的完整目录</h3>
            <p>规格、设计、评审和验收证据随需求保存在同一个上下文包中。</p>
            <ul>
              <li>立项先生成 BRIEF.md 与 context/_INDEX.md；后续文件随阶段按需创建。</li>
              <li>第 5、8 步复用同一测试 Skill，分别规划用例与按请求执行验收。</li>
              <li>
                源码与自动化测试放在 apps/、tools/、packages/ 的对应模块；这里维护规格与记录。
              </li>
            </ul>
            <a
              href={`${assetRoot}/my-create-feature/template/FEATURE_LAYOUT.json`}
              target="_blank"
              rel="noreferrer"
            >
              查看默认产物路径 <ArrowUpRight aria-hidden="true" />
            </a>
          </div>
          <pre className={s.tree} tabIndex={0} aria-label="Feature 完整目录结构">
            <code>{featureTree}</code>
          </pre>
        </div>
        <p className={s.note}>以上展示完整路径；实际根据需求复杂度组合阶段，已有产物可直接接续。</p>
      </TabsContent>

      <TabsContent value="local" className={s.panel}>
        <p className={s.intro}>
          以下命令均在 Compass 根目录执行。使用 pnpm &lt;任务&gt; -F &lt;应用短名&gt; 选择应用。
        </p>
        <div className={s.startGrid}>
          <div>
            <CopyBlock
              title="启动 Home 官网"
              code={"pnpm install --frozen-lockfile\npnpm dev -F home"}
            />
            <p className={s.commandNote}>只需 Node.js 与 pnpm；打开 http://127.0.0.1:3001。</p>
          </div>
          <div>
            <CopyBlock
              title="按应用启动"
              code={"pnpm dev -F web\npnpm dev -F agent\npnpm dev -F memory\npnpm dev -F worker"}
            />
            <p className={s.commandNote}>
              按需选择一条。Python 应用先完成 pnpm setup；Web / Agent 示例链路需初始化数据库，Memory
              / Worker 当前脚手架可独立运行。
            </p>
          </div>
        </div>
        <Disclosure
          id="workflow-start"
          title="首次启动完整工程：安装、数据库与链路验收"
          density="compact"
        >
          <div className={s.setupGrid}>
            <CopyBlock
              title="安装与环境检查"
              code={
                "# 已有 .env 时保留本地配置\ncp -n .env.example .env\npnpm install --frozen-lockfile\npnpm setup\npnpm doctor"
              }
            />
            <CopyBlock title="初始化数据库" code={"pnpm db:up\npnpm db:migrate\npnpm db:seed"} />
            <CopyBlock
              title="启动五个应用并验收"
              code={"pnpm dev\n# 另开终端验证链路与 Memory 就绪\npnpm smoke --memory"}
            />
          </div>
          <p className={s.commandNote}>
            完整工程还需 uv 与 Docker。home 3001 · Web 3000 · Agent 8000 · Memory 8001 · PostgreSQL
            55432；Worker 无 HTTP 端口，检查启动日志与退出状态。Memory 业务和 Worker
            任务消费待接入，当前两项均不依赖数据库或 Temporal。
          </p>
        </Disclosure>
        <div className={s.commandGrid}>
          <div>
            <CopyBlock
              title="只启动基础示例链路"
              code={
                "pnpm dev -F home -F web -F agent\n# 另开终端验证 Web → Agent → PostgreSQL\npnpm smoke"
              }
            />
            <p className={s.commandNote}>
              完成上述安装与数据库初始化后使用；pnpm dev 不带筛选时启动全部五个应用。
            </p>
          </div>
          <div>
            <CopyBlock
              title="单应用检查与构建"
              code={
                "pnpm lint -F home\npnpm typecheck -F home\npnpm test -F home\npnpm build -F home"
              }
            />
            <p className={s.commandNote}>
              依次检查代码规范、类型、测试与生产构建；home 可替换为目标应用短名。
            </p>
          </div>
          <div>
            <CopyBlock
              title="工程质量与交付"
              code={"pnpm format\npnpm check\npnpm build\npnpm smoke"}
            />
            <p className={s.commandNote}>
              格式化、完整检查、全量构建；smoke 在应用与数据库运行后执行。加 --memory 检查已启动的
              Memory 脚手架。
            </p>
          </div>
          <div>
            <CopyBlock
              title="数据与接口契约"
              code={
                "pnpm db:migrate\npnpm db:seed\npnpm contracts\npnpm contracts:check\npnpm db:down"
              }
            />
            <p className={s.commandNote}>
              迁移与示例数据、契约生成与漂移检查；db:down 停库并保留数据卷。
            </p>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}
