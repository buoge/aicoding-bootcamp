# 编辑后自动格式化

由 Compass 项目维护。唯一配置源为 [hooks.json](hooks.json)，执行脚本为 [format-edited.mjs](format-edited.mjs)。两个工具入口通过相对软链接复用配置：

| 工具        | 自动加载入口                                           | 编辑事件                                                          |
| ----------- | ------------------------------------------------------ | ----------------------------------------------------------------- |
| Claude Code | [`.claude/settings.json`](../../.claude/settings.json) | `PostToolUse` → `Edit` / `Write` / `MultiEdit`                    |
| Codex       | [`.codex/hooks.json`](../../.codex/hooks.json)         | `PostToolUse` → `apply_patch`（也支持 `Edit` / `Write` 匹配别名） |

## 启用

1. 按[根 README](../../README.md#本地启动)安装依赖；仅处理前端时只需 `pnpm install --frozen-lockfile`，Python 需要 `uv sync --locked --all-packages`。
2. 从 Compass 根目录或其子目录启动 Claude Code / Codex。已有会话重新启动，让客户端加载新增配置。
3. 在客户端的 `/hooks` 中确认 `PostToolUse`。Codex 要求项目可信，并要求审阅、信任新配置或已变更的 Hook；待信任的 Hook 会被跳过。保持 `features.hooks` 开启（当前默认开启）。Claude Code 也需完成其项目信任流程，且不能设置 `disableAllHooks: true`。

配置命令从会话工作目录向上寻找 Compass Hook，支持从 `apps/web` 等子目录启动；不会把上层课程 Git 根目录当作 Compass 根目录。若从课程根目录启动工具，需切换到 Compass 后重新开启会话，确保加载该项目配置。

## 执行边界

- 读取 Hook 的 JSON 标准输入，只处理该编辑事件给出的文件。Claude 使用 `tool_input.file_path`；Codex 从 `tool_input.command` 解析补丁新增、修改和移动后的路径。删除、目录、软链接及 Compass 外部路径跳过。
- 前端、配置、文档使用 `node_modules/prettier/bin/prettier.cjs --write --ignore-unknown`；Python / stub / notebook 使用 `.venv/bin/ruff format --force-exclude`。只运行已安装的项目工具，不下载依赖。
- 沿用[编码规范](../../docs/coding-style.md)、`.prettierrc.json`、`.prettierignore`、EditorConfig 和 Ruff 配置。排除目录、生成契约、分发素材保持原有规则；不支持的文件类型跳过。`.agents/` 本身沿用现有格式排除，维护 Hook 时需使用下方显式检查。
- 成功时无输出；缺少依赖、语法错误、格式化失败或单个格式化进程超过 20 秒时，以退出码 `2` 和具体错误反馈给 Agent。混合语言补丁会尝试两个格式化器，再汇总错误；编辑本身已经完成，Hook 不回滚编辑。
- 同步执行，下一次编辑前完成格式化。只调整排版，导入排序和 lint 修复仍按仓库命令执行。
- `Bash` / `exec_command`、外部编辑器和其他 MCP 写文件工具不在该匹配范围内；通过这些入口改文件时显式运行单文件格式化命令。CI 继续使用 `pnpm format:check`。

## 验证与维护

```bash
node --test scripts/format-hook.test.mjs
pnpm test:tooling
pnpm exec prettier --check --ignore-path /dev/null .agents/hooks .agents/README.md .claude/README.md .codex/README.md
```

测试使用隔离临时目录和项目已安装的真实 Prettier / Ruff，覆盖两端事件、多文件补丁、移动与删除、含空格及特殊字符的路径、子目录启动、排除规则、无关文件保护、缺失依赖和错误反馈。测试被现有 `pnpm test:tooling` / `pnpm check` 自动发现。

本次实现对照本机 `Claude Code 2.1.161`、`codex-cli 0.154.0-alpha.6.2` 的工具入口与官方事件契约。更老的 Codex 需先确认支持 `PostToolUse` 和项目 `.codex/hooks.json`。

官方接口参考：[Claude Code Hooks](https://code.claude.com/docs/en/hooks#posttooluse)、[Codex Hooks](https://learn.chatgpt.com/docs/hooks#posttooluse)。
