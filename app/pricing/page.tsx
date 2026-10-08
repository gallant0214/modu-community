import Link from "next/link";
import type { Metadata } from "next";
import { SAAS_PLANS, won } from "@/app/lib/saas-plans";
import { platformSeller, SERVICE_NAME } from "@/app/lib/platform-seller";
import SellerInfo from "@/app/pay/SellerInfo";

export const metadata: Metadata = {
  title: "센터 CRM 요금제",
  description:
    "모두의지도사 센터 CRM 이용권. 회원 관리부터 매출 정산까지 한 달 단위로 이용하실 수 있습니다.",
};

/**
 * /pricing — 공개 요금제 페이지.
 *
 * 🚨 **로그인 없이** 상품·가격·규정이 모두 보여야 한다. PG 심사원이 이 주소를 열어
 *    상품이 실제로 판매 가능한 상태인지 확인한다.
 *
 * 🚨 심사 필수 기재 5항목을 그대로 넣는다 — 서비스 제공시기 / 서비스 제공기간 /
 *    주문 취소·청약철회 / 교환 / 환불. '교환' 과 '취소' 는 **단어 자체를** 찾으므로
 *    환불 규정만 있으면 반려된다. (센터 판매 페이지에서 한 번 겪은 일)
 *
 * 🚨 홈과 같은 `lp-*` CSS 시스템을 쓴다(globals.css). Tailwind 가 아니다.
 *    공개 페이지는 다크모드가 전역으로 꺼져 있어(app/layout.tsx) `dark:` 는 쓰지 않는다.
 */
