import { notFound } from "next/navigation";
import { supabase } from "@/app/lib/supabase";
import { verifyOrderToken } from "@/app/lib/order-token";
import { portoneConfigured, portoneImpCode, portoneChannelKey } from "@/app/lib/portone-payments";
import { saasSalesEnabled, SAAS_SALES_DISABLED_MESSAGE } from "@/app/lib/saas-subscription";
import { platformSeller } from "@/app/lib/platform-seller";
import PayClient from "@/app/pay/[orderUid]/PayClient";
import SellerInfo from "@/app/pay/SellerInfo";

export const dynamic = "force-dynamic";

/**
 * /billing/pay/[orderUid]?t=토큰 — **CRM 이용권(구독)** 결제 페이지.
 *
 * 센터 이용권 결제(`/pay/[orderUid]`)와 결제창 컴포넌트는 공유하지만 주문 테이블과
 * 판매자가 다르다. 금액은 화면에서 받지 않고 `saas_orders` 에 저장된 서버 확정값만 쓴다.
 */
export default async function SaasPayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderUid: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderUid } = await params;
  const { t } = await searchParams;

  if (!saasSalesEnabled()) {
    return <Notice title="준비 중이에요" body={SAAS_SALES_DISABLED_MESSAGE} />;
  }
  /* 식별코드·채널키·API 키 중 하나라도 비면 결제창이 뜨다 말거나 검증이 실패한다.
     돈을 받고 나서 터지면 수습이 훨씬 어려우니 들어오기 전에 막는다. */
  if (!portoneConfigured()) {
    return <Notice title="결제 설정에 문제가 있어요" body="문의해주세요. (결제 연동 설정 누락)" />;
  }
  if (!verifyOrderToken(t, orderUid)) {
    return (
      <Notice title="결제 링크가 만료됐어요" body="이용권 화면에서 다시 시도해주세요." />
    );
  }

  const { data } = await supabase
    .from("saas_orders")
    .select("center_id, plan_name, period_months, amount_won, status, expires_at")
    .eq("order_uid", orderUid)
    .maybeSingle();
  const order = data as {
    center_id: number;
    plan_name: string;
    period_months: number;
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
        body="이용권 화면에서 확인해주세요."
      />
    );
  }
  if (order.expires_at && new Date(order.expires_at).getTime() < Date.now()) {
    return <Notice title="결제 시간이 지났어요" body="처음부터 다시 주문해주세요." />;
  }

  const { data: centerRow } = await supabase
    .from("crm_centers")
    .select("name, phone, owner_name, owner_phone")
    .eq("id", order.center_id)
    .maybeSingle();
  const center = centerRow as {
    name: string;
    phone: string | null;
    owner_name: string | null;
    owner_phone: string | null;
  } | null;

  const seller = platformSeller();
  /* 🚨 포트원 V1 은 buyer_tel 이 **필수**다. 비우면 결제창이 거부한다.
     대표자 휴대전화 → 센터 전화 → 우리 대표번호 순으로 채운다. */
  const buyerTel = (center?.owner_phone || center?.phone || seller.phone || "").replace(/[^0-9]/g, "");

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg bg-white px-5 pb-16 pt-8">
      <h1 className="text-lg font-bold text-gray-900">이용권 결제</h1>

      <section className="mt-5 rounded-xl border border-gray-200 p-4">
        <p className="font-semibold text-gray-900">{order.plan_name}</p>
        {center?.name && <p className="mt-0.5 text-xs text-gray-400">{center.name}</p>}
        <dl className="mt-3 space-y-1.5 text-sm">
          <Line label="이용 기간" value={`${order.period_months}개월`} />
          <Line label="서비스 제공시기" value="결제 완료 즉시" />
          <div className="!mt-3 flex items-center justify-between border-t border-gray-200 pt-3">
            <dt className="font-semibold text-gray-900">최종 결제 금액</dt>
            <dd className="text-lg font-bold text-gray-900">
              {order.amount_won.toLocaleString()}원
            </dd>
          </div>
        </dl>
      </section>

      <PayClient
        orderUid={orderUid}
        token={t as string}
        centerId={order.center_id}
        amount={order.amount_won}
        orderName={order.plan_name}
        customerName={center?.owner_name ?? ""}
        customerTel={buyerTel}
        impCode={portoneImpCode()}
        channelKey={portoneChannelKey()}
        donePath={`/billing/pay/${orderUid}/done`}
        policyHref="/pricing/policy"
      />

      <SellerInfo seller={seller} />
    </main>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-base font-bold text-gray-900">{title}</p>
      <p className="mt-2 text-sm text-gray-500">{body}</p>
      <a href="/billing" className="mt-6 text-sm font-semibold text-blue-600 underline">
        이용권 화면으로
      </a>
    </main>
  );
}
