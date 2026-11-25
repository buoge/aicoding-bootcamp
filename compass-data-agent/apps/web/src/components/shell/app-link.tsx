"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useDocumentSession } from "./session-boundary";

export function AppLink({ onNavigate, ...props }: ComponentProps<typeof Link>) {
  const session = useDocumentSession();
  return (
    <Link
      {...props}
      prefetch={false}
      onNavigate={(event) => {
        if (!session.confirmNavigation()) {
          event.preventDefault();
          return;
        }
        onNavigate?.(event);
      }}
    />
  );
}
