"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Maximize, Minus, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import s from "./business-data.module.css";

let mermaidModule: Promise<(typeof import("mermaid"))["default"]> | undefined;
function loadMermaid() {
  mermaidModule ??= import("mermaid")
    .then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        look: "classic",
        layout: "elk",
        htmlLabels: false,
        fontFamily: "Arial, sans-serif",
        themeVariables: {
          primaryColor: "#edf3e4",
          primaryTextColor: "#183e32",
          primaryBorderColor: "#789181",
          lineColor: "#789181",
          secondaryColor: "#ffffff",
          tertiaryColor: "#f8f9f6",
        },
        er: { useMaxWidth: false, entityPadding: 6, nodeSpacing: 35, rankSpacing: 55 },
      });
      return mermaid;
    })
    .catch((error) => {
      mermaidModule = undefined;
      throw error;
    });
  return mermaidModule;
}

export function MermaidDiagram({
  source,
  label,
  focusTable,
  kind = "er",
}: {
  source: string;
  label: string;
  focusTable?: string;
  kind?: "er" | "flowchart";
}) {
  const diagramName = kind === "er" ? "ER 图" : "领域关系图";
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const viewport = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(
    null,
  );
  const [rendered, setRendered] = useState<{ svg: string; width: number; height: number }>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState<number | null>(null);
  const scale = zoom ?? fit;

  useEffect(() => {
    let cancelled = false;
    // Mermaid measures text in the DOM. Keep its temporary render outside page layout.
    const staging = document.createElement("div");
    staging.className = s.renderStaging;
    staging.style.cssText =
      "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
    document.body.append(staging);
    loadMermaid()
      .then(async (mermaid) => {
        if (cancelled) return;
        const { svg } = await mermaid.render(`er${id}${attempt}`, source, staging);
        if (cancelled) return;
        const element = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
        const [, , width, height] = element.getAttribute("viewBox")!.split(/\s+/).map(Number);
        setRendered({ svg, width, height });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => staging.remove());
    return () => {
      cancelled = true;
      staging.remove();
    };
  }, [source, id, attempt]);

  useEffect(() => {
    const container = viewport.current;
    if (!container || !rendered) return;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth <= 32 || container.clientHeight <= 32) return;
      setFit(
        Math.min(
          (container.clientWidth - 32) / rendered.width,
          (container.clientHeight - 32) / rendered.height,
          1,
        ),
      );
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [rendered]);

  useEffect(() => {
    if (!focusTable || !rendered) return;
    const frame = requestAnimationFrame(() => setZoom(1));
    return () => cancelAnimationFrame(frame);
  }, [focusTable, rendered]);

  // Apply scroll after React commits the new canvas size, so the browser does not
  // clamp a requested position against the previous (fitted) scroll area.
  useLayoutEffect(() => {
    const container = viewport.current;
    if (!container || !pendingScroll.current) return;
    container.scrollLeft = pendingScroll.current.x;
    container.scrollTop = pendingScroll.current.y;
    pendingScroll.current = null;
  }, [zoom, fit]);

  useLayoutEffect(() => {
    if (!focusTable || zoom !== 1 || !rendered) return;
    const container = viewport.current;
    const node = canvas.current?.querySelector(
      `[id*="-entity-${focusTable.replaceAll(".", "_")}-"]`,
    );
    if (!container || !node || !container.clientWidth) return;
    const bounds = node.getBoundingClientRect();
    const view = container.getBoundingClientRect();
    container.scrollLeft += bounds.left - view.left + bounds.width / 2 - view.width / 2;
    container.scrollTop += bounds.top - view.top + bounds.height / 2 - view.height / 2;
  }, [focusTable, rendered, zoom]);

  function changeZoom(next: number | null) {
    const container = viewport.current;
    if (!container || !rendered) return;
    const x = (container.scrollLeft + container.clientWidth / 2) / scale;
    const y = (container.scrollTop + container.clientHeight / 2) / scale;
    const newScale = next === null ? fit : Math.max(Math.min(fit, 0.1), Math.min(next, 2));
    pendingScroll.current = {
      x: next === null ? 0 : x * newScale - container.clientWidth / 2,
      y: next === null ? 0 : y * newScale - container.clientHeight / 2,
    };
    setZoom(next === null ? null : newScale);
  }

  return (
    <div className={s.diagram}>
      <div className={s.diagramToolbar}>
        <span>
          {kind === "er" ? "Mermaid ER" : "领域关系图"}{" "}
          <span className={s.zoomValue}>{Math.round(scale * 100)}%</span>
        </span>
        <div>
          <Button
            size="icon-sm"
            aria-label={`缩小 ${diagramName}`}
            disabled={!rendered}
            onClick={() => changeZoom(scale / 1.4)}
          >
            <Minus />
          </Button>
          <Button
            size="icon-sm"
            aria-label={`放大 ${diagramName}`}
            disabled={!rendered}
            onClick={() => changeZoom(scale * 1.4)}
          >
            <Plus />
          </Button>
          <Button size="sm" disabled={!rendered} onClick={() => changeZoom(1)}>
            100%
          </Button>
          <Button size="sm" disabled={!rendered} onClick={() => changeZoom(null)}>
            <Maximize />
            适应画布
          </Button>
        </div>
      </div>
      <div
        ref={viewport}
        data-scroll-native
        className={s.viewport}
        role="region"
        aria-label={`${label} ${diagramName}，方向键平移，加减键缩放，Home 复位`}
        aria-busy={!rendered && !error}
        tabIndex={0}
        onKeyDown={(event) => {
          if (["+", "=", "-", "Home"].includes(event.key)) {
            event.preventDefault();
            changeZoom(event.key === "Home" ? null : scale * (event.key === "-" ? 1 / 1.4 : 1.4));
          }
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0 || !rendered) return;
          drag.current = {
            pointer: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: event.currentTarget.scrollLeft,
            top: event.currentTarget.scrollTop,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current || drag.current.pointer !== event.pointerId) return;
          event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x);
          event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      >
        {error ? (
          <div className={s.message} role="alert">
            <p>{diagramName}暂时未能绘制，仍可查看清单与详情。</p>
            <Button
              size="sm"
              onClick={() => {
                setError(false);
                setAttempt(attempt + 1);
              }}
            >
              <RotateCcw />
              重新绘制
            </Button>
          </div>
        ) : !rendered ? (
          <p className={s.message} role="status">
            正在绘制完整关系图…
          </p>
        ) : (
          <div
            className={s.diagramStage}
            style={{
              width: Math.max(1, rendered.width * scale),
              height: Math.max(1, rendered.height * scale),
            }}
          >
            <div
              ref={canvas}
              className={s.svgCanvas}
              style={{
                width: rendered.width,
                height: rendered.height,
                transform: `scale(${scale})`,
              }}
              dangerouslySetInnerHTML={{ __html: rendered.svg }}
            />
          </div>
        )}
      </div>
      <p className={s.diagramHint}>
        {kind === "er"
          ? "拖动画布 / 方向键平移 · 灰色为外域引用 · 实线为标识关系，虚线为非标识关系"
          : "拖动画布 / 方向键平移 · 箭头表示领域协作与数据流"}
      </p>
    </div>
  );
}
