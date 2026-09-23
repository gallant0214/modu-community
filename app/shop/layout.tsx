/**
 * 판매 페이지 전용 레이아웃.
 * 루트 레이아웃이 NavBar 자리만큼 준 상단 여백을 되돌린다(/pay 와 같은 이유).
 * 커뮤니티 네비를 띄우지 않는 건 nav-bar.tsx 에서 처리한다.
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ marginTop: "calc(-1 * (env(safe-area-inset-top, 0px) + 56px))" }}
      className="min-h-screen bg-white"
    >
      {children}
    </div>
  );
}
