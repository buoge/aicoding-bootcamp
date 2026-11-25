import assert from "node:assert/strict";
import { test } from "node:test";
import {
  courseChapters,
  courseTasks,
  filterCourseTasks,
  courseTasksCsv,
} from "../src/lib/course-map.ts";

test("the V5 map covers chapters four to ten and lessons 11–43 exactly once", () => {
  assert.deepEqual(
    courseChapters.map((chapter) => chapter.number),
    [4, 5, 6, 7, 8, 9, 10],
  );
  assert.deepEqual(
    courseChapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.number)),
    Array.from({ length: 33 }, (_, index) => index + 11),
  );
  assert.equal(new Set(courseChapters.map((chapter) => chapter.id)).size, 7);
  assert.equal(new Set(courseTasks.map((task) => task.id)).size, courseTasks.length);
  for (const task of courseTasks) {
    for (const field of ["chapter", "lesson", "title", "work", "dependency", "evidence"])
      assert.ok(task[field]?.trim(), `${task.id}: missing ${field}`);
    assert.ok(task.assets.length > 0, task.id);
    assert.ok(
      courseChapters.some((chapter) => chapter.id === task.chapterId),
      task.id,
    );
  }
});

test("product routing, writers and PPT are included as supplementary work", () => {
  for (const name of [
    "intentRouter",
    "casualChat",
    "finalAnswer",
    "defaultWriter",
    "analysisReportWriter",
    "executiveSummaryWriter",
    "actionProposalWriter",
    "pptSkill",
    "pptOutlineWriter",
    "pptPageWriter",
  ]) {
    assert.ok(
      courseTasks.some((task) => task.supplement && task.assets.includes(name)),
      name,
    );
  }
  assert.ok(filterCourseTasks("modelRouter", "model").every((task) => !task.supplement));
});

test("search combines chapter and lane filters, including asset and evidence text", () => {
  assert.deepEqual(
    filterCourseTasks("  LLM-ROUTER  ", "model", "工程产出").map((task) => task.id),
    ["L12-ENG"],
  );
  assert.equal(filterCourseTasks("llm-router", "memory").length, 0);
  assert.equal(filterCourseTasks("llm-router", "model", "Prompt / 策略").length, 0);
  assert.ok(filterCourseTasks("finalAnswer", "capability", "Prompt / 策略").length > 0);
  assert.ok(filterCourseTasks("非法输出不进入下游").some((task) => task.id === "L13-ENG"));
  assert.equal(filterCourseTasks("no-such-asset").length, 0);
  assert.equal(filterCourseTasks().length, courseTasks.length);
});

test("CSV exports only filtered results with quoting and spreadsheet-safe cells", () => {
  const selected = filterCourseTasks("llm-router", "model", "工程产出");
  const csv = courseTasksCsv(selected);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv.split("\r\n").length, 2);
  assert.ok(csv.includes('"L12-ENG"'));
  assert.ok(!csv.includes("L13-ENG"));
  const escaped = courseTasksCsv([
    { ...selected[0], title: "=SUM(1,2)", work: '保留 "证据",\n再验收' },
  ]);
  assert.ok(escaped.includes('"\'=SUM(1,2)"'));
  assert.ok(escaped.includes('"保留 ""证据"",\n再验收"'));
  assert.equal(courseTasksCsv([]).split("\r\n").length, 1);
});
