import DoneClient from "@/app/pay/[orderUid]/done/DoneClient";

export const dynamic = "force-dynamic";

/**
 * CRM 이용권 결제창에서 돌아오는 자리. 포트원(V1)이 결과를 쿼리로 붙여 보낸다.
 *   성공: imp_uid, merchant_uid, imp_success=true
 *   실패: imp_success=false, error_code, error_msg
 *
 * PC 는 PayClient 의 콜백이 이 주소로 보내고, 모바일은 PG 가 m_redirect_url 로 직접 보낸다.
 *
 * 🚨 이 페이지에 도달한 것만으로는 아무것도 확정되지 않았다. imp_uid 는 사용자
 *    브라우저를 거쳐 온 값이라 그대로 믿을 수 없고, 서버가 포트원에 직접 물어
 *    금액·주문번호를 검증한 뒤에야 구독이 연장된다.
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
  const failed = sp.imp_success === "false" || sp.success === "false";

  return (
    <DoneClient
      orderUid={orderUid}
      token={sp.t ?? ""}
      centerId={Number(sp.centerId) || 0}
      impUid={failed ? "" : (sp.imp_uid ?? "")}
      failCode={sp.error_code ?? ""}
      failMessage={sp.error_msg ?? ""}
      confirmPath="/api/saas/orders/confirm"
    />
  );
}
