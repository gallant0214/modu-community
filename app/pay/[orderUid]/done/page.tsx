import DoneClient from "./DoneClient";

export const dynamic = "force-dynamic";

/**
 * 결제창에서 돌아오는 자리. 토스가 쿼리로 결과를 붙여 보낸다.
 *   성공: paymentKey, orderId, amount
 *   실패: code, message, orderId
 *
 * 승인(confirm)은 여기서 **한 번 더 서버를 거쳐** 이뤄진다.
 * 이 페이지에 도달했다는 것만으로 결제가 끝난 게 아니다 — 승인해야 실제로 결제된다.
 */
export default async function PayDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ orderUid: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orderUid } = await params;
  const sp = await searchParams;

  return (
    <DoneClient
      orderUid={orderUid}
      token={sp.t ?? ""}
      centerId={Number(sp.centerId) || 0}
      paymentKey={sp.paymentKey ?? ""}
      amount={Number(sp.amount) || 0}
      failCode={sp.code ?? ""}
      failMessage={sp.message ?? ""}
      returnToApp={sp.rn === "1"}
    />
  );
}
