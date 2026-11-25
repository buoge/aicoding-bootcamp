import type { SVGProps } from "react";

// Geometry from Feature 999's canonical prototype/core.js. Keep navigation.js and
// workspaces.js mappings in sync here; do not substitute visually similar icons.
const paths = {
  compass: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Zm-7-4-2 6-5 2 2-6Z",
  spark: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z",
  folder: "M3 5h6l2 3h10v12H3Z",
  code: "m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18",
  chart: "M4 4v16h16M8 15v-4m5 4V7m5 8v-6",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  file: "M14 2H5v20h14V7l-5-5Zm0 0v6h5M8 13h8m-8 4h6",
  database: "M3 5c0-4 18-4 18 0s-18 4-18 0Zm0 0v14c0 4 18 4 18 0V5M3 12c0 4 18 4 18 0",
  grid: "M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z",
  book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3ZM12 6v16",
  play: "m8 4 12 8-12 8Z",
  check: "m5 12 4 4L19 6",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Zm-4 10 3 3 5-6",
  users:
    "M8 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M1 21v-3a6 6 0 0 1 12 0v3m3-17a4 4 0 0 1 0 8m1 3a5 5 0 0 1 5 5v1",
  plus: "M12 5v14M5 12h14",
  search: "m21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "m6 6 12 12M6 18 18 6",
  bell: "M5 16V9a7 7 0 0 1 14 0v7l2 2H3l2-2Zm5 5h4",
  logout: "M9 3H3v18h6m4-5 5-4-5-4m-5 4h14",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
} as const;
export type NavigationIconName = keyof typeof paths;

export const primaryIcons: Record<string, NavigationIconName> = {
  analysis: "spark",
  reports: "folder",
  plugins: "code",
  automations: "clock",
  boards: "chart",
  admin: "shield",
  guide: "grid",
};
export const governanceIcons: Record<string, NavigationIconName> = {
  "admin-overview": "chart",
  data: "database",
  capabilities: "code",
  runs: "play",
  quality: "check",
  security: "shield",
  memory: "book",
  organization: "users",
};
export const secondaryIcons: Record<string, NavigationIconName> = {
  "reports-all": "folder",
  "reports-documents": "file",
  "reports-charts": "chart",
  "reports-data": "database",
  "plugins-all": "grid",
  "plugins-skills": "book",
  "plugins-prompts": "file",
  "plugins-agents": "spark",
  "plugins-templates": "file",
  "plugins-datasets": "database",
  "automations-all": "clock",
  "automations-new": "plus",
  "automations-history": "clock",
  "boards-overview": "grid",
  "boards-channels": "chart",
  "boards-inventory": "database",
  // Web foundation additions use the same prototype vocabulary.
  profile: "users",
  sessions: "shield",
  notifications: "bell",
  "my-memory": "book",
  guide: "grid",
  workspaces: "grid",
  access: "shield",
  "platform-tenants": "users",
};

export function NavigationIcon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: NavigationIconName;
  size?: number;
}) {
  return (
    <svg
      {...props}
      data-nav-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
