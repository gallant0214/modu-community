"use client";

export default function Home() {
  return (
    <div
      className="landing-page"
      style={{ margin: "calc(-1 * (env(safe-area-inset-top, 0px) + 48px)) 0 calc(-1 * (env(safe-area-inset-bottom, 0px) + 20px)) 0" }}
    >
      <style dangerouslySetInnerHTML={{ __html: landingStyles }} />
      <div dangerouslySetInnerHTML={{ __html: landingHTML }} />
    </div>
  );
}

const landingStyles = `
.landing-page { font-family: 'Noto Sans KR', system-ui, -apple-system, sans-serif; background: #F6F1E8; color: #2F2A24; line-height: 1.7; -webkit-font-smoothing: antialiased; }
.landing-page a { color: inherit; text-decoration: none; }
.landing-page ul { list-style: none; margin:0; padding:0; }
.landing-page *, .landing-page *::before, .landing-page *::after { box-sizing: border-box; }

.l-container { max-width: 960px; margin: 0 auto; padding: 0 20px; }

.l-hero { padding: 60px 0 48px; text-align: center; }
.l-hero-kicker { display: inline-block; font-size: 13px; font-weight: 600; color: #4A6D5E; background: rgba(74,109,94,.1); border-radius: 20px; padding: 5px 16px; margin-bottom: 20px; }
.l-hero-title { font-size: 32px; font-weight: 800; line-height: 1.4; margin-bottom: 18px; letter-spacing: -0.5px; }
.l-hero-title .hl { color: #4A6D5E; }
.l-hero-sub { font-size: 15px; color: #6B6560; margin-bottom: 24px; }
.l-hero-badges { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-bottom: 28px; }
.l-hero-badge { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #4A6D5E; background: rgba(74,109,94,.08); border-radius: 20px; padding: 6px 14px; }
.l-hero-buttons { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.l-btn { display: inline-flex; align-items: center; gap: 8px; padding: 12px 24px; border-radius: 12px; font-weight: 600; font-size: 14px; transition: all .2s; cursor: pointer; border: none; }
.l-btn-primary { background: #4A6D5E; color: #fff; }
.l-btn-primary:hover { background: #3d5c4f; }
.l-btn-secondary { background: #fff; color: #4A6D5E; border: 1.5px solid rgba(74,109,94,.25); }
.l-btn-secondary:hover { border-color: #4A6D5E; }
.l-hero-note { font-size: 12px; color: #9B9590; }

.l-section { padding: 20px 0; }
.l-card { background: #fff; border-radius: 20px; padding: 36px 32px; box-shadow: 0 2px 16px rgba(47,42,36,.04); }
.l-section-label { display: inline-block; font-size: 11px; font-weight: 800; color: #4A6D5E; background: rgba(74,109,94,.1); border-radius: 16px; padding: 5px 14px; margin-bottom: 16px; text-transform: uppercase; letter-spacing: .5px; }
.l-section-title { font-size: 22px; font-weight: 800; line-height: 1.45; margin-bottom: 12px; letter-spacing: -0.3px; }
.l-section-desc { font-size: 15px; color: #6B6560; margin-bottom: 24px; line-height: 1.8; }
.l-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.l-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.l-grid-card { background: #FAFAF8; border-radius: 14px; padding: 24px; }
.l-grid-card h3 { font-size: 15px; font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
.l-grid-card ul { padding-left: 0; }
.l-grid-card li { position: relative; padding-left: 16px; font-size: 14px; color: #6B6560; margin-bottom: 6px; }
.l-grid-card li::before { content: "·"; position: absolute; left: 4px; color: #4A6D5E; font-weight: 700; }
.l-tag { font-size: 11px; font-weight: 700; color: #4A6D5E; background: rgba(74,109,94,.1); border-radius: 6px; padding: 2px 8px; }
.l-icon-card { display: flex; flex-direction: column; align-items: center; text-align: center; background: #FAFAF8; border-radius: 14px; padding: 28px 20px; }
.l-icon-box { width: 48px; height: 48px; border-radius: 14px; background: rgba(74,109,94,.1); display: flex; align-items: center; justify-content: center; margin-bottom: 14px; color: #4A6D5E; }
.l-icon-card h3 { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.l-icon-card p { font-size: 13px; color: #6B6560; }
.l-card-list li { position: relative; padding: 10px 0 10px 20px; font-size: 14px; color: #4B4540; border-bottom: 1px solid rgba(74,109,94,.06); }
.l-card-list li::before { content: "✓"; position: absolute; left: 0; color: #4A6D5E; font-weight: 700; }
.l-faq-item { border-bottom: 1px solid rgba(74,109,94,.08); padding: 16px 0; }
.l-faq-q { font-size: 15px; font-weight: 700; color: #2F2A24; margin-bottom: 8px; }
.l-faq-a { font-size: 14px; color: #6B6560; line-height: 1.8; }

.l-download { background: linear-gradient(135deg, #4A6D5E 0%, #3d5c4f 100%); border-radius: 20px; padding: 48px 32px; text-align: center; color: #fff; }
.l-download .l-section-label { background: rgba(255,255,255,.15); color: #fff; }
.l-download .l-section-title { color: #fff; }
.l-download .l-section-desc { color: rgba(255,255,255,.8); }
.l-store-buttons { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; }
.l-store-btn { display: inline-flex; align-items: center; gap: 10px; background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.2); border-radius: 12px; padding: 12px 20px; color: #fff; font-size: 14px; transition: all .2s; }
.l-store-btn:hover { background: rgba(255,255,255,.2); }
.l-store-sub { font-size: 10px; opacity: .7; display: block; }
.l-store-main { font-weight: 700; display: block; }

.l-footer { text-align: center; padding: 32px 0; font-size: 12px; color: #9B9590; }
.l-footer a { margin: 0 8px; }
.l-footer a:hover { color: #4A6D5E; }

.l-policy { background: #FAFAF8; border-radius: 14px; padding: 24px; margin-top: 20px; }
.l-policy h3 { font-size: 14px; font-weight: 700; margin-bottom: 10px; }
.l-policy li { position: relative; padding-left: 16px; font-size: 13px; color: #6B6560; margin-bottom: 6px; }
.l-policy li::before { content: "·"; position: absolute; left: 4px; color: #4A6D5E; font-weight: 700; }

@media (max-width: 768px) {
  .l-hero-title { font-size: 24px; }
  .l-section-title { font-size: 19px; }
  .l-grid-2, .l-grid-3 { grid-template-columns: 1fr; }
  .l-card { padding: 24px 18px; }
  .l-hero { padding: 40px 0 32px; }
}
`;

