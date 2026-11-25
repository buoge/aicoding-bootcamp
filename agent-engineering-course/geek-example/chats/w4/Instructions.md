# Instructions for week4

## Exercise 1: Generate codex's architecture document
仔细阅读 https://github.com/openai/codex 的代码，撰写一个详细的架构分析文档，如需图表，使用 mermaid chart。文档放在: ./specs/w4/codex-arch-by-codex.md

## Exercise 2: Analyze codex's event loop
帮我梳理 codex 代码处理事件循环的部分详细解读当用户发起一个任务后codex 是如何分解处理这个任务并不断自我迭代最终完成整个任务。
这个过程中发生了什么codex 如何决定任务完成还是未完成需要继续迭代。如果需要，可以用 mermaid chart 来辅助说明。写入 ./specs/w4/codex-event-loop.md

## Exercise 3: open-notebook architecture analysis
仔细阅读 /vendor/open-notebook 的代码，撰写一个详细的架构分析文档，如需图表，使用 mermaid chart。文档放在: ./specs/w4/open-notebook-arch-design-by-qooder.md

## Exercise 4: learn from commit history(optional)
查看 repo 的所有 commit history，梳理其代码变更的脉络，必要时辅以 mermaid chart。 写入 ./specs/w4/codex-changes-by-claude.md

## codex apply_patch 
帮我梳理./vendors/codex 的 apply_patch 工具，详细解读 apply_patch 工具的原理，如何使用，如何实现，如何测试等等。以及 apply_patch 工具的代码是如何跟 codex 其他部分集成的，另外我注意到 apply_patch_tool_instructions.md 文件，这个文件是做什么的，如何跟 apply_patch crate 打交道。如果需要，可以用 mermaid chart 来辅助说明。写入
./specs/w4/codex-apply-patch.md

## apply_patch 
如果我要把 apply_patch 工具集成到我自己的项目中，我需要做哪些工作，如何做等等。如果需要，可以用 mermaid chart 来辅助说明。写入./specs/w4/codex-apply-patch-
integration.md

## opennotebook
git submodule add https://github.com/lfnovo/open-notebook vendors/open-notebook
- 通过最新的流行项目了解新技术动向
- 看他的语音生成模块是怎么实现的
- surrealdb 的新范式






