"use client";

import { useMemo, useState } from "react";
import { Download, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { courseChapters, courseLanes, courseTasksCsv, filterCourseTasks } from "@/lib/course-map";

export function CourseExplorer() {
  const [lane, setLane] = useState("all");
  const [chapter, setChapter] = useState("all");
  const [query, setQuery] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const filtered = useMemo(() => filterCourseTasks(query, chapter, lane), [query, chapter, lane]);

  function download() {
    const blob = new Blob([courseTasksCsv(filtered)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "compass-v5-course-tasks.csv";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportMessage(`已导出 ${filtered.length} 项任务`);
  }

  return (
    <div className="task-ledger">
      <div className="ledger-heading">
        <p>每课按工程与算法两条任务记录，工程补齐项单独标注。</p>
        <Button variant="ghost" onClick={download} disabled={!filtered.length}>
          <Download data-icon="inline-start" />
          导出当前清单
        </Button>
      </div>
      <div className="task-filters">
        <div className="task-search">
          <Search size={16} aria-hidden="true" />
          <Input
            aria-label="搜索任务"
            placeholder="搜索 llm-router、闲聊、PPT、finalAnswer…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <label>
          <span className="sr-only">按篇章筛选</span>
          <select value={chapter} onChange={(event) => setChapter(event.target.value)}>
            <option value="all">全部篇章</option>
            {courseChapters.map((item) => (
              <option key={item.id} value={item.id}>
                {item.ordinal} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">按产出类型筛选</span>
          <select value={lane} onChange={(event) => setLane(event.target.value)}>
            <option value="all">全部产出</option>
            {courseLanes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="task-result-count" aria-live="polite">
        <span>
          {filtered.length} 项任务{exportMessage && ` · ${exportMessage}`}
        </span>
        <span>展开查看具体工作与验收</span>
      </div>
      {filtered.length ? (
        <Accordion type="multiple" className="tasks-accordion">
          {filtered.map((task) => (
            <AccordionItem key={task.id} value={task.id}>
              <AccordionTrigger>
                <span className="task-id">{task.id}</span>
                <strong>{task.title}</strong>
                <span className="task-lesson">
                  {task.supplement ? "工程补齐" : `第 ${task.lesson} 课`}
                </span>
                <Badge variant="outline">{task.lane}</Badge>
              </AccordionTrigger>
              <AccordionContent>
                <dl className="task-contract">
                  {[
                    ["所属篇章", task.chapter],
                    ["模块 / 算法资产", task.assets.join(" · ")],
                    ["具体工作", task.work],
                    ["前置依赖", task.dependency],
                    ["验收证据", task.evidence],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="empty-results">
          <Search aria-hidden="true" />
          <h4>没有找到符合条件的任务</h4>
          <p>试着减少筛选条件，或搜索“模型”“报告”“PPT”。</p>
          <Button
            variant="ghost"
            onClick={() => {
              setQuery("");
              setChapter("all");
              setLane("all");
            }}
          >
            <X data-icon="inline-start" />
            清除筛选
          </Button>
        </div>
      )}
    </div>
  );
}
