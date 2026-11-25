"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { ArrowUpRight, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { courseName, navigation, prototypeUrl } from "@/lib/content";
import { cn } from "@/lib/utils";

export function CompassMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn("compass-mark", className)}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.4" />
      <path d="m21.7 8.6-3 10.1-8.4 4.7 3-10.1 8.4-4.7Z" fill="currentColor" />
      <path d="m21.7 8.6-5.7 7.4 2.7 2.7 3-10.1Z" fill="var(--background)" />
      <circle cx="16" cy="16" r="1.5" fill="var(--background)" />
    </svg>
  );
}

function subscribeScroll(callback: () => void) {
  window.addEventListener("scroll", callback, { passive: true });
  window.addEventListener("resize", callback);
  return () => {
    window.removeEventListener("scroll", callback);
    window.removeEventListener("resize", callback);
  };
}
const getScrolled = () => {
  const header = document.querySelector<HTMLElement>(".site-header");
  return header ? window.scrollY > header.getBoundingClientRect().height : false;
};
const getServerScrolled = () => false;

export function SiteHeader() {
  const pathname = usePathname().replace(/\/$/, "") || "/";
  const [open, setOpen] = useState(false);
  const scrolled = useSyncExternalStore(subscribeScroll, getScrolled, getServerScrolled);
  const home = pathname === "/";
  return (
    <>
      <a className="skip-link" href="#main-content">
        跳转到正文
      </a>
      <header className={cn("site-header", home && "header-dark", scrolled && "is-scrolled")}>
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Compass 首页">
            <CompassMark />
            <span>
              compass<span className="brand-dot">.</span>
            </span>
          </Link>
          <nav className="desktop-nav" aria-label="主导航">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <Button asChild variant="ghost" className="header-cta">
            <a href={prototypeUrl} target="_blank" rel="noreferrer">
              体验产品 <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button className="mobile-menu" variant="ghost" size="icon" aria-label="打开导航">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent className="p-6">
              <SheetHeader className="p-0">
                <SheetTitle className="brand">
                  <CompassMark /> compass.
                </SheetTitle>
              </SheetHeader>
              <nav className="mobile-nav" aria-label="移动端导航">
                {navigation.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={pathname === item.href ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                    <ArrowUpRight size={18} />
                  </Link>
                ))}
              </nav>
              <p className="muted text-sm">
                {courseName}
                <br />
                课程项目与学习指南
              </p>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container footer-top">
        <Link href="/" className="brand">
          <CompassMark />
          compass.
        </Link>
        <p>面向电商团队的经营分析 Agent</p>
        <nav aria-label="页脚导航">
          {navigation.slice(1).map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 Compass · {courseName}</span>
        <a href={prototypeUrl} target="_blank" rel="noreferrer">
          产品体验原型 · 使用合成数据 ↗
        </a>
      </div>
    </footer>
  );
}
