import DoneClient from "@/app/pay/[orderUid]/done/DoneClient";

export const dynamic = "force-dynamic";

/**
 * CRM 이용권 결제창에서 돌아오는 자리. **PG 두 곳의 응답 형식이 다르다.**
 *
 *   토스    성공: paymentKey, orderId, amount      실패: code, message
 *   포트원  성공: imp_uid, imp_success=true        실패: imp_success=false, error_code, error_msg
 *
 * 어느 쪽이 왔는지는 쿼리만 보고 판별한다 — 주문을 조회하지 않아도 되고,
 * 결제창을 띄운 뒤 PG 설정이 바뀌어도 돌아온 결제는 제대로 처리된다.
 *
 * 🚨 이 페이지에 도달한 것만으로는 **아무것도 확정되지 않았다.**
 *    특히 토스는 여기서 서버가 승인 API 를 호출해야 비로소 결제가 된다.
 *    식별자는 사용자 브라우저를 거쳐 온 값이라 서버가 PG 에 다시 물어 확인한다.
 */
export default async function SaasPayDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ orderUid: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { orderUid } = await params;
  const sp = await searchParams;

  const tossFailed = !!sp.code; // 토스는 실패할 때만 code 를 붙인다
  const portoneFailed = sp.imp_success === "false" || sp.success === "false";

  // 토스면 paymentKey, 포트원이면 imp_uid
  const paymentId = tossFailed || portoneFailed ? "" : (sp.paymentKey ?? sp.imp_uid ?? "");

  return (
    <DoneClient
      orderUid={orderUid}
      token={sp.t ?? ""}
      centerId={Number(sp.centerId) || 0}
      impUid={paymentId}
      confirmExtra={sp.paymentKey ? { paymentKey: sp.paymentKey } : undefined}
      failCode={sp.code ?? sp.error_code ?? ""}
      failMessage={sp.message ?? sp.error_msg ?? ""}
      confirmPath="/api/saas/orders/confirm"
    />
  );
}
