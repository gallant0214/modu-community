import { notFound } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { verifyOrderToken } from "@/app/lib/order-token";
import { tossClientKey } from "@/app/lib/toss-payments";
import { onlineSalesEnabled, SALES_DISABLED_MESSAGE } from "@/app/lib/member-checkout";
import PayClient from "./PayClient";
import SellerInfo, { loadSellerInfo } from "../SellerInfo";

export const dynamic = "force-dynamic";

/**
 * /pay/[orderUid]?t=토큰 — 홈페이지와 회원앱 WebView 가 **같이 쓰는 결제 페이지**.
 *
 * 금액은 화면에서 받지 않는다. 주문에 저장된 서버 확정값만 보여주고 그대로 결제한다.
 */
export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderUid: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderUid } = await params;
  const { t } = await searchParams;

  if (!onlineSalesEnabled()) {
    return <Notice title="준비 중이에요" body={SALES_DISABLED_MESSAGE} />;
  }

  if (!verifyOrderToken(t, orderUid)) {
    return (
      <Notice
        title="결제 링크가 만료됐어요"
        body="주문 화면으로 돌아가 다시 시도해주세요."
      />
    );
  }

  const { data } = await supabase
    .from("crm_orders")
    .select(
      "id, center_id, member_id, product_name, list_price_won, coupon_discount_won, " +
        "mileage_used, mileage_earned, amount_won, status, expires_at"
    )
    .eq("order_uid", orderUid)
    .maybeSingle();
  const order = data as {
    center_id: number;
    member_id: number;
    product_name: string;
    list_price_won: number;
    coupon_discount_won: number;
    mileage_used: number;
    mileage_earned: number;
    amount_won: number;
    status: string;
    expires_at: string | null;
  } | null;

  if (!order) notFound();

  if (order.status !== "pending") {
    return (
      <Notice
        title={order.status === "paid" ? "이미 결제가 끝난 주문이에요" : "종료된 주문이에요"}
        body="주문 내역에서 확인해주세요."
      />
    );
  }
  if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    return <Notice title="결제 시간이 지났어요" body="처음부터 다시 주문해주세요." />;
  }

  const { data: mem } = await supabase
    .from("crm_members")
    .select("name")
    .eq("id", order.member_id)
    .maybeSingle();

  const seller = await loadSellerInfo(order.center_id);

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-white px-5 pb-16 pt-8">
      <h1 className="text-lg font-bold text-gray-900">결제하기</h1>

      {/* 주문 요약 — 실제로 청구될 금액을 그대로 보여준다 */}
      <section className="mt-5 rounded-xl border border-gray-200 p-4">
        <p className="font-semibold text-gray-900">{order.product_name}</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <Line label="상품 금액" value={`${order.list_price_won.toLocaleString()}원`} />
          {order.coupon_discount_won > 0 && (
            <Line
              label="쿠폰 할인"
              value={`-${order.coupon_discount_won.toLocaleString()}원`}
              accent
            />
          )}
          {order.mileage_used > 0 && (
            <Line label="마일리지 사용" value={`-${order.mileage_used.toLocaleString()}원`} accent />
          )}
          <div className="!mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
            <dt className="font-semibold text-gray-900">최종 결제 금액</dt>
            <dd className="text-lg font-bold text-gray-900">
              {order.amount_won.toLocaleString()}원
            </dd>
          </div>
          {order.mileage_earned > 0 && (
            <p className="!mt-2 text-xs text-gray-500">
              결제 완료 시 {order.mileage_earned.toLocaleString()}P 적립
            </p>
          )}
        </dl>
      </section>

      <PayClient
        orderUid={orderUid}
        token={t as string}
        centerId={order.center_id}
        amount={order.amount_won}
        orderName={order.product_name}
        customerName={(mem as { name?: string } | null)?.name ?? ""}
        customerKey={`m_${order.center_id}_${order.member_id}`}
        clientKey={tossClientKey()}
      />

      <SellerInfo seller={seller} />
    </main>
  );
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className={accent ? "text-blue-600" : "text-gray-900"}>{value}</dd>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-base font-bold text-gray-900">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{body}</p>
    </main>
  );
}
