"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  nextScreenPosition,
  SCREEN_TRANSITION_MS,
  WheelGesture,
  wheelPixels,
} from "@/lib/screen-scroll";

const sectionSelector = "[data-chapter], [data-screen]";
const nativeSelector =
  "[data-scroll-native], [role='dialog'], [role='listbox'], textarea, select, input, [contenteditable='true']";

function canScroll(element: Element, direction: number) {
  const style = getComputedStyle(element);
  return (
    /(auto|scroll)/.test(style.overflowY) &&
    element.scrollHeight > element.clientHeight + 2 &&
    (direction > 0
      ? element.scrollTop + element.clientHeight < element.scrollHeight - 2
      : element.scrollTop > 2)
  );
}

function hasNativeScroll(target: Element, direction: number) {
  if (target.closest(nativeSelector)) return true;
  for (
    let node: Element | null = target;
    node && node !== document.body;
    node = node.parentElement
  ) {
    if (canScroll(node, direction)) return true;
  }
  return false;
}

function layers(section: HTMLElement) {
  let children = Array.from(section.children).filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement &&
      !["absolute", "fixed"].includes(getComputedStyle(node).position),
  );
  if (children.length === 1 && children[0].tagName === "DIV") {
    children = Array.from(children[0].children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement,
    );
  }
  return children;
}

/** Keep document scrolling, native anchors, and nested interactive surfaces intact. */
export function PageScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    const sections = Array.from(main.querySelectorAll<HTMLElement>(sectionSelector));
    if (!sections.length) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const gesture = new WheelGesture();
    let frame = 0;
    let busy = false;
    let animations: Animation[] = [];
    const headerHeight = () =>
      document.querySelector(".site-header")?.getBoundingClientRect().height ?? 0;
    const viewport = () => window.innerHeight - headerHeight();
    const maximum = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const sectionTop = (section: HTMLElement) =>
      Math.max(0, section.getBoundingClientRect().top + window.scrollY - headerHeight());
    const starts = () => [0, ...sections.map(sectionTop), maximum()].sort((a, b) => a - b);
    const sectionAt = (position: number) =>
      sections.findLast((section) => sectionTop(section) <= position + 3) ?? sections[0];

    const cancel = () => {
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
      animations = [];
      busy = false;
    };

    const move = (requested: number, animate: boolean) => {
      cancel();
      const from = window.scrollY;
      const to = Math.max(0, Math.min(maximum(), requested));
      if (!animate || reducedMotion.matches || Math.abs(to - from) < 3) {
        window.scrollTo({ top: to, behavior: "instant" });
        return;
      }
      busy = true;
      const outgoing = sectionAt(from);
      const incoming = sectionAt(to);
      const direction = Math.sign(to - from);
      if (outgoing !== incoming) {
        for (const [section, entering] of [
          [outgoing, false],
          [incoming, true],
        ] as const) {
          layers(section).forEach((layer, index) => {
            const distance = (index === 0 ? 80 : 36) * direction;
            animations.push(
              layer.animate(
                [
                  {
                    transform: `translate3d(0, ${entering ? -distance : 0}px, 0)`,
                    opacity: entering ? 0.82 : 1,
                  },
                  {
                    transform: `translate3d(0, ${entering ? 0 : distance}px, 0)`,
                    opacity: entering ? 1 : 0.82,
                  },
                ],
                {
                  duration: SCREEN_TRANSITION_MS,
                  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
                  fill: "both",
                },
              ),
            );
          });
        }
      }
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / SCREEN_TRANSITION_MS);
        const eased = 1 - (1 - progress) ** 4;
        window.scrollTo({ top: from + (to - from) * eased, behavior: "instant" });
        if (progress < 1) frame = requestAnimationFrame(tick);
        else cancel();
      };
      frame = requestAnimationFrame(tick);
    };

    const wheel = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
        !(event.target instanceof Element) ||
        document.querySelector("[role='dialog'][data-state='open'], dialog[open]")
      )
        return;
      const delta = wheelPixels(event.deltaY, event.deltaMode, viewport());
      const native = hasNativeScroll(event.target, Math.sign(delta));
      const to = nextScreenPosition(
        window.scrollY,
        Math.sign(delta),
        starts(),
        viewport(),
        maximum(),
      );
      if (!busy && Math.abs(to - window.scrollY) < 3 && !native) return;
      const action = gesture.sample(delta, performance.now(), busy, native);
      if (action === "native") return;
      event.preventDefault();
      if (action === "step") move(to, true);
    };

    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !(event.target instanceof Element) ||
        event.target.closest(
          `${nativeSelector}, button, a, summary, [role='tab'], [role='slider'], [role='region'][tabindex]`,
        ) ||
        document.querySelector("[role='dialog'][data-state='open'], dialog[open]")
      )
        return;
      const direction = ["ArrowDown", "PageDown", " "].includes(event.key)
        ? event.shiftKey
          ? -1
          : 1
        : ["ArrowUp", "PageUp"].includes(event.key)
          ? -1
          : 0;
      if (!direction && event.key !== "Home" && event.key !== "End") return;
      if (hasNativeScroll(event.target, direction)) return;
      event.preventDefault();
      move(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? maximum()
            : nextScreenPosition(window.scrollY, direction, starts(), viewport(), maximum()),
        false,
      );
    };

    const click = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        !(event.target instanceof Element)
      )
        return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (
        !url.hash ||
        url.origin !== location.origin ||
        url.pathname !== location.pathname ||
        url.search !== location.search
      )
        return;
      let id: string;
      try {
        id = decodeURIComponent(url.hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(id);
      if (!target || !main.contains(target) || target === main) return;
      event.preventDefault();
      const to = target.getBoundingClientRect().top + window.scrollY - headerHeight();
      history.pushState(history.state, "", url.hash);
      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1");
        target.addEventListener("blur", () => target.removeAttribute("tabindex"), { once: true });
      }
      target.focus({ preventScroll: true });
      move(to, event.detail !== 0);
    };

    window.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("keydown", keydown);
    document.addEventListener("click", click);
    window.addEventListener("pointerdown", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    window.addEventListener("resize", cancel);
    reducedMotion.addEventListener("change", cancel);
    return () => {
      cancel();
      window.removeEventListener("wheel", wheel);
      window.removeEventListener("keydown", keydown);
      document.removeEventListener("click", click);
      window.removeEventListener("pointerdown", cancel);
      window.removeEventListener("touchstart", cancel);
      window.removeEventListener("resize", cancel);
      reducedMotion.removeEventListener("change", cancel);
    };
  }, [pathname]);

  return null;
}
