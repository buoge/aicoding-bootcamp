import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, Blocks, Braces, CheckCheck, GitBranch } from "lucide-react";
import { StoryPage } from "@/components/story-page";
import { CourseExplorer } from "@/components/course-explorer";
import { Disclosure } from "@/components/ui/disclosure";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  courseChapters,
  promptDeliverables,
  type CourseChapter,
  type Output,
} from "@/lib/course-map";
import { courseName } from "@/lib/content";
import s from "./course.module.css";

export const metadata: Metadata = {
  title: "课程任务地图",
  description:
    "第四篇至第十篇，每篇一个独立任务模块。逐课查看工程模块、Prompt 与策略、Skill、演示场景和验收产出，搜索并导出完整清单。",
};
const chapters = [
  ["overview", "课程产出全景"],
  ...courseChapters.map((chapter) => [chapter.id, `${chapter.ordinal} · ${chapter.name}`] as const),
  ["task-ledger", "搜索与导出"],
] as const;

function Assets({ output }: { output: Output }) {
  return (
    <>
      <div className={s.assets}>
        {output.assets.map((asset) => (
          <code key={asset}>{asset}</code>
        ))}
      </div>
      <p className={s.work}>{output.work}</p>
    </>
  );
}

function ChapterLanding({ chapter }: { chapter: CourseChapter }) {
  const last = chapter.lessons.at(-1)!.number;
  return (
    <section
      id={chapter.id}
      data-chapter
      className={`${s.screen} ${chapter.number % 2 ? s.mist : s.white}`}
      aria-labelledby={`${chapter.id}-title`}
    >
      <div className={s.inner}>
        <header className={s.chapterHeader}>
          <span className={s.chapterNumber} aria-hidden="true">
            {String(chapter.number).padStart(2, "0")}
          </span>
          <div>
            <p className={s.kicker}>
              {chapter.ordinal} · 第 {chapter.lessons[0].number}–{last} 课{" "}
              <span>{chapter.english}</span>
            </p>
            <h2 id={`${chapter.id}-title`}>{chapter.name}</h2>
            <p className={s.headline}>{chapter.headline}</p>
            <p className={s.description}>{chapter.description}</p>
          </div>
        </header>
        <Tabs defaultValue="map" className={s.chapterTabs}>
          <TabsList variant="line" className={s.tabs} aria-label={`${chapter.ordinal}任务视图`}>
            <TabsTrigger value="map">产出地图</TabsTrigger>
            <TabsTrigger value="lessons">逐课任务 · {chapter.lessons.length}</TabsTrigger>
            <TabsTrigger value="demo">演示与验收</TabsTrigger>
            {chapter.supplements.length > 0 && (
              <TabsTrigger value="supplements">工程补齐 · {chapter.supplements.length}</TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="map">
            <div className={s.lanes}>
              <div className={s.lane}>
                <h3>
                  <Blocks aria-hidden="true" /> 工程产出 <span>模块 · 契约 · 执行机制</span>
                </h3>
                <ol className={s.outputs}>
                  {chapter.lessons.map((lesson) => (
                    <li key={lesson.number}>
                      <span className={s.lessonNumber}>{lesson.number}</span>
                      <div>
                        <Assets output={lesson.engineering} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
              <div className={s.lane}>
                <h3>
                  <Braces aria-hidden="true" /> Prompt / 策略 <span>提示词 · 规则 · 评测集</span>
                </h3>
                <ol className={s.outputs}>
                  {chapter.lessons.map((lesson) => (
                    <li key={lesson.number}>
                      <span className={s.lessonNumber}>{lesson.number}</span>
                      <div>
                        <Assets output={lesson.algorithm} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            {chapter.supplements.length > 0 && (
              <div className={s.supplementSummary}>
                <span>本篇工程补齐</span>
                <p>
                  {chapter.supplements.map((item) => item.title).join(" · ")}
                  <small>在“工程补齐”中查看完整任务。</small>
                </p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="lessons">
            <div className={s.lessonList}>
              {chapter.lessons.map((lesson) => (
                <Disclosure
                  key={lesson.number}
                  title={
                    <>
                      <span className={s.disclosureNumber}>第 {lesson.number} 课</span>
                      {lesson.title}
                    </>
                  }
                >
                  <div className={s.detailLanes}>
                    <div>
                      <h4>工程产出</h4>
                      <Assets output={lesson.engineering} />
                    </div>
                    <div>
                      <h4>Prompt / 策略</h4>
                      <Assets output={lesson.algorithm} />
                    </div>
                  </div>
                  <div className={s.acceptance}>
                    <CheckCheck aria-hidden="true" />
                    <p>
                      <strong>验收任务</strong>
                      {lesson.acceptance}
                    </p>
                  </div>
                </Disclosure>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="demo">
            <div className={s.scenarios}>
              {chapter.scenarios.map((scenario, index) => (
                <article key={scenario.title}>
                  <span className={s.scenarioNumber}>
                    场景 {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3>{scenario.title}</h3>
                  <p>{scenario.action}</p>
                  <div>
                    <CheckCheck aria-hidden="true" />
                    <p>
                      <strong>保留验收证据</strong>
                      {scenario.evidence}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className={s.acceptanceList}>
              {chapter.lessons.map((lesson) => (
                <p key={lesson.number}>
                  <span>第 {lesson.number} 课</span>
                  {lesson.acceptance}
                </p>
              ))}
            </div>
          </TabsContent>
          {chapter.supplements.length > 0 && (
            <TabsContent value="supplements">
              <p className={s.supplementNote}>
                为产品入口、成果交付与完整演示补充的实现任务，与课次产出共同组成系统。
              </p>
              <div className={s.supplements}>
                {chapter.supplements.map((item) => (
                  <article key={item.id}>
                    <h3>
                      {item.title}
                      <span>工程补齐</span>
                    </h3>
                    <div className={s.detailLanes}>
                      <div>
                        <h4>工程产出</h4>
                        <Assets output={item.engineering} />
                      </div>
                      <div>
                        <h4>Prompt / Skill</h4>
                        <Assets output={item.algorithm} />
                      </div>
                    </div>
                    <div className={s.acceptance}>
                      <CheckCheck aria-hidden="true" />
                      <p>
                        <strong>验收任务</strong>
                        {item.acceptance}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
        <div className={s.handoff}>
          <div>
            <span>前置依赖</span>
            <p>{chapter.entry}</p>
          </div>
          <ArrowRight aria-hidden="true" />
          <div>
            <span>本篇交付</span>
            <p>{chapter.outcome}</p>
          </div>
        </div>
        <p className={s.note}>{chapter.note}</p>
        <a
          className={s.nextChapter}
          href={`#${courseChapters.find((item) => item.number === chapter.number + 1)?.id ?? "task-ledger"}`}
        >
          {chapter.number === 10 ? "搜索与导出完整任务" : "继续下一篇"}
          <ArrowDown size={15} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

export default function CoursePage() {
  return (
    <StoryPage chapters={chapters} label="课程产出章节">
      <section
        id="overview"
        data-chapter
        className={`${s.screen} ${s.hero}`}
        aria-labelledby="course-title"
      >
        <div className={s.inner}>
          <header className={s.heroHeader}>
            <p className={s.kicker}>{courseName} · V5 课程任务</p>
            <h1 id="course-title">
              从模型调用开始，
              <br />
              <em>拼出完整的 Agent 系统。</em>
            </h1>
            <p className={s.lead}>
              第四篇至第十篇，逐课交付工程模块、Prompt 与策略。
              <br />
              每一项产出，都对应可演示的场景与可检查的验收证据。
            </p>
          </header>
          <div className={s.flow} aria-label="DataAgent 建设全景">
            <div>
              <span>入口与分流</span>
              <p>分析 · 闲聊 · 报告 · PPT</p>
            </div>
            <ArrowRight aria-hidden="true" />
            <div>
              <span>Agent 执行与治理</span>
              <p>模型 · 运行 · Context · 能力 · 记忆 · Eval</p>
            </div>
            <ArrowRight aria-hidden="true" />
            <div>
              <span>成果与行动</span>
              <p>finalAnswer · Writer · 审批 · 执行</p>
            </div>
          </div>
          <nav className={s.chapterMap} aria-label="七篇课程任务地图">
            {courseChapters.map((chapter) => (
              <a href={`#${chapter.id}`} key={chapter.id} className="ghost-control">
                <span>
                  {String(chapter.number).padStart(2, "0")}
                  <ArrowDown size={14} aria-hidden="true" />
                </span>
                <strong>{chapter.name}</strong>
                <small>
                  第 {chapter.lessons[0].number}–{chapter.lessons.at(-1)!.number} 课
                </small>
              </a>
            ))}
          </nav>
          <div className={s.heroFooter}>
            <p>
              模块名称用于拆分建设任务；每篇包含产出地图、逐课任务与演示验收。标注“可选”的算法按实际需要引入。
            </p>
            <a href="#task-ledger" className="ghost-control">
              搜索 / 导出任务 <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
      {courseChapters.map((chapter) => (
        <ChapterLanding key={chapter.id} chapter={chapter} />
      ))}
      <section
        id="task-ledger"
        data-chapter
        className={`${s.screen} ${s.white}`}
        aria-labelledby="ledger-title"
      >
        <div className={s.inner}>
          <header className={s.ledgerHeader}>
            <p className={s.kicker}>课程任务 · 搜索与导出</p>
            <h2 id="ledger-title">找到具体模块，带走你的任务清单。</h2>
            <p className={s.description}>
              按篇章、产出类型或关键词查询；每项记录包含模块、具体工作、前置依赖与验收证据。
            </p>
          </header>
          <CourseExplorer />
          <div className={s.promptPackage}>
            <h3>
              <GitBranch aria-hidden="true" /> 每个 Prompt 的完整交付包
            </h3>
            <ol>
              {promptDeliverables.map((item, index) => (
                <li key={item}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {item}
                </li>
              ))}
            </ol>
          </div>
          <div className={s.quality}>
            <article>
              <h3>Outcome · 结果</h3>
              <p>计算正确、证据充分、报告完整，明确不确定性。</p>
            </article>
            <article>
              <h3>Trajectory · 过程</h3>
              <p>工具、上下文、权限和审批符合契约，副作用受控。</p>
            </article>
            <article>
              <h3>System · 系统</h3>
              <p>故障可恢复，成本和时延可度量，版本可复现。</p>
            </article>
          </div>
          <div className={s.heroFooter}>
            <p>最终交付：代码与能力包、设计与 ADR、数据与评测、运行说明与演示证据。</p>
            <Link href="/learning" className="ghost-control">
              查看学习指南 <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>
    </StoryPage>
  );
}
