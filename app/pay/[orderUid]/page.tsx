import { notFound } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { verifyOrderToken } from "@/app/lib/order-token";
import { portoneConfigured, portoneImpCode, portoneChannelKey } from "@/app/lib/portone-payments";
import {
  onlineSalesEnabled,
  SALES_DISABLED_MESSAGE,
  salesAllowedForMember,
  SALES_RESTRICTED_MESSAGE,
} from "@/app/lib/member-checkout";
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
  searchParams: Promise<{ t?: string; rn?: string }>;
}) {
  const { orderUid } = await params;
  const { t, rn } = await searchParams;

  if (!onlineSalesEnabled()) {
    return <Notice title="준비 중이에요" body={SALES_DISABLED_MESSAGE} />;
  }
  /* 식별코드·채널키·API 키 중 하나라도 비면 결제창이 뜨다 말거나 검증이 실패한다.
     결제창을 띄워 돈을 받고 나서 터지면 수습이 훨씬 어려우니 들어오기 전에 막는다. */
  if (!portoneConfigured()) {
    return (
      <Notice
        title="결제 설정에 문제가 있어요"
        body="센터로 문의해주세요. (결제 연동 설정 누락)"
      />
    );
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
        title={
          order.status === "paid"
            ? "이미 결제가 끝난 주문이에요"
            : order.status === "processing"
              ? "결제를 처리하고 있어요"
              : "종료된 주문이에요"
        }
        body="주문 내역에서 확인해주세요."
      />
    );
  }
  if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    return <Notice title="결제 시간이 지났어요" body="처음부터 다시 주문해주세요." />;
  }
  /* 주문 생성 뒤에 허용목록이 바뀌었을 수도 있다 — 결제창을 띄우기 전에 한 번 더 본다 */
  if (!salesAllowedForMember(order.member_id)) {
    return <Notice title="준비 중이에요" body={SALES_RESTRICTED_MESSAGE} />;
  }

  /* 🚨 포트원 V1 은 buyer_tel 이 **필수**다. 비우면 결제창이 거부한다.
     없으면 센터 대표번호로 대체한다 — 결제 자체가 막히는 것보다 낫다. */
  const { data: mem } = await supabase
    .from("crm_members")
    .select("name, phone")
    .eq("id", order.member_id)
    .maybeSingle();
  const member = mem as { name?: string; phone?: string | null } | null;

  const seller = await loadSellerInfo(order.center_id);

  /* 센터 판매 페이지 주소 — 결제 동의 문구와 하단에 약관·정책 링크를 띄우는 데 쓴다.
     🚨 PG 심사가 '이용약관·개인정보처리방침 유무'를 자동 검사한다. 결제 페이지에도 보여야 한다. */
  const { data: slugRow } = await supabase
    .from("crm_centers")
    .select("shop_slug")
    .eq("id", order.center_id)
    .maybeSingle();
  const slug = (slugRow as { shop_slug?: string | null } | null)?.shop_slug ?? undefined;

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
        customerName={member?.name ?? ""}
        customerTel={(member?.phone || seller?.phone || "").replace(/[^0-9]/g, "")}
        impCode={portoneImpCode()}
        channelKey={portoneChannelKey()}
        slug={slug}
        returnToApp={rn === "1"}
      />

      <SellerInfo seller={seller} slug={slug} />
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
