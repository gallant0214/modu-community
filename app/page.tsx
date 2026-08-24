export const revalidate = false;

import Link from "next/link";
import { AppStoreButton } from "@/app/components/app-store-button";
import { GooglePlayButton } from "@/app/components/google-play-button";

export default async function Home() {

  return (
    <div className="lp" style={{ margin: "calc(-1 * (env(safe-area-inset-top, 0px) + 56px)) 0 calc(-1 * (env(safe-area-inset-bottom, 0px) + 20px)) 0" }}>

      <main>

        {/* ===== 1. 히어로 ===== */}
        <section className="lp-hero" id="about">
          <div className="lp-c">
            <div className="lp-hero-chip">커뮤니티 · 스포츠 구인 · 스포츠 거래 · 시험 준비 · 회원관리 CRM</div>
            <h1 className="lp-hero-title">
              체육지도사를 준비하고
              <br />
              현장에서 일하는 사람들의 브랜드 허브
            </h1>
            <p className="lp-hero-sub">
              종목별 후기와 정보 공유, 스포츠 업계 채용·거래, 그리고 기출문제 풀이까지.
              <br />
              흩어진 준비 과정을 모두의 지도사 브랜드 안에서 더 차분하게 이어가세요.
            </p>
            <div className="lp-hero-ctas">
              <Link href="/community" className="lp-btn lp-btn-primary">종목별 커뮤니티 보기</Link>
              <Link href="/crm/members" className="lp-btn lp-btn-outline">회원관리 CRM</Link>
              <Link href="/jobs" className="lp-btn lp-btn-outline">구인 공고 탐색</Link>
              <Link href="/trade" className="lp-btn lp-btn-outline">스포츠 거래 보기</Link>
              <a
                href="https://modujidosa.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="lp-btn lp-btn-soft"
              >
                모두의지도사 앱 보기
              </a>
            </div>
            <p className="lp-hero-note">무료 커뮤니티 · 스포츠 업계 전용 구인·거래 · 기출문제 풀이앱 연결</p>
          </div>
        </section>

        {/* ===== 2. 브랜드 연결 ===== */}
        <section className="lp-section">
          <div className="lp-c">
            <div className="lp-brand-bridge">
              <div>
                <div className="lp-label">브랜드 안내</div>
                <h2 className="lp-title">커뮤니티와 학습을 함께 이어가는 모두의 지도사</h2>
                <p className="lp-desc">
                  이 홈페이지에서는 종목별 경험, 질문, 현장 이야기, 스포츠 구인·거래 정보를 모아보고,
                  {' '}
                  <a
                    href="https://modujidosa.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lp-inline-link"
                  >
                    모두의지도사
                  </a>
                  에서는 기출문제, 오답노트, 모의고사 중심의 학습을 이어갈 수 있습니다.
                </p>
              </div>
              <div className="lp-brand-grid">
                <div className="lp-brand-card">
                  <div className="lp-brand-kicker">moducm.com</div>
                  <h3>정보를 찾고 연결되는 커뮤니티</h3>
                  <p>종목별 후기, 질문, 준비 팁, 스포츠 구인 공고와 거래 게시판을 한곳에서 살펴보세요.</p>
                </div>
                <a
                  href="https://modujidosa.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="lp-brand-card lp-brand-card-link"
                >
                  <div className="lp-brand-kicker">modujidosa.com</div>
                  <h3>기출문제 풀이와 학습에 집중하는 앱</h3>
                  <p>스포츠지도사 자격시험 준비를 위한 기출문제, 오답노트, 모의고사를 이어서 확인하세요.</p>
                  <span className="lp-brand-link">모두의지도사 바로가기 ↗</span>
                </a>
              </div>
            </div>
          </div>
        </section>


        {/* ===== 5.5 회원관리 CRM ===== */}
        <section className="lp-section" id="section-crm">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">회원관리 CRM · 신규</div>
            <h2 className="lp-title">체육시설 사장님과 프리랜서 강사를 위한<br />올인원 회원관리 도구</h2>
            <p className="lp-desc">회원 등록부터 이용권·수강권 발급, 스케줄·예약·출석, 마일리지, 락커, 전자 계약서까지 — 별도 프로그램 없이 웹 브라우저 하나로 관리하세요.</p>
            <div className="lp-grid-2">
              <div className="lp-gc">
                <h3>🏢 센터 CRM</h3>
                <ul>
                  <li>다인 사업장(센터장 · 관리자 · 강사 · 프론트) 권한 분리</li>
                  <li>회원별 이용권·락커·운동복 · 결제 · 미수금 · 예약 · 출석 통합</li>
                  <li>강사 수업료 · 급여 자동 산정, 성과급 구간 지원</li>
                  <li>얼굴 인식/번호 입력 터치 출석, 음성 안내</li>
                </ul>
                <p className="lp-gc-example">예: &ldquo;3층 필라테스 스튜디오, 강사 5명 · 회원 200명 관리&rdquo;</p>
              </div>
              <div className="lp-gc">
                <h3>🧑‍🏫 개인 CRM</h3>
                <ul>
                  <li>1인 프리랜서 강사 전용 축소 UI</li>
                  <li>내 회원 · 내 수강권 · 내 스케줄 · 내 급여만 한눈에</li>
                  <li>여러 센터를 오가며 담당하는 회원도 통합 조회</li>
                  <li>개인 상품 카탈로그(PT · 그룹 수업) 별도 관리</li>
                </ul>
                <p className="lp-gc-example">예: &ldquo;여러 센터에 출강하는 PT 강사, 회원별 진행 상황을 한 화면에&rdquo;</p>
              </div>
            </div>

            <div className="lp-grid-3" style={{ marginTop: 24 }}>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📅</div>
                <h3>스케줄 · 예약</h3>
                <p className="lp-feature-example">&ldquo;내일 10시 회원 3명 노쇼 사유까지 기록&rdquo;</p>
                <p>강사별 캘린더, 드래그 이동, 겹침 자동 분할, 노쇼/취소 사유 이력</p>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">✅</div>
                <h3>터치 출석</h3>
                <p className="lp-feature-example">&ldquo;출석번호 or 얼굴만 대면 자동 체크인&rdquo;</p>
                <p>번호 / 얼굴 / 번호+얼굴 3가지 모드 + 만료·생일·저세션 음성 안내</p>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">💳</div>
                <h3>이용권 · 결제</h3>
                <p className="lp-feature-example">&ldquo;회원권+락커+운동복 장바구니 한번에 결제&rdquo;</p>
                <p>회원권/수강권 발급, 정지·홀딩, 미수금, 자동 마일리지 적립</p>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📝</div>
                <h3>전자 계약서</h3>
                <p className="lp-feature-example">&ldquo;결제 즉시 서명 링크 발송, 서명 이력 자동 보관&rdquo;</p>
                <p>템플릿 선택 → 회원 서명 → 이중 서명 저장 (SMS · 앱 푸시 발송 예정)</p>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">📈</div>
                <h3>대시보드 · 통계</h3>
                <p className="lp-feature-example">&ldquo;이번 달 매출·수업료·미수금·만료 임박 한 눈에&rdquo;</p>
                <p>센터장/강사 관점 분리, 시간대 · 요일 매출, 리텐션 · 활성 회원 KPI</p>
              </div>
              <div className="lp-feature-card">
                <div className="lp-feature-icon">🔔</div>
                <h3>자동 알림</h3>
                <p className="lp-feature-example">&ldquo;만료 D-3, 생일, 저세션 회원에 자동 안내&rdquo;</p>
                <p>트리거별 on/off · 개별 문구 관리 (실 발송 채널은 순차 오픈)</p>
              </div>
            </div>

            <div className="lp-gc" style={{ marginTop: 24 }}>
              <h3>Q. 회원관리 CRM은 뭔가요?</h3>
              <p>
                여러 체육시설을 오가며 수업을 진행하는 1인(프리랜서) 강사부터, 여러 회원의 수업 예약을
                관리해야 하는 운동 센터까지 — 모두를 위한 회원관리 도구입니다.
              </p>
              <p style={{ marginTop: 8 }}>
                회원 등록, 이용권·수강권 발급, 스케줄·예약 관리, 얼굴/번호 터치 출석, 마일리지, 락커,
                전자 계약서, 강사 급여 자동 산정까지 별도 프로그램 설치 없이 웹 브라우저 하나로 이용할 수
                있습니다.
              </p>
              <p style={{ marginTop: 8 }}>
                이용 형태도 두 가지로 나뉘어, 여러 강사가 함께 쓰는 &lsquo;센터 CRM&rsquo;과 혼자 수업을
                운영하는 강사를 위한 &lsquo;개인 CRM&rsquo; 중 상황에 맞게 선택할 수 있습니다.
              </p>
            </div>

            <div className="lp-section-cta">
              <Link href="/crm/members" className="lp-btn lp-btn-primary">회원관리 CRM 시작하기 →</Link>
            </div>
            <p className="lp-hero-note" style={{ marginTop: 12 }}>
              현재 무료 이용 중 · 자동 알림 발송 · POS · 전자 계약서 채널 등 일부 기능은 추후 유료 전환될 수 있습니다.
            </p>
          </div></div>
        </section>

        {/* ===== 3. Before → After ===== */}
        <section className="lp-section">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">왜 필요한가요?</div>
            <h2 className="lp-title">흩어진 준비 과정을 한 브랜드 안에서 정리합니다</h2>
            <div className="lp-compare">
              <div className="lp-compare-col lp-compare-before">
                <div className="lp-compare-header">😩 지금까지</div>
                <ul>
                  <li>블로그·카페에 흩어진 시험 후기</li>
                  <li>&quot;내 종목&quot; 후기만 찾으려면 수십 번 검색</li>
                  <li>일반 알바 사이트에 묻힌 스포츠 채용</li>
                  <li>근무조건·급여 비교가 어려움</li>
                  <li>회원관리는 엑셀·수기 장부·고가 프로그램</li>
                </ul>
              </div>
              <div className="lp-compare-col lp-compare-after">
                <div className="lp-compare-header">✅ 모두의 지도사에서</div>
                <ul>
                  <li>종목별 후기와 질문을 한 흐름으로 탐색</li>
                  <li>실기·구술 정보와 현장 경험을 함께 확인</li>
                  <li>스포츠 업계 전용 구인 공고를 바로 비교</li>
                  <li>운동 장비·센터 거래도 한곳에서 확인</li>
                  <li>회원관리 CRM(센터/1인 프리랜서용)으로 회원·수강권·스케줄·급여까지 통합</li>
                  <li>기출문제 풀이 앱까지 브랜드 안에서 자연스럽게 연결</li>
                </ul>
              </div>
            </div>
          </div></div>
        </section>

        {/* ===== 4. 실기·구술 후기 ===== */}
        <section className="lp-section" id="section-community">
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
        <section className="lp-section" id="section-jobs">
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
              <div className="lp-persona"><span className="lp-persona-emoji">🧾</span><h3>1인 프리랜서 강사</h3><p>개인 CRM으로 회원·수업·급여를 정리하고 싶은 분</p></div>
              <div className="lp-persona"><span className="lp-persona-emoji">🏋️‍♀️</span><h3>센터·스튜디오 사장님</h3><p>회원·강사·매출을 웹 하나로 관리하고 싶은 분</p></div>
            </div>
          </div></div>
        </section>

        {/* ===== 8. FAQ ===== */}
        <section className="lp-section" id="faq">
          <div className="lp-c"><div className="lp-card">
            <div className="lp-label">FAQ</div>
            <h2 className="lp-title">자주 묻는 질문</h2>
            <FAQ q="Q. 무료인가요?" a="네, 커뮤니티·구인·거래·회원관리 CRM 모두 현재 무료로 이용 가능합니다. 자동 알림 발송, POS, 전자 계약서 발송 채널 등 CRM 일부 기능은 추후 유료 전환될 수 있으며, 시행 최소 30일 전 사전 공지드립니다." />
            <FAQ q="Q. 회원관리 CRM은 뭔가요?" a="체육시설 사장님과 프리랜서 강사를 위한 회원관리 도구입니다. 회원 등록, 이용권/수강권 발급, 스케줄·예약, 얼굴/번호 터치 출석, 마일리지, 락커, 전자 계약서, 강사 급여 자동 산정까지 별도 프로그램 없이 웹 브라우저 하나로 이용할 수 있으며, '센터 CRM'(다인)과 '개인 CRM'(1인 강사) 두 가지 형태로 제공됩니다." />
            <FAQ q="Q. 어떤 종목 후기를 볼 수 있나요?" a="생활스포츠지도사, 전문스포츠지도사, 유소년·노인스포츠지도사 등 체육지도자 자격시험 전 종목의 실기·구술 후기를 다루고 있습니다." />
            <FAQ q="Q. 구인 공고에는 어떤 분야가 있나요?" a="헬스장, PT 스튜디오, 필라테스, 요가, GX, 복싱, 수영 등 스포츠·운동 업계 전용 구인 공고만 모여 있습니다." />
            <FAQ q="Q. iOS에서도 이용할 수 있나요?" a="네, App Store와 Google Play 모두에서 다운로드 가능합니다." />
            <FAQ q="Q. 공식 시험 기관에서 운영하나요?" a="아니요. 공식 시험 주관 기관과 무관한 민간 정보 공유 서비스입니다. 반드시 공식 공지를 최종 기준으로 삼아 주세요." />
            <FAQ q="Q. 허위 공고를 발견하면?" a="앱 내 신고 기능을 통해 알려주세요. 내부 기준에 따라 게시글 삭제 및 계정 제한 조치를 진행합니다." />
            <div className="lp-faq-item">
              <div className="lp-faq-q">Q. 추가 문의는 어떻게 하나요?</div>
              <div className="lp-faq-a">
                시험(실기·구술·필기) · 종목별 커뮤니티 · 스포츠 구인·거래 · 회원관리 CRM(센터/개인) 등
                모든 서비스에 대한 문의·오류 신고·기능 제안은 카카오톡 오픈채팅으로 받고 있습니다.
                <div style={{ marginTop: 12 }}>
                  <a
                    href="https://open.kakao.com/o/soLx7Eei"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 18px",
                      backgroundColor: "#FEE500",
                      color: "#191919",
                      borderRadius: 8,
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
                    카카오톡으로 문의하기
                  </a>
                </div>
              </div>
            </div>
          </div></div>
        </section>

        {/* ===== 9. 최종 CTA ===== */}
        <section id="app-download" className="lp-section" style={{ scrollMarginTop: "calc(56px + env(safe-area-inset-top, 0px) + 8px)" }}>
          <div className="lp-c">
            {/* 강사·센터용 앱 카드 (위) */}
            <div className="lp-final-cta" style={{ background: "linear-gradient(135deg,#3E5170 0%,#2C3B54 100%)" }}>
              <div className="lp-label" style={{background:"rgba(255,255,255,.15)",color:"#fff"}}>강사·센터용 앱</div>
              <h2 className="lp-final-title">{`'모두의지도사 강사용' 앱으로`}<br />회원을 더 쉽게 관리하세요.</h2>
              <p className="lp-final-sub">회원·수강권 관리, 수업 스케줄, 예약 요청 알림, 정산·실적까지<br />강사와 센터를 위한 올인원 관리 앱입니다.</p>
              <div className="lp-final-buttons">
                <AppStoreButton href="https://apps.apple.com/kr/app/id6796166468" track="app_store_trainer" />
                <GooglePlayButton href="https://play.google.com/store/apps/details?id=com.moduji.trainer" track="google_play_trainer" />
              </div>
            </div>

            {/* 회원용 앱 카드 */}
            <div className="lp-final-cta" style={{ marginTop: 20, background: "linear-gradient(135deg,#4B6A57 0%,#33503F 100%)" }}>
              <div className="lp-label" style={{background:"rgba(255,255,255,.15)",color:"#fff"}}>회원용 앱</div>
              <h2 className="lp-final-title">{`'모두의지도사 회원용' 앱으로`}<br />내 수업을 더 편하게.</h2>
              <p className="lp-final-sub">수업 예약·출석, 이용권·수강권 잔여 확인, 데일리 기록, 센터 알림까지<br />회원을 위한 전용 앱입니다.</p>
              <div className="lp-final-buttons">
                <AppStoreButton href="https://apps.apple.com/kr/app/id6797501332" track="app_store_member" />
                <GooglePlayButton href="https://play.google.com/store/apps/details?id=com.moduji.member" track="google_play_member" />
              </div>
            </div>

            {/* 커뮤니티 앱 카드 (아래) */}
            <div className="lp-final-cta" style={{ marginTop: 20 }}>
              <div className="lp-label" style={{background:"rgba(255,255,255,.15)",color:"#fff"}}>앱 다운로드</div>
              <h2 className="lp-final-title">{`'모두의 지도사 커뮤니티' 앱에서`}<br />더 편하게 이용하세요.</h2>
              <p className="lp-final-sub">시험 후기 알림, 관심 종목 즐겨찾기, 구인 공고 필터링, 운동 장비 거래까지<br />앱에서 더 빠르고 편리하게 사용할 수 있습니다.</p>
              <div className="lp-final-buttons">
                <AppStoreButton />
                <GooglePlayButton />
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
