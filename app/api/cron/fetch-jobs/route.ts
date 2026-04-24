export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sql } from "@/app/lib/db";
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
  [/헬스|피트니스|PT|퍼스널|트레이너|웨이트|짐|GYM|체력단련/i, "헬스/PT"],
  [/크로스핏/i, "헬스/PT"], [/필라테스/i, "필라테스"], [/요가/i, "요가"],
  [/발레/i, "기타"], [/무용|댄스/i, "댄스스포츠"], [/에어로빅/i, "기타"],
  [/수영/i, "수영"], [/골프/i, "골프"],
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
const SPORTS_WORDS = /태권도|유도|검도|복싱|권투|합기도|주짓수|킥복싱|무에타이|무술|헬스|피트니스|트레이너|크로스핏|필라테스|요가|발레|에어로빅|무용|줄넘기|수영|골프|테니스|배드민턴|탁구|축구|풋살|농구|배구|야구|클라이밍|암벽|볼더링|승마|체조|댄스|양궁|펜싱|사격|스키|스노보드|스케이트|볼링|스쿼시|스포츠|체육|운동|지도사|코치|강사|인스트럭터|레저|생활체육|체력단련|PT|GYM|짐|웰니스|피지컬|유아체육|유소년|어린이체육|장애인체육|장애인스포츠|노인체육|노인스포츠|실버체육|호텔피트니스|호텔스파|운동처방|체육교사|스포츠강사|국민체육|체육회|체육진흥|종합운동장|문화체육|시설관리공단|도장/i;
const SPORTS_IND = /태권도|무술|체력단련|수영장|골프장|골프연습장|스포츠|체육|운동|경기용|레크리에이션|댄스|교습학원|스포츠 교육|스포츠 서비스/;

// 확실히 스포츠와 무관한 제목 패턴 (도장공사, 생산직 등)
const EXCLUDE_TITLE = /도장공사|도장작업|분체도장|스프레이도장|자동차도장|도장기사|생산직|생산팀|생산부|제조직|조립직|용접|프레스|사출|금형|CNC|선반|포장|상하차|지게차|화물|배송기사|납품기사|운전기사|택배/i;

function isSportsRelated(title: string, company: string, indTpNm: string): boolean {
  // 확실히 무관한 제목은 먼저 제외
  if (EXCLUDE_TITLE.test(title)) return false;
  // 제목이나 회사명에 스포츠 키워드가 있으면 통과
  if (SPORTS_WORDS.test(title) || SPORTS_WORDS.test(company)) return true;
  // 업종이 스포츠 관련이면 통과
  if (SPORTS_IND.test(indTpNm)) return true;
  // 그 외는 탈락
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

function parseXml(xml: string): W24[] {
  const items: W24[] = [];
  for (const b of xml.match(/<wanted>([\s\S]*?)<\/wanted>/g) || []) {
    const g = (t: string) => b.match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`))?.[1]?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() || "";
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
 * 연락처 결정 우선순위:
 *   1) API 응답의 전화 필드(phnNo/mblePhnNo)
 *   2) 모든 텍스트에서 전화번호 정규식 추출
 *   3) API 응답의 이메일 필드(emlAddr)
 *   4) 모든 텍스트에서 이메일 정규식 추출
 *   5) 폴백: 고용24 상세 URL
 */
function resolveContact(it: W24, searchText: string): { type: string; value: string } {
  // 1) 전화 필드 (있으면 정규화해서 사용)
  const apiPhone = extractPhone(it.mblePhnNo) || extractPhone(it.phnNo);
  if (apiPhone) return { type: "연락처", value: apiPhone };

  // 2) 텍스트에서 전화 추출
  const textPhone = extractPhone(searchText);
  if (textPhone) return { type: "연락처", value: textPhone };

  // 3) 이메일 필드
  const apiEmail = extractEmail(it.emlAddr);
  if (apiEmail) return { type: "이메일", value: apiEmail };

  // 4) 텍스트에서 이메일 추출
  const textEmail = extractEmail(searchText);
  if (textEmail) return { type: "이메일", value: textEmail };

  // 5) 폴백
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

  try { await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user'`; } catch {}
  try { await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source_id TEXT`; } catch {}
  try { await sql`ALTER TABLE job_posts ALTER COLUMN center_name TYPE VARCHAR(200)`; } catch {}
  try { await sql`ALTER TABLE job_posts ALTER COLUMN salary TYPE VARCHAR(200)`; } catch {}
  try { await sql`ALTER TABLE job_posts ALTER COLUMN contact TYPE TEXT`; } catch {}
  try { await sql`ALTER TABLE job_posts ALTER COLUMN address TYPE TEXT`; } catch {}

  const existingRows = await sql`SELECT source_id FROM job_posts WHERE source = 'work24' AND source_id IS NOT NULL`;
  const existingIds = new Set(existingRows.map((r: { source_id: string }) => r.source_id));

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

  // 신규 건만 INSERT
  const toInsert: { it: W24; sport: string; rName: string; rCode: string; salary: string; addr: string; deadline: string; desc: string; empType: string; contactType: string; contactValue: string }[] = [];

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

    // 풍부한 설명
    const descLines = [
      it.holidayTpNm ? `근무형태: ${it.holidayTpNm}` : "",
      salary ? `급여: ${salary}` : "",
      it.minEdubg ? `학력: ${it.minEdubg}` : "",
      it.career ? `경력: ${it.career}` : "",
      it.indTpNm ? `업종: ${it.indTpNm}` : "",
      addr ? `근무지: ${addr}` : "",
    ];
    const desc = descLines.filter(Boolean).join("\n");

    // 연락처 결정: 전화 > 이메일 > 고용24 URL 폴백
    const searchText = [it.title, it.company, it.indTpNm, it.basicAddr, it.detailAddr, desc].filter(Boolean).join(" ");
    const contactResolved = resolveContact(it, searchText);
    if (contactResolved.type === "연락처") stat_phone++;
    else if (contactResolved.type === "이메일") stat_email++;
    else stat_fallback++;

    toInsert.push({
      it, sport: detectSport(it.title, it.company, it.indTpNm),
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
    const results = await Promise.allSettled(
      batch.map(({ it, sport, rName, rCode, salary, addr, deadline, desc, empType, contactType, contactValue }) =>
        sql`INSERT INTO job_posts (title,description,center_name,address,author_role,author_name,contact_type,contact,sport,region_name,region_code,employment_type,salary,headcount,benefits,preferences,deadline,ip_address,firebase_uid,source,source_id) VALUES (${it.title.slice(0, 200)},${desc},${it.company.slice(0, 200)},${addr},${"채용담당자"},${it.company.slice(0, 50)},${contactType},${contactValue.slice(0, 200)},${sport.slice(0, 50)},${rName.slice(0, 50)},${rCode},${empType},${salary.slice(0, 200)},${""},${""},${""},${deadline},${"work24-api"},${"system_work24"},${"work24"},${it.wantedAuthNo})`
      )
    );
    inserted += results.filter((r) => r.status === "fulfilled").length;
    for (const r of results) {
      if (r.status === "rejected") errors.push(r.reason?.message || String(r.reason));
    }
  }

  return NextResponse.json({
    success: true, inserted, totalFound: allItems.length, filtered: filtered.length,
    skippedDuplicate: filtered.length - toInsert.length,
    // 연락처 결정 통계 (새로 임포트된 건 기준)
    contact: { phone: stat_phone, email: stat_email, fallbackUrl: stat_fallback },
    errors: errors.slice(0, 5), timestamp: new Date().toISOString(),
  });
}
