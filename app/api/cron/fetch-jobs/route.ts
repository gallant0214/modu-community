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
  "클라이밍","승마","체조","양궁","펜싱","사격","댄스",
  "스포츠지도사","체육","생활체육","스포츠센터","체육관",
];

const REGION_MAP: Record<string, string> = {
  "서울":"seoul","부산":"busan","대구":"daegu","인천":"incheon",
  "광주":"gwangju","대전":"daejeon","울산":"ulsan","세종":"sejong",
  "경기":"gyeonggi","강원":"gangwon","충북":"chungbuk","충남":"chungnam",
  "전북":"jeonbuk","전남":"jeonnam","경북":"gyeongbuk","경남":"gyeongnam","제주":"jeju",
};

const EMP_MAP: Record<string, string> = { "10":"정규직","11":"정규직","20":"계약직","21":"계약직","4":"파트타임" };

function toSport(kw: string): string {
  if (["헬스","피트니스","트레이너","크로스핏"].includes(kw)) return "헬스/PT";
  if (["스포츠지도사","체육","생활체육","스포츠센터","체육관"].includes(kw)) return "기타";
  return kw;
}

interface W24 { wantedAuthNo:string; company:string; title:string; salTpNm:string; sal:string; region:string; holidayTpNm:string; closeDt:string; wantedInfoUrl:string; basicAddr:string; detailAddr:string; empTpCd:string; }

async function fetchKw(kw: string): Promise<W24[]> {
  try {
    const res = await fetch(`${BASE_URL}?authKey=${API_KEY}&callTp=L&returnType=XML&startPage=1&display=50&keyword=${encodeURIComponent(kw)}&regDate=D-3`, { signal: AbortSignal.timeout(6000) });
    const xml = await res.text();
    const items: W24[] = [];
    for (const b of xml.match(/<wanted>([\s\S]*?)<\/wanted>/g) || []) {
      const g = (t: string) => b.match(new RegExp(`<${t}>([\\s\\S]*?)<\\/${t}>`))?.[1]?.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").trim() || "";
      items.push({ wantedAuthNo:g("wantedAuthNo"), company:g("company"), title:g("title"), salTpNm:g("salTpNm"), sal:g("sal"), region:g("region"), holidayTpNm:g("holidayTpNm"), closeDt:g("closeDt"), wantedInfoUrl:g("wantedInfoUrl"), basicAddr:g("basicAddr"), detailAddr:g("detailAddr"), empTpCd:g("empTpCd") });
    }
    return items;
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

  // 기존 source_id 목록을 한번에 조회
  const existingRows = await sql`SELECT source_id FROM job_posts WHERE source = 'work24' AND source_id IS NOT NULL`;
  const existingIds = new Set(existingRows.map((r: { source_id: string }) => r.source_id));

  let inserted = 0;
  const seen = new Set<string>();

  // 10개씩 병렬 호출
  for (let i = 0; i < SPORTS_KEYWORDS.length; i += 10) {
    const batch = SPORTS_KEYWORDS.slice(i, i + 10);
    const results = await Promise.all(batch.map(async (kw) => ({ kw, items: await fetchKw(kw) })));

    for (const { kw, items } of results) {
      for (const it of items) {
        if (!it.wantedAuthNo || seen.has(it.wantedAuthNo) || existingIds.has(it.wantedAuthNo)) continue;
        seen.add(it.wantedAuthNo);

        const pts = it.region?.trim().split(/\s+/) || [];
        const rName = pts.length > 1 ? `${pts[0]} - ${pts.slice(1).join(" ")}` : (pts[0] || "");
        const rCode = REGION_MAP[pts[0] || ""] || "";
        const sport = toSport(kw);
        const salary = it.sal ? `${it.salTpNm} ${it.sal}` : "";
        const addr = [it.basicAddr, it.detailAddr].filter(Boolean).join(" ");
        let deadline = "";
        if (it.closeDt) { const p = it.closeDt.split("-"); if (p.length === 3) deadline = `20${p[0]}-${p[1]}-${p[2]}`; }

        const desc = `[고용24 채용정보]\n\n${it.title}\n\n${it.holidayTpNm ? `근무형태: ${it.holidayTpNm}\n` : ""}${salary ? `급여: ${salary}\n` : ""}${addr ? `근무지: ${addr}\n` : ""}\n상세보기: ${it.wantedInfoUrl}`;

        try {
          await sql`INSERT INTO job_posts (title,description,center_name,address,author_role,author_name,contact_type,contact,sport,region_name,region_code,employment_type,salary,headcount,benefits,preferences,deadline,ip_address,firebase_uid,source,source_id) VALUES (${it.title},${desc},${it.company},${addr},${"채용담당자"},${it.company},${"고용24"},${it.wantedInfoUrl},${sport},${rName},${rCode},${EMP_MAP[it.empTpCd]||"기타"},${salary},${""},${""},${""},${deadline},${"work24-api"},${"system_work24"},${"work24"},${it.wantedAuthNo})`;
          inserted++;
          existingIds.add(it.wantedAuthNo);
        } catch {}
      }
    }
  }

  return NextResponse.json({ success: true, inserted, timestamp: new Date().toISOString() });
}
