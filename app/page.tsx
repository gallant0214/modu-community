export const revalidate = 60;

import Link from "next/link";
import { AppStoreButton } from "@/app/components/app-store-button";

export default async function Home() {

  return (
    <div className="lp" style={{ margin: "calc(-1 * (env(safe-area-inset-top, 0px) + 48px)) 0 calc(-1 * (env(safe-area-inset-bottom, 0px) + 20px)) 0" }}>

      <main>

        {/* ===== 1. 히어로 ===== */}
        <section className="lp-hero" id="about">
          <div className="lp-c">
            <div className="lp-hero-chip">Google Play 출시</div>
            <h1 className="lp-hero-title">
              시험장 후기부터 채용 공고까지,<br /><span className="hl">한 곳에서.</span>
            </h1>
            <p className="lp-hero-sub">
              블로그에 흩어진 실기·구술 후기, 알바 사이트에 묻힌 스포츠 채용 정보<br />
              — 이제 따로 찾지 마세요.
            </p>
            <div className="lp-hero-ctas">
              <Link href="/community" className="lp-btn lp-btn-primary">실기·구술 후기 보기</Link>
              <Link href="/jobs" className="lp-btn lp-btn-outline">구인 공고 탐색</Link>
            </div>
            <p className="lp-hero-note">무료 이용 · 가입 후 바로 시작</p>
          </div>
        </section>


        {/* ===== 3. Before → After ===== */}
        <section className="lp-section">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">왜 필요한가요?</div>
            <h2 className="lp-title">기존 방식 vs 모두의 지도사</h2>
            <div className="lp-compare">
              <div className="lp-compare-col lp-compare-before">
                <div className="lp-compare-header">😩 지금까지</div>
                <ul>
                  <li>블로그·카페에 흩어진 시험 후기</li>
                  <li>&quot;내 종목&quot; 후기만 찾으려면 수십 번 검색</li>
                  <li>일반 알바 사이트에 묻힌 스포츠 채용</li>
                  <li>근무조건·급여 비교가 어려움</li>
                </ul>
              </div>
              <div className="lp-compare-col lp-compare-after">
                <div className="lp-compare-header">✅ 모두의 지도사에서</div>
                <ul>
                  <li>종목·시험장별로 정리된 후기 아카이브</li>
                  <li>종목 선택 한 번이면 바로 확인</li>
                  <li>스포츠 업계 전용 구인 게시판</li>
                  <li>종목·지역·형태별 필터로 바로 비교</li>
                </ul>
              </div>
            </div>
          </div></div>
        </section>

        {/* ===== 4. 실기·구술 후기 ===== */}
        <section className="lp-section" id="community">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">실기·구술 후기</div>
            <h2 className="lp-title">합격한 선배의 시험장 후기,<br />바로 확인하세요.</h2>
            <p className="lp-desc">종목을 선택하면 해당 종목의 실기 동작 후기, 구술 질문 후기가 정리되어 있습니다.</p>
            <div className="lp-grid-3">
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📍</div>
                <h3>시험장별 후기</h3>
                <p className="lp-feature-example">&ldquo;2026년 1차 서울 시험장에서 스쿼트 깊이를 많이 봤습니다&rdquo;</p>
                <p>연도·차수·시험장 기준으로 정리된 생생한 후기</p>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">🎯</div>
                <h3>실전 포인트</h3>
                <p className="lp-feature-example">&ldquo;구술에서 도핑 관련 질문이 2개 나왔어요&rdquo;</p>
                <p>자주 나오는 동작, 감독관 스타일, 대기 시간 등</p>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">💬</div>
                <h3>질문하고 답받기</h3>
                <p className="lp-feature-example">&ldquo;벤치프레스 그립 넓이 기준이 있나요?&rdquo;</p>
                <p>댓글로 궁금한 점을 물어보면 경험자가 답해줍니다</p>
              </div>
            </div>
            <div className="lp-section-cta">
              <Link href="/community" className="lp-btn lp-btn-primary">종목별 후기 바로 보기 →</Link>
            </div>
          </div></div>
        </section>

        {/* ===== 5. 스포츠 구인 공고 ===== */}
        <section className="lp-section" id="jobs">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">스포츠 구인 공고</div>
            <h2 className="lp-title">스포츠 업계 전용 채용 정보,<br />여기서 찾으세요.</h2>
            <p className="lp-desc">헬스장 · PT · 필라테스 · 요가 · GX · 복싱 — 종목과 지역으로 필터링하세요.</p>
            <div className="lp-grid-2">
              <div className="lp-gc">
                <h3>💼 구직자</h3>
                <ul>
                  <li>스포츠·운동 업계 공고만 — 시간 낭비 없음</li>
                  <li>종목 · 지역 · 근무 형태로 필터링</li>
                  <li>급여 · 센터 분위기 등 실질 정보 비교</li>
                </ul>
                <p className="lp-gc-example">예: &ldquo;서울 강남 / 필라테스 / 정규직&rdquo;</p>
              </div>
              <div className="lp-gc">
                <h3>🏢 센터 운영자</h3>
                <ul>
                  <li>운동을 이해하는 지원자에게만 노출</li>
                  <li>불필요한 문의 없이 빠르게 연결</li>
                  <li>업계 경험자를 우선으로 만나는 전용 공간</li>
                </ul>
                <p className="lp-gc-example">예: &ldquo;경기 수원 / 헬스 PT / 파트타임&rdquo;</p>
              </div>
            </div>
            <div className="lp-section-cta">
              <Link href="/jobs" className="lp-btn lp-btn-primary">구인 공고 보러가기 →</Link>
            </div>
          </div></div>
        </section>

        {/* ===== 6. 타겟별 어필 ===== */}
        <section className="lp-section">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">이런 분께 추천</div>
            <h2 className="lp-title">나에게 맞는 기능이 있는지 확인하세요.</h2>
            <div className="lp-persona-grid">
              <div className="lp-persona"><span className="lp-persona-emoji">📚</span><h3>실기·구술 초시생</h3><p>필기 합격 후 막막한 분</p></div>
              <div className="lp-persona"><span className="lp-persona-emoji">🔄</span><h3>재도전 수험생</h3><p>떨어진 이유를 점검하고 싶은 분</p></div>
              <div className="lp-persona"><span className="lp-persona-emoji">🏋️</span><h3>현직 트레이너</h3><p>후배에게 경험을 나눠주고 싶은 분</p></div>
              <div className="lp-persona"><span className="lp-persona-emoji">💼</span><h3>스포츠 구직자</h3><p>운동 분야 전용 일자리를 찾는 분</p></div>
              <div className="lp-persona"><span className="lp-persona-emoji">🏢</span><h3>센터 운영자</h3><p>업계 경험자를 채용하고 싶은 분</p></div>
              <div className="lp-persona"><span className="lp-persona-emoji">🎓</span><h3>체육 지도자</h3><p>정리된 시험 정보를 보여주고 싶은 분</p></div>
            </div>
          </div></div>
        </section>

        {/* ===== 7. 앱 미리보기 ===== */}
        <section className="lp-section">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">앱 미리보기</div>
            <h2 className="lp-title">앱에서는 이렇게 이용할 수 있어요</h2>
            <div className="lp-grid-3">
              <div className="lp-preview">
                <div className="lp-preview-icon">💬</div>
                <h3>후기 피드</h3>
                <p>종목·시험장별 후기를 카드 형식으로 탐색하고 북마크할 수 있습니다.</p>
              </div>
              <div className="lp-preview">
                <div className="lp-preview-icon">🔍</div>
                <h3>구인 공고 필터</h3>
                <p>종목 · 지역 · 근무 형태로 나에게 맞는 일자리를 찾으세요.</p>
              </div>
              <div className="lp-preview">
                <div className="lp-preview-icon">🔔</div>
                <h3>키워드 알림</h3>
                <p>관심 종목의 새 후기, 맞춤 구인 알림을 실시간으로 받아보세요.</p>
              </div>
            </div>
          </div></div>
        </section>

        {/* ===== 8. FAQ ===== */}
        <section className="lp-section" id="faq">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">FAQ</div>
            <h2 className="lp-title">자주 묻는 질문</h2>
            <FAQ q="Q. 무료인가요?" a="네, 완전 무료입니다. 앱 다운로드, 후기 열람, 구인 공고 확인 모두 무료이며 별도 결제 없이 이용 가능합니다." />
            <FAQ q="Q. 어떤 종목 후기를 볼 수 있나요?" a="생활스포츠지도사, 전문스포츠지도사, 유소년·노인스포츠지도사 등 체육지도자 자격시험 전 종목의 실기·구술 후기를 다루고 있습니다." />
            <FAQ q="Q. 구인 공고에는 어떤 분야가 있나요?" a="헬스장, PT 스튜디오, 필라테스, 요가, GX, 복싱, 수영 등 스포츠·운동 업계 전용 구인 공고만 모여 있습니다." />
            <FAQ q="Q. iOS에서도 이용할 수 있나요?" a="현재는 Android(Google Play)에서만 다운로드 가능합니다. iOS 버전은 준비 중이며, 출시되면 안내해 드리겠습니다." />
            <FAQ q="Q. 공식 시험 기관에서 운영하나요?" a="아니요. 공식 시험 주관 기관과 무관한 민간 정보 공유 서비스입니다. 반드시 공식 공지를 최종 기준으로 삼아 주세요." />
            <FAQ q="Q. 허위 공고를 발견하면?" a="앱 내 신고 기능을 통해 알려주세요. 내부 기준에 따라 게시글 삭제 및 계정 제한 조치를 진행합니다." />
          </div></div>
        </section>

        {/* ===== 9. 최종 CTA ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-final-cta">
              <div className="lp-label" style={{background:"rgba(255,255,255,.15)",color:"#fff"}}>앱 다운로드</div>
              <h2 className="lp-final-title">{`'모두의 지도사 커뮤니티' 앱에서`}<br />더 편하게 이용하세요.</h2>
              <p className="lp-final-sub">시험 후기 알림, 관심 종목 즐겨찾기, 구인 공고 필터링까지<br />앱에서 더 빠르고 편리하게 사용할 수 있습니다.</p>
              <div className="lp-final-buttons">
                <AppStoreButton />
                <a href="https://play.google.com/store/apps/details?id=com.moduji.app" target="_blank" rel="noopener" className="lp-badge-btn">
                  <svg className="lp-badge-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M3.18 23.76c.34.17.72.24 1.1.17.27-.05.53-.15.77-.3l7.94-4.56-3.22-3.2-6.8 6.76c-.12.12-.18.28-.16.44.03.24.16.47.37.6v.09zM.47 21.27c.02.11.05.22.09.33l.02.02c.03-.05.06-.1.1-.14l7.3-7.26L.9 7.18c-.28.39-.44.86-.44 1.35l.01 12.74zM20.89 11.32L17.3 9.26l-3.65 3.63 3.65 3.63 3.59-2.06c.68-.4 1.09-1.12 1.09-1.91v-.32c-.1-.48-.41-.89-.84-1.12l-.25.21zM4.55.26C4.3.1 4.02.02 3.73 0c-.37-.03-.73.09-1.01.32l-.05.05 9.89 9.83 3.23-3.2L5.33.56c-.25-.14-.51-.24-.78-.3z"/></svg>
                  <span>
                    <span className="lp-badge-sub">GET IT ON</span>
                    <span className="lp-badge-main">Google Play</span>
                  </span>
                </a>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ===== Footer ===== */}
      <footer className="lp-footer-dark">
        <div className="lp-c">
          <div className="lp-footer-inner">
            <p className="lp-footer-copy">© 2026 모두의 지도사. All rights reserved.</p>
            <nav className="lp-footer-nav-right">
              <a href="/">맨 위로</a>
              <a href="#about">서비스 소개</a>
              <a href="#faq">FAQ</a>
              <a href="/terms.html">이용약관</a>
              <a href="/privacy.html">개인정보처리방침</a>
            </nav>
          </div>
        </div>
      </footer>

      {/* Floating */}
      <div className="lp-float">
        <a href="https://open.kakao.com/o/soLx7Eei" target="_blank" rel="noopener" className="lp-float-btn lp-float-kakao" aria-label="카카오톡 문의">💬</a>
      </div>

    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="lp-faq-item">
      <div className="lp-faq-q">{q}</div>
      <div className="lp-faq-a">{a}</div>
    </div>
  );
}
