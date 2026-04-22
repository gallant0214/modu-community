export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.WORK24_API_KEY || "";
const BASE_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do";

const SPORTS_KEYWORDS = [
  "태권도","유도","검도","복싱","합기도","주짓수","킥복싱",
  "헬스","피트니스","트레이너","크로스핏",
  "필라테스","요가","발레","에어로빅","무용","줄넘기",
  "수영","골프","테니스","배드민턴","탁구","축구","농구","배구","야구",
  "클라이밍","승마","체조","양궁","펜싱","댄스",
  "스포츠지도사","체육","생활체육","스포츠센터",
];

const REGION_MAP: Record<string, string> = {
  "서울":"seoul","부산":"busan","대구":"daegu","인천":"incheon",
  "광주":"gwangju","대전":"daejeon","울산":"ulsan","세종":"sejong",
  "경기":"gyeonggi","강원":"gangwon","충북":"chungbuk","충남":"chungnam",
  "전북":"jeonbuk","전남":"jeonnam","경북":"gyeongbuk","경남":"gyeongnam","제주":"jeju",
};

const EMP_MAP: Record<string, string> = { "10":"정규직","11":"정규직","20":"계약직","21":"계약직","4":"파트타임" };

// 제목+회사명에서 종목을 지능적으로 추론
const SPORT_PATTERNS: [RegExp, string][] = [
  [/태권도/i, "태권도"], [/유도/i, "유도"], [/검도/i, "검도"],
  [/복싱|권투/i, "복싱"], [/킥복싱/i, "킥복싱"], [/무에타이/i, "무에타이"],
  [/주짓수|BJJ/i, "주짓수"], [/합기도/i, "합기도"], [/가라테/i, "기타"],
  [/헬스|피트니스|PT|퍼스널|트레이너|웨이트|짐|GYM/i, "헬스/PT"],
  [/크로스핏/i, "헬스/PT"], [/필라테스/i, "필라테스"], [/요가/i, "요가"],
  [/발레/i, "기타"], [/무용|댄스/i, "댄스스포츠"], [/에어로빅/i, "기타"],
  [/줄넘기/i, "기타"], [/수영/i, "수영"], [/골프/i, "골프"],
  [/테니스/i, "테니스"], [/배드민턴/i, "배드민턴"], [/탁구/i, "탁구"],
  [/축구|풋살/i, "축구"], [/농구/i, "농구"], [/배구/i, "배구"], [/야구/i, "야구"],
  [/클라이밍|암벽|볼더링/i, "클라이밍"], [/승마/i, "승마"], [/체조/i, "체조"],
  [/양궁/i, "기타"], [/펜싱/i, "기타"], [/사격/i, "기타"],
  [/스키|스노보드/i, "스키/스노보드"], [/스케이트|빙상/i, "기타"],
  [/볼링/i, "기타"], [/스쿼시/i, "기타"],
  [/핸드볼/i, "기타"], [/럭비/i, "기타"],
];

function detectSport(title: string, company: string, keyword: string): string {
  const text = `${title} ${company}`;
  for (const [pattern, sport] of SPORT_PATTERNS) {
    if (pattern.test(text)) return sport;
  }
  // 패턴 매칭 실패 시 키워드 기반 폴백
  if (["헬스","피트니스","트레이너","크로스핏"].includes(keyword)) return "헬스/PT";
  if (["스포츠지도사","체육","생활체육","스포츠센터"].includes(keyword)) return "기타";
  return keyword;
}

interface W24 { wantedAuthNo:string; company:string; title:string; salTpNm:string; sal:string; region:string; holidayTpNm:string; closeDt:string; wantedInfoUrl:string; basicAddr:string; detailAddr:string; empTpCd:string; }

