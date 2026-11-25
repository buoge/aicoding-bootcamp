import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Blocks,
  BookOpen,
  CalendarCheck,
  Code2,
  FileText,
  FolderGit2,
  MessageSquareText,
  Terminal,
} from "lucide-react";
import { StoryPage } from "@/components/story-page";
import { Disclosure } from "@/components/ui/disclosure";
import { CopyBlock, FAQ, ReadinessChecklist } from "@/components/learning-tools";
import s from "@/components/engineering-story.module.css";
import l from "./learning.module.css";

export const metadata: Metadata = {
  title: "学习指南",
  description:
    "从第四篇开始，基于 Compass 脚手架逐步完成 Agent。了解授课模式、课前准备、SDD 练习、随课资料和四次作业检查点。",
};
const chapters = [
  ["rhythm", "授课模式"],
  ["ready", "课前准备"],
  ["materials", "随课资料"],
  ["assignment", "作业与检查点"],
  ["submission", "提交方案"],
] as const;

export default function LearningPage() {
  return (
    <StoryPage chapters={chapters} label="学习指南章节">
      <section
        id="rhythm"
        data-chapter
        className={`${s.screen} ${s.mist}`}
        aria-labelledby="rhythm-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>学习指南 · 授课模式</p>
            <h1 id="rhythm-title">
              每节课补上一块拼图，
              <br />
              <em>让 Agent 完整跑起来。</em>
            </h1>
            <p className={s.lead}>
              从第四篇开始到最后一篇，我们会基于给定的 Compass 脚手架，
              <br />
              逐课完成设计、实现与验证，把各项能力拼成完整的系统。
            </p>
          </header>
          <div className={l.lessonSplit}>
            <article>
              <div className={l.partLabel}>
                <BookOpen aria-hidden="true" />
                <span>前半节 · 理解与设计</span>
              </div>
              <h2>先讲清这节课要解决的问题</h2>
              <p>学习相关知识，讨论技术选型与架构考量，形成当课的设计方案。</p>
              <div className={l.topics}>
                <span>问题与知识</span>
                <span>技术选型</span>
                <span>架构考量</span>
                <span>设计方案</span>
              </div>
            </article>
            <article>
              <div className={l.partLabel}>
                <Terminal aria-hidden="true" />
                <span>后半节 · IDE 实战</span>
              </div>
              <h2>再把方案落到实际代码里</h2>
              <p>进入 IDE，讲解关键代码，演示实际的实现过程，运行并验证本课增量。</p>
              <div className={l.topics}>
                <span>代码讲解</span>
                <span>现场实现</span>
                <span>运行验证</span>
              </div>
            </article>
          </div>
          <ol className={l.journey} aria-label="贯穿课程的实现路径">
            <li>
              <Blocks aria-hidden="true" />
              <span>给定脚手架</span>
            </li>
            <li>
              <Code2 aria-hidden="true" />
              <span>逐课补齐能力</span>
            </li>
            <li>
              <CalendarCheck aria-hidden="true" />
              <span>完整运行 Agent</span>
            </li>
          </ol>
          <div className={l.actions}>
            <Link className="ghost-control" href="#ready">
              查看课前任务 <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
      <section
        id="ready"
        data-chapter
        className={`${s.screen} ${s.white}`}
        aria-labelledby="ready-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>课前准备 · 环境与第一次开发</p>
            <h2 id="ready-title">
              跑通 Compass，<em>完成一个小 Feature。</em>
            </h2>
            <p className={s.lead}>
              开课前，请完成下面的任务。逐项验证后勾选，准备进度保存在当前浏览器。
            </p>
          </header>
          <div className={l.preparation}>
            <ReadinessChecklist />
            <div className={l.preparationDetails}>
              <Disclosure title="硬件与软件：逐项确认可用">
                <dl className={l.requirements}>
                  <div>
                    <dt>硬件</dt>
                    <dd>
                      确认电脑支持并已启用容器所需的虚拟化；预留可用内存与磁盘，能够同时运行
                      IDE、浏览器和 Docker 服务。
                    </dd>
                  </div>
                  <div>
                    <dt>操作系统</dt>
                    <dd>macOS / Linux；Windows 使用 WSL2，在同一环境中安装工具与运行项目。</dd>
                  </div>
                  <div>
                    <dt>基础工具</dt>
                    <dd>
                      Git、Node.js 24、pnpm 11.3.0、uv 0.13.0；Python 由 uv
                      按项目版本文件准备。版本以仓库配置和锁文件为准。
                    </dd>
                  </div>
                  <div>
                    <dt>Docker</dt>
                    <dd>
                      安装并启动 Docker Desktop / Docker Engine，确认 Docker Compose
                      可用，能启动项目的 PostgreSQL 容器。
                    </dd>
                  </div>
                  <div>
                    <dt>DBeaver</dt>
                    <dd>
                      安装数据库客户端，按本地配置连接 PostgreSQL。项目默认地址为
                      127.0.0.1:55432，库名与账号以自己的 .env 为准。
                    </dd>
                  </div>
                  <div>
                    <dt>AI Coding</dt>
                    <dd>
                      准备可用的 AI Coding 工具与账号，在 IDE 或终端中打开
                      Compass，确认可以读取项目、修改代码和执行检查。
                    </dd>
                  </div>
                </dl>
                <Link className={l.textLink} href="/scaffold#environment">
                  查看环境与完整启动步骤 <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </Disclosure>
              <Disclosure title="my-ai-infra：安装并接入项目">
                <p className={l.detailCopy}>
                  安装工具后，在 Compass 根目录按项目配置接入自己的 Coding 工具，确认能使用 SDD
                  Skill。
                </p>
                <CopyBlock
                  title="安装 my-ai-infra"
                  code={
                    "npm install --global @easyuseai/my-ai-infra\n# 在 Compass 根目录执行\nmai init"
                  }
                />
                <p className={l.detailCopy}>
                  已有配置时先查看配置与命令提示，保留自己的资产。具体接入方式见工具使用指南。
                </p>
                <a
                  className={l.textLink}
                  href="https://github.com/shanggqm/my-ai-infra"
                  target="_blank"
                  rel="noreferrer"
                >
                  my-ai-infra 使用指南 <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </Disclosure>
              <Disclosure title="Compass：运行并验证完整链路">
                <p className={l.detailCopy}>
                  按脚手架页完成依赖安装、环境检查、数据库迁移与初始化，再启动系统。
                </p>
                <ul className={l.bulletList}>
                  <li>Home 官网：127.0.0.1:3001。</li>
                  <li>Web 工作台：127.0.0.1:3000，点击“查看示例数据”。</li>
                  <li>API 文档：127.0.0.1:8000/docs。</li>
                  <li>DBeaver 能连接数据库并查看示例表。</li>
                </ul>
                <CopyBlock
                  title="运行后的链路验收"
                  code={"# 保持服务运行，另开终端执行\npnpm smoke"}
                />
                <Link className={l.textLink} href="/scaffold#start">
                  查看完整工程启动步骤 <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </Disclosure>
              <article id="practice" className={l.exercise}>
                <div className={l.partLabel}>
                  <CalendarCheck aria-hidden="true" />
                  <span>课前练习 · 最小 SDD Feature</span>
                </div>
                <h3>给 Home App 增加学习打卡工具</h3>
                <p>用一次小功能开发，走通需求、设计、实现与验收。复用现有页面的视觉和交互规范。</p>
                <Disclosure title="展开练习范围与验收要求" density="compact">
                  <ul className={l.bulletList}>
                    <li>记录所学课次、学习日期与一句学习收获。</li>
                    <li>能够查看打卡历史，刷新页面后记录仍保留。</li>
                    <li>
                      最小版本可保存在当前浏览器，说明保存范围，并处理空输入、重复操作与保存失败。
                    </li>
                    <li>保留需求说明、技术方案、相关 Prompt 与验收记录，能够演示自己的实现。</li>
                  </ul>
                  <Link className={l.textLink} href="/scaffold#workflow">
                    查看 SDD 研发流程 <ArrowRight size={15} aria-hidden="true" />
                  </Link>
                </Disclosure>
              </article>
            </div>
          </div>
        </div>
      </section>
      <section
        id="materials"
        data-chapter
        data-ghost-theme="dark"
        className={`${s.screen} ${s.dark}`}
        aria-labelledby="materials-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>随课资料 · 第四章及后续课程</p>
            <h2 id="materials-title">
              从问题到代码，<em>有材料可以对照。</em>
            </h2>
            <p className={s.lead}>
              进入第四章的实战阶段后，每节课可能按需要提供以下资料，帮助大家理解任务、动手实现和课后复盘。
            </p>
          </header>
          <div className={l.materials}>
            {[
              {
                icon: FileText,
                title: "需求文档",
                text: "说明当课要解决的问题、功能范围与验收要求，明确这一块拼图要完成什么。",
              },
              {
                icon: MessageSquareText,
                title: "Prompt 示例",
                text: "提供完成任务时可参考的提示词，展示如何组织上下文、表达约束和引导 AI 协作。",
              },
              {
                icon: Code2,
                title: "老师的源代码",
                text: "用于对照关键实现、运行课堂示例，理解设计方案如何落到具体模块。",
              },
              {
                icon: FolderGit2,
                title: "本课 SDD 资产",
                text: "保留本课相关的规格、设计、评审与验收材料，理解一次开发从需求到交付的过程。",
              },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
          <div className={l.materialNote}>
            <span>课前读需求</span>
            <ArrowRight aria-hidden="true" />
            <span>课中看实现</span>
            <ArrowRight aria-hidden="true" />
            <span>课后对照资产</span>
          </div>
          <p className={s.footnote}>
            具体资料以当课实际发布为准；各课提供的材料类型与完整程度可能不同。
          </p>
        </div>
      </section>
      <section
        id="assignment"
        data-chapter
        className={`${s.screen} ${s.white}`}
        aria-labelledby="assignment-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>作业与检查点</p>
            <h2 id="assignment-title">
              用阶段作业，<em>检验系统的成长。</em>
            </h2>
            <p className={s.lead}>
              整个课程设置四次作业与检查点。从第四章开始，原则上每章结束安排一次作业，让本章新增能力在自己的系统里运行起来。
            </p>
          </header>
          <div className={l.checkpoints}>
            <div className={l.checkpointCount}>
              <strong>4</strong>
              <span>次作业与检查点</span>
            </div>
            <ol aria-label="四次作业检查点">
              {["01", "02", "03", "04"].map((n) => (
                <li key={n}>
                  <span>{n}</span>
                  <strong>检查点 {n}</strong>
                </li>
              ))}
            </ol>
          </div>
          <div className={l.deliverables}>
            <article>
              <Code2 aria-hidden="true" />
              <h3>提交自己的可运行系统</h3>
              <p>
                把本章能力集成到 Compass，保留启动说明、代码版本和运行结果，演示实际完成的功能。
              </p>
            </article>
            <article>
              <FolderGit2 aria-hidden="true" />
              <h3>提交配套的 SDD 资产</h3>
              <p>保留需求、设计、相关 Prompt、评审与验收记录，让实现过程和设计选择有据可查。</p>
            </article>
          </div>
          <p className={s.footnote}>
            四次检查点的具体章节对应、任务要求与时间安排，将随课程进一步说明。
          </p>
        </div>
      </section>
      <section
        id="submission"
        data-chapter
        className={`${s.screen} ${s.sage}`}
        aria-labelledby="submission-title"
      >
        <div className={s.inner}>
          <header className={s.heading}>
            <p className={s.kicker}>提交方案 · 待定</p>
            <h2 id="submission-title">
              先保留成果，<em>提交方式后续公布。</em>
            </h2>
            <p className={s.lead}>
              提交渠道、材料组织方式、截止时间与反馈安排，将在方案确定后统一说明。
            </p>
          </header>
          <div className={l.submissionNote}>
            <FileText aria-hidden="true" />
            <div>
              <h3>现在可以先做好这些事</h3>
              <p>
                保存可运行的代码版本、环境与启动说明，以及对应的 SDD
                资产和验收结果。收到正式提交说明后，再按要求整理交付。
              </p>
            </div>
          </div>
          <div id="collaboration" className={l.faq}>
            <FAQ
              items={[
                {
                  question: "如何同步老师后续提供的代码？",
                  answer:
                    "同步前先保存自己的工作并记录代码版本；阅读变更说明，比较本课增量与自己的实现，再按需要合并。同步后执行相关检查，确认已有能力仍然可运行。",
                },
                {
                  question: "遇到问题时，怎样让老师更容易定位？",
                  answer:
                    "保留课次、代码版本、环境信息、复现步骤、预期与实际结果，以及必要的报错日志。先缩小到一个可复现的问题，分享前移除密钥与个人信息。具体反馈渠道随提交方案公布。",
                },
              ]}
            />
          </div>
          <div className={l.actions}>
            <Link className="ghost-control" href="/scaffold">
              查看项目脚手架 <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="ghost-control" href="/course">
              查看课程任务 <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </StoryPage>
  );
}
