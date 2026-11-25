export const SCREEN_TRANSITION_MS = 640;
const GESTURE_IDLE_MS = 180;
const WHEEL_THRESHOLD = 28;

/** A trackpad's momentum belongs to the gesture that started it. */
export class WheelGesture {
  private lastTime = -Infinity;
  private distance = 0;
  private owner: "page" | "native" | null = null;

  sample(delta: number, now: number, busy: boolean, native = false) {
    if (now - this.lastTime > GESTURE_IDLE_MS && !busy) {
      this.distance = 0;
      this.owner = null;
    }
    this.lastTime = now;
    if (busy) this.owner = "page";
    if (this.owner === "page") return "hold";
    if (native) {
      this.owner = "native";
      return "native";
    }
    // Do not turn a scroll inside a panel into a page turn at its boundary.
    if (this.owner === "native") return "hold";
    if (Math.sign(delta) !== Math.sign(this.distance)) this.distance = 0;
    this.distance += delta;
    if (Math.abs(this.distance) < WHEEL_THRESHOLD) return "hold";
    this.owner = "page";
    return "step";
  }
}

export function wheelPixels(delta: number, mode: number, viewport: number) {
  return delta * (mode === 1 ? 16 : mode === 2 ? viewport : 1);
}

/** Long chapters advance one viewport at a time so expanded content stays reachable. */
export function nextScreenPosition(
  position: number,
  direction: number,
  starts: number[],
  viewport: number,
  maximum: number,
) {
  const tolerance = 3;
  const destination =
    direction > 0
      ? (starts.find((top) => top > position + tolerance) ?? maximum)
      : (starts.findLast((top) => top < position - tolerance) ?? 0);
  return Math.max(
    0,
    Math.min(
      maximum,
      direction > 0
        ? Math.min(destination, position + viewport)
        : Math.max(destination, position - viewport),
    ),
  );
}
