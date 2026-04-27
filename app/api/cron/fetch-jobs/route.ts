export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { supabase } from "@/app/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.WORK24_API_KEY || "";
const BASE_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do";

// 직종코드: 스포츠·레크레이션 + 스포츠 공고가 등록된 다른 직종코드
const OCCUPATION_CODES = [
  // 622 스포츠·레크레이션
  "622000", "622100", "622200", "622201", "622202", "622300", "622301", "622302",
  // 231 교육 (스포츠지도사, 체육교사)
  "231100", "231101", "231103",
  // 232 교육서비스
  "232900", "232903", "232904",
  // 420 돌봄·서비스 (수영강사, 체육강사, 헬스트레이너)
  "420400", "420401", "420402", "420403",
  // 550 시설관리 (수영장, 체육관)
  "550102", "550400",
  // 561 체육시설 운영
  "561100", "561101",
  // 026 스포츠 관련
  "026202", "026501",
  // 029 기타 스포츠
  "029900", "029103",
];
// 추가 키워드 검색 (직종코드 622 외에 다른 코드로 등록된 스포츠 공고 보완)
const EXTRA_KEYWORDS = [
  // 종목명
  "태권도", "유도", "검도", "복싱", "합기도", "주짓수", "킥복싱", "무에타이",
  "헬스", "트레이너", "필라테스", "요가", "크로스핏", "에어로빅",
  "수영", "골프", "테니스", "배드민턴", "탁구", "축구", "농구", "배구",
  "발레", "무용", "댄스", "줄넘기", "체조", "클라이밍", "승마",
  // 시설·업종
  "스포츠", "체육관", "피트니스", "헬스장", "수영장", "골프장", "태권도장",
  "피트니스센터", "스포츠센터", "호텔피트니스", "호텔스파",
  // 대상별
  "유아체육", "유소년체육", "유소년스포츠", "어린이체육", "어린이스포츠",
  "장애인체육", "장애인스포츠", "노인체육", "노인스포츠", "실버체육",
  // 자격·직종
  "스포츠지도사", "체육지도자", "생활체육", "수영강사", "골프강사", "테니스강사",
  "체육교사", "체육강사", "스포츠강사", "운동처방사",
  // 시설명 변형 (짐, 도장 등)
  "짐", "도장", "도복", "체력단련", "운동시설", "피티샵",
  // 공공 체육시설
  "국민체육센터", "국민체육", "시설관리공단", "체육회", "문화체육",
  "체육진흥", "종합운동장", "공공체육",
  // 아파트/커뮤니티 체육시설
  "아파트 트레이너", "아파트 헬스", "커뮤니티센터 트레이너", "커뮤니티 트레이너",
  "커뮤니티센터 인포", "커뮤니티 스포츠",
];

const REGION_MAP: Record<string, string> = {
  "서울":"seoul","부산":"busan","대구":"daegu","인천":"incheon",
  "광주":"gwangju","대전":"daejeon","울산":"ulsan","세종":"sejong",
  "경기":"gyeonggi","강원":"gangwon","충북":"chungbuk","충남":"chungnam",
  "전북":"jeonbuk","전남":"jeonnam","경북":"gyeongbuk","경남":"gyeongnam","제주":"jeju",
};

const EMP_MAP: Record<string, string> = { "10":"정규직","11":"정규직","20":"계약직","21":"계약직","4":"파트타임" };

