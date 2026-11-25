# Codex 项目入口

`hooks.json` 通过相对软链接加载 [共享 Hook 配置](../.agents/hooks/hooks.json)。编辑后的格式化行为、项目与 Hook 信任要求、验证命令见 [Hook 说明](../.agents/hooks/README.md)。

`agents/` 沿用 my-ai-infra 管理的项目 Agent 适配入口；Hook 源文件独立维护在 `.agents/hooks/`。
