/**
 * 결제 전용 레이아웃.
 *
 * 루트 레이아웃이 NavBar 자리만큼 body 에 상단 여백을 주는데, 결제 페이지는
 * NavBar 를 띄우지 않으므로(nav-bar.tsx 에서 /pay/ 제외) 그 여백을 되돌린다.
 * 회원앱 WebView 에서 열릴 때 위가 텅 비어 보이는 걸 막는다.
 */
export default function PayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ marginTop: "calc(-1 * (env(safe-area-inset-top, 0px) + 56px))" }}
      className="min-h-screen bg-white"
    >
      {children}
    </div>
  );
}