export default function PricingPage() {
  const seller = platformSeller();

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
            <div className="lp-hero-chip">센터 CRM 이용권</div>
            <h1 className="lp-hero-title">
              회원 관리부터 매출 정산까지,
              <br />
              한 달 단위로 쓰세요
            </h1>
            <p className="lp-hero-sub">
              {SERVICE_NAME} 센터 CRM 은 체육시설 운영에 필요한 기능을 한곳에 모은
              웹 서비스입니다. 설치할 것도, 약정도 없습니다.
            </p>
          </div>
        </section>

        {/* ===== 요금제 ===== */}
        <section className="lp-section" id="plans">
          <div className="lp-c">
            {SAAS_PLANS.map((plan) => (
              <div className="lp-card" key={plan.code}>
                <div className="lp-label">요금제</div>
                <h2 className="lp-title">{plan.name}</h2>
                <p className="lp-desc">{plan.summary}</p>

                <div style={{ margin: "20px 0 4px", display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: "#2F2A24" }}>
                    {won(plan.priceWon)}
                  </span>
                  <span style={{ fontSize: 15, color: "#6B6560" }}>
                    / {plan.periodMonths}개월 (부가세 포함)
                  </span>
                </div>
                <p className="lp-hero-note" style={{ marginTop: 4 }}>
                  자동 갱신 없이 결제한 기간만 이용됩니다. 약정·해지 위약금이 없습니다.
                </p>

                <ul style={{ margin: "22px 0 0", padding: 0, listStyle: "none" }}>
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        padding: "9px 0",
                        borderTop: "1px solid #EFE8DC",
                        fontSize: 15,
                        color: "#3A342A",
                      }}
                    >
                      <span style={{ color: "#4A6D5E", fontWeight: 700, marginRight: 8 }}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="lp-section-cta" style={{ marginTop: 26 }}>
                  <Link href="/billing" className="lp-btn lp-btn-primary">
                    이용권 구매하기 →
                  </Link>
                </div>
                <p className="lp-hero-note" style={{ marginTop: 10 }}>
                  구매는 {SERVICE_NAME} 회원가입 후 센터를 등록하신 다음 진행하실 수 있습니다.
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ===== 🚨 PG 심사 필수 기재 5항목 ===== */}
        <section className="lp-section" id="guide">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">구매 안내</div>
              <h2 className="lp-title">결제 전에 확인해 주세요</h2>

              <Guide label="서비스 제공시기">
                결제가 완료되면 <b>즉시</b> 센터 CRM 을 이용하실 수 있습니다. 설치하거나 배송받는
                물품은 없습니다.
              </Guide>

              <Guide label="서비스 제공기간">
                결제일부터 <b>1개월</b>입니다. 만료일이 지나면 자동으로 이용이 종료되며, 자동
                결제되지 않습니다. 만료 전에 미리 결제하시면 남은 기간에 이어서 1개월이
                더해집니다.
              </Guide>

              <Guide label="주문 취소 · 청약철회">
                이용을 시작하지 않으셨다면 결제일로부터 <b>7일 이내</b>에 취소하시면 위약금 없이{" "}
                <b>전액 환불</b>해 드립니다(전자상거래법 제17조). 접수 후 <b>3영업일 이내</b>에
                결제하신 카드로 환급됩니다.
              </Guide>

              <Guide label="교환 · 상품 변경">
                무형의 서비스로 배송되는 물품이 없어 <b>물품 교환 절차가 없습니다.</b> 현재 판매
                중인 요금제가 1개월권 하나이므로 상품 간 변경도 발생하지 않습니다.
              </Guide>

              <Guide label="환불">
                이용을 시작하신 뒤에는 <b>남은 이용기간에 해당하는 금액을 일 단위로 계산해</b>{" "}
                환불해 드립니다. 이용기간이 끝나도 센터 데이터는 그대로 보존되며, 다시 결제하시면
                이어서 사용하실 수 있습니다.
              </Guide>

              <div style={{ marginTop: 20 }}>
                <Link href="/pricing/policy" className="lp-btn lp-btn-outline">
                  판매 · 환불 정책 전문 보기
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 결제 수단 ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">결제 수단</div>
              <h2 className="lp-title">신용 · 체크카드</h2>
              {/* 🚨 PG 계약에 신청한 결제수단과 반드시 일치해야 한다.
                  여기에 없는 수단을 적으면 "계약에 없는 수단" 으로 지적된다. */}
              <p className="lp-desc">
                결제는 전자지급결제대행사(PG)를 통해 안전하게 처리되며, {SERVICE_NAME}는 카드
                정보를 저장하지 않습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">자주 묻는 질문</div>
              <h2 className="lp-title">결제와 이용</h2>
              <div className="lp-faq-item">
                <div className="lp-faq-q">이용권이 만료되면 데이터가 지워지나요?</div>
                <div className="lp-faq-a">
                  아닙니다. 회원·매출·사진 등 센터 데이터는 그대로 보존됩니다. 다시 결제하시면
                  끊긴 지점부터 이어서 사용하실 수 있습니다.
                </div>
              </div>
              <div className="lp-faq-item">
                <div className="lp-faq-q">센터에 강사가 여러 명인데 인원마다 결제해야 하나요?</div>
                <div className="lp-faq-a">
                  아닙니다. 이용권은 <b>센터 단위</b>입니다. 소속 강사·직원 수에 관계없이 한 센터당
                  하나만 결제하시면 됩니다.
                </div>
              </div>
              <div className="lp-faq-item">
                <div className="lp-faq-q">누가 결제할 수 있나요?</div>
                <div className="lp-faq-a">
                  센터 대표자로 등록된 분만 결제하실 수 있습니다. 결제 내역과 환불 대상이 명확해야
                  하기 때문입니다.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 🚨 사업자정보 — 전자상거래법 의무이자 PG 심사 반려 사유 1순위.
            센터 정보가 아니라 플랫폼(우리) 사업자 정보를 쓴다. */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <SellerInfo seller={seller} />
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
              <a href="/pricing/policy">판매·환불 정책</a>
              <a href="/terms.html">이용약관</a>
              <a href="/privacy.html">개인정보처리방침</a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Guide({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: "#2F2A24" }}>{label}</div>
      <p style={{ margin: "4px 0 0", fontSize: 14.5, lineHeight: 1.75, color: "#5C564F" }}>
        {children}
      </p>
    </div>
  );
}