const SPORT_PATTERNS: [RegExp, string][] = [
  [/태권도/i, "태권도"], [/유도/i, "유도"], [/검도/i, "검도"],
  [/복싱|권투/i, "복싱"], [/킥복싱/i, "킥복싱"], [/무에타이/i, "무에타이"],
  [/주짓수|BJJ/i, "주짓수"], [/합기도/i, "합기도"],
  [/헬스(?!케어)|피트니스|PT|퍼스널|트레이너|웨이트|짐|GYM|체력단련/i, "헬스/PT"],
  [/크로스핏/i, "헬스/PT"], [/필라테스/i, "필라테스"], [/요가/i, "요가"],
  [/발레/i, "기타"], [/무용|댄스/i, "댄스스포츠"], [/에어로빅/i, "기타"],
  [/수영(?![구동로시군면읍리만])/i, "수영"], [/골프/i, "골프"],
  [/테니스/i, "테니스"], [/배드민턴/i, "배드민턴"], [/탁구/i, "탁구"],
  [/축구|풋살/i, "축구"], [/농구/i, "농구"], [/배구/i, "배구"], [/야구/i, "야구"],
  [/클라이밍|암벽|볼더링/i, "클라이밍"], [/승마/i, "승마"], [/체조/i, "체조"],
  [/스키|스노보드/i, "스키/스노보드"], [/볼링/i, "기타"], [/스쿼시/i, "기타"],
];

function detectSport(title: string, company: string, indTpNm: string): string {
  const text = `${title} ${company} ${indTpNm}`;
  for (const [pattern, sport] of SPORT_PATTERNS) {
    if (pattern.test(text)) return sport;
  }
  return "기타";
}

// 스포츠 무관 업종 필터 (키워드 검색 결과에만 적용)
const UNRELATED = /제조업|인쇄업|건설|토공사|창호|플라스틱|반도체|변압기|전자부품|전자상거래|소매업|도매업|음식점|식품|부동산|보험|금융|섬유|오프셋|요양 병원|일반 병원|공중 보건|의료용|진단/;
// 제목/회사명/업종 중 하나라도 스포츠 관련이어야 통과
// 주: "도장" 은 이중의미(道場=무술, 塗裝=페인트)라 SPORTS_WORDS 에서 제외.
//    무술 도장 글은 "태권도/유도/검도" 같은 종목 단어로 잡힘.
// 주: "강사", "코치", "지도사" 같은 일반 직무명은 단독으로 SPORTS_WORDS 에 두지 않음.
//    "도배 강사", "건축도장 강사" 같은 비-스포츠 강사도 잡혀버리므로,
//    스포츠 강사 글은 종목 키워드(헬스/태권도/요가 등) + "강사" 같이 매칭됨.
const SPORTS_WORDS = /태권도|유도|검도|복싱|권투|합기도|주짓수|킥복싱|무에타이|무술|헬스(?!케어)|피트니스|트레이너|크로스핏|필라테스|요가|발레|에어로빅|무용|줄넘기|수영(?![구동로시군면읍리만])|골프|테니스|배드민턴|탁구|축구|풋살|농구|배구|야구|클라이밍|암벽|볼더링|승마|체조|댄스|양궁|펜싱|사격|스키|스노보드|스케이트|볼링|스쿼시|스포츠|체육|운동|스포츠지도사|체육지도사|체육교사|스포츠강사|체육강사|운동강사|헬스강사|수영강사|골프강사|테니스강사|요가강사|필라테스강사|태권도강사|유도강사|검도강사|레슨|인스트럭터|레저|생활체육|체력단련|PT|GYM|짐|웰니스|피지컬|유아체육|유소년|어린이체육|장애인체육|장애인스포츠|노인체육|노인스포츠|실버체육|호텔피트니스|호텔스파|운동처방|국민체육|체육회|체육진흥|종합운동장|문화체육|시설관리공단/i;
const SPORTS_IND = /태권도|무술|체력단련|수영장|골프장|골프연습장|스포츠|체육|운동|경기용|레크리에이션|댄스|교습학원|스포츠 교육|스포츠 서비스/;

// 제조·산업 업종 — title 에 SPORTS_WORDS 의 한글 부분 문자열이 매칭되더라도 차단
// 예: "사무용" 의 "무용", "짐키드" 의 "짐" 등 false positive 차단
const INDUSTRIAL_IND = /제조업|기계|금속|화학|플라스틱|반도체|전자부품|변압기|자동차|운송|물류|일반목적용|산업용|조립|건설|창호|토공사|도금|성형|가공|수리업|단조|적층|표면처리|오락용품\s*제조|인력\s*공급|인력공급|인사관리|비금속|광물|목재가구|가구\s*제조/;

