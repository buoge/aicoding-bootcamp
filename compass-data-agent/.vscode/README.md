# 编辑器配置

以 Compass 根目录打开 VS Code / Cursor，安装 `extensions.json` 推荐扩展。
`settings.json` 配置保存时格式化、ESLint 修复及 Ruff 导入排序；Python 使用 `pnpm setup` 安装的 `.venv`。
编辑器固定按 `editor.wordWrapColumn` 指定的目标列数折行显示（当前为 200 列），不随视口宽度变化，源码不插入换行。

跨编辑器基础风格由 [EditorConfig](../.editorconfig) 定义。完整规则、命令与排除范围见 [编码规范](../docs/coding-style.md)。
以课程仓库根目录打开编辑器时，这里的工作区设置不会自动生效；可把 Compass 添加为独立 workspace folder。
