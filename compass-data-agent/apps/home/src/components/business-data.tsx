"use client";

import { SchemaExplorer } from "@/components/schema-explorer";
import { schemaDomains } from "@/lib/business-schema";

export function BusinessData() {
  return (
    <SchemaExplorer
      id="business-data"
      label="业务数据结构"
      title="从业务领域，"
      emphasis="看清每一张表。"
      domains={schemaDomains}
      schemaUrl="/resources/business-schema.json"
      summary="八大业务域 + 生产与权限"
      legend="保留租户与采集批次关联；外域节点仅列关联字段"
      sourceNote="依据业务数据生产方案 §3、§10.13、§11.10 与当前规范 SQL · 逻辑 schema：core / ops / sec · 单文件交付另附 course_asset 公开材料索引表"
    />
  );
}