// 명백히 비스포츠 업종 — 인력알선/의약/가구소매 등은 제목과 무관하게 항상 제외
const EXCLUDE_IND = /의약품|가구\s*소매|가구\s*도매|사무용가구|운동\s*및\s*경기용품\s*소매|운동\s*및\s*경기용품\s*도매|체조.*장비\s*제조|체력단련용\s*장비\s*제조|운동기구\s*제조|운동기구\s*도매|운동기구\s*소매|시설관리\s*공단|시설관리\s*용역|인력\s*공급|인력공급|인사관리\s*서비스|고용\s*알선|임시\s*및\s*일용\s*인력|상용\s*인력|광물제품\s*제조/;

// 비스포츠 직무 제목 키워드 — 사무/조리/도장/제조 등 (스포츠 시설에서 쓰일 수 없는 명백한 비스포츠 단어만)
// 매장관리/판매/조리 등 모호한 키워드는 EXCLUDE_IND(업종 기반) 에 위임 — 진짜 스포츠 시설 직원이 잘리지 않도록.
// 공백 허용(\s*) 으로 "자동차 도장사원" 같은 공백 포함 표현 매칭.
const EXCLUDE_TITLE = /도장\s*공|도장\s*사원|도장\s*기사|도장\s*작업|도장\s*공사|도장\s*부|도장\s*파트|도장\s*업체|도장\s*협력|도장\s*반|도장\s*팀|도장\s*과|도장\s*직|도장\s*과장|건축\s*도장|건설\s*도장|전착\s*도장|분체\s*도장|자동차\s*도장|스프레이\s*도장|우레탄\s*도장|선박\s*도장|차체\s*도장|에폭시\s*도장|하지\s*엔지니어|도배|미장|방수\s*공사|방수\s*직무|방수\s*기사|타일\s*시공|인테리어\s*마감|건설|토목|중장비|굴삭기|크레인|생산직|생산팀|생산부|생산관리|생산보조|제조직|조립직|용접|프레스|사출|금형|CNC|선반|상하차|지게차|화물|배송기사|납품기사|운전기사|택배|회계|총무|경리|인사담당|마케팅|기획팀|개발자|프로그래머|디자이너|연구원|보조선생님|보육교사|사무직|사무\s*직원|사무용가구|사무용품|관리사무원|영업사원|영업직|납품\s*및\s*영업|납품\s*영업|사회복지사|복지사|간호조무사|요양원|간병인|돌보미|장애아돌보미|조경원|조경관리|하우스키퍼|하우스키핑|룸어텐던트|객실관리|객실정비|객실청소|바리스타|베이커리|카페\s*직원|카페\s*매니저|매점|미화|세차|룸메이드|하우스키핑|홀서빙|식음|외곽\s*미화|호텔\s*프론트|호텔\s*객실|호텔.*프론트|컨트리클럽.*프론트|골프.*프론트|화장품|식품|요양보호사|방문요양|재가요양|주간보호|어르신케어|어르신\s*돌봄|미화원|환경미화|잔디\s*관리|잔디관리|예초|클럽하우스|식당\s*홀|레스토랑\s*조리|주방\s*보조|중식당|한식당|양식당|일식당|중식\s*조리|한식\s*조리|양식\s*조리|일식\s*조리|조리원|조리사|샤워실|간병|청소(?!강사)/i;

// 진짜 무술 도장 글은 반드시 종목 단어와 함께 나옴. "도장" 단독은 페인트.
const MARTIAL_ARTS = /태권도|유도|검도|합기도|주짓수|킥복싱|무에타이|복싱|권투|무술/i;

// "도장" 을 단어 경계로 매칭 — "경상북도장애인부모회" 같이 다른 단어 안의 "도장" 은 제외
// 한글에는 \b 가 작동 안 해서 lookbehind/lookahead 로 한글 인접성 체크
const DOJANG_WORD = /(?<![가-힣])도장(?![가-힣])/;

