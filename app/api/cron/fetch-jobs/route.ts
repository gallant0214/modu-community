export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.WORK24_API_KEY || "";
const BASE_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do";

// 운동 관련 키워드 (종목 + 시설 + 직종)
const SPORTS_KEYWORDS = [
  // 구기 종목
  "축구","풋살","농구","배구","배드민턴","테니스","탁구","야구","소프트볼","핸드볼","럭비","하키","아이스하키","크리켓","라크로스","게이트볼","족구",
  // 수상·빙상
  "수영","수영장","아쿠아","다이빙","서핑","카약","조정","세일링","수상스키","워터폴로","스케이트","빙상","피겨","쇼트트랙","컬링",
  // 라켓 스포츠
  "스쿼시","골프","골프장","볼링",
  // 격투·무도
  "태권도","태권도장","유도","검도","복싱","권투","킥복싱","무에타이","주짓수","합기도","씨름","가라테","우슈","쿵후","택견","MMA","격투기","무술",
  // 피트니스·헬스
  "헬스","헬스장","피트니스","피트니스센터","PT","퍼스널트레이닝","트레이너","피티샵","짐","GYM","웨이트","크로스핏","크로스핏박스","바디빌딩","보디빌딩",
  // 유연성·마음·몸
  "필라테스","요가","요가원","발레","무용","현대무용","한국무용","줄넘기","에어로빅","스트레칭","기공","명상",
  // 댄스
  "댄스","댄스스포츠","방송댄스","재즈댄스","힙합댄스",
  // 동계
  "스키","스노보드","스키장",
  // 사이클·육상·기타
  "사이클","자전거","트라이애슬론","육상","마라톤","조깅","체조","리듬체조","기계체조","승마","클라이밍","볼더링","암벽등반","사격","양궁","궁도","펜싱",
  // 시설·업종 키워드
  "스포츠센터","체육관","체육시설","레저","운동","스포츠","체육","생활체육","스포츠지도사","체육지도자","생활스포츠지도사","전문스포츠지도사","유소년스포츠","노인스포츠","장애인스포츠",
];

// 고용24 지역명 → region_code 매핑
const REGION_MAP: Record<string, string> = {
  "서울": "SEOUL", "부산": "BUSAN", "대구": "DAEGU", "인천": "INCHEON",
  "광주": "GWANGJU", "대전": "DAEJEON", "울산": "ULSAN", "세종": "SEJONG",
  "경기": "GYEONGGI", "강원": "GANGWON", "충북": "CHUNGBUK", "충남": "CHUNGNAM",
  "전북": "JEONBUK", "전남": "JEONNAM", "경북": "GYEONGBUK", "경남": "GYEONGNAM",
  "제주": "JEJU",
};

// 고용형태코드 → 텍스트
const EMP_TYPE_MAP: Record<string, string> = {
  "10": "정규직", "11": "정규직", "20": "계약직", "21": "계약직", "4": "파트타임",
};

function parseRegion(regionStr: string): { name: string; code: string } {
  if (!regionStr) return { name: "", code: "" };
  // "서울 강서구" → name: "서울 - 강서구", code: "SEOUL"
  const parts = regionStr.trim().split(/\s+/);
  const sido = parts[0] || "";
  const sigungu = parts.slice(1).join(" ");
  const code = REGION_MAP[sido] || "";
  const name = sigungu ? `${sido} - ${sigungu}` : sido;
  return { name, code: code.toLowerCase() };
}

function matchSport(title: string, company: string, indTpNm: string, keyword: string): string {
  // 검색 키워드와 매칭되는 종목명 반환
  const text = `${title} ${company} ${indTpNm}`.toLowerCase();
  // 특수 매핑
  if (keyword === "헬스" || keyword === "PT") {
    if (text.includes("헬스") || text.includes("피트니스") || text.includes("pt") || text.includes("트레이너")) return "헬스/PT";
  }
  if (keyword === "스키" || keyword === "스노보드") return "스키/스노보드";
  return keyword;
}

interface Work24Item {
  wantedAuthNo: string;
  company: string;
  title: string;
  salTpNm: string;
  sal: string;
  region: string;
  holidayTpNm: string;
  closeDt: string;
  wantedInfoUrl: string;
  basicAddr: string;
  detailAddr: string;
  empTpCd: string;
  indTpNm: string;
}

