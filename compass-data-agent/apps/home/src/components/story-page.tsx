"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./story-page.module.css";

type Chapter = readonly [id: string, label: string];

export function StoryPage({
  chapters,
  label,
  className = "",
  children,
}: {
  chapters: readonly Chapter[];
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(chapters[0]?.[0]);

  useEffect(() => {
    const sections = root.current?.querySelectorAll<HTMLElement>("[data-chapter]");
    if (!sections || !("IntersectionObserver" in window)) return;
    let navigation: IntersectionObserver;
    const observeNavigation = () => {
      navigation?.disconnect();
      // Percentage margins resolve against width, so use viewport-height pixels.
      navigation = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
        },
        {
          rootMargin: `-${Math.round(window.innerHeight * 0.3)}px 0px -${Math.round(window.innerHeight * 0.6)}px 0px`,
        },
      );
      sections.forEach((section) => navigation.observe(section));
    };
    const reveal = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.revealed = "true";
          reveal.unobserve(entry.target);
        }
      },
      { threshold: 0.08 },
    );
    observeNavigation();
    sections.forEach((section) => reveal.observe(section));
    window.addEventListener("resize", observeNavigation, { passive: true });
    return () => {
      window.removeEventListener("resize", observeNavigation);
      navigation.disconnect();
      reveal.disconnect();
    };
  }, []);

  return (
    <main id="main-content" data-page-scroll ref={root} className={`${styles.root} ${className}`}>
      <nav className={styles.navigation} aria-label={label}>
        {chapters.map(([id, title]) => (
          <a
            key={id}
            href={`#${id}`}
            aria-label={title}
            aria-current={active === id ? "location" : undefined}
          >
            <span>{title}</span>
            <i aria-hidden="true" />
          </a>
        ))}
      </nav>
      {children}
    </main>
  );
}