function isSportsRelated(title: string, company: string, indTpNm: string): boolean {
  // 1) 명백히 비스포츠 제목 키워드 (사무/판매/조리/청소/제조 등)
  if (EXCLUDE_TITLE.test(title)) return false;

  // 2) 명백히 비스포츠 업종 (가구소매/의약/인력알선 등) — title 무관하게 차단
  if (EXCLUDE_IND.test(indTpNm)) return false;

  // 3) 산업/제조 업종 — title 에 SPORTS_WORDS 부분 문자열 매칭(예: "사무용"→"무용")
  //    으로 false positive 발생하던 사례 차단
  if (INDUSTRIAL_IND.test(indTpNm)) return false;

  // 4) 이중의미 "도장" 단어가 title 에 있으면 무술 종목 키워드가 함께 등장해야 통과
  //    DOJANG_WORD 로 한글 단어 경계 체크 (도장 앞뒤가 한글이면 부분 문자열로 보고 무시)
  if (DOJANG_WORD.test(title) && !MARTIAL_ARTS.test(title) && !MARTIAL_ARTS.test(company)) {
    return false;
  }

  // 5) 제목/회사명 스포츠 키워드 매칭 시 통과 (강한 시그널)
  if (SPORTS_WORDS.test(title) || SPORTS_WORDS.test(company)) return true;

  // 6) SPORTS_IND 단독으로는 통과시키지 않음.
  //    "수영장 운영업" 회사가 바리스타/미화/회계 직원 모집하는 경우 차단.
  //    진짜 스포츠 직원이라면 title 이나 company 에 종목/체육 키워드가 함께 있음
  //    → 5번에서 이미 통과.
  return false;
}

interface W24 {
  wantedAuthNo: string; company: string; title: string; salTpNm: string; sal: string;
  region: string; holidayTpNm: string; closeDt: string; wantedInfoUrl: string;
  basicAddr: string; detailAddr: string; empTpCd: string; indTpNm: string;
  minEdubg: string; career: string;
  // 일부 응답에만 담기는 연락처 관련 필드 (없으면 빈 문자열)
  phnNo: string; mblePhnNo: string; emlAddr: string;
}

function decodeEntities(s: string): string {
  // 이중 인코딩 (&amp;amp; → &amp; → &) 까지 처리하기 위해 두 번 decode
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ");
  }
  return out;
}

