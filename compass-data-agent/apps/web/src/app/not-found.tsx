export default function NotFound() {
  return (
    <main className="safe-state">
      <div className="brand-mark">C</div>
      <h1>未找到页面</h1>
      <p>链接可能已变化，请从工作台重新选择入口。</p>
      <a className="button" href="/">
        返回工作台
      </a>
    </main>
  );
}
