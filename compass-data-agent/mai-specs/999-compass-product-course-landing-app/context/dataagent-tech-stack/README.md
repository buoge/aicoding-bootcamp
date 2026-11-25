---
id: dataagent-tech-stack-page
title: DataAgent 技术栈宣传页
type: marketing-page
scope: course-v5
status: review
owner: guomeiqing
updated: 2026-09-16
---

# DataAgent 技术栈宣传页

[打开 HTML 页面](index.html)。内容包含项目场景、八层完整系统架构图、六组技术栈、Next.js BFF、Turborepo 目录与共享包规则、部署方案及选型说明。方案尚待运行工程验证，不代表现成产品能力。

## 目录归属

| 内容 | 位置 | 职责 |
|---|---|---|
| 会话选型审查与来源 | [research/shared/dataagent-technology-selection/](../../../research/shared/dataagent-technology-selection/README.md) | 跨课研究依据 |
| 系统架构 / 技术栈 / BFF / 部署 | [technical-architecture.md](../../../learner-kit/code/dataagent/technical-architecture.md) | 跨课项目技术设计唯一源 |
| 项目脚手架方案 | [scaffold-design.md](../../../learner-kit/code/dataagent/scaffold-design.md) | 运行工程结构、构建与发布约定 |
| 学员静态宣传页 | 本目录 | 课程传播表达 |
| 页面专用生成图像 | `visuals/` | 主视觉与架构概览，随页面分发 |
| 临时文件与中间图 | `work/dataagent-tech-stack/`、`work/dataagent-green-visuals/` | 可丢弃、不入 Git |

上述内容跨多课，不放单课 lessons；运行工程不会建立在课程根 src 下。当前并非 release，也未创建独立代码仓库。

## 设计与来源

- 内容上游：[V5 正式课](../../../course/curriculum/v5/course_outline.md)、[PRD](../../../learner-kit/code/dataagent/PRD.md)、[技术架构](../../../learner-kit/code/dataagent/technical-architecture.md)、[脚手架设计](../../../learner-kit/code/dataagent/scaffold-design.md)。技术决定先更新设计，再同步页面。
- 视觉参考为用户于 2026-09-16 提供的绿色课程长页：深绿首屏、白色 / 浅绿分区、紧凑课程信息、少量橙色。没有复制原图的肖像、品牌标识、招生数字或承诺；截图未纳入发布包。
- 文案依据 `de-ai-taste-studio` 审校，采用具体业务问题、技术职责、共享规则与阶段限制，删除泛化口号和同义卖点堆叠。未更改用户的全局品味配置。
- `index.html` 和 `styles.css` 是本页可编辑的表达源；网页渲染与发布包是派生产物。本宣传页保持静态 HTML；Next.js 是 DataAgent 产品工程的选型。
- 两张图使用内置 image_gen 生成。主视觉为 1536×1024；当前完整分层架构图为 1402×1122。两张均小于 5 MB，按治理可直接存 Git，本次未提交。完整图的实际请求与 QA 见 [分层架构生成记录](visuals/layered-generation-prompt.md)，校验值见 [manifest.yml](manifest.yml)。
- 设计采用八个横向逻辑层、独立的数据存储层、外部依赖区，以及安全治理 / 可观测评测侧栏。逻辑模块与独立部署应用分开标识；扩展 Apps、Action 写入、Kubernetes 均有后续 / 按需标记。准确运行关系与状态所有权以技术架构正文为准。
- 主视觉来源仍是 [绿色方案生成记录](visuals/green-generation-prompt.md)。该记录内的简版架构图请求，以及更早的 [生成记录](visuals/generation-prompt.md) 和 [修正记录](visuals/correction-prompt.md)，均保留为此前方案的来源，不对应当前完整架构图。

## 查看与携带

直接打开 index.html，或从课程仓库根运行：

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory marketing/copy/dataagent-tech-stack
```

访问 `http://127.0.0.1:8765/`。携带以下四个文件即可离线渲染：

- `index.html`
- `styles.css`
- `visuals/project-hero.png`
- `visuals/system-architecture.png`

页面使用本地图片、系统字体和原生 details；无需 JS 或构建器。架构图在窄屏保持可读宽度，支持键盘聚焦后横向滚动，也可打开原图放大。官方资料点击后才联网。生成记录和内部设计文档不必对外分发。

## 验证范围

2026-09-16：检查 HTML 锚点与资源、内部 Markdown 链接、manifest 路径、CSS 语法、图片尺寸 / SHA-256 与本地 HTTP 响应；生成图片进行了文字和架构语义检查。`git diff --check` 作为本轮提交前检查。没有进行浏览器自动化视觉 / 交互验收；运行工程尚未创建，未执行 Next.js、Turborepo、Python 技术栈集成验收。

页面和设计继续保持 `review`，未注册或发布外部网站。