function parseXml(xml: string): W24[] {
  const items: W24[] = [];
  for (const b of xml.match(/<wanted>([\s\S]*?)<\/wanted>/g) || []) {
    const g = (t: string) => b.match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`))?.[1]?.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim() || "";
    items.push({ wantedAuthNo:g("wantedAuthNo"), company:g("company"), title:g("title"), salTpNm:g("salTpNm"), sal:g("sal"), region:g("region"), holidayTpNm:g("holidayTpNm"), closeDt:g("closeDt"), wantedInfoUrl:g("wantedInfoUrl"), basicAddr:g("basicAddr"), detailAddr:g("detailAddr"), empTpCd:g("empTpCd") });
  }
  return items;
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!API_KEY) return NextResponse.json({ error: "WORK24_API_KEY not set" }, { status: 500 });

  try { await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user'`; } catch {}
  try { await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source_id TEXT`; } catch {}
  // VARCHAR 컬럼 크기 확장
  try { await sql`ALTER TABLE job_posts ALTER COLUMN center_name TYPE VARCHAR(200)`; } catch {}
  try { await sql`ALTER TABLE job_posts ALTER COLUMN salary TYPE VARCHAR(200)`; } catch {}
  try { await sql`ALTER TABLE job_posts ALTER COLUMN contact TYPE TEXT`; } catch {}
  try { await sql`ALTER TABLE job_posts ALTER COLUMN address TYPE TEXT`; } catch {}

  const existingRows = await sql`SELECT source_id FROM job_posts WHERE source = 'work24' AND source_id IS NOT NULL`;
  const existingIds = new Set(existingRows.map((r: { source_id: string }) => r.source_id));

  // 모든 키워드 동시 호출 (각 API 호출은 독립적)
  const allResults = await Promise.all(
    SPORTS_KEYWORDS.map(async (kw) => {
      try {
        const res = await fetch(
          `${BASE_URL}?authKey=${API_KEY}&callTp=L&returnType=XML&startPage=1&display=20&keyword=${encodeURIComponent(kw)}&regDate=D-3`,
          { signal: AbortSignal.timeout(8000) }
        );
        return { kw, items: parseXml(await res.text()) };
      } catch { return { kw, items: [] as W24[] }; }
    })
  );

  // 중복 제거 후 INSERT할 목록 수집
  const seen = new Set<string>();
  const toInsert: { it: W24; sport: string; rName: string; rCode: string; salary: string; addr: string; deadline: string; desc: string; empType: string }[] = [];

  for (const { kw, items } of allResults) {
    for (const it of items) {
      if (!it.wantedAuthNo || seen.has(it.wantedAuthNo) || existingIds.has(it.wantedAuthNo)) continue;
      seen.add(it.wantedAuthNo);

      const pts = it.region?.trim().split(/\s+/) || [];
      const rName = pts.length > 1 ? `${pts[0]} - ${pts.slice(1).join(" ")}` : (pts[0] || "");
      const rCode = REGION_MAP[pts[0] || ""] || "";
      const salary = it.sal ? `${it.salTpNm} ${it.sal}` : "";
      const addr = [it.basicAddr, it.detailAddr].filter(Boolean).join(" ");
      let deadline = "";
      if (it.closeDt) { const p = it.closeDt.split("-"); if (p.length === 3) deadline = `20${p[0]}-${p[1]}-${p[2]}`; }
      const desc = [
        it.holidayTpNm ? `근무형태: ${it.holidayTpNm}` : "",
        salary ? `급여: ${salary}` : "",
        addr ? `근무지: ${addr}` : "",
      ].filter(Boolean).join("\n");

      toInsert.push({ it, sport: detectSport(it.title, it.company, kw), rName, rCode, salary, addr, deadline, desc, empType: EMP_MAP[it.empTpCd] || "기타" });
    }
  }

  // DB INSERT 병렬 (10개씩)
  let inserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < toInsert.length; i += 10) {
    const batch = toInsert.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(({ it, sport, rName, rCode, salary, addr, deadline, desc, empType }) =>
        sql`INSERT INTO job_posts (title,description,center_name,address,author_role,author_name,contact_type,contact,sport,region_name,region_code,employment_type,salary,headcount,benefits,preferences,deadline,ip_address,firebase_uid,source,source_id) VALUES (${it.title.slice(0,200)},${desc},${it.company.slice(0,100)},${addr.slice(0,200)},${"채용담당자"},${it.company.slice(0,50)},${"고용24"},${it.wantedInfoUrl},${sport.slice(0,50)},${rName.slice(0,50)},${rCode},${empType},${salary.slice(0,100)},${""},${""},${""},${deadline},${"work24-api"},${"system_work24"},${"work24"},${it.wantedAuthNo})`
      )
    );
    const fulfilled = results.filter((r) => r.status === "fulfilled").length;
    const rejected = results.filter((r) => r.status === "rejected");
    inserted += fulfilled;
    if (rejected.length > 0) {
      errors.push(...rejected.map((r) => r.status === "rejected" ? (r.reason?.message || String(r.reason)) : ""));
    }
  }

  return NextResponse.json({ success: true, inserted, found: toInsert.length, errors: errors.slice(0, 5), timestamp: new Date().toISOString() });
}
