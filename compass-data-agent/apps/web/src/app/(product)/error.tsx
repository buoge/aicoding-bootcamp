"use client";
import { ProductError } from "@/components/product-page";
export default function ProductRouteError() {
  return (
    <ProductError
      failure={{
        title: "暂时无法打开页面",
        message: "请稍后重试，或返回工作空间。",
        path: "/workspaces",
      }}
    />
  );
}
