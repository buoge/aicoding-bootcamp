"use client";
import { useLayoutEffect } from "react";
import type { PagePayload } from "@/contracts/page";
import { usePagePresenter, type PageFailure } from "./shell/session-boundary";

export function ProductPage({ payload }: { payload: PagePayload }) {
  const present = usePagePresenter();
  useLayoutEffect(() => present({ payload }), [present, payload]);
  return null;
}

export function ProductError({ failure }: { failure: PageFailure }) {
  const present = usePagePresenter();
  const { title, message, path } = failure;
  useLayoutEffect(
    () => present({ failure: { title, message, path } }),
    [present, title, message, path],
  );
  return null;
}
