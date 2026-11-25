import { Braces, FileCheck2, GitBranch, Settings2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Disclosure } from "@/components/ui/disclosure";
import { CopyBlock } from "@/components/learning-tools";
import s from "./engineering-standards.module.css";

// This is a reader's map of existing checks, not a second set of engineering rules.
// Files and scripts in Compass remain the authority for each described mechanism.
const groups = [
  {
    id: "code",
    label: "代码与类型",
    icon: Braces,
    command: "pnpm format:check\npnpm lint\npnpm lint:tooling\npnpm typecheck",
    rows: [
      {
        name: "前端代码与类型",
        rule: "web / home 启用 Next Core Web Vitals、TypeScript ESLint 规则及 strict 类型检查。",
        files: [
          "apps/web/eslint.config.mjs",
          "apps/home/eslint.config.mjs",
          "apps/web/tsconfig.json",
          "apps/home/tsconfig.json",
        ],
        checks: ["pnpm lint", "pnpm typecheck"],
        mechanism: "分别执行 eslint . --max-warnings 0 与 next typegen + tsc --noEmit。",
      },
      {
        name: "前端代码美化",
        rule: "Prettier 统一 2 空格、双引号、分号、尾逗号与目标行宽 100；ESLint 配置排除格式冲突。",
        files: [".prettierrc.json", ".prettierignore", "package.json"],
        checks: ["pnpm format:check", "pnpm format:frontend"],
        mechanism:
          "Prettier 检查源码、配置和文档；格式不一致会使 check / CI 失败，format:frontend 自动修复。",
      },
      {
        name: "统一编辑器风格",
        rule: "EditorConfig 统一 UTF-8、LF、末尾换行；默认 2 空格，Python 4 空格，保留 Markdown 硬换行。",
        files: [".editorconfig", ".vscode/settings.json", ".vscode/extensions.json"],
        checks: ["pnpm format:check"],
        mechanism:
          "以 Compass 根目录打开 VS Code / Cursor，安装推荐扩展后，保存时格式化并执行 ESLint / Ruff 修复。",
      },
      {
        name: "Python 代码与格式",
        rule: "Ruff 启用 E / F / I / UP / B；目标 Python 3.13，4 空格、双引号、LF、行宽 100。",
        files: [
          "pyproject.toml",
          "apps/agent/package.json",
          "apps/memory/package.json",
          "apps/worker/package.json",
          "tools/data-seed/package.json",
        ],
        checks: ["pnpm lint", "pnpm lint:tooling", "pnpm format:python"],
        mechanism:
          "三个 Python App 与 data-seed 工具分别检查源码与测试；agent 管理应用迁移，data-seed 管理零售候选迁移；lint:tooling 检查根 Python 脚本，format:check 执行全工程 Python 格式检查。",
      },
      {
        name: "Python 类型",
        rule: "Pyright 使用 standard 模式，检查 agent / memory / worker 及 data-seed 源码与测试；运行时版本按 Python 3.13。",
        files: [
          "pyproject.toml",
          "apps/agent/package.json",
          "apps/memory/package.json",
          "apps/worker/package.json",
          "tools/data-seed/package.json",
        ],
        checks: ["pnpm typecheck -F agent -F memory -F worker -F data-seed"],
        mechanism:
          "各 Python workspace 执行 pyright --project ../../pyproject.toml src tests，共用根配置并限定自身范围。",
      },
    ],
    scope:
      "格式检查已纳入 pnpm check，ESLint 要求零 warning。排除项见 .prettierignore 与 pyproject.toml；生成契约、外部输入及上游素材保留原格式。format 命令会改写文件。",
  },
  {
    id: "contracts",
    label: "契约与边界",
    icon: GitBranch,
    command: "pnpm contracts:check\nuv run --locked python scripts/check-workspace.py",
    rows: [
      {
        name: "接口契约单一来源",
        rule: "Pydantic DTO 与 FastAPI 路由生成 OpenAPI、JSON Schema 和 Web TypeScript；派生文件不手改。",
        files: [
          "apps/agent/src/compass_agent/schemas.py",
          "scripts/export-contracts.py",
          "scripts/contracts.mjs",
          "apps/web/src/lib/overview.ts",
        ],
        checks: ["pnpm contracts:check", "pnpm test -F @compass/web"],
        mechanism:
          "生成到临时目录后逐字节比对；Web 用 Ajv 校验响应，测试拒绝错误版本、类型、金额和额外字段。",
      },
      {
        name: "工作区依赖与 App 边界",
        rule: "Python 的 uv workspace 内部依赖与 package.json 声明一致；已配置的跨 App 源码导入受限。",
        files: [
          "pyproject.toml",
          "pnpm-workspace.yaml",
          "scripts/check-workspace.py",
          "apps/web/eslint.config.mjs",
        ],
        checks: ["pnpm check"],
        mechanism:
          "脚本比对依赖图并扫描 Python import；Web 的 no-restricted-imports 禁止 agent、memory、worker 的 app 路径。",
      },
    ],
    scope:
      "“至少两个独立 App 消费才提取共享包”写在 packages/README.md，靠评审执行。当前脚本未覆盖任意 JS / TS 跨 App 导入，也未检测全部依赖环。",
  },
  {
    id: "environment",
    label: "环境与数据",
    icon: Settings2,
    command: "pnpm test:tooling\npnpm test -F @compass/agent",
    rows: [
      {
        name: "工具链与锁文件",
        rule: "Node / Python 版本文件、pnpm packageManager 与双端锁文件登记工具链；CI 固定 pnpm 和 uv 版本。",
        files: [
          ".node-version",
          ".python-version",
          "package.json",
          "pnpm-lock.yaml",
          "uv.lock",
          "../../../.github/workflows/compass.yml",
        ],
        checks: ["pnpm install --frozen-lockfile", "uv sync --locked --all-packages"],
        mechanism:
          "锁定安装用于本地基线与 CI；安装配置漂移时失败。doctor 检查命令可用性并打印版本。",
      },
      {
        name: "环境加载与任务缓存",
        rule: "根任务入口为开发、数据库管理和指定集成测试加载本地 .env；缓存检查与 Docker 部署不主动加载它，运行任务不缓存。",
        files: [
          "scripts/tasks.mjs",
          "turbo.json",
          "apps/agent/turbo.json",
          "apps/memory/turbo.json",
          "apps/worker/turbo.json",
          ".gitignore",
          "scripts/tasks.test.mjs",
        ],
        checks: ["pnpm test:tooling"],
        mechanism:
          "测试五个 App 的短名筛选、环境隔离和任务依赖；Python 工具链指纹覆盖 agent / memory / worker，Web 构建依赖契约，home 独立于 Python。",
      },
      {
        name: "迁移顺序与幂等 seed",
        rule: "各 App 独立维护迁移；Agent 使用 Alembic。部署先等数据库就绪，再执行所属迁移与 Agent seed，成功后启动应用。",
        files: [
          "apps/agent/alembic.ini",
          "apps/agent/migrations/",
          "apps/web/db/main/",
          "scripts/deploy.mjs",
          "deploy/compose/compose.yaml",
          "apps/agent/tests/test_api.py",
        ],
        checks: ["pnpm test -F @compass/agent", "pnpm db:migrate", "pnpm db:seed"],
        mechanism:
          "单测重复 seed 两次，检查金额、订单量和天数；PostgreSQL 迁移链路由 CI 容器启动及 smoke 验证。",
      },
    ],
    scope:
      "doctor 不做严格版本比对；.gitignore 忽略 .env 不等于密钥扫描。API 单测使用 SQLite，不能替代 PostgreSQL 集成验收。db:migrate / db:seed 会修改本地数据库。",
  },
  {
    id: "verification",
    label: "测试与 CI/CD",
    icon: FileCheck2,
    command:
      "pnpm check\npnpm build\n# 本机 Docker：全部五个应用\npnpm run deploy\n# 仅更新 home 时，将上一条替换为 pnpm run deploy home\npnpm deploy:status",
    rows: [
      {
        name: "单测与检查总入口",
        rule: "Web 用 Vitest，agent / memory / worker 和 data-seed 用 pytest，home 和任务脚本用 Node test；根 check 串联五个 App 与离线工具的工程检查。",
        files: [
          "package.json",
          "apps/web/vitest.config.ts",
          "pyproject.toml",
          "apps/home/package.json",
          "scripts/tasks.test.mjs",
        ],
        checks: ["pnpm check"],
        mechanism:
          "任务脚本测试 → 格式与脚本 lint → 契约漂移 → workspace 边界 → 各 App 的 lint、类型和单测；失败返回非零状态。",
      },
      {
        name: "CI 构建与运行链路",
        rule: "课程仓库 workflow 在匹配路径的 push / PR 及手动触发时运行；包含检查、构建和容器验收。",
        files: [
          "../../../.github/workflows/compass.yml",
          "deploy/compose/compose.yaml",
          "scripts/smoke.mjs",
        ],
        checks: ["pnpm check", "pnpm build", "pnpm run deploy"],
        mechanism:
          "锁定安装 → check → build → 复用部署入口启动五个应用并 smoke → Web PostgreSQL 与浏览器验收；失败收集日志，结束后清理容器并保留卷。",
      },
      {
        name: "CD 本机确定性部署",
        rule: "不传参数部署五个应用，传一个 App 名称只更新该应用；固定本机 Docker 与 Compose 项目，保留数据库卷。",
        files: [
          "package.json",
          "scripts/deploy.mjs",
          "deploy/compose/compose.yaml",
          "deploy/containers/",
          "scripts/deploy.test.mjs",
        ],
        checks: ["pnpm run deploy", "pnpm run deploy web", "pnpm test:tooling"],
        mechanism:
          "预检端口与数据库 → 检查 Web 契约 / 准备 home 素材 → 构建镜像 → 停止所选应用 → 执行所属迁移 → 启动并等待健康检查 → smoke。Worker 另检查进程存活；任一步失败退出非零。",
      },
      {
        name: "部署状态与失败恢复",
        rule: "构建失败保留旧应用；迁移失败保留数据和现场，修复后重跑。部署锁防止并发执行，停止命令保留卷与镜像。",
        files: [
          "scripts/deploy.mjs",
          "scripts/smoke.mjs",
          "scripts/smoke.test.mjs",
          "deploy/README.md",
        ],
        checks: ["pnpm deploy:status", "pnpm deploy:logs web", "pnpm deploy:down"],
        mechanism:
          "status 查看容器状态，logs 查看最近 100 行日志；两者支持指定 App。down 停止整个项目。部署 smoke 固定本机地址；端口被开发服务占用时提前失败，不自动结束进程。",
      },
    ],
    scope:
      "CI 文件位于课程仓库根目录，包含 Web PostgreSQL 与浏览器 E2E 验收。CD 当前覆盖本机 Docker，尚未配置远程环境自动发布；pnpm 自带 deploy 命令，项目部署必须使用 pnpm run deploy。部署会执行迁移并短暂停止所选应用，不提供自动数据库回滚。覆盖率阈值与 PR 分支保护按仓库策略另行配置。",
  },
];

