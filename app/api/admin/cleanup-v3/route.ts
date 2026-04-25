// ⚠️ 임시 — 새 strict 룰 적용해 부적절 work24 글 정리.
//
// dry-run: GET /api/admin/cleanup-v3?password=<ADMIN_PASSWORD>&dry=1
// 실삭제: GET /api/admin/cleanup-v3?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

const TITLE_BAD =
  "(바리스타|베이커리|카페\\s*직원|카페\\s*매니저|매점|미화|세차|룸메이드|호텔\\s*프론트|호텔\\s*객실|화장품|식품)";

const IND_BAD =
  "(화장품\\s*제조|식품\\s*제조|음식점|커피\\s*전문점|베이커리|카페|음식료품)";

// 강한 sports 시그널 — 이게 title/center_name 에 없으면 의심
const SPORT_KEYWORD =
  "(태권도|유도|검도|복싱|권투|합기도|주짓수|킥복싱|무에타이|무술|헬스|피트니스|트레이너|필라테스|요가|발레|수영|골프|테니스|배드민턴|탁구|축구|풋살|농구|배구|야구|클라이밍|승마|체조|댄스|스키|스노보드|스포츠|체육|운동|지도사|레슨|인스트럭터|레저|체력단련|GYM|짐 |피트니스|웰니스)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  const dry = url.searchParams.get("dry") === "1";
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 패턴 A: title 에 명백한 비스포츠 직무 키워드
    const a = await sql`
      SELECT id, title, center_name, sport,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND title ~ ${TITLE_BAD}
    ` as any[];

    // 패턴 B: 업종이 비스포츠
    const b = await sql`
      SELECT id, title, center_name, sport,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND description ~ ${IND_BAD}
    ` as any[];

    // 패턴 C: SPORTS_IND 만으로 통과한 케이스 — title/center_name 에 종목 키워드가 전혀 없음
    // (수영장/골프장 운영업체에서 바리스타/회계/미화 같은 비스포츠 직원)
    // 단, 매장관리/판매 등 모호한 단어는 보호 (사용자 피드백)
    const c = await sql`
      SELECT id, title, center_name, sport,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND title !~ ${SPORT_KEYWORD}
        AND center_name !~ ${SPORT_KEYWORD}
        AND description ~ '(수영장 운영업|골프장 운영업|체육관 운영업|체육시설 운영업|기타 스포츠 서비스업)'
        AND title ~ '(조리|주방|미화|예초|락카|락커|운영지원|운영팀|총무|회계|경리|보안|경비|시설관리|식음|연회|객실|프론트|매점|카페|바리스타|베이커리|세차|룸메이드)'
    ` as any[];

    // 합치기 + dedup
    const map = new Map<number, any>();
    for (const r of a) map.set(r.id, { ...r, reason: "비스포츠 직무" });
    for (const r of b) {
      if (!map.has(r.id)) map.set(r.id, { ...r, reason: "비스포츠 업종" });
    }
    for (const r of c) {
      if (!map.has(r.id)) map.set(r.id, { ...r, reason: "스포츠시설 비스포츠직무" });
    }
    const targets = Array.from(map.values()).sort((a, b) => b.id - a.id);

    if (targets.length === 0) {
      return NextResponse.json({ scanned: 0, deleted: 0, message: "no targets" });
    }

    if (dry) {
      return NextResponse.json({
        dry: true,
        scanned: targets.length,
        sample: targets.slice(0, 60).map(t => ({
          id: t.id,
          reason: t.reason,
          title: (t.title || "").slice(0, 50),
          center_name: (t.center_name || "").slice(0, 25),
          sport: t.sport,
          industry: (t.industry || "").slice(0, 30),
        })),
      });
    }

    const ids = targets.map(t => t.id);
    try { await sql`DELETE FROM job_post_likes WHERE job_post_id = ANY(${ids})`; } catch {}
    try { await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ANY(${ids})`; } catch {}

    const deleted = await sql`
      DELETE FROM job_posts WHERE id = ANY(${ids}) RETURNING id, title
    ` as { id: number; title: string }[];

    invalidateCache("jobs:*").catch(() => {});

    return NextResponse.json({
      scanned: targets.length,
      deleted: deleted.length,
      sample: deleted.slice(0, 30).map(d => ({ id: d.id, title: (d.title || "").slice(0, 60) })),
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
