export const dynamic = "force-dynamic";

/**
 * /shop/done — 0원 주문(증정 쿠폰·마일리지 전액) 완료 안내.
 * PG 를 거치는 결제는 /pay/[orderUid]/done 이 결과를 보여준다.
 */
export default async function ShopDonePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const { name } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-3xl">
        ✓
      </div>
      <p className="mt-5 text-lg font-bold text-gray-900">등록이 완료됐어요</p>
      <p className="mt-2 text-sm leading-relaxed text-gray-500">
        {name ? `'${name}' 이(가) ` : ""}바로 등록됐습니다.
        <br />
        회원 앱에서 확인하실 수 있어요.
      </p>
    </main>
  );
}
