import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Eyebrow({
  children,
  light = false,
}: {
  children: React.ReactNode;
  light?: boolean;
}) {
  return (
    <div className={`eyebrow${light ? " eyebrow-light" : ""}`}>
      <span />
      {children}
    </div>
  );
}

export function SectionHeading({
  index,
  title,
  description,
}: {
  index?: string;
  title: React.ReactNode;
  description?: string;
}) {
  return (
    <div className="section-heading">
      {index && <span className="section-index">{index}</span>}
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}

export type SectionLink = { id: string; label: string };
export function DocumentPage({
  title,
  description,
  sections,
  children,
  next,
}: {
  title: React.ReactNode;
  description: string;
  sections: SectionLink[];
  children: React.ReactNode;
  next: { href: string; title: string; label: string };
}) {
  return (
    <main id="main-content" data-page-scroll>
      <div className="document-hero container" data-screen>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="document-layout container">
        <aside className="section-nav">
          <span className="section-nav-label">本页内容</span>
          <nav aria-label="本页目录">
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.label}
              </a>
            ))}
          </nav>
        </aside>
        <div className="document-content">{children}</div>
      </div>
      <div className="container">
        <Link href={next.href} className="next-page">
          <div>
            <span>接下来 · {next.label}</span>
            <h2>{next.title}</h2>
          </div>
          <ArrowRight />
        </Link>
      </div>
    </main>
  );
}

export function DocSection({
  id,
  index,
  title,
  description,
  children,
}: {
  id: string;
  index: string;
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-screen className="doc-section">
      <SectionHeading index={index} title={title} description={description} />
      {children}
    </section>
  );
}

export function ResourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="ghost">
      <a href={href} target="_blank" rel="noreferrer">
        {children}
        <ArrowUpRight data-icon="inline-end" />
      </a>
    </Button>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="editor-note">
      <span>注</span>
      {children}
    </p>
  );
}
