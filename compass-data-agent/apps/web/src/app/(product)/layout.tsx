import type { ReactNode } from "react";
import { ProductApplication } from "@/components/shell/session-boundary";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return <ProductApplication>{children}</ProductApplication>;
}
