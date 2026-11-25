# Instructions

## 确认在工程根目录初始化了 claude code 和 speckit
我之前都是用 cursor 的 agent 还没有初始化，开始之前进入到项目的根目录然后 运行 specify init --here --ai claude 

## 演练一：实现一个 agent ，实现架构设计
你是一个 Python 开发的资深系统级工程师，可以进行优雅的架构设计，遵循Python哲学，并对并发异步web/grpc/数据库/大数据处理有深刻的理解

## 演练二：实现一个 slashcommand 的定义，code review command

帮我参照 @.claude/commands/speckit.specify.md 的结构，think ultra hard，构建一个对 Python 和 Typescript 代码进行深度代码审查的命令，放在 @.claude/commands/ 下。主要考虑几个方面：

- 架构和设计：是否考虑 python 和 typescript 的架构和设计最佳实践？是否有清晰的接口设计？是否考虑一定程度的可扩展性
- KISS 原则
- 代码质量：DRY, YAGNI, SOLID, etc. 函数原则上不超过 150 行，参数原则上不超过 7 个。
- 使用 builder 模式

## 演练三：review 代码

@agent-py-arch 仔细查看 ./w2/db_query/backend
的架构，重新考虑整体的设计，最好设计一套 interface，为以后添加更多数据库留有余地，不至于到处修改已有代码。设计要符合 Open-Close 和 SOLID 原则。

## Raflow spec format

将 @specs/w3/raflow/0001-spec.md 的内容组织成格式正确的 markdown 文件，不要丢失任何内容

## 演练 4：使用 google deepresearch 生成可行性报告用于 spec 描述

任务：探索 elevenlabs 实时 transcribe API （scribe v2 realtime）的 typescript 例子，然后构思如何实现一个类似 Wispr Flow 的工具。

要求：
1. app使用tauri2实现，
2. app打开后，常驻 systray，
3. 用户使用“cmd+shift+Y" hotkey 可以开启或者停止transcribing. 
4. 从 scribe v2 api 获得的文本插入到当前 active app 的光标的位置（如果当前光标位置不可输入，那么就在停止 transcribing 时，把内容拷贝到剪贴板，用户可以粘贴到想要的地方。



## 演练5：使用 spec 生成详细设计文档（花费 3 元）

根据 @specs/w3/raflow/0001-spec.md 的内容，进行系统的 web search 确保信息的准确性，确保使用最新版本的 dependencies。根据你了解的知识，构建一个详细的设计文档，放在 ./specs/w3/raflow/0002-design.md 文件中，输出为中文，使用 mermaid 绘制架构，设计，组件，流程等图表并详细说明。


## 可选操作：生成更新的 design doc
仔细阅读目前 ./w3/raflow 的代码，think ultra hard，构建一个更新的 design doc，放在 ./specs/w3/raflow/0004-design.md 文件中，输出为中文，使用 mermaid 绘制架构，设计，组件，流程等图表并详细说明。

## 可选操作：生成分享的 ppt
帮我以 harry potter 系列内容，生成一个图文并茂，充满故事性的 slides，给10岁的孩子介绍语音转文字背后的 Al 技术，不少于30页。


## 总结
deeprearch 参考的信息来源五花八门，还有的是 csdn！ 这里的感悟是：首先要限制搜索的范围告诉它不要参考一些质量不高的网站，另外一方面要对内容进行整理和筛选。
人工确认后把内容放入到 notebookllm 中去生成 spec 这样进一步提炼生成内容的准确性。