export function EngineeringStandards() {
  return (
    <Tabs defaultValue="code" className={s.standards}>
      <TabsList className={s.tabs} aria-label="工程规范分类">
        {groups.map(({ id, label, icon: Icon }) => (
          <TabsTrigger value={id} key={id}>
            <Icon size={17} aria-hidden="true" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {groups.map((group) => (
        <TabsContent value={group.id} key={group.id} className={s.panel}>
          <table className={s.table}>
            <caption className="sr-only">
              {group.label}：已落实规范、规则文件与检查机制。文件路径相对 Compass 根目录。
            </caption>
            <thead>
              <tr>
                <th scope="col">已落实的规范</th>
                <th scope="col">规则与配置文件</th>
                <th scope="col">检查机制</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">
                    <strong>{row.name}</strong>
                    <p>{row.rule}</p>
                  </th>
                  <td data-label="规则与配置文件">
                    <ul className={s.files}>
                      {row.files.map((file) => (
                        <li key={file}>
                          <code>{file}</code>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td data-label="检查机制">
                    <div className={s.checks}>
                      {row.checks.map((command) => (
                        <code key={command}>{command}</code>
                      ))}
                    </div>
                    <p>{row.mechanism}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={s.footer}>
            <Disclosure density="compact" title="执行范围与人工约定">
              <p>{group.scope}</p>
            </Disclosure>
            <Disclosure density="compact" className={s.commands} title="复制本组命令">
              <CopyBlock title={`${group.label}命令`} code={group.command} />
              <p>在 Compass 根目录执行。</p>
            </Disclosure>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
