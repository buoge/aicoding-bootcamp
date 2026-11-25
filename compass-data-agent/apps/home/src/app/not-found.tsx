import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main-content" className="closing-section container">
      <div className="eyebrow">404</div>
      <h1 className="my-8 text-4xl">页面未找到</h1>
      <p>请检查地址，或返回首页查找产品与课程内容。</p>
      <Button asChild>
        <Link href="/">返回首页</Link>
      </Button>
    </main>
  );
}