async function fetchWork24(keyword: string): Promise<Work24Item[]> {
  const url = `${BASE_URL}?authKey=${API_KEY}&callTp=L&returnType=XML&startPage=1&display=100&keyword=${encodeURIComponent(keyword)}&regDate=D-3`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const xml = await res.text();

    // XML 파싱 (간단한 정규식 기반)
    const items: Work24Item[] = [];
    const wantedBlocks = xml.match(/<wanted>([\s\S]*?)<\/wanted>/g) || [];

    for (const block of wantedBlocks) {
      const get = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
        return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').trim() : "";
      };
      items.push({
        wantedAuthNo: get("wantedAuthNo"),
        company: get("company"),
        title: get("title"),
        salTpNm: get("salTpNm"),
        sal: get("sal"),
        region: get("region"),
        holidayTpNm: get("holidayTpNm"),
        closeDt: get("closeDt"),
        wantedInfoUrl: get("wantedInfoUrl"),
        basicAddr: get("basicAddr"),
        detailAddr: get("detailAddr"),
        empTpCd: get("empTpCd"),
        indTpNm: get("indTpNm"),
      });
    }
    return items;
  } catch {
    return [];
  }
}

// GET /api/cron/fetch-jobs — Vercel Cron으로 호출
export async function GET(req: NextRequest) {
  // Vercel Cron 인증 확인
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!API_KEY) {
    return NextResponse.json({ error: "WORK24_API_KEY not set" }, { status: 500 });
  }

  // 테이블에 work24 출처 컬럼 확인/추가
  try {
    await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user'`;
    await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source_id TEXT`;
  } catch {}

  let totalInserted = 0;
  const seen = new Set<string>(); // 중복 방지 (같은 구인번호)

  for (let ki = 0; ki < SPORTS_KEYWORDS.length; ki++) {
    const keyword = SPORTS_KEYWORDS[ki];
    const items = await fetchWork24(keyword);
    // API rate limit 방지: 5개 키워드마다 500ms 대기
    if (ki > 0 && ki % 5 === 0) await new Promise((r) => setTimeout(r, 500));

    for (const item of items) {
      if (!item.wantedAuthNo || seen.has(item.wantedAuthNo)) continue;
      seen.add(item.wantedAuthNo);

      // 이미 등록된 공고인지 확인
      const existing = await sql`SELECT id FROM job_posts WHERE source_id = ${item.wantedAuthNo} LIMIT 1`;
      if (existing.length > 0) continue;

      const region = parseRegion(item.region);
      const sport = matchSport(item.title, item.company, item.indTpNm, keyword);
      const empType = EMP_TYPE_MAP[item.empTpCd] || "기타";
      const salary = item.sal ? `${item.salTpNm} ${item.sal}` : "";
      const address = [item.basicAddr, item.detailAddr].filter(Boolean).join(" ");

      // 마감일 변환: "26-04-30" → "2026-04-30"
      let deadline = "";
      if (item.closeDt) {
        const parts = item.closeDt.split("-");
        if (parts.length === 3) {
          deadline = `20${parts[0]}-${parts[1]}-${parts[2]}`;
        }
      }

      const description = [
        `[고용24 채용정보]`,
        ``,
        `${item.title}`,
        ``,
        item.holidayTpNm ? `근무형태: ${item.holidayTpNm}` : "",
        salary ? `급여: ${salary}` : "",
        address ? `근무지: ${address}` : "",
        ``,
        `상세보기: ${item.wantedInfoUrl}`,
      ].filter((line) => line !== undefined).join("\n");

      try {
        await sql`
          INSERT INTO job_posts (
            title, description, center_name, address,
            author_role, author_name, contact_type, contact,
            sport, region_name, region_code,
            employment_type, salary, headcount,
            benefits, preferences, deadline,
            ip_address, firebase_uid, source, source_id
          ) VALUES (
            ${item.title}, ${description}, ${item.company}, ${address},
            ${"채용담당자"}, ${item.company}, ${"고용24"}, ${item.wantedInfoUrl},
            ${sport}, ${region.name}, ${region.code},
            ${empType}, ${salary}, ${""},
            ${""}, ${""}, ${deadline},
            ${"work24-api"}, ${"system_work24"}, ${"work24"}, ${item.wantedAuthNo}
          )
        `;
        totalInserted++;
      } catch (e) {
        console.error(`Failed to insert ${item.wantedAuthNo}:`, e);
      }
    }
  }

  return NextResponse.json({
    success: true,
    inserted: totalInserted,
    keywords: SPORTS_KEYWORDS.length,
    timestamp: new Date().toISOString(),
  });
}
