export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";

const API_KEY = process.env.WORK24_API_KEY || "";
const BASE_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do";

// 운동 관련 핵심 키워드 (중복 제거, 효율적 검색)
const SPORTS_KEYWORDS = [
  // 구기
  "축구","풋살","농구","배구","배드민턴","테니스","탁구","야구","핸드볼","럭비","게이트볼",
  // 수상·빙상
  "수영","수영장","아쿠아","다이빙","서핑","스케이트","빙상","컬링",
  // 라켓·기타
  "스쿼시","골프","골프장","볼링",
  // 격투·무도
  "태권도","태권도장","유도","검도","복싱","권투","킥복싱","무에타이","주짓수","합기도","격투기",
  // 피트니스
  "헬스","헬스장","피트니스","트레이너","PT","크로스핏","웨이트",
  // 유연성·몸
  "필라테스","요가","발레","무용","에어로빅","줄넘기","스트레칭",
  // 댄스
  "댄스","댄스스포츠",
  // 동계
  "스키","스노보드",
  // 기타 종목
  "사이클","육상","마라톤","체조","승마","클라이밍","사격","양궁","펜싱",
  // 시설·업종
  "스포츠센터","체육관","스포츠지도사","체육지도자","생활체육","스포츠","체육",
];

const REGION_MAP: Record<string, string> = {
  "서울": "seoul", "부산": "busan", "대구": "daegu", "인천": "incheon",
  "광주": "gwangju", "대전": "daejeon", "울산": "ulsan", "세종": "sejong",
  "경기": "gyeonggi", "강원": "gangwon", "충북": "chungbuk", "충남": "chungnam",
  "전북": "jeonbuk", "전남": "jeonnam", "경북": "gyeongbuk", "경남": "gyeongnam",
  "제주": "jeju",
};

const EMP_TYPE_MAP: Record<string, string> = {
  "10": "정규직", "11": "정규직", "20": "계약직", "21": "계약직", "4": "파트타임",
};

function parseRegion(regionStr: string) {
  if (!regionStr) return { name: "", code: "" };
  const parts = regionStr.trim().split(/\s+/);
  const sido = parts[0] || "";
  const sigungu = parts.slice(1).join(" ");
  return { name: sigungu ? `${sido} - ${sigungu}` : sido, code: REGION_MAP[sido] || "" };
}

function toSport(keyword: string): string {
  if (["헬스","헬스장","피트니스","트레이너","PT","웨이트","크로스핏"].includes(keyword)) return "헬스/PT";
  if (["스키","스노보드"].includes(keyword)) return "스키/스노보드";
  if (["권투"].includes(keyword)) return "복싱";
  if (["태권도장"].includes(keyword)) return "태권도";
  if (["수영장"].includes(keyword)) return "수영";
  if (["골프장"].includes(keyword)) return "골프";
  if (["격투기"].includes(keyword)) return "복싱";
  if (["스포츠센터","체육관","스포츠지도사","체육지도자","생활체육","스포츠","체육"].includes(keyword)) return "기타";
  return keyword;
}

interface Work24Item {
  wantedAuthNo: string; company: string; title: string; salTpNm: string; sal: string;
  region: string; holidayTpNm: string; closeDt: string; wantedInfoUrl: string;
  basicAddr: string; detailAddr: string; empTpCd: string;
}

async function fetchWork24(keyword: string): Promise<Work24Item[]> {
  const url = `${BASE_URL}?authKey=${API_KEY}&callTp=L&returnType=XML&startPage=1&display=100&keyword=${encodeURIComponent(keyword)}&regDate=D-3`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const xml = await res.text();
    const items: Work24Item[] = [];
    const blocks = xml.match(/<wanted>([\s\S]*?)<\/wanted>/g) || [];
    for (const block of blocks) {
      const g = (tag: string) => {
        const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
        return m ? m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : "";
      };
      items.push({
        wantedAuthNo: g("wantedAuthNo"), company: g("company"), title: g("title"),
        salTpNm: g("salTpNm"), sal: g("sal"), region: g("region"),
        holidayTpNm: g("holidayTpNm"), closeDt: g("closeDt"), wantedInfoUrl: g("wantedInfoUrl"),
        basicAddr: g("basicAddr"), detailAddr: g("detailAddr"), empTpCd: g("empTpCd"),
      });
    }
    return items;
  } catch { return []; }
}

// 5개씩 병렬 배치
async function fetchBatch(keywords: string[]): Promise<{ keyword: string; items: Work24Item[] }[]> {
  return Promise.all(keywords.map(async (kw) => ({ keyword: kw, items: await fetchWork24(kw) })));
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!API_KEY) return NextResponse.json({ error: "WORK24_API_KEY not set" }, { status: 500 });

  try { await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'user'`; } catch {}
  try { await sql`ALTER TABLE job_posts ADD COLUMN IF NOT EXISTS source_id TEXT`; } catch {}

  let totalInserted = 0;
  const seen = new Set<string>();

  // 5개씩 병렬로 API 호출
  const batchSize = 5;
  for (let i = 0; i < SPORTS_KEYWORDS.length; i += batchSize) {
    const batch = SPORTS_KEYWORDS.slice(i, i + batchSize);
    const results = await fetchBatch(batch);

    for (const { keyword, items } of results) {
      for (const item of items) {
        if (!item.wantedAuthNo || seen.has(item.wantedAuthNo)) continue;
        seen.add(item.wantedAuthNo);

        const existing = await sql`SELECT id FROM job_posts WHERE source_id = ${item.wantedAuthNo} LIMIT 1`;
        if (existing.length > 0) continue;

        const region = parseRegion(item.region);
        const sport = toSport(keyword);
        const empType = EMP_TYPE_MAP[item.empTpCd] || "기타";
        const salary = item.sal ? `${item.salTpNm} ${item.sal}` : "";
        const address = [item.basicAddr, item.detailAddr].filter(Boolean).join(" ");

        let deadline = "";
        if (item.closeDt) {
          const p = item.closeDt.split("-");
          if (p.length === 3) deadline = `20${p[0]}-${p[1]}-${p[2]}`;
        }

        const description = `[고용24 채용정보]\n\n${item.title}\n\n${item.holidayTpNm ? `근무형태: ${item.holidayTpNm}\n` : ""}${salary ? `급여: ${salary}\n` : ""}${address ? `근무지: ${address}\n` : ""}\n상세보기: ${item.wantedInfoUrl}`;

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
        } catch {}
      }
    }
  }

  return NextResponse.json({ success: true, inserted: totalInserted, timestamp: new Date().toISOString() });
}
