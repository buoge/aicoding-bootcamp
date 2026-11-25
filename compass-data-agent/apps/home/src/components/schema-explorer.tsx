"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowUpRight, ChevronRight, Table2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import {
  buildDomainDiagram,
  columnKeys,
  type DatabaseSchema,
  type SchemaDomain,
  type SchemaTable,
} from "@/lib/business-schema";
import s from "./business-data.module.css";

function TableDetails({
  table,
  schema,
  onBack,
}: {
  table: SchemaTable;
  schema: DatabaseSchema;
  onBack: () => void;
}) {
  const relations = schema.relations.filter((relation) => relation.from === table.name);
  return (
    <>
      <div className={s.catalogHeading}>
        <Button size="sm" onClick={onBack}>
          <ArrowLeft />
          全部表
        </Button>
        <span>
          {table.phase && `${table.phase} · `}
          {table.columns.length} 个字段
        </span>
      </div>
      <div
        className={s.catalogScroll}
        data-scroll-native
        tabIndex={0}
        aria-label={`${table.name} 字段详情`}
      >
        <h4 className={s.tableName}>{table.name}</h4>
        <p className={s.tableDescription}>{table.description}</p>
        {table.rationale && (
          <div className={s.designNote}>
            <strong>
              {table.phase === "M0" ? "MVP 为什么需要" : `${table.phase} 启用 · 延后理由`}
            </strong>
            <p>{table.rationale}</p>
          </div>
        )}
        {table.constraints && (
          <Disclosure title="设计约束与索引" density="compact" className={s.designNote}>
            <p>{table.constraints}</p>
          </Disclosure>
        )}
        <p className={s.constraint}>
          <strong>主键</strong>
          <code>{table.primaryKey.join(" + ")}</code>
        </p>
        {table.uniqueKeys.map((keys) => (
          <p className={s.constraint} key={keys.join(",")}>
            <strong>唯一键</strong>
            <code>{keys.join(" + ")}</code>
          </p>
        ))}
        <table className={s.fields}>
          <caption className="sr-only">完整字段、类型、主外键、逻辑引用与可空约束</caption>
          <thead>
            <tr>
              <th scope="col">字段 / 类型</th>
              <th scope="col">约束</th>
            </tr>
          </thead>
          <tbody>
            {table.columns.map((column) => (
              <tr key={column.name}>
                <td>
                  <code>{column.name}</code>
                  <span>{column.type}</span>
                  {column.description && <p>{column.description}</p>}
                </td>
                <td>
                  {columnKeys(table, column.name, schema.relations).map((key) => (
                    <b key={key}>{key}</b>
                  ))}
                  <span>{column.nullable ? "可空" : "必填"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {relations.length > 0 && (
          <div className={s.foreignKeys}>
            <h4>关联引用 · {relations.length}</h4>
            {relations.map((relation) => (
              <p key={relation.name}>
                <span>{relation.kind === "logical" ? "REF" : "FK"}</span>
                <code>{relation.columns.join(" + ")}</code>
                <ArrowUpRight size={12} aria-hidden="true" />
                <code>
                  {relation.to}
                  <br />({relation.references.join(", ")})
                </code>
              </p>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function DomainPanel({
  schema,
  domain,
  legend,
}: {
  schema: DatabaseSchema;
  domain: SchemaDomain;
  legend: string;
}) {
  const [allFields, setAllFields] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string>();
  const [mobileView, setMobileView] = useState("diagram");
  const tables = schema.tables.filter((table) => table.domain === domain.id);
  const selected = tables.find((table) => table.name === selectedTable);
  const diagram = buildDomainDiagram(schema, domain.id, allFields);
  return (
    <>
      <div className={s.domainHeading}>
        <div>
          <h3>
            {domain.title}
            <span>
              {tables.length} 张表 · {tables.reduce((sum, table) => sum + table.columns.length, 0)}{" "}
              个字段
            </span>
          </h3>
          <p>{domain.description}</p>
        </div>
        <label className={s.fieldToggle}>
          <input
            type="checkbox"
            checked={allFields}
            onChange={(event) => setAllFields(event.target.checked)}
          />
          显示全部字段
        </label>
      </div>
      <div className={s.mobileViews} role="group" aria-label={`${domain.title}数据视图`}>
        <Button
          size="sm"
          aria-pressed={mobileView === "diagram"}
          onClick={() => setMobileView("diagram")}
        >
          ER 关系图
        </Button>
        <Button
          size="sm"
          aria-pressed={mobileView === "tables"}
          onClick={() => setMobileView("tables")}
        >
          表与字段
        </Button>
      </div>
      <div className={s.workspace} data-mobile-view={mobileView}>
        <div className={s.graphArea}>
          <MermaidDiagram
            key={`${domain.id}-${allFields}`}
            source={diagram.source}
            label={domain.title}
            focusTable={mobileView === "diagram" ? selectedTable : undefined}
          />
        </div>
        <aside className={s.catalog} aria-label={`${domain.title}表清单`}>
          {selected ? (
            <TableDetails
              table={selected}
              schema={schema}
              onBack={() => setSelectedTable(undefined)}
            />
          ) : (
            <>
              <div className={s.catalogHeading}>
                <span>
                  <Table2 size={15} />
                  本域表清单
                </span>
                <span>{tables.length} 张</span>
              </div>
              <div
                className={s.catalogScroll}
                data-scroll-native
                tabIndex={0}
                aria-label="滚动查看本域全部表"
              >
                {domain.rationale && (
                  <Disclosure
                    title="领域设计与 MVP 边界"
                    density="compact"
                    className={s.designNote}
                  >
                    <p>{domain.rationale}</p>
                    <p>{domain.boundary}</p>
                  </Disclosure>
                )}
                {tables.map((table, index) => (
                  <button
                    className={`ghost-control ${s.tableCard}`}
                    key={table.name}
                    onClick={() => setSelectedTable(table.name)}
                  >
                    <span className={s.tableIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{table.name}</strong>
                      <span>{table.description.split(/[。；]/)[0]}</span>
                      <small>
                        {table.phase && (
                          <b className={s.phase} data-mvp={table.phase === "M0"}>
                            {table.phase}
                          </b>
                        )}
                        {table.columns.length} 字段 ·{" "}
                        {schema.relations.filter((relation) => relation.from === table.name).length}{" "}
                        关联
                      </small>
                    </span>
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>
      </div>
      <div className={s.legend}>
        <span>
          {diagram.relationCount} 条关联 · {diagram.referenceCount} 张外域引用表 · PK 主键 / FK 外键
          / REF 逻辑引用 / UK 唯一键
        </span>
        <span>{legend}</span>
      </div>
    </>
  );
}

function OverviewPanel({
  schema,
  onSelect,
}: {
  schema: DatabaseSchema;
  onSelect: (id: string) => void;
}) {
  const [mobileView, setMobileView] = useState("diagram");
  return (
    <>
      <div className={s.domainHeading}>
        <div>
          <h3>
            系统业务域总关系
            <span>
              {schema.domains.length} 个领域 ·{" "}
              {schema.tables.filter((table) => table.phase === "M0").length} 张 M0 表
            </span>
          </h3>
          <p>从身份与分析任务，到证据、产物与治理，沿系统链路查看领域边界。</p>
        </div>
      </div>
      <div className={s.mobileViews} role="group" aria-label="系统领域总览视图">
        <Button
          size="sm"
          aria-pressed={mobileView === "diagram"}
          onClick={() => setMobileView("diagram")}
        >
          领域关系图
        </Button>
        <Button
          size="sm"
          aria-pressed={mobileView === "tables"}
          onClick={() => setMobileView("tables")}
        >
          领域与约束
        </Button>
      </div>
      <div className={s.workspace} data-mobile-view={mobileView}>
        <div className={s.graphArea}>
          <MermaidDiagram
            source={schema.overview!.source}
            label="Compass DataAgent 系统业务域"
            kind="flowchart"
          />
        </div>
        <aside className={s.catalog} aria-label="系统领域与通用约束">
          <div className={s.catalogHeading}>
            <span>
              <Table2 size={15} />
              系统领域
            </span>
            <span>{schema.domains.length} 个</span>
          </div>
          <div
            className={s.catalogScroll}
            data-scroll-native
            tabIndex={0}
            aria-label="滚动查看全部系统领域"
          >
            <Disclosure title="通用字段与约束" density="compact" className={s.designNote}>
              {schema.overview!.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </Disclosure>
            {schema.domains.map((domain, index) => {
              const tables = schema.tables.filter((table) => table.domain === domain.id);
              return (
                <button
                  key={domain.id}
                  className={`ghost-control ${s.tableCard}`}
                  onClick={() => onSelect(domain.id)}
                >
                  <span className={s.tableIndex}>{String(index + 1).padStart(2, "0")}</span>
                  <span>
                    <strong>{domain.title}</strong>
                    <span>{domain.description}</span>
                    <small>
                      {tables.length} 张目标表 · M0{" "}
                      {tables.filter((table) => table.phase === "M0").length} 张
                    </small>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </aside>
      </div>
      <div className={s.legend}>
        <span>领域关系表示协作与数据流；进入领域查看完整 ER、字段和设计理由。</span>
        <span>M0–M5 按阶段建设 · 当前为待评审设计</span>
      </div>
    </>
  );
}

type ExplorerProps = {
  id: string;
  label: string;
  title: string;
  emphasis: string;
  domains: Pick<SchemaDomain, "id" | "label">[];
  schemaUrl: string;
  summary: string;
  legend: string;
  sourceNote: string;
  sourceHref?: string;
  overview?: boolean;
};

export function SchemaExplorer({
  id,
  label,
  title,
  emphasis,
  domains,
  schemaUrl,
  summary,
  legend,
  sourceNote,
  sourceHref,
  overview = false,
}: ExplorerProps) {
  const root = useRef<HTMLElement>(null);
  const [schema, setSchema] = useState<DatabaseSchema>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(overview ? "overview" : domains[0].id);

  function selectDomain(value: string) {
    setActive(value);
    // Reveal the selected tab horizontally without scrolling the whole story page.
    const scroller = root.current?.querySelector<HTMLElement>(`[data-domain-tabs]`);
    const tab = scroller?.querySelector<HTMLElement>(`[data-domain="${value}"]`);
    if (scroller && tab)
      scroller.scrollLeft +=
        tab.getBoundingClientRect().left -
        scroller.getBoundingClientRect().left -
        scroller.clientWidth / 2 +
        tab.offsetWidth / 2;
  }

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(schemaUrl, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Schema unavailable");
        const data: DatabaseSchema = await response.json();
        if (
          !data.tables?.length ||
          !data.relations?.length ||
          data.domains?.length !== domains.length ||
          domains.some((domain) => !data.domains.some((item) => item.id === domain.id)) ||
          (overview && !data.overview?.source)
        )
          throw new Error("Invalid schema");
        setSchema(data);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void load();
          observer.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    if (root.current) observer.observe(root.current);
    return () => {
      controller.abort();
      observer.disconnect();
    };
  }, [attempt, domains, schemaUrl, overview]);

  return (
    <section id={id} ref={root} data-chapter className={s.screen} aria-labelledby={`${id}-title`}>
      <div className={s.inner}>
        <header className={s.heading}>
          <div>
            <p className={s.kicker}>技术架构 · {label}</p>
            <h2 id={`${id}-title`}>
              {title}
              <em>{emphasis}</em>
            </h2>
          </div>
          <p className={s.summary}>
            {schema ? (
              <>
                <strong>{schema.tables.length}</strong> 张表<span> / </span>
                <strong>
                  {schema.tables.reduce((sum, table) => sum + table.columns.length, 0)}
                </strong>{" "}
                个字段<span> / </span>
                <strong>{schema.relations.length}</strong> 条关联
              </>
            ) : (
              summary
            )}
          </p>
        </header>
        <Tabs value={active} onValueChange={selectDomain} className={s.tabs}>
          <div className={s.tabScroller} data-domain-tabs data-scroll-native>
            <TabsList variant="line" className={s.tabList} aria-label={`${label}领域`}>
              {overview && (
                <TabsTrigger value="overview" data-domain="overview" className={s.tab}>
                  领域总览
                </TabsTrigger>
              )}
              {domains.map((domain, index) => (
                <TabsTrigger
                  value={domain.id}
                  data-domain={domain.id}
                  key={domain.id}
                  className={s.tab}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  {domain.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {[...(overview ? ["overview"] : []), ...domains.map((domain) => domain.id)].map(
            (domainId) => (
              <TabsContent key={domainId} value={domainId} className={s.panel}>
                {schema ? (
                  domainId === "overview" ? (
                    <OverviewPanel schema={schema} onSelect={selectDomain} />
                  ) : (
                    <DomainPanel
                      schema={schema}
                      domain={schema.domains.find((domain) => domain.id === domainId)!}
                      legend={legend}
                    />
                  )
                ) : (
                  <div className={s.message} role={error ? "alert" : "status"}>
                    {error ? (
                      <>
                        <p>{label}加载失败，请重试。</p>
                        <Button
                          size="sm"
                          onClick={() => {
                            setError(false);
                            setAttempt(attempt + 1);
                          }}
                        >
                          重新加载
                        </Button>
                      </>
                    ) : (
                      `正在加载${label}…`
                    )}
                  </div>
                )}
              </TabsContent>
            ),
          )}
        </Tabs>
        <p className={s.source}>
          {sourceNote}
          {sourceHref && (
            <>
              {" "}
              ·{" "}
              <a href={sourceHref} download>
                下载完整设计文档 <ArrowUpRight size={11} aria-hidden="true" />
              </a>
            </>
          )}
        </p>
      </div>
    </section>
  );
}
