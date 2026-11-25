# Instructions

![演示图片](project_alpha_screenshot.png)

## 准备环境

1. 安装 claude-code 确保能运行
2. 安装 postgrey 确保能运行
3. 安装 cursor 确保可以试用或购买试用账号，这一步搞了半天购买账号然后激活
4. 创建项目文件目录
5. 基于cursor的 agent模式，使用 composer1 模型完成对话

## project-alpha 需求和设计文档（cursor中我使用的是 composer1 模型）

```
构建一个一个简单的，使用标签分类和管理 ticket 的工具。它基于 Postgres 数据库，使用 Fast API 作为后端，使用 Typescript/Vite/Vue3 作为前端。无需用户系统，当前用户可以：
- 创建/编辑/删除/完成/取消完成 ticket
- 添加/删除 ticket 的标签
- 按照不同的标签查看 ticket 列表
- 按 title 搜索 ticket
按照这个想法，帮我生成详细的需求和设计文档，放在 ./specs/w1/0001-spec.md 文件中，输出为中文。
```

## implementation plan

```
按照 ./specs/w1/0001-spec.md 中的需求和设计文档，生成一个详细的实现计划，放在 ./specs/w1/0002-implementation.md 文件中，输出位中文
```

## phase implementation

```
按照 ./specs/w1/0002-implementation.md 完成实现这个项目的 phase 1 代码
```

实现计划生成出来后增加如下信息：

- **项目名称**: Project Alpha - Ticket 管理系统
- **项目路径**: `./w1/project-alpha`

## seed sql

添加一个 seed.sql 里面放50 个 meaningful 的 ticket 和 十个 tags（包含 plantform tag 如 ios，project tag 如 viking，功能性 tag 如 autocomplete，等等）要求 seed 文件可以正确通过 psql 执行

## 优化UI

* 按照 apple website 的设计风格，think ultra hard，优化 UI 和 UX。
* 增加一个分页功能每页 15 条数据
* 请在列表页左侧添加按 状态和标签 快速过滤的功能
* 增加一个创建按钮，能够创建 ticket
