import type { Metadata } from "next";
import Link from "next/link";
import { AppStoreButton } from "@/app/components/app-store-button";
import { GooglePlayButton } from "@/app/components/google-play-button";

export const metadata: Metadata = {
  title: "체육지도사 자격시험 공부 자료 — 모두의 지도사",
  description:
    "연간 시험 일정 흐름, 공식 자료 안내, 종목별 실기·구술, 시험 커뮤니티까지 체육지도사 자격시험 준비 통합 가이드.",
};

export const revalidate = 3600;

// 외부 공식 소스 — KSPO (공공 저작물)
const KSPO_HOME = "https://sqms.kspo.or.kr";
const KAKAO_INQUIRY = "https://open.kakao.com/o/gvup8fki";

type RoadmapStep = {
  step: string;
  icon: string;
  title: string;
  desc: string;
  cta: { label: string; href: string; external?: boolean };
};

const ROADMAP: RoadmapStep[] = [
  {
    step: "STEP 1",
    icon: "📄",
    title: "공식 공고로 시작하기",
    desc:
      "자격 종류·종목·응시 요건·시험장은 매년 KSPO 공식 공고에서 확정됩니다. 어떤 자격을 어떤 종목으로 볼지 공식 자료로 먼저 확인하세요.",
    cta: { label: "KSPO 공식 공고 바로가기 ↗", href: KSPO_HOME, external: true },
  },
  {
    step: "STEP 2",
    icon: "📅",
    title: "연간 일정 흐름 익히기",
    desc:
      "필기 → 실기·구술 → 연수 → 최종 합격까지 흐름을 미리 잡으면 공부 순서가 명확해집니다. 아래 표에서 매년 반복되는 월별 패턴을 확인하세요.",
    cta: { label: "일정 흐름 보기 ↓", href: "#annual" },
  },
  {
    step: "STEP 3",
    icon: "🏋️",
    title: "종목별 실기·구술 자료",
    desc:
      "전 종목의 실기 평가 기준·동작 체크리스트·구술 예상 질문과 답변을 정리해뒀습니다. 종목을 고르면 세부 자료로 바로 이동합니다.",
    cta: { label: "실기·구술 자료 보기", href: "/practical" },
  },
  {
    step: "STEP 4",
    icon: "💬",
    title: "종목별 커뮤니티에서 공유",
    desc:
      "실제 시험장 후기, 감독관 질문, 당일 체크 포인트는 먼저 본 사람에게서 가장 빠르게 얻을 수 있습니다. 종목별 게시판에서 질문·답변하세요.",
    cta: { label: "종목별 커뮤니티 가기", href: "/community" },
  },
  {
    step: "STEP 5",
    icon: "📱",
    title: "앱으로 어디서나 학습",
    desc:
      "실기 동작·구술 질문·시험 공지까지 앱에서 바로 열람할 수 있습니다. iOS·Android 모두 무료.",
    cta: { label: "앱 다운로드 ↓", href: "#app" },
  },
  {
    step: "STEP 6",
    icon: "🗣️",
    title: "실시간 문의 — 오픈 카톡",
    desc:
      "실기·구술·필기 관련 궁금한 점은 모두의 지도사 공식 오픈 카톡방에서 바로 물어볼 수 있습니다.",
    cta: { label: "오픈 카톡방 입장 ↗", href: KAKAO_INQUIRY, external: true },
  },
];

// 연간 흐름 — 정확한 일자는 매년 KSPO 공고로 확정되므로 '월' 단위 패턴만 안내
const ANNUAL_FLOW: { month: string; stage: string; detail: string }[] = [
  { month: "3월 말 ~ 4월 초", stage: "필기 접수", detail: "KSPO 자격검정 사이트에서 종목 선택 후 접수" },
  { month: "4월 중순", stage: "필기 시험", detail: "지역별 지정 고사장에서 시행" },
  { month: "5월 초 ~ 중순", stage: "필기 합격자 발표", detail: "KSPO 공식 사이트에서 확인" },
  { month: "5월 중순 ~ 6월 초", stage: "실기·구술 접수", detail: "종목별 시험장·일정 선택" },
  { month: "5월 말 ~ 7월 초", stage: "실기·구술 시행", detail: "종목별 지정일 중 하루 응시" },
  { month: "7월 중순", stage: "실기·구술 합격자 발표", detail: "KSPO 공식 사이트에서 확인" },
  { month: "7월 하순", stage: "연수 접수", detail: "지정 연수기관 신청" },
  { month: "8월 초 ~ 10월 중순", stage: "연수 (일반·현장실습)", detail: "지정 기간 중 시행" },
  { month: "12월 초", stage: "최종 합격자 발표", detail: "모든 과정 통과 시 자격 취득" },
];

