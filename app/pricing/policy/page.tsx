import Link from "next/link";
import type { Metadata } from "next";
import { SAAS_PLANS, won } from "@/app/lib/saas-plans";
import { platformSeller, SERVICE_NAME } from "@/app/lib/platform-seller";
import SellerInfo from "@/app/pay/SellerInfo";

export const metadata: Metadata = {
  title: "판매 · 환불 정책",
  description: "모두의지도사 센터 CRM 이용권의 판매 조건과 취소·환불 규정입니다.",
};

/**
 * /pricing/policy — 판매·환불 정책 전문.
 *
 * PG 계약 심사가 '환불정책을 확인할 수 있는 URL' 을 **따로** 요구한다.
 * 결제 페이지 하단에만 있으면 심사원이 결제를 진행해야만 볼 수 있어 URL 로 제출할 수 없다.
 *
 * 🚨 전자상거래법 제17·18조가 우선한다 — 이용 개시 전 7일 내 전액 환불, 위약금 공제 금지,
 *    3영업일 내 환급. 어떤 자체 규정도 이보다 불리하게 쓸 수 없다.
 */
export default function PricingPolicyPage() {
  const seller = platformSeller();
  const plan = SAAS_PLANS[0];

  return (
    <div
      className="lp"
      style={{
        margin:
          "calc(-1 * (env(safe-area-inset-top, 0px) + 56px)) 0 calc(-1 * (env(safe-area-inset-bottom, 0px) + 20px)) 0",
      }}
    >
      <main>
        <section className="lp-hero">
          <div className="lp-c">
            <div className="lp-hero-chip">판매 · 환불 정책</div>
            <h1 className="lp-hero-title">센터 CRM 이용권</h1>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <Section title="판매 상품">
                <p>
                  {SERVICE_NAME} 센터 CRM 이용권을 판매합니다. 웹 브라우저로 접속해 사용하는{" "}
                  <b>무형의 소프트웨어 서비스</b>이며, 설치 파일이나 배송되는 물품은 없습니다.
                </p>
                <p style={{ marginTop: 8 }}>
                  현재 판매 중인 요금제는 <b>{plan.name} / {won(plan.priceWon)}</b> (부가세 포함)
                  하나입니다. 이용권은 <b>센터 단위</b>로, 소속 강사·직원 수에 관계없이 한 센터당
                  하나를 결제합니다.
                </p>
              </Section>

              <Section title="서비스 제공시기">
                <p>
                  결제가 완료되면 <b>즉시</b> 이용이 시작됩니다. 별도의 승인 대기나 설치 과정이
                  없습니다.
                </p>
              </Section>

              <Section title="서비스 제공기간">
                <p>
                  결제일부터 <b>1개월</b>입니다(만료일 당일까지 포함). 만료일이 지나면 자동으로
                  이용이 종료되며 <b>자동 결제되지 않습니다.</b>
                </p>
                <p style={{ marginTop: 8 }}>
                  만료 전에 미리 결제하시면 남은 기간을 잃지 않고 <b>기존 만료일 다음 날부터</b>{" "}
                  1개월이 더해집니다.
                </p>
              </Section>

              <Section title="주문 취소 · 청약철회">
                <ul style={ULS}>
                  <li>
                    <b>이용을 시작하지 않은 경우</b> — 결제일로부터 <b>7일 이내</b>에 취소하시면
                    위약금 없이 <b>전액 환불</b>해 드립니다(전자상거래법 제17조 청약철회).
                  </li>
                  <li>
                    <b>이용을 시작한 뒤</b>에는 청약철회가 제한되며, 아래 환불 규정에 따라 사용하신
                    기간을 공제하고 환불해 드립니다.
                  </li>
                  <li>
                    취소·환불은 결제하신 카드로 승인취소 또는 부분취소 방식으로 처리되며, 접수 후{" "}
                    <b>3영업일 이내</b>에 환급합니다.
                  </li>
                </ul>
              </Section>

              <Section title="교환 · 상품 변경">
                <p>
                  무형의 서비스로 배송되는 물품이 없어 <b>물품 교환에 해당하는 절차가 없습니다.</b>{" "}
                  현재 판매 중인 요금제가 1개월권 하나이므로 상품 간 변경도 발생하지 않습니다.
                  요금제가 추가되면 이 정책을 함께 갱신합니다.
                </p>
              </Section>

              <Section title="환불 규정">
                <p style={{ whiteSpace: "pre-line" }}>{seller.refundPolicy}</p>
                <p style={{ marginTop: 10, color: "#6B6560" }}>
                  이용기간이 끝나거나 환불하셔도 센터에 입력된 회원·매출·사진 등 데이터는 삭제되지
                  않습니다. 다시 결제하시면 그대로 이어서 사용하실 수 있습니다.
                </p>
              </Section>

              <Section title="결제 수단">
                <p>
                  신용·체크카드로 결제하실 수 있습니다. 결제는 전자지급결제대행사(PG)를 통해
                  처리되며 {SERVICE_NAME}는 카드 정보를 저장하지 않습니다. 자동결제(정기결제)는
                  운영하지 않습니다.
                </p>
              </Section>

              <Section title="문의">
                <p>
                  결제·환불 문의는 아래 연락처 또는 이메일로 접수해 주세요. 영업일 기준으로 빠르게
                  답변드립니다.
                </p>
              </Section>

              <div style={{ marginTop: 26 }}>
                <Link href="/pricing" className="lp-btn lp-btn-primary">
                  요금제로 돌아가기
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <SellerInfo seller={seller} hideRefundPolicy />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer-dark">
        <div className="lp-c">
          <div className="lp-footer-inner">
            <p className="lp-footer-copy">© 2026 모두의 지도사. All rights reserved.</p>
            <nav className="lp-footer-nav-right">
              <a href="/">홈</a>
              <a href="/pricing">요금제</a>
              <a href="/terms.html">이용약관</a>
              <a href="/privacy.html">개인정보처리방침</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

const ULS: React.CSSProperties = {
  margin: "4px 0 0",
  paddingLeft: 20,
  fontSize: 14.5,
  lineHeight: 1.8,
  color: "#5C564F",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#2F2A24" }}>{title}</h2>
      <div style={{ marginTop: 6, fontSize: 14.5, lineHeight: 1.8, color: "#5C564F" }}>
        {children}
      </div>
    </div>
  );
}