function parseXml(xml: string): W24[] {
  const items: W24[] = [];
  for (const b of xml.match(/<wanted>([\s\S]*?)<\/wanted>/g) || []) {
    const g = (t: string) => decodeEntities(b.match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`))?.[1] || "").trim();
    items.push({
      wantedAuthNo: g("wantedAuthNo"), company: g("company"), title: g("title"),
      salTpNm: g("salTpNm"), sal: g("sal"), region: g("region"),
      holidayTpNm: g("holidayTpNm"), closeDt: g("closeDt"),
      wantedInfoUrl: g("wantedInfoUrl"), basicAddr: g("basicAddr"),
      detailAddr: g("detailAddr"), empTpCd: g("empTpCd"), indTpNm: g("indTpNm"),
      minEdubg: g("minEdubg"), career: g("career"),
      phnNo: g("phnNo"), mblePhnNo: g("mblePhnNo"), emlAddr: g("emlAddr"),
    });
  }
  return items;
}

/**
 * 한국 전화번호 추출 (유선/휴대 모두):
 *   010-1234-5678, 02-123-4567, 031-123-4567, 01012345678 등
 * 잘못된 매치 줄이기 위해 국번 범위 제한.
 */
function extractPhone(text: string): string | null {
  if (!text) return null;
  // 앞자리: 010/011/016/017/018/019 (휴대) 또는 02/031/032/033/041/042/043/044/051/052/053/054/055/061/062/063/064/070 (유선/인터넷)
  const re = /(?<!\d)(01[016-9]|02|0[3-6][1-5]|070)[-.\s)]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/;
  const m = text.match(re);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * 이메일 추출 — 가장 먼저 나타나는 유효한 이메일 하나.
 */
function extractEmail(text: string): string | null {
  if (!text) return null;
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

/**
 * W24 상세 페이지 HTML 을 fetch 해서 전화/이메일 추출.
 * 실측 검증: 5/5 건에서 담당자 전화번호 100% 추출 (2026-04-24 샘플).
 * 타임아웃/에러 시 { phone: null, email: null } 반환 — 그 경우 폴백 로직으로 넘어감.
 */
/**
 * W24 상세 페이지 HTML 에서 "직무내용" 섹션 텍스트 추출.
 * "직무내용" 마커 뒤 텍스트 → 다음 섹션 마커("모집 인원"/"더보기"/"접기") 까지.
 *
 * 블록 태그(<br>/<li>/<p>/<div>/<tr>) 는 줄바꿈으로 보존해
 * frontend 의 whitespace-pre-wrap 스타일에서 가독성 좋게 표시되도록 함.
 */
function extractJobDuty(html: string): string | null {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const dutyIdx = cleaned.indexOf("직무내용");
  if (dutyIdx < 0) return null;

  const after = cleaned.slice(dutyIdx + "직무내용".length);

  // 다음 섹션 시작 마커 (이 마커들 중 가장 먼저 나오는 것까지가 직무내용)
  const endMarkers = ["모집 인원", "더보기", "접기"];
  let endIdx = after.length;
  for (const m of endMarkers) {
    const i = after.indexOf(m);
    if (i >= 0 && i < endIdx) endIdx = i;
  }

  const section = after.slice(0, endIdx);
  const text = section
    // 1) 블록 태그를 줄바꿈으로 변환 (가독성 보존)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:li|p|div|tr|h[1-6]|ol|ul)\s*>/gi, "\n")
    // 2) 나머지 태그는 제거 (공백으로)
    .replace(/<[^>]+>/g, " ")
    // 3) HTML 엔티티 디코딩
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    // 4) 공백/줄바꿈 정리
    .replace(/[ \t]+/g, " ")              // 다중 공백 → 단일
    .replace(/[ \t]*\n[ \t]*/g, "\n")     // 줄바꿈 주변 공백 제거
    .replace(/\n{3,}/g, "\n\n")           // 3+ 연속 줄바꿈 → 빈 줄 1개
    .trim();

  if (text.length < 5) return null;
  // description 컬럼 너무 길면 부담 → 2000 자 cap
  return text.slice(0, 2000);
}

/**
 * W24 상세 페이지 HTML 의 emp_sumup_wrp 블록에서 풀 title 추출.
 * 형식: "<회사명> <실제 채용 제목>" — 회사명 prefix 가 알려져 있으면 제거.
 * <title> 태그는 SEO 메타이므로 사용 금지.
 */
function extractFullTitle(html: string, companyName?: string): string | null {
  // emp_sumup_wrp div 안에 회사명 + 본문 제목이 함께 들어있음
  const m = html.match(/<div[^>]*class="[^"]*\bemp_sumup_wrp\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return null;
  let t = decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim().replace(/\s+/g, " ");
  if (t.length < 5) return null;

  // 회사명 prefix 제거
  if (companyName) {
    const cn = companyName.trim();
    if (cn && t.startsWith(cn)) {
      t = t.slice(cn.length).trim();
    }
  }

  // 거부 조건: SEO 메타, '...' 잘림 표시, 너무 짧음
  if (t.length < 5 || t.startsWith("채용정보") || t.startsWith("...")) return null;
  return t.slice(0, 300);
}

async function fetchDetailContact(url: string, companyHint?: string): Promise<{ phone: string | null; email: string | null; jobDuty: string | null; fullTitle: string | null }> {
  if (!url || !url.startsWith("http")) return { phone: null, email: null, jobDuty: null, fullTitle: null };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; moducm-bot/1.0)",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
    });
    if (!res.ok) return { phone: null, email: null, jobDuty: null, fullTitle: null };
    const html = await res.text();
    return {
      phone: extractPhone(html),
      email: extractEmail(html),
      jobDuty: extractJobDuty(html),
      fullTitle: extractFullTitle(html, companyHint),
    };
  } catch {
    return { phone: null, email: null, jobDuty: null, fullTitle: null };
  }
}

/**
 * 연락처 결정 우선순위:
 *   1) 상세 페이지 HTML 에서 추출된 전화 (실제 담당자 번호일 가능성 높음)
 *   2) API 응답의 전화 필드 (목록 API 는 안 주지만 혹시 모를 확장 대비)
 *   3) 목록 API 텍스트 필드(title/company/주소)에서 전화 정규식
 *   4) 상세 페이지 HTML 에서 추출된 이메일
 *   5) API 응답 이메일 필드
 *   6) 텍스트 필드에서 이메일 정규식
 *   7) 폴백: 고용24 상세 URL
 */
function resolveContact(
  it: W24,
  searchText: string,
  detail: { phone: string | null; email: string | null }
): { type: string; value: string } {
  if (detail.phone) return { type: "연락처", value: detail.phone };

  const apiPhone = extractPhone(it.mblePhnNo) || extractPhone(it.phnNo);
  if (apiPhone) return { type: "연락처", value: apiPhone };

  const textPhone = extractPhone(searchText);
  if (textPhone) return { type: "연락처", value: textPhone };

  if (detail.email) return { type: "이메일", value: detail.email };

  const apiEmail = extractEmail(it.emlAddr);
  if (apiEmail) return { type: "이메일", value: apiEmail };

  const textEmail = extractEmail(searchText);
  if (textEmail) return { type: "이메일", value: textEmail };

  return { type: "고용24", value: it.wantedInfoUrl };
}

// 직종코드로 전체 페이지 수집
async function fetchByOccupation(code: string): Promise<W24[]> {
  const all: W24[] = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const res = await fetch(`${BASE_URL}?authKey=${API_KEY}&callTp=L&returnType=XML&startPage=${page}&display=100&occupation=${code}`, { signal: AbortSignal.timeout(10000) });
      const items = parseXml(await res.text());
      if (items.length === 0) break;
      all.push(...items);
      if (items.length < 100) break;
    } catch { break; }
  }
  return all;
}

// 키워드로 검색
async function fetchByKeyword(kw: string): Promise<W24[]> {
  try {
    const res = await fetch(`${BASE_URL}?authKey=${API_KEY}&callTp=L&returnType=XML&startPage=1&display=100&keyword=${encodeURIComponent(kw)}`, { signal: AbortSignal.timeout(10000) });
    return parseXml(await res.text());
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!API_KEY) return NextResponse.json({ error: "WORK24_API_KEY not set" }, { status: 500 });

  // 스키마는 마이그레이션 완료, ALTER TABLE 제거
  // 마감일 지난 글 자동 is_closed=true 처리 (RPC)
  let autoClosed = 0;
  const { data: closedCount, error: closeErr } = await supabase.rpc("auto_close_expired_jobs");
  if (closeErr) {
    console.error("auto-close failed:", closeErr.message);
  } else {
    autoClosed = closedCount ?? 0;
    if (autoClosed > 0) {
      const { invalidateCache } = await import("@/app/lib/cache");
      invalidateCache("jobs:*").catch(() => {});
    }
  }

  const { data: existingRows } = await supabase
    .from("job_posts")
    .select("source_id")
    .eq("source", "work24")
    .not("source_id", "is", null)
    .limit(100000);
  const existingIds = new Set(
    (existingRows || []).map((r) => r.source_id).filter((x): x is string => !!x),
  );

  // 1단계: 직종코드로 수집 (병렬)
  const occResults = await Promise.all(OCCUPATION_CODES.map((code) => fetchByOccupation(code)));

  // 2단계: 키워드 검색 보완 (병렬)
  const kwResults = await Promise.all(EXTRA_KEYWORDS.map((kw) => fetchByKeyword(kw)));

  // 통합 + 중복 제거
  const seen = new Set<string>();
  const allItems: W24[] = [];

  for (const items of [...occResults, ...kwResults]) {
    for (const it of items) {
      if (!it.wantedAuthNo || seen.has(it.wantedAuthNo)) continue;
      seen.add(it.wantedAuthNo);
      allItems.push(it);
    }
  }

  // 키워드 검색 결과는 스포츠 관련 필터링 적용
  const filtered = allItems.filter((it) => isSportsRelated(it.title, it.company, it.indTpNm));

  // 신규 후보 추출 (중복 제외) → 상세 페이지 HTML 병렬 prefetch
  const newCandidates = filtered.filter(it => !existingIds.has(it.wantedAuthNo));
  const detailMap = new Map<string, { phone: string | null; email: string | null; jobDuty: string | null; fullTitle: string | null }>();

  // maxDuration=60s 내 처리 보장: 최대 100건까지만 상세 fetch 시도
  // (100건 초과분은 텍스트 regex / URL 폴백으로 처리됨)
  const DETAIL_LIMIT = Math.min(newCandidates.length, 100);
  let detailFetched = 0;
  let detailFailed = 0;
  for (let i = 0; i < DETAIL_LIMIT; i += 10) {
    const batch = newCandidates.slice(i, i + 10);
    const results = await Promise.all(batch.map(it => fetchDetailContact(it.wantedInfoUrl, it.company)));
    batch.forEach((it, idx) => {
      detailMap.set(it.wantedAuthNo, results[idx]);
      if (results[idx].phone || results[idx].email) detailFetched++;
      else detailFailed++;
    });
  }

  // 신규 건만 INSERT
  const toInsert: { it: W24; finalTitle: string; sport: string; rName: string; rCode: string; salary: string; addr: string; deadline: string; desc: string; empType: string; contactType: string; contactValue: string }[] = [];

  // 통계 수집용
  let stat_phone = 0;
  let stat_email = 0;
  let stat_fallback = 0;

  for (const it of filtered) {
    if (existingIds.has(it.wantedAuthNo)) continue;

    const pts = it.region?.trim().split(/\s+/) || [];
    const rName = pts.length > 1 ? `${pts[0]} - ${pts.slice(1).join(" ")}` : (pts[0] || "");
    const rCode = REGION_MAP[pts[0] || ""] || "";
    let salText = it.sal || "";
    // 두 금액이 공백/특수문자로 연결돼 있으면 사이에 " ~ " 삽입.
    // 운영 환경에서 .replace() + 캡쳐 그룹이 알 수 없는 이유로 치환을 안 적용하는
    // 사례가 있어 match() + substring 으로 명시적으로 처리.
    {
      const re = /(\d[\d,]*\s*(?:만원|원))[^\d가-힣]+(\d[\d,]*\s*(?:만원|원))/;
      const m = salText.match(re);
      if (m && m.index !== undefined && m[1] !== m[2]) {
        salText = salText.slice(0, m.index) + `${m[1]} ~ ${m[2]}` + salText.slice(m.index + m[0].length);
      }
    }
    // "333만원 ~ 333만원" → "333만원" (최소=최대 동일할 때)
    salText = salText.replace(/(.+?)\s*~\s*\1/g, "$1");
    const salary = salText ? `${it.salTpNm} ${salText}` : "";
    const addr = [it.basicAddr, it.detailAddr].filter(Boolean).join(" ");
    let deadline = "";
    if (it.closeDt) {
      const dateMatch = it.closeDt.match(/(\d{2})-(\d{2})-(\d{2})/);
      if (it.closeDt.includes("채용시까지")) {
        deadline = dateMatch ? `채용시까지 (20${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]})` : "채용시까지";
      } else if (dateMatch) {
        deadline = `20${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
      }
    }

    // 상세 HTML 에서 추출된 직무내용(모집요강) + full title 가져오기
    const detail = detailMap.get(it.wantedAuthNo) || { phone: null, email: null, jobDuty: null, fullTitle: null };

    // W24 목록 API 가 title 을 잘라서 "...어쩌고" 형식으로 보낼 때
    // 상세 HTML 에서 추출한 fullTitle 로 보강 (잘리지 않은 형태면 길이가 더 김)
    let finalTitle = it.title.replace(/^[.…\s]+/, "").trim();
    if (detail.fullTitle && detail.fullTitle.length > finalTitle.length && !detail.fullTitle.startsWith("...")) {
      finalTitle = detail.fullTitle;
    }

    // 풍부한 설명 — 모집요강(직무내용) 이 있으면 맨 앞에 추가
    const descLines = [
      detail.jobDuty ? `[직무내용]\n${detail.jobDuty}` : "",
      it.holidayTpNm ? `근무형태: ${it.holidayTpNm}` : "",
      salary ? `급여: ${salary}` : "",
      it.minEdubg ? `학력: ${it.minEdubg}` : "",
      it.career ? `경력: ${it.career}` : "",
      it.indTpNm ? `업종: ${it.indTpNm}` : "",
      addr ? `근무지: ${addr}` : "",
    ];
    const desc = descLines.filter(Boolean).join("\n");

    // 연락처 결정: 상세 HTML 전화 > 전화 > 상세 HTML 이메일 > 이메일 > URL 폴백
    const searchText = [it.title, it.company, it.indTpNm, it.basicAddr, it.detailAddr, desc].filter(Boolean).join(" ");
    const contactResolved = resolveContact(it, searchText, detail);
    if (contactResolved.type === "연락처") stat_phone++;
    else if (contactResolved.type === "이메일") stat_email++;
    else stat_fallback++;

    toInsert.push({
      it, finalTitle, sport: detectSport(it.title, it.company, it.indTpNm),
      rName, rCode, salary, addr, deadline, desc,
      empType: EMP_MAP[it.empTpCd] || "기타",
      contactType: contactResolved.type,
      contactValue: contactResolved.value,
    });
  }

  // DB INSERT 병렬 (10개씩)
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < toInsert.length; i += 10) {
    const batch = toInsert.slice(i, i + 10);
    const rows = batch.map(({ it, finalTitle, sport, rName, rCode, salary, addr, deadline, desc, empType, contactType, contactValue }) => ({
      title: finalTitle,
      description: desc,
      center_name: it.company.slice(0, 200),
      address: addr,
      author_role: "채용담당자",
      author_name: it.company.slice(0, 50),
      contact_type: contactType,
      contact: contactValue.slice(0, 200),
      sport: sport.slice(0, 50),
      region_name: rName.slice(0, 50),
      region_code: rCode,
      employment_type: empType,
      salary: salary.slice(0, 200),
      headcount: "",
      benefits: "",
      preferences: "",
      deadline,
      ip_address: "work24-api",
      firebase_uid: "system_work24",
      source: "work24",
      source_id: it.wantedAuthNo,
    }));
    const { count, error } = await supabase
      .from("job_posts")
      .insert(rows, { count: "exact" });
    if (error) {
      errors.push(error.message);
    } else {
      inserted += count ?? rows.length;
    }
  }

  return NextResponse.json({
    success: true, inserted, totalFound: allItems.length, filtered: filtered.length,
    skippedDuplicate: filtered.length - toInsert.length,
    // 마감일 지난 글 자동 마감 처리 건수
    autoClosed,
    // 상세 HTML prefetch 통계
    detail: { attempted: DETAIL_LIMIT, extracted: detailFetched, noContact: detailFailed, skipped: newCandidates.length - DETAIL_LIMIT },
    // 연락처 결정 통계 (새로 임포트된 건 기준)
    contact: { phone: stat_phone, email: stat_email, fallbackUrl: stat_fallback },
    errors: errors.slice(0, 5), timestamp: new Date().toISOString(),
  });
}