const OFFICIAL_RESOURCES: { label: string; href: string; desc: string }[] = [
  {
    label: "체육지도자 자격검정시스템 (KSPO)",
    href: "https://sqms.kspo.or.kr",
    desc: "공식 접수·공고·합격자 발표",
  },
  {
    label: "KSPO 자격 정보 안내",
    href: "https://sqms.kspo.or.kr/qualfct/qualGuide.kspo",
    desc: "자격 종류·응시 요건·시험 과목",
  },
  {
    label: "국민체육진흥공단",
    href: "https://www.kspo.or.kr",
    desc: "체육 전반 정책·사업 안내",
  },
];

const SPORT_CARDS: { emoji: string; title: string; desc: string }[] = [
  { emoji: "🏋️", title: "보디빌딩", desc: "실기 동작 체크리스트, 포징, 구술 Q&A" },
  { emoji: "🏊", title: "수영", desc: "영법 동작, 지도 포인트, 구술 자료" },
  { emoji: "🥊", title: "복싱·킥복싱", desc: "기본 자세, 미트·콤비네이션, 평가 기준" },
  { emoji: "⚽", title: "축구·배드민턴·테니스", desc: "구기 종목별 기술·전술 자료" },
  { emoji: "🧘", title: "요가·필라테스", desc: "자세·시퀀스·지도법 포인트" },
  { emoji: "👴", title: "노인·유소년", desc: "대상별 지도 특성, 안전 수칙" },
];

