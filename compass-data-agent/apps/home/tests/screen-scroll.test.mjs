import assert from "node:assert/strict";
import { test } from "node:test";
import { nextScreenPosition, WheelGesture, wheelPixels } from "../src/lib/screen-scroll.ts";

test("one continuous wheel gesture turns one screen, including momentum after animation", () => {
  const gesture = new WheelGesture();
  assert.equal(gesture.sample(100, 0, false), "step");
  for (let time = 50; time < 1400; time += 50) {
    assert.equal(gesture.sample(40, time, time < 640), "hold");
  }
  assert.equal(gesture.sample(100, 1600, false), "step");
});

test("small deltas accumulate, reverse direction resets intent, and zoom units normalize", () => {
  const gesture = new WheelGesture();
  assert.equal(gesture.sample(15, 0, false), "hold");
  assert.equal(gesture.sample(-15, 20, false), "hold");
  assert.equal(gesture.sample(-15, 40, false), "step");
  assert.equal(wheelPixels(3, 1, 800), 48);
  assert.equal(wheelPixels(1, 2, 800), 800);
  assert.equal(wheelPixels(40, 0, 800), 40);
});

test("a gesture inside a panel cannot turn a page when it reaches the panel boundary", () => {
  const gesture = new WheelGesture();
  assert.equal(gesture.sample(80, 0, false, true), "native");
  assert.equal(gesture.sample(80, 30, false, true), "native");
  assert.equal(gesture.sample(80, 60, false), "hold");
  assert.equal(gesture.sample(80, 300, false), "step");
});

test("normal chapters align below the header and the footer remains reachable", () => {
  const starts = [0, 720, 1440, 1660];
  assert.equal(nextScreenPosition(0, 1, starts, 720, 1660), 720);
  assert.equal(nextScreenPosition(720, 1, starts, 720, 1660), 1440);
  assert.equal(nextScreenPosition(1440, 1, starts, 720, 1660), 1660);
  assert.equal(nextScreenPosition(1660, 1, starts, 720, 1660), 1660);
  assert.equal(nextScreenPosition(1440, -1, starts, 720, 1660), 720);
  assert.equal(nextScreenPosition(0, -1, starts, 720, 1660), 0);
});

test("long or expanded chapters are paged without skipping content in either direction", () => {
  const starts = [0, 2300, 3100];
  assert.equal(nextScreenPosition(0, 1, starts, 800, 3100), 800);
  assert.equal(nextScreenPosition(800, 1, starts, 800, 3100), 1600);
  assert.equal(nextScreenPosition(1600, 1, starts, 800, 3100), 2300);
  assert.equal(nextScreenPosition(2300, -1, starts, 800, 3100), 1500);
  assert.equal(nextScreenPosition(1500, -1, starts, 800, 3100), 700);
  assert.equal(nextScreenPosition(700, -1, starts, 800, 3100), 0);
});
