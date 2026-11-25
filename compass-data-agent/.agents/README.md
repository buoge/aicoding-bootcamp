# Compass AI 资产

`hooks/` 提供 Claude Code 与 Codex 共用的[编辑后自动格式化](hooks/README.md)，使用项目已安装的 Prettier / Ruff，仅处理当前编辑事件涉及的文件。配置通过 `.claude/settings.json` 和 `.codex/hooks.json` 软链接加载。

`skills/` 提供 Compass 的项目级 Skill 入口。现有 `my-*` 资产由项目的 my-ai-infra 配置维护；UI Skill 按锁定版本随本次发布分发。

| Skill                                              | 用途                               |
| -------------------------------------------------- | ---------------------------------- |
| [shadcn](skills/shadcn/SKILL.md)                   | shadcn/ui 组件、样式与设计系统     |
| [ui-ux-pro-max](skills/ui-ux-pro-max/SKILL.md)     | UI/UX 检索、配色、排版和技术栈建议 |
| [emil-design-eng](skills/emil-design-eng/SKILL.md) | 界面细节、交互与动画设计           |

上述三个 Skill 的版本、文件校验值和路径适配登记在 [skills-lock.json](skills-lock.json)，许可证和评测随各 Skill 保留。

从 Compass 根目录检查 UI/UX 检索：

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus modal" --domain ux
```

这三个 Skill 独立于当前 my-ai-infra 库的选择清单维护。本次独立发布已将课程级相对链接展开为锁定版本的文件。