export default function StudyGuidePage() {
  return (
    <main className="lp" style={{ margin: "calc(-1 * (env(safe-area-inset-top, 0px) + 56px)) 0 calc(-1 * (env(safe-area-inset-bottom, 0px) + 20px)) 0" }}>
      {/* ===== HERO ===== */}
      <section className="lp-hero">
        <div className="lp-c">
          <div className="lp-hero-chip">공부 자료 · 공식 공고 · 종목별 자료 · 커뮤니티</div>
          <h1 className="lp-hero-title">
            체육지도사 자격시험
            <br />
            준비를 돕는 공부 가이드
          </h1>
          <p className="lp-hero-sub">
            연간 시험 일정 흐름, 공식 자료, 종목별 실기·구술 자료, 시험 커뮤니티까지
            <br />
            필요한 모든 것을 모두의 지도사 안에서 한 번에 이어가세요.
          </p>
          <div className="lp-hero-ctas">
            <Link href="/practical" className="lp-btn lp-btn-primary">실기·구술 자료 보기</Link>
            <Link href="/community" className="lp-btn lp-btn-outline">종목별 커뮤니티</Link>
            <a href={KAKAO_INQUIRY} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-soft">
              💬 오픈 카톡 문의
            </a>
          </div>
          <p className="lp-hero-note">무료 자료 · 공식 공고 안내 · 종목별 커뮤니티 · 24시간 Q&amp;A</p>
        </div>
      </section>

      <main>
        {/* ===== 1. 공부 로드맵 ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">공부 로드맵</div>
              <h2 className="lp-title">무엇부터, 어떻게 공부하면 될지 순서대로</h2>
              <p className="lp-desc">
                막연히 교재부터 사기보다, 공식 공고를 먼저 확인하고 → 연간 흐름을 익힌 뒤 → 종목별 자료로 넘어가는 것을 추천합니다.
                아래 6단계를 따라가면 흩어진 정보 때문에 돌아가는 일이 줄어듭니다.
              </p>
              <div className="lp-grid-3" style={{ marginTop: 20 }}>
                {ROADMAP.map((r) => (
                  <div key={r.step} className="lp-feature-card">
                    <div className="lp-feature-icon">{r.icon}</div>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "#8C8270", letterSpacing: 1, marginBottom: 4 }}>
                      {r.step}
                    </div>
                    <h3>{r.title}</h3>
                    <p>{r.desc}</p>
                    <div style={{ marginTop: 10 }}>
                      {r.cta.external ? (
                        <a
                          href={r.cta.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#6B7B3A",
                            fontWeight: 600,
                            fontSize: 12.5,
                            textDecoration: "none",
                          }}
                        >
                          {r.cta.label}
                        </a>
                      ) : (
                        <Link
                          href={r.cta.href}
                          style={{
                            color: "#6B7B3A",
                            fontWeight: 600,
                            fontSize: 12.5,
                            textDecoration: "none",
                          }}
                        >
                          {r.cta.label}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== 2. 연간 시험 일정 흐름 ===== */}
        <section className="lp-section" id="annual">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">연간 시험 일정 흐름</div>
              <h2 className="lp-title">매년 반복되는 월별 패턴</h2>
              <p className="lp-desc">
                정확한 일자는 매년 KSPO 공식 공고에서 발표됩니다. 아래 표는 생활 2급·유소년·노인 기준의
                일반적인 흐름이며, 종목과 자격 종류에 따라 ±1~2주 편차가 있을 수 있습니다. 반드시 공식 공고를 함께 확인하세요.
              </p>
              <div
                style={{
                  marginTop: 20,
                  overflow: "hidden",
                  border: "1px solid #E8E0D0",
                  borderRadius: 16,
                  background: "#FEFCF7",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <thead>
                      <tr style={{ background: "#F5F0E5", color: "#6B5D47" }}>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>시기</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, whiteSpace: "nowrap" }}>단계</th>
                        <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600 }}>참고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ANNUAL_FLOW.map((row, i) => (
                        <tr key={row.stage} style={{ borderTop: i === 0 ? "none" : "1px solid #F2EBDD" }}>
                          <td style={{ padding: "12px 16px", color: "#3A342A", fontWeight: 600, whiteSpace: "nowrap" }}>{row.month}</td>
                          <td style={{ padding: "12px 16px", color: "#6B7B3A", fontWeight: 600, whiteSpace: "nowrap" }}>{row.stage}</td>
                          <td style={{ padding: "12px 16px", color: "#6B5D47" }}>{row.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="lp-section-cta" style={{ marginTop: 20 }}>
                <a href={KSPO_HOME} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary">
                  KSPO 공식 공고에서 올해 일정 확인 ↗
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 3. 공식 자료 안내 ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">공식 자료 안내</div>
              <h2 className="lp-title">기출문제·시행공고·응시요건은 KSPO 공식 사이트에서</h2>
              <p className="lp-desc">
                기출문제·정답표, 응시요건, 종목별 시행공고 같은 공식 자료는 KSPO 자격검정시스템에서 바로 받을 수 있습니다.
                검증되지 않은 사설 자료를 보기 전에 공식 자료부터 열어보시는 걸 권합니다.
              </p>
              <div className="lp-grid-3" style={{ marginTop: 20 }}>
                {OFFICIAL_RESOURCES.map((o) => (
                  <a
                    key={o.href}
                    href={o.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "block",
                      padding: "20px 22px",
                      borderRadius: 16,
                      background: "#FEFCF7",
                      border: "1px solid #E8E0D0",
                      textDecoration: "none",
                      transition: "all 0.15s",
                    }}
                  >
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "#2A251D", marginBottom: 6 }}>
                      {o.label}
                    </div>
                    <div style={{ fontSize: 12.5, color: "#6B5D47", lineHeight: 1.4 }}>{o.desc}</div>
                    <div style={{ marginTop: 10, fontSize: 12, color: "#6B7B3A", fontWeight: 600 }}>바로가기 ↗</div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== 4. 종목별 자료 ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">종목별 실기·구술 자료</div>
              <h2 className="lp-title">전 종목 실기 평가 기준과 구술 질문을 한곳에</h2>
              <p className="lp-desc">
                보디빌딩·수영·축구·테니스·요가 등 종목별로 실기 동작 체크리스트, 평가 기준, 구술 예상 질문과 답변까지 정리되어 있습니다.
                종목을 고르면 바로 세부 자료로 이동합니다.
              </p>
              <div className="lp-grid-3" style={{ marginTop: 20 }}>
                {SPORT_CARDS.map((s) => (
                  <div key={s.title} className="lp-feature-card">
                    <div className="lp-feature-icon">{s.emoji}</div>
                    <h3>{s.title}</h3>
                    <p>{s.desc}</p>
                  </div>
                ))}
              </div>
              <div className="lp-section-cta">
                <Link href="/practical" className="lp-btn lp-btn-primary">전 종목 실기·구술 자료 보기 →</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 5. 커뮤니티 ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">종목별 커뮤니티</div>
              <h2 className="lp-title">먼저 본 사람에게 가장 빠르게 묻기</h2>
              <p className="lp-desc">
                시험 당일 분위기·감독관 질문·실수 포인트는 PDF보다 먼저 응시한 수험생이 가장 생생하게 알려줍니다.
                종목별 게시판에서 후기와 질문·답변을 공유하세요. 익명 가입, 무료.
              </p>
              <div className="lp-grid-2" style={{ marginTop: 20 }}>
                <div className="lp-gc">
                  <h3>💬 시험 후기</h3>
                  <ul>
                    <li>시험장별 분위기·대기 시간</li>
                    <li>감독관 질문 유형</li>
                    <li>실수 사례와 대응 팁</li>
                    <li>합격 후기와 공부 방법</li>
                  </ul>
                </div>
                <div className="lp-gc">
                  <h3>❓ 질문·답변</h3>
                  <ul>
                    <li>실기 동작·평가 기준 질문</li>
                    <li>구술 암기 어려운 포인트</li>
                    <li>필기 과목 선택 상담</li>
                    <li>연수·현장실습 안내</li>
                  </ul>
                </div>
              </div>
              <div className="lp-section-cta">
                <Link href="/community" className="lp-btn lp-btn-primary">종목별 커뮤니티 가기 →</Link>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 6. 앱 ===== */}
        <section className="lp-section" id="app">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">무료 앱</div>
              <h2 className="lp-title">앱에서 바로 자료 열람과 알림 받기</h2>
              <p className="lp-desc">
                공지 알림, 종목별 실기 동작, 구술 질문·답변, 즐겨찾기까지 — 공부 자료를 모바일에서 바로 이용하세요.
              </p>
              <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 24 }}>
                <AppStoreButton />
                <GooglePlayButton />
              </div>
            </div>
          </div>
        </section>

        {/* ===== 7. 오픈 카톡방 ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">공식 오픈 카톡방</div>
              <h2 className="lp-title">실기·구술·필기 궁금한 점은 바로 물어보기</h2>
              <p className="lp-desc">
                방 분위기와 질문 품질을 지키기 위해 아래 이용 약속에 동의하신 분만 참여 부탁드립니다.
              </p>
              <div className="lp-grid-2" style={{ marginTop: 20 }}>
                <div className="lp-gc">
                  <h3>✔ 가능한 내용</h3>
                  <ul>
                    <li>실기·구술·필기 관련 질문</li>
                    <li>공부 방법·후기·팁 공유</li>
                    <li>종목 지식 교환</li>
                    <li>모두의 지도사 서비스 문의</li>
                  </ul>
                </div>
                <div className="lp-gc">
                  <h3>❌ 금지</h3>
                  <ul>
                    <li>광고·마케팅 링크 투척</li>
                    <li>유료 강의·개인 서비스 바이럴</li>
                    <li>욕설·비방·분쟁 유발</li>
                    <li>시험과 무관한 과도한 잡담</li>
                  </ul>
                </div>
              </div>
              <p style={{ marginTop: 16, fontSize: 12.5, color: "#8C8270", textAlign: "center" }}>
                약속을 지키기 어려운 경우 안내 후 방 퇴장 조치될 수 있습니다.
              </p>
              <div className="lp-section-cta" style={{ marginTop: 16 }}>
                <a
                  href={KAKAO_INQUIRY}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "14px 28px",
                    background: "#FEE500",
                    color: "#191919",
                    borderRadius: 12,
                    fontWeight: 700,
                    fontSize: 14,
                    textDecoration: "none",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 3.5C6.755 3.5 2.5 6.948 2.5 11.2c0 2.71 1.736 5.099 4.378 6.475l-1.13 4.115c-.058.21.183.385.357.262l4.93-3.218c.327.025.66.038.965.038 5.245 0 9.5-3.448 9.5-7.7C21.5 6.948 17.245 3.5 12 3.5z"
                      fill="#191919"
                    />
                  </svg>
                  오픈 카톡방 입장
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* ===== 8. 간단 FAQ ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-card">
              <div className="lp-label">공부 FAQ</div>
              <h2 className="lp-title">자주 묻는 질문</h2>
              <div className="lp-faq-item">
                <div className="lp-faq-q">Q. 모든 자료가 무료인가요?</div>
                <div className="lp-faq-a">네, 홈페이지·앱·오픈 카톡방 모두 무료입니다. 자격 응시료 같은 공식 비용은 KSPO에서 별도로 안내됩니다.</div>
              </div>
              <div className="lp-faq-item">
                <div className="lp-faq-q">Q. 어떤 종목의 자료가 있나요?</div>
                <div className="lp-faq-a">생활·전문·유소년·노인 체육지도사 자격 종목 전반의 실기·구술 자료를 다루고 있습니다. 신규 종목은 수험생 요청과 자료 수집 상황에 따라 추가됩니다.</div>
              </div>
              <div className="lp-faq-item">
                <div className="lp-faq-q">Q. 모두의 지도사는 공식 시험 기관인가요?</div>
                <div className="lp-faq-a">아니요. 공식 시험 주관 기관(KSPO)과는 무관한 민간 정보 공유·커뮤니티 서비스입니다. 반드시 공식 공고를 최종 기준으로 삼아 주세요.</div>
              </div>
              <div className="lp-faq-item">
                <div className="lp-faq-q">Q. 자료에 오류가 있으면 어떻게 하나요?</div>
                <div className="lp-faq-a">앱 안의 공유 버튼 또는 공식 오픈 카톡방으로 알려주시면 확인 후 빠르게 수정합니다.</div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </main>
  );
}
