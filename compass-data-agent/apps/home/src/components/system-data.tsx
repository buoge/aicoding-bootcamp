"use client";

import { SchemaExplorer } from "@/components/schema-explorer";
import { systemSchemaDomains } from "@/lib/system-schema";

export function SystemData() {
  return (
    <SchemaExplorer
      id="system-data"
      label="系统数据结构"
      title="Compass DataAgent，"
      emphasis="系统数据结构。"
      domains={systemSchemaDomains}
      schemaUrl="/resources/system-schema.json"
      summary="12 个系统领域 · 目标设计"
      legend="目标结构按阶段启用；空间复合约束见领域总览"
      sourceNote="Compass 系统设计 · agent schema · 待评审，尚未实施 · M0–M5"
      sourceHref="/resources/system-data-model.md"
      overview
    />
  );
}
