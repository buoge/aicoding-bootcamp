import { ProductError } from "@/components/product-page";
export default function NotFound() {
  return (
    <ProductError
      failure={{ title: "页面不存在", message: "请从导航选择可访问的页面。", path: "/workspaces" }}
    />
  );
}
