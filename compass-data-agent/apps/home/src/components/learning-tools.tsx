"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Check, Copy, Folder, ArrowRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { codeMap } from "@/lib/content";

export function CopyBlock({ code, title = "终端命令" }: { code: string; title?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => {
    if (state === "idle") return;
    const timer = setTimeout(() => setState("idle"), 3000);
    return () => clearTimeout(timer);
  }, [state]);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
  }
  return (
    <div className="copy-block">
      <div>
        <span>{title}</span>
        <Button variant="ghost" size="sm" onClick={copy} aria-label={`复制 ${title}`}>
          {state === "copied" ? <Check /> : <Copy />}
          <span aria-live="polite">
            {state === "copied" ? "已复制" : state === "failed" ? "请选中文本复制" : "复制"}
          </span>
        </Button>
      </div>
      <pre tabIndex={0}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function CodeExplorer() {
  const [selected, setSelected] = useState(1);
  return (
    <div className="code-explorer">
      <div className="file-tree" role="group" aria-label="代码目录选择">
        <div className="file-tree-title">compass /</div>
        {codeMap.map((node, i) => (
          <button
            className="ghost-control"
            key={node.path}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
          >
            <Folder size={15} />
            <code>{node.path}</code>
            <ArrowRight size={14} />
          </button>
        ))}
      </div>
      <div className="file-detail" aria-live="polite">
        <Badge variant="secondary">{codeMap[selected].status}</Badge>
        <h3>{codeMap[selected].role}</h3>
        <code>{codeMap[selected].path}</code>
        <p>{codeMap[selected].detail}</p>
        <span>应用通过明确契约协作，共享能力按实际消费关系提取。</span>
      </div>
    </div>
  );
}

const checklist = [
  ["hardware", "检查硬件与系统", "虚拟化、内存与磁盘满足本地开发，Windows 准备 WSL2。"],
  [
    "software",
    "准备软件环境与项目依赖",
    "Git、Node.js、pnpm、uv、Docker 可用，完成 setup 与 doctor。",
  ],
  ["ai-coding", "准备 AI Coding 工具", "账号可用，能读取 Compass 代码、修改文件并执行检查。"],
  [
    "ai-infra",
    "安装并接入 my-ai-infra",
    "配置自己的 Coding 工具，确认能够调用项目中的 SDD Skill。",
  ],
  ["database-client", "用 DBeaver 连通数据库", "完成数据库迁移与示例数据初始化，能查看表与数据。"],
  ["roundtrip", "跑通 Compass 完整链路", "打开 Web 示例数据，运行 pnpm smoke 验证完整链路。"],
  [
    "sdd-feature",
    "完成学习打卡 Feature",
    "按 SDD 完成 Home App 小功能，保留代码、规格与验收记录。",
  ],
];

const storageKey = "compass-home-readiness-v1";
function subscribeChecklist(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("compass-checklist", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("compass-checklist", callback);
  };
}
function readChecklist() {
  try {
    return localStorage.getItem(storageKey) || "[]";
  } catch {
    return "[]";
  }
}
export function ReadinessChecklist() {
  const stored = useSyncExternalStore(subscribeChecklist, readChecklist, () => "[]");
  const [fallback, setFallback] = useState<string[] | null>(null);
  const checked = useMemo(() => {
    if (fallback) return fallback;
    try {
      const value: unknown = JSON.parse(stored);
      return Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (v): v is string => typeof v === "string" && checklist.some(([id]) => id === v),
              ),
            ),
          ]
        : [];
    } catch {
      return [];
    }
  }, [stored, fallback]);
  const localOnly = fallback !== null;
  function update(next: string[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setFallback(null);
      window.dispatchEvent(new Event("compass-checklist"));
    } catch {
      setFallback(next);
    }
  }
  return (
    <div className="readiness">
      <div className="readiness-header">
        <div>
          <h3>课前任务清单</h3>
        </div>
        <strong aria-live="polite">
          {checked.length}
          <span> / {checklist.length}</span>
        </strong>
      </div>
      <div
        className="readiness-progress"
        role="progressbar"
        aria-label="课前准备完成度"
        aria-valuemin={0}
        aria-valuemax={checklist.length}
        aria-valuenow={checked.length}
      >
        <span style={{ width: `${(checked.length / checklist.length) * 100}%` }} />
      </div>
      {checklist.map(([id, title, description]) => (
        <label key={id} className="checklist-row">
          <Checkbox
            checked={checked.includes(id)}
            onCheckedChange={(value) =>
              update(value === true ? [...checked, id] : checked.filter((x) => x !== id))
            }
          />
          <span>
            <strong>{title}</strong>
            <small>{description}</small>
          </span>
        </label>
      ))}
      <div className="checklist-foot">
        <p>
          {checked.length === checklist.length
            ? "准备完成。带着可运行的基线和第一次 SDD 实践进入课堂。"
            : localOnly
              ? "当前浏览器无法保存，勾选仅保留在本次页面中。"
              : "勾选保存在当前浏览器，可随时回来继续。"}
          {checked.length === checklist.length && localOnly ? " 本次进度未能保存。" : ""}
        </p>
        <Button variant="ghost" size="sm" onClick={() => update([])} disabled={!checked.length}>
          <RotateCcw data-icon="inline-start" />
          重置
        </Button>
      </div>
    </div>
  );
}

export function FAQ({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <Accordion type="single" collapsible className="faq">
      {items.map((item, i) => (
        <AccordionItem value={String(i)} key={item.question}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>
            <p>{item.answer}</p>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
