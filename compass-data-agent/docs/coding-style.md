# 编码规范与格式化

Compass 的规则由以下配置执行，`pnpm check` 和 CI 使用同一入口。

| 范围               | 工具与配置                                      | 约定                                                                                             |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| TypeScript / React | 两个前端的 `eslint.config.mjs`、`tsconfig.json` | Next Core Web Vitals、React / Hooks、TypeScript 推荐规则；TypeScript `strict`；ESLint 零 warning |
| 前端与工程配置格式 | 根 [`.prettierrc.json`](../.prettierrc.json)    | 2 空格、双引号、分号、尾逗号、箭头参数括号，目标行宽 100                                         |
| Python             | 根 [`pyproject.toml`](../pyproject.toml)        | Python 3.13；Ruff `E / F / I / UP / B`；4 空格、双引号、行宽 100；Pyright `standard`             |
| 跨编辑器基础风格   | 根 [`.editorconfig`](../.editorconfig)          | UTF-8、LF、文件末尾换行、删除行尾空格；默认 2 空格，Python 4 空格；保留 Markdown 硬换行          |
| VS Code / Cursor   | [`.vscode/`](../.vscode/README.md)              | 保存时格式化、ESLint 安全修复、Ruff 安全修复与导入排序                                           |

ESLint 负责代码质量，Prettier 负责前端排版；两个 ESLint 配置末尾接入 `eslint-config-prettier/flat`，关闭与格式化冲突的规则。Python 由 Ruff 同时提供 lint、导入排序和格式化，无需额外安装 Black 或 isort。Python 类型检查仍由 Pyright 提供。

## 日常命令

从 Compass 根目录执行：

```bash
pnpm format             # 自动格式化前端、配置、文档及 Python
pnpm format:check       # 只检查格式，不改文件；已纳入 pnpm check
pnpm format:frontend    # 仅 Prettier，无需 Python 环境
pnpm format:python      # 仅 Ruff format
pnpm lint               # 各应用 ESLint / Ruff 检查；API 同时检查格式
pnpm lint:tooling       # 根 scripts/ 下的 Python 工程脚本
pnpm typecheck          # TypeScript strict + Pyright standard
pnpm check              # 格式、脚本 lint、契约、边界、应用 lint、类型和测试
```

`lint` / `typecheck` 沿用 `-F home`、`-F web`、`-F agent`、`-F memory`、`-F worker` 应用筛选。离线数据工具使用 `-F data-seed`，同样纳入根 `pnpm check`。`format*` 是根工作区命令，不接受应用筛选；只处理单文件时使用以下入口：

```bash
pnpm exec prettier --write apps/web/src/app/page.tsx
uv run --locked ruff format apps/agent/src/compass_agent/main.py
pnpm --filter @compass/web exec eslint . --fix
uv run --locked ruff check apps/agent --fix
```

`format` 只调整排版；未使用变量、React Hooks 违规等仍需按 lint 提示修复。Ruff 的导入排序由 `ruff check --fix` 或编辑器保存动作执行。

Claude Code / Codex 的编辑工具通过 [共享 `PostToolUse` Hook](../.agents/hooks/README.md) 自动格式化当前编辑文件，直接调用已安装的 Prettier / Ruff 并保留本页的排除规则。Shell 脚本等其他写入入口继续显式运行上面的单文件命令。配置加载、信任与测试入口见 Hook 说明。

## 覆盖范围与配置维护

- Prettier 扫描自身支持的前端源码、配置与文档，排除项集中在 [`.prettierignore`](../.prettierignore)。依赖、构建输出、生成契约、外部输入、原型副本、数据目录和上游 React Bits 源文件保持原有格式；生成文件由生成器和 `contracts:check` 管理。
- Ruff 格式检查扫描工程内的 Python；应用 lint 覆盖 API 源码、测试和两套迁移目录，`lint:tooling` 补充根脚本。根 `pyproject.toml` 是共享规则源；新 Python 子项目若新增 `[tool.ruff]`，须通过 `extend` 显式继承根配置。
- Prettier、ESLint 集成包通过 `pnpm-lock.yaml` 固定，Ruff 通过 `uv.lock` 固定。编辑器使用工程本地版本；完整安装见 [根 README](../README.md#本地启动)。
- 新 TypeScript / React 应用应沿用上述 ESLint 预设、Prettier 冲突处理及 `strict` 检查，并提供 `lint` / `typecheck` / `test` 入口。修改风格配置后运行 `pnpm format`、`pnpm check`。
- 格式检查直接运行，始终检查当前文件；Turbo 的全局依赖包含共享风格配置，配置变化会使应用任务缓存失效。

工具行为参考：[Prettier 与 lint 集成](https://prettier.io/docs/integrating-with-linters)、[Ruff 配置继承](https://docs.astral.sh/ruff/configuration/)。