const landingHTML = `
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;800&display=swap" rel="stylesheet" />

<main>
  <section class="l-hero">
    <div class="l-container">
      <div class="l-hero-kicker">스포츠지도사와 현직 트레이너를 위한 공간</div>
      <h1 class="l-hero-title">
        <span class="hl">실기·구술 후기</span>부터<br />
        <span class="hl">스포츠 구인 공고</span>까지,<br />
        한 곳에서 확인하세요.
      </h1>
      <p class="l-hero-sub">
        스포츠지도사 실기·구술 시험을 준비하는 수험생과<br />
        운동·스포츠 업계에서 일하는 사람들을 위한 전용 커뮤니티입니다.
      </p>
      <div class="l-hero-badges">
        <span class="l-hero-badge">✓ 실기·구술 시험장 후기</span>
        <span class="l-hero-badge">✓ 종목·지역·시험장별 커뮤니티</span>
        <span class="l-hero-badge">✓ 스포츠 업계 전용 구인 공고</span>
      </div>
      <div class="l-hero-buttons">
        <a href="/category/1" class="l-btn l-btn-primary">실기·구술 커뮤니티 살펴보기</a>
        <a href="/jobs" class="l-btn l-btn-secondary">스포츠 구인 기능 살펴보기</a>
      </div>
      <p class="l-hero-note">※ 모두의 지도사 커뮤니티는 시험 주관 기관과 무관한 <strong>비공식 정보 공유 서비스</strong>입니다.</p>
    </div>
  </section>

  <section class="l-section">
    <div class="l-container"><div class="l-card">
      <div class="l-section-label">왜 필요한가요?</div>
      <h2 class="l-section-title">왜 스포츠 지도사들의 커뮤니티가 필요할까요?</h2>
      <p class="l-section-desc">실기·구술 정보는 블로그, 카페, 단톡방 곳곳에 흩어져 있고,<br />스포츠 업계 구인 공고는 일반 알바 사이트 속에 섞여 있습니다.</p>
      <div class="l-grid-2">
        <div class="l-grid-card">
          <h3>실기·구술 정보, 여기저기 흩어져 있을 때</h3>
          <ul>
            <li>"내가 보는 종목, 내가 가는 시험장" 후기는 생각보다 적습니다.</li>
            <li>정보가 오래되어 실제 시험과 맞지 않는 경우도 많습니다.</li>
            <li>누가 직접 보고 온 후기인지 검증하기도 어렵습니다.</li>
          </ul>
        </div>
        <div class="l-grid-card">
          <h3>스포츠 업계 구인 공고, 일반 알바와는 다릅니다</h3>
          <ul>
            <li>헬스장·스튜디오·센터마다 요구하는 조건이 다르고 세부적입니다.</li>
            <li>운동을 이해하는 사람을 찾고 싶은 센터와, 그 분야 일자리를 찾는 사람을 바로 연결하기 어렵습니다.</li>
          </ul>
        </div>
      </div>
    </div></div>
  </section>

  <section class="l-section">
    <div class="l-container"><div class="l-card">
      <div class="l-section-label">서비스 구성</div>
      <h2 class="l-section-title">모두의 지도사 커뮤니티, 이렇게 구성되어 있습니다.</h2>
      <p class="l-section-desc">실기·구술 준비와 스포츠 업계 커리어를 함께 생각한 구조입니다.</p>
      <div class="l-grid-2">
        <div class="l-grid-card">
          <h3>실기·구술 커뮤니티 <span class="l-tag">Community</span></h3>
          <ul>
            <li>종목별·지역별·시험장별 게시판 구조</li>
            <li>실제 응시자가 남긴 동작·분위기·주의사항 후기</li>
            <li>구술 예상 질문, 실기 동작 기준에 대한 Q&A</li>
          </ul>
        </div>
        <div class="l-grid-card">
          <h3>스포츠 구인 공고 게시판 <span class="l-tag">Jobs</span></h3>
          <ul>
            <li>헬스장, PT 스튜디오, 필라테스, 요가, GX, 복싱 등 스포츠 업계 전용</li>
            <li>트레이너·지도사·인스트럭터·센터 스태프 채용 공고</li>
            <li>종목, 지역, 근무 형태 등으로 조건 필터링</li>
          </ul>
        </div>
      </div>
    </div></div>
  </section>

  <section class="l-section">
    <div class="l-container"><div class="l-card">
      <div class="l-section-label">실기·구술 커뮤니티</div>
      <h2 class="l-section-title">실기·구술, 혼자 준비하지 마세요.</h2>
      <p class="l-section-desc">먼저 시험을 치러본 사람들의 경험을 듣는 것만으로도<br />준비 방향과 실전 감각이 훨씬 더 뚜렷해집니다.</p>
      <div class="l-grid-3">
        <div class="l-icon-card">
          <div class="l-icon-box"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
          <h3>시험장별 후기 아카이브</h3>
          <p>"내가 가는 시험장" 후기를 중심으로 살펴볼 수 있습니다.</p>
        </div>
        <div class="l-icon-card">
          <div class="l-icon-box"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg></div>
          <h3>실전 포인트 공유</h3>
          <p>어떤 동작이 많이 나오는지, 감독관 스타일 등 실전 디테일을 공유합니다.</p>
        </div>
        <div class="l-icon-card">
          <div class="l-icon-box"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></div>
          <h3>질문을 바로 물어볼 수 있는 공간</h3>
          <p>궁금한 점은 댓글과 게시글로 바로 물어보고 답을 받을 수 있습니다.</p>
        </div>
      </div>
    </div></div>
  </section>

  <section class="l-section">
    <div class="l-container"><div class="l-card">
      <div class="l-section-label">스포츠 구인 공고</div>
      <h2 class="l-section-title">스포츠 업계 사람들만 모이는 구인 공고 게시판</h2>
      <p class="l-section-desc">일반 알바 공고 속에서 운동 관련 일자리를 찾는 대신,<br />운동을 사랑하는 사람들만 모인 채용 게시판을 활용해 보세요.</p>
      <div class="l-grid-2">
        <div class="l-grid-card">
          <h3>센터를 위한 장점</h3>
          <ul>
            <li>운동을 이해하는 트레이너·지도사에게만 공고를 노출할 수 있습니다.</li>
            <li>불필요한 문의를 줄이고, 관심 있는 지원자와 빠르게 연결됩니다.</li>
          </ul>
        </div>
        <div class="l-grid-card">
          <h3>구직자에게 필요한 이유</h3>
          <ul>
            <li>오직 스포츠/운동 업계 공고만 모여 있습니다.</li>
            <li>근무 시간, 급여, 센터 분위기 등을 기준으로 비교해볼 수 있습니다.</li>
          </ul>
        </div>
      </div>
      <div class="l-policy">
        <h3>구인 공고 운영 정책 (요약)</h3>
        <ul>
          <li>허위 구인, 과장된 급여 기재 시 게시글 삭제 및 계정 정지 조치</li>
          <li>공고 내용에 대한 법적·도덕적 책임은 공고 작성자 본인에게 있습니다.</li>
          <li>모두의 지도사 커뮤니티는 게시판(정보 제공 공간)만 제공하며, 채용·근로계약 등에는 관여하지 않습니다.</li>
        </ul>
      </div>
    </div></div>
  </section>

  <section class="l-section">
    <div class="l-container"><div class="l-card">
      <div class="l-section-label">이런 분께 추천</div>
      <h2 class="l-section-title">이런 분께 특히 추천합니다.</h2>
      <ul class="l-card-list">
        <li>스포츠지도사 필기 합격 후 실기·구술 준비가 막막한 수험생</li>
        <li>처음 보는 시험장 분위기가 불안한 초시생</li>
        <li>재도전하면서 떨어졌던 이유를 점검하고 싶은 수험생</li>
        <li>본인 경험을 바탕으로 후배들을 돕고 싶은 현직 트레이너·강사</li>
        <li>스포츠·운동 업계에서 일자리를 찾거나, 함께 일할 동료를 찾는 사람</li>
      </ul>
    </div></div>
  </section>

  <section class="l-section">
    <div class="l-container"><div class="l-card">
      <div class="l-section-label">FAQ</div>
      <h2 class="l-section-title">자주 받는 질문들을 정리했습니다.</h2>
      <div class="l-faq-item">
        <div class="l-faq-q">Q. 여기 올라오는 시험 정보가 100% 정확한가요?</div>
        <div class="l-faq-a">A. 아닙니다. 모든 후기는 실제 응시자 개인의 경험과 의견이며, 정보의 정확성을 보증하지 않습니다. 반드시 공식 공지를 최종 기준으로 삼아 주세요.</div>
      </div>
      <div class="l-faq-item">
        <div class="l-faq-q">Q. 공식 시험 기관에서 운영하는 서비스인가요?</div>
        <div class="l-faq-a">A. 아니요. 모두의 지도사 커뮤니티는 어떠한 공식 시험 주관 기관과도 직접적인 관련이 없는, 민간 정보 공유 서비스입니다.</div>
      </div>
      <div class="l-faq-item">
        <div class="l-faq-q">Q. 구인 공고에 적힌 조건이 실제와 다를 경우 어떻게 되나요?</div>
        <div class="l-faq-a">A. 공고 내용의 책임은 전적으로 공고 작성자에게 있으며, 허위·과장 공고로 의심되는 경우 신고 기능을 통해 알려주시면 조치를 진행합니다.</div>
      </div>
    </div></div>
  </section>

  <section class="l-section">
    <div class="l-container">
      <div class="l-download">
        <div class="l-section-label">앱 다운로드</div>
        <h2 class="l-section-title">'모두의 지도사 커뮤니티' 앱에서<br />더 편하게 이용하세요.</h2>
        <p class="l-section-desc">시험 후기 알림, 관심 종목 즐겨찾기, 구인 공고 필터링까지<br />앱에서 더 빠르고 편리하게 사용할 수 있습니다.</p>
        <div class="l-store-buttons">
          <a href="#" class="l-store-btn">
            <span><span class="l-store-sub">GET IT ON</span><span class="l-store-main">Google Play</span></span>
          </a>
        </div>
      </div>
    </div>
  </section>

  <footer class="l-footer">
    <p>&copy; 2026 모두의 지도사. All rights reserved.</p>
    <nav>
      <a href="/inquiry">문의하기</a>
      <a href="/terms.html">이용약관</a>
      <a href="/privacy.html">개인정보처리방침</a>
    </nav>
  </footer>
</main>
`;
