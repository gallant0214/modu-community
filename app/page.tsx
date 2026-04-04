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
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;800&display=swap');
.lp{font-family:'Noto Sans KR',system-ui,-apple-system,sans-serif;background:#F6F1E8;color:#2F2A24;line-height:1.7;-webkit-font-smoothing:antialiased}
.lp a{color:inherit;text-decoration:none}
.lp ul{list-style:none;margin:0;padding:0}
.lp *,.lp *::before,.lp *::after{box-sizing:border-box;margin:0;padding:0}

/* Header */
.lp-header{position:sticky;top:0;z-index:100;background:rgba(246,241,232,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(47,42,36,.06)}
.lp-header-inner{max-width:960px;margin:0 auto;padding:0 20px;display:flex;align-items:center;justify-content:space-between;height:60px}
.lp-logo{display:inline-flex;align-items:center;gap:10px}
.lp-logo-icon{width:28px;height:28px;border-radius:6px}
.lp-logo-text{font-weight:800;font-size:17px;letter-spacing:-.3px;color:#4A6D5E}
.lp-nav{display:flex;gap:20px}
.lp-nav a{font-size:13px;font-weight:600;color:#6B6560;transition:color .2s}
.lp-nav a:hover{color:#4A6D5E}
.lp-dl-btn{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:700;color:#fff;background:#4A6D5E;border-radius:8px;padding:8px 16px;transition:background .2s}
.lp-dl-btn:hover{background:#3d5c4f}

/* Container */
.lp-c{max-width:960px;margin:0 auto;padding:0 20px}

/* Hero */
.lp-hero{padding:60px 0 48px;text-align:center}
.lp-hero-release{display:inline-block;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(135deg,#4A6D5E,#3d8b6a);border-radius:20px;padding:6px 16px;margin-bottom:16px}
.lp-hero-kicker{display:inline-block;font-size:13px;font-weight:600;color:#4A6D5E;background:rgba(74,109,94,.1);border-radius:20px;padding:5px 16px;margin-bottom:20px;margin-left:8px}
.lp-hero-title{font-size:32px;font-weight:800;line-height:1.4;margin-bottom:18px;letter-spacing:-.5px}
.lp-hero-title .hl{color:#4A6D5E}
.lp-hero-desc{font-size:14px;color:#6B6560;margin-bottom:28px;line-height:1.9;max-width:640px;margin-left:auto;margin-right:auto}
.lp-hero-badges{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-bottom:28px}
.lp-hero-badge{display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#4A6D5E;background:rgba(74,109,94,.08);border-radius:20px;padding:6px 14px}
.lp-hero-buttons{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.lp-btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:12px;font-weight:700;font-size:14px;transition:all .2s;cursor:pointer;border:none}
.lp-btn-gplay{background:#4A6D5E;color:#fff}
.lp-btn-gplay:hover{background:#3d5c4f}
.lp-btn-secondary{background:#fff;color:#4A6D5E;border:1.5px solid rgba(74,109,94,.25)}
.lp-btn-secondary:hover{border-color:#4A6D5E}
.lp-hero-note{font-size:11px;color:#9B9590;max-width:480px;margin:0 auto}

/* Section */
.lp-section{padding:20px 0}
.lp-card{background:#fff;border-radius:20px;padding:36px 32px;box-shadow:0 2px 16px rgba(47,42,36,.04)}
.lp-label{display:inline-block;font-size:11px;font-weight:800;color:#4A6D5E;background:rgba(74,109,94,.1);border-radius:16px;padding:5px 14px;margin-bottom:16px;text-transform:uppercase;letter-spacing:.5px}
.lp-title{font-size:22px;font-weight:800;line-height:1.45;margin-bottom:12px;letter-spacing:-.3px}
.lp-desc{font-size:15px;color:#6B6560;margin-bottom:24px;line-height:1.8}
.lp-grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.lp-grid-3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.lp-gc{background:#FAFAF8;border-radius:14px;padding:24px}
.lp-gc h3{font-size:15px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.lp-gc li{position:relative;padding-left:16px;font-size:14px;color:#6B6560;margin-bottom:6px}
.lp-gc li::before{content:"·";position:absolute;left:4px;color:#4A6D5E;font-weight:700}
.lp-tag{font-size:11px;font-weight:700;color:#4A6D5E;background:rgba(74,109,94,.1);border-radius:6px;padding:2px 8px}

/* Icon cards */
.lp-ic{display:flex;flex-direction:column;align-items:center;text-align:center;background:#FAFAF8;border-radius:14px;padding:28px 20px}
.lp-ic-icon{width:48px;height:48px;border-radius:14px;background:rgba(74,109,94,.1);display:flex;align-items:center;justify-content:center;margin-bottom:14px;color:#4A6D5E}
.lp-ic h3{font-size:15px;font-weight:700;margin-bottom:8px}
.lp-ic p{font-size:13px;color:#6B6560}

/* Recommend cards */
.lp-rec-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.lp-rec{background:#FAFAF8;border-radius:14px;padding:20px;text-align:center}
.lp-rec-emoji{font-size:28px;margin-bottom:8px}
.lp-rec h3{font-size:14px;font-weight:700;margin-bottom:4px}
.lp-rec p{font-size:12px;color:#6B6560}

/* Policy */
.lp-policy{background:#FAFAF8;border-radius:14px;padding:24px;margin-top:20px}
.lp-policy h3{font-size:14px;font-weight:700;margin-bottom:10px}
.lp-policy li{position:relative;padding-left:16px;font-size:13px;color:#6B6560;margin-bottom:6px}
.lp-policy li::before{content:"·";position:absolute;left:4px;color:#4A6D5E;font-weight:700}

/* FAQ */
.lp-faq{border-bottom:1px solid rgba(74,109,94,.08);padding:16px 0}
.lp-faq-q{font-size:15px;font-weight:700;color:#2F2A24;margin-bottom:8px}
.lp-faq-a{font-size:14px;color:#6B6560;line-height:1.8}

/* Card list */
.lp-cl li{position:relative;padding:10px 0 10px 20px;font-size:14px;color:#4B4540;border-bottom:1px solid rgba(74,109,94,.06)}
.lp-cl li::before{content:"✓";position:absolute;left:0;color:#4A6D5E;font-weight:700}

/* Download */
.lp-download{background:linear-gradient(135deg,#4A6D5E 0%,#3d5c4f 100%);border-radius:20px;padding:48px 32px;text-align:center;color:#fff}
.lp-download .lp-label{background:rgba(255,255,255,.15);color:#fff}
.lp-download .lp-title{color:#fff}
.lp-download .lp-desc{color:rgba(255,255,255,.8)}
.lp-store-btns{display:flex;justify-content:center;gap:12px;flex-wrap:wrap}
.lp-store{display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:12px;padding:12px 20px;color:#fff;font-size:14px;transition:all .2s}
.lp-store:hover{background:rgba(255,255,255,.2)}
.lp-store-sub{font-size:10px;opacity:.7;display:block}
.lp-store-main{font-weight:700;display:block}
.lp-store-soon{opacity:.5}

/* Footer */
.lp-footer{max-width:960px;margin:0 auto;padding:32px 20px;border-top:1px solid rgba(47,42,36,.08)}
.lp-footer-info{font-size:12px;color:#9B9590;margin-bottom:12px;line-height:1.8}
.lp-footer-links{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px}
.lp-footer-links a{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#4A6D5E;font-weight:600;transition:opacity .2s}
.lp-footer-links a:hover{opacity:.7}
.lp-footer-copy{font-size:11px;color:#B5B0AB}
.lp-footer-nav{display:flex;gap:16px;margin-top:8px}
.lp-footer-nav a{font-size:12px;color:#9B9590;transition:color .2s}
.lp-footer-nav a:hover{color:#4A6D5E}

/* Floating */
.lp-float{position:fixed;bottom:24px;right:24px;display:flex;flex-direction:column;gap:10px;z-index:90}
.lp-float-btn{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:none;cursor:pointer;box-shadow:0 2px 12px rgba(0,0,0,.15);transition:transform .2s}
.lp-float-btn:hover{transform:scale(1.08)}
.lp-float-kakao{background:#FEE500;color:#3C1E1E}
.lp-float-top{background:#fff;color:#4A6D5E}

@media(max-width:768px){
  .lp-hero-title{font-size:24px}
  .lp-title{font-size:19px}
  .lp-grid-2,.lp-grid-3,.lp-rec-grid{grid-template-columns:1fr}
  .lp-card{padding:24px 18px}
  .lp-hero{padding:40px 0 32px}
  .lp-nav{display:none}
  .lp-dl-btn{font-size:12px;padding:6px 12px}
  .lp-hero-desc br{display:none}
  .lp-desc br{display:none}
}
`;

const landingHTML = `
<div class="lp">

<!-- Header -->
<header class="lp-header">
  <div class="lp-header-inner">
    <a href="/" class="lp-logo">
      <img src="/logo.png" alt="모두의 지도사" class="lp-logo-icon" />
      <span class="lp-logo-text">모두의 지도사 커뮤니티</span>
    </a>
    <nav class="lp-nav">
      <a href="#about">서비스 소개</a>
      <a href="#community">실기·구술 커뮤니티</a>
      <a href="#jobs">스포츠 구인 공고</a>
      <a href="#faq">FAQ</a>
    </nav>
    <a href="https://play.google.com/store/apps/details?id=com.moduji.app" target="_blank" rel="noopener" class="lp-dl-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      앱 다운로드
    </a>
  </div>
</header>

<main>

<!-- Hero -->
<section class="lp-hero" id="about">
  <div class="lp-c">
    <span class="lp-hero-release">Google Play 출시</span>
    <span class="lp-hero-kicker">스포츠지도사와 현직 트레이너를 위한 공간</span>
    <h1 class="lp-hero-title">
      <span class="hl">실기·구술 후기</span>부터<br />
      <span class="hl">스포츠 구인 공고</span>까지,<br />
      한 곳에서 확인하세요.
    </h1>
    <p class="lp-hero-desc">
      흩어져 있던 시험 후기, 일반 알바 사이트에 묻혀 있던 스포츠 업계 구인 공고.<br />
      모두의 지도사 커뮤니티는 이 두 가지를 한 곳에 모아,<br />
      스포츠지도사 수험생과 현직 트레이너가 꼭 필요한 정보를 빠르게 찾을 수 있도록 만든 전용 커뮤니티입니다.
    </p>
    <div class="lp-hero-badges">
      <span class="lp-hero-badge">✓ 종목·시험장별 실기·구술 후기</span>
      <span class="lp-hero-badge">✓ 스포츠 업계 전용 구인 공고</span>
      <span class="lp-hero-badge">✓ 무료 이용 · 가입 후 바로 시작</span>
    </div>
    <div class="lp-hero-buttons">
      <a href="https://play.google.com/store/apps/details?id=com.moduji.app" target="_blank" rel="noopener" class="lp-btn lp-btn-gplay">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Google Play에서 다운로드
      </a>
      <a href="/community" class="lp-btn lp-btn-secondary">서비스 둘러보기</a>
    </div>
    <p class="lp-hero-note">※ 본 서비스는 시험 주관 기관과 무관한 민간 정보 공유 커뮤니티입니다. iOS 버전은 준비 중입니다.</p>
  </div>
</section>

<!-- 왜 필요한가 -->
<section class="lp-section">
  <div class="lp-c"><div class="lp-card">
    <div class="lp-label">왜 필요한가요?</div>
    <h2 class="lp-title">시험 준비와 취업 준비, 둘 다 막막했던 경험이 있다면</h2>
    <p class="lp-desc">실기·구술 후기는 블로그와 카페에 흩어져 있고,<br />스포츠 업계 채용 정보는 일반 알바 사이트 속에 파묻혀 있습니다.<br />"내 종목, 내 시험장" 정보만 골라보기 어렵고, 스포츠 업계 전용 구인 게시판도 없었습니다.</p>
    <div class="lp-grid-2">
      <div class="lp-gc">
        <h3>실기·구술 정보를 찾기 어렵습니다</h3>
        <ul>
          <li>내가 보는 종목, 내가 가는 시험장의 후기가 부족합니다.</li>
          <li>오래된 후기가 현재 시험과 맞지 않는 경우가 많습니다.</li>
          <li>직접 본 사람의 후기인지 검증하기 어렵습니다.</li>
        </ul>
      </div>
      <div class="lp-gc">
        <h3>스포츠 업계 채용도 따로 없습니다</h3>
        <ul>
          <li>헬스장·스튜디오·센터마다 요구하는 조건이 다릅니다.</li>
          <li>일반 구인 사이트에서 스포츠 분야만 골라보기 힘듭니다.</li>
          <li>업계를 이해하는 사람과 센터를 바로 연결할 수 없습니다.</li>
        </ul>
      </div>
    </div>
  </div></div>
</section>

<!-- 실기·구술 커뮤니티 -->
<section class="lp-section" id="community">
  <div class="lp-c"><div class="lp-card">
    <div class="lp-label">실기·구술 커뮤니티</div>
    <h2 class="lp-title">실기·구술, 혼자 준비하지 마세요.</h2>
    <p class="lp-desc">먼저 시험을 치러본 사람들의 경험을 듣는 것만으로도<br />준비 방향과 실전 감각이 훨씬 더 뚜렷해집니다.</p>
    <div class="lp-grid-3">
      <div class="lp-ic">
        <div class="lp-ic-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>
        <h3>시험장별 후기 아카이브</h3>
        <p>연도·차수·종목·시험장 기준으로 후기를 모아서, "내가 가는 시험장" 후기를 중심으로 살펴볼 수 있습니다.</p>
      </div>
      <div class="lp-ic">
        <div class="lp-ic-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8a2 2 0 0 1 2 2v5z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/></svg></div>
        <h3>실전에서 느낀 포인트 공유</h3>
        <p>어떤 동작이 많이 나오는지, 감독관 스타일은 어떤지, 준비물이 어떻게 체크됐는지 등 실전 디테일을 공유합니다.</p>
      </div>
      <div class="lp-ic">
        <div class="lp-ic-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></div>
        <h3>궁금한 점은 바로 질문</h3>
        <p>정보만 보고 끝나는 것이 아니라, 댓글과 게시글로 궁금한 점을 바로 물어보고 답을 받을 수 있습니다.</p>
      </div>
    </div>
  </div></div>
</section>

<!-- 스포츠 구인 공고 -->
<section class="lp-section" id="jobs">
  <div class="lp-c"><div class="lp-card">
    <div class="lp-label">스포츠 구인 공고</div>
    <h2 class="lp-title">스포츠 업계 사람들만 모이는 구인 공고 게시판</h2>
    <p class="lp-desc">일반 알바 공고 속에서 운동 관련 일자리를 찾는 대신,<br />헬스장·PT·필라테스·요가·GX·복싱 등 스포츠 업계 전용 채용 정보를 한 곳에서 확인하세요.</p>
    <div class="lp-grid-2">
      <div class="lp-gc">
        <h3>센터/스튜디오 운영자</h3>
        <ul>
          <li>운동을 이해하는 트레이너·지도사에게만 공고를 노출</li>
          <li>불필요한 문의 없이 관심 있는 지원자와 빠르게 연결</li>
          <li>업계 경험자를 우선으로 만날 수 있는 전용 공간</li>
        </ul>
      </div>
      <div class="lp-gc">
        <h3>트레이너/지도사 구직자</h3>
        <ul>
          <li>스포츠·운동 업계 공고만 모여 있어 시간 낭비 없음</li>
          <li>종목, 지역, 근무 형태(정규직·파트·PT)로 필터링</li>
          <li>센터 분위기·급여·회원 연령층 등 실질 정보 비교 가능</li>
        </ul>
      </div>
    </div>
    <div class="lp-policy">
      <h3>신뢰할 수 있는 운영 정책</h3>
      <ul>
        <li>허위 구인·과장된 조건 기재 시 게시글 삭제 및 계정 정지 조치</li>
        <li>이용자 신고 기능으로 커뮤니티 자정 — 부적절 공고 빠르게 대응</li>
        <li>구인·구직 정보 공유 공간을 제공하며, 채용·근로계약에는 관여하지 않습니다.</li>
      </ul>
    </div>
  </div></div>
</section>

<!-- 이런 분께 추천 -->
<section class="lp-section">
  <div class="lp-c"><div class="lp-card">
    <div class="lp-label">이런 분께 추천</div>
    <h2 class="lp-title">이런 상황이라면, 모두의 지도사 커뮤니티가 도움이 됩니다.</h2>
    <div class="lp-rec-grid">
      <div class="lp-rec"><div class="lp-rec-emoji">📚</div><h3>실기·구술 초시생</h3><p>필기 합격 후 실기·구술이 막막한 분</p></div>
      <div class="lp-rec"><div class="lp-rec-emoji">🔄</div><h3>재도전 수험생</h3><p>떨어진 이유를 점검하고 전략을 세우고 싶은 분</p></div>
      <div class="lp-rec"><div class="lp-rec-emoji">🏋</div><h3>현직 트레이너·강사</h3><p>후배들에게 경험을 나눠주고 싶은 분</p></div>
      <div class="lp-rec"><div class="lp-rec-emoji">💼</div><h3>스포츠 업계 구직자</h3><p>운동 분야 전용 일자리를 찾고 있는 분</p></div>
      <div class="lp-rec"><div class="lp-rec-emoji">🏢</div><h3>센터 운영자</h3><p>업계 경험자를 채용하고 싶은 센터·스튜디오</p></div>
      <div class="lp-rec"><div class="lp-rec-emoji">🎓</div><h3>체육 지도자</h3><p>제자·회원에게 정리된 시험 정보를 보여주고 싶은 분</p></div>
    </div>
  </div></div>
</section>

<!-- 앱 미리보기 -->
<section class="lp-section">
  <div class="lp-c"><div class="lp-card">
    <div class="lp-label">앱 미리보기</div>
    <h2 class="lp-title">앱에서는 이렇게 이용할 수 있어요</h2>
    <p class="lp-desc">모두의 지도사 커뮤니티 앱의 주요 기능을 미리 살펴보세요.</p>
    <div class="lp-grid-3">
      <div class="lp-ic">
        <div class="lp-ic-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
        <h3>후기 피드</h3>
        <p>종목·시험장별 실기·구술 후기를 카드 형식으로 빠르게 탐색하고, 관심 게시글을 즐겨찾기할 수 있습니다.</p>
      </div>
      <div class="lp-ic">
        <div class="lp-ic-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg></div>
        <h3>구인 공고 필터</h3>
        <p>종목, 지역, 근무 형태 등 조건을 설정해 나에게 딱 맞는 스포츠 업계 일자리를 찾아보세요.</p>
      </div>
      <div class="lp-ic">
        <div class="lp-ic-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></div>
        <h3>알림 설정</h3>
        <p>관심 종목의 새 후기, 즐겨찾기 시험장 소식, 맞춤 구인 알림을 실시간으로 받아보세요.</p>
      </div>
    </div>
  </div></div>
</section>

<!-- FAQ -->
<section class="lp-section" id="faq">
  <div class="lp-c"><div class="lp-card">
    <div class="lp-label">FAQ</div>
    <h2 class="lp-title">자주 묻는 질문</h2>
    <div class="lp-faq"><div class="lp-faq-q">Q. 앱은 무료인가요?</div><div class="lp-faq-a">A. 네, 완전 무료입니다. 앱 다운로드, 후기 열람, 구인 공고 확인 모두 무료이며, 별도의 유료 멤버십이나 결제 없이 자유롭게 이용하실 수 있습니다.</div></div>
    <div class="lp-faq"><div class="lp-faq-q">Q. 어떤 종목의 실기·구술 후기를 볼 수 있나요?</div><div class="lp-faq-a">A. 생활스포츠지도사, 전문스포츠지도사, 유소년·노인스포츠지도사 등 체육지도자 자격시험 전 종목의 실기·구술 후기를 다루고 있습니다. 종목별·시험장별로 분류되어 있어 필요한 정보를 빠르게 찾을 수 있습니다.</div></div>
    <div class="lp-faq"><div class="lp-faq-q">Q. 구인 공고에는 어떤 분야가 있나요?</div><div class="lp-faq-a">A. 헬스장, PT 스튜디오, 필라테스, 요가, GX, 복싱, 수영 등 스포츠·운동 업계 전용 구인 공고만 모여 있습니다.</div></div>
    <div class="lp-faq"><div class="lp-faq-q">Q. iOS(아이폰)에서도 이용할 수 있나요?</div><div class="lp-faq-a">A. 현재는 Android(Google Play)에서만 다운로드 가능합니다. iOS 버전은 준비 중이며, 출시되면 안내해 드리겠습니다.</div></div>
    <div class="lp-faq"><div class="lp-faq-q">Q. 공식 시험 기관에서 운영하는 서비스인가요?</div><div class="lp-faq-a">A. 아니요. 모두의 지도사 커뮤니티는 공식 시험 주관 기관과 무관한 민간 정보 공유 서비스입니다. 반드시 공식 공지를 최종 기준으로 삼아 주세요.</div></div>
    <div class="lp-faq"><div class="lp-faq-q">Q. 허위 공고를 발견하면 어떻게 하나요?</div><div class="lp-faq-a">A. 앱 내 신고 기능을 통해 알려주세요. 내부 기준에 따라 게시글 삭제 및 계정 제한 등 조치를 진행합니다.</div></div>
  </div></div>
</section>

<!-- 앱 다운로드 -->
<section class="lp-section" id="download">
  <div class="lp-c">
    <div class="lp-download">
      <div class="lp-label">앱 다운로드</div>
      <h2 class="lp-title">지금 바로 시작하세요.</h2>
      <p class="lp-desc">실기·구술 후기 확인부터 스포츠 업계 구인 공고 탐색까지,<br />모두의 지도사 커뮤니티 앱 하나로 해결하세요.</p>
      <div class="lp-store-btns">
        <a href="https://play.google.com/store/apps/details?id=com.moduji.app" target="_blank" rel="noopener" class="lp-store">
          <span><span class="lp-store-sub">GET IT ON</span><span class="lp-store-main">Google Play</span></span>
        </a>
        <span class="lp-store lp-store-soon">
          <span><span class="lp-store-sub">출시 예정</span><span class="lp-store-main">App Store</span></span>
        </span>
      </div>
    </div>
  </div>
</section>

</main>

<!-- Footer -->
<footer class="lp-footer">
  <p class="lp-footer-info">
    <strong>모두의 지도사 커뮤니티</strong><br />
    서비스 운영 · 박준익<br />
    이메일 : gallant0214@naver.com
  </p>
  <div class="lp-footer-links">
    <a href="https://open.kakao.com/o/soLx7Eei" target="_blank" rel="noopener">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.67-.15.54-.95 3.47-.98 3.7 0 0-.02.17.09.23.11.07.24.01.24.01.32-.04 3.7-2.42 4.28-2.83.55.08 1.12.12 1.71.12 5.52 0 10-3.58 10-7.94S17.52 3 12 3z"/></svg>
      카카오톡 문의
    </a>
    <a href="mailto:gallant0214@naver.com">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      이메일 문의
    </a>
  </div>
  <p class="lp-footer-copy">&copy; 2026 모두의 지도사. All rights reserved.</p>
  <nav class="lp-footer-nav">
    <a href="/">맨 위로</a>
    <a href="#about">서비스 소개</a>
    <a href="#faq">FAQ</a>
    <a href="/terms.html">이용약관</a>
    <a href="/privacy.html">개인정보처리방침</a>
  </nav>
</footer>

<!-- Floating -->
<div class="lp-float">
  <a href="https://open.kakao.com/o/soLx7Eei" target="_blank" rel="noopener" class="lp-float-btn lp-float-kakao" aria-label="카카오톡 문의">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.48 3 2 6.58 2 10.94c0 2.8 1.86 5.27 4.66 6.67-.15.54-.95 3.47-.98 3.7 0 0-.02.17.09.23.11.07.24.01.24.01.32-.04 3.7-2.42 4.28-2.83.55.08 1.12.12 1.71.12 5.52 0 10-3.58 10-7.94S17.52 3 12 3z"/></svg>
  </a>
  <button class="lp-float-btn lp-float-top" aria-label="맨 위로" onclick="window.scrollTo({top:0,behavior:'smooth'})">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
  </button>
</div>

</div>
`;
