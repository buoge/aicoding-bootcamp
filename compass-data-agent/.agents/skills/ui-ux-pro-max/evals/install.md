# 项目路径适配验收

目的：确认项目级安装可直接检索，且从其他工作目录调用时能找到随附数据。

在项目根目录执行 README 中的两条命令，再从临时目录用脚本绝对路径执行第一条。命令不加 `--persist`，不生成设计产物。

| 输入 | 通过标准 |
|---|---|
| `keyboard focus modal --domain ux --json` | 退出码为 0，`domain` 为 `ux`，`count` 大于 0，结果包含键盘或焦点相关指导 |
| `education dashboard --design-system --json` | 退出码为 0，`design_system` 含非空设计建议，`persistence` 为 null |
| 从临时目录使用绝对路径执行同一 UX 检索 | 与项目根目录检索的结构化输出一致 |
| 入口中的每一条检索命令 | 脚本路径可解析到本目录；无 `CLAUDE_PLUGIN_ROOT` 依赖 |

以上为安装和路径行为验收。实际界面的视觉质量、交互体验和辅助技术表现需在对应任务中单独评审。
