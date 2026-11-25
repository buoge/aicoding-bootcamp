# UI/UX Pro Max

项目级第三方 Skill，用于界面结构、视觉设计、交互、可访问性和技术栈建议。

- 入口：[SKILL.md](SKILL.md)。
- 来源：[nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/tree/56ea9cf174ed86786187daa9de0e6247cb0747e4/.claude/skills/ui-ux-pro-max)。
- 版本与完整性：[依赖锁](../../skills-lock.json)；许可：[MIT](LICENSE)。
- 数据来源和附属许可：[data/data-provenance.json](data/data-provenance.json)。
- 安装评测：[evals/install.md](evals/install.md)；上游测试：[scripts/tests/](scripts/tests/)。
- 本地维护：课程仓库维护者负责路径适配，上游负责检索数据和脚本。

依赖 Python 3 标准库，无需额外 Python 包。保留上游全部数据、引用和脚本，仅将入口中的 Claude 插件路径适配到项目 `.agents/skills/`，详细差异见依赖锁。

从项目根目录运行：

```bash
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus modal" --domain ux
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "education dashboard" --design-system
```

从其他目录运行时，使用脚本的绝对路径。检索输出作为设计建议；具体任务仍遵循用户要求和项目规范。
