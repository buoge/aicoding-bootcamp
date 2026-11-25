"use client";
import { useRef, useState } from "react";
import { ArrowUp, Plus, Database, ChartNoAxesColumn, FileText, ChevronDown } from "lucide-react";
import { useDocumentSession } from "./shell/session-boundary";
import type { PagePayload } from "@/contracts/page";

const suggestions = ["上周经营表现", "解释指标变化", "预测未来销量", "分析一份文件"];
export function AnalysisComposer({ payload }: { payload: PagePayload }) {
  const api = useDocumentSession();
  const input = useRef<HTMLTextAreaElement>(null);
  const [question, setQuestion] = useState("");
  return (
    <section className="analysis-welcome" aria-label="新建分析对话">
      <div className="analysis-intro">
        <h2>
          每个好问题，<em>都有迹可循。</em>
        </h2>
        <p>从一个经营问题开始，让数据带你看清下一步。</p>
      </div>
      <div className="analysis-composer" data-editor>
        <textarea
          ref={input}
          aria-label="分析问题"
          placeholder="本月销售增长了，为什么渠道贡献没有跟上？"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={8000}
        />
        <div className="composer-toolbar">
          <button
            className="icon-button"
            disabled
            aria-label="添加文件（待接入）"
            title="文件上传将在后续版本接入"
          >
            <Plus size={21} />
          </button>
          <button className="analysis-mode" disabled>
            自动选择分析路径
            <ChevronDown size={15} />
          </button>
          <span className="composer-scope">
            <Database size={18} />
            {payload.session.workspace?.name ?? "当前空间"}
          </span>
          <button
            className="composer-send"
            disabled
            aria-label="发送分析（待接入）"
            title="分析执行将在后续版本接入"
          >
            <ArrowUp size={21} />
          </button>
        </div>
      </div>
      <div className="analysis-suggestions">
        {suggestions.map((suggestion, index) => (
          <button
            className="secondary"
            key={suggestion}
            onClick={() => {
              setQuestion(suggestion);
              api.setDirty(true);
              input.current?.focus();
            }}
          >
            {index === 3 ? <FileText size={17} /> : <ChartNoAxesColumn size={17} />}
            {suggestion}
          </button>
        ))}
      </div>
      <p className="analysis-availability">分析执行与文件上传将在后续版本接入，当前可编辑问题。</p>
    </section>
  );
}
