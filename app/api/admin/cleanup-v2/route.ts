// ⚠️ 임시 — 강사 단독 매칭/도배/방수/건축도장 등 새 strict 룰 적용해 정리.
// 1회 사용 후 삭제 예정.
//
// dry-run:  GET /api/admin/cleanup-v2?password=<ADMIN_PASSWORD>&dry=1
// 실 삭제:  GET /api/admin/cleanup-v2?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

// 비스포츠 직무/제목 키워드 (건설/도배/방수/타일 등 추가)
const TITLE_BAD =
  "(도배|미장|방수\\s*공사|방수\\s*직무|방수\\s*기사|타일\\s*시공|인테리어\\s*마감|건축\\s*도장|건설\\s*도장|중장비|굴삭기|크레인|회계|총무|경리|인사담당|마케팅|기획팀|개발자|프로그래머|디자이너|연구원|보조선생님|보육교사|사무직|사무\\s*직원|사무용가구|관리사무원)";

// 스포츠 종목 키워드 — 이게 같이 있으면 "강사" 등이 진짜 스포츠 강사 모집임
const SPORT_KEYWORD =
  "(태권도|유도|검도|복싱|권투|합기도|주짓수|킥복싱|무에타이|무술|헬스|피트니스|트레이너|필라테스|요가|발레|수영|골프|테니스|배드민턴|탁구|축구|풋살|농구|배구|야구|클라이밍|승마|체조|댄스|스키|스노보드|스포츠|체육|운동|스포츠지도사|체육지도사|체육교사|레저|생활체육|체력단련)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  const dry = url.searchParams.get("dry") === "1";
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 비스포츠 강사 글: title 에 "강사"는 있는데 종목 키워드는 title/center_name 어디에도 없음
    const wrongInstructors = await sql`
      SELECT id, title, center_name, sport,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND title ~ '강사'
        AND title !~ ${SPORT_KEYWORD}
        AND center_name !~ ${SPORT_KEYWORD}
    ` as any[];

    // 건설/도배/방수 등 비스포츠 직무 키워드 매칭
    const constructionJobs = await sql`
      SELECT id, title, center_name, sport,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND title ~ ${TITLE_BAD}
    ` as any[];

    // 합치고 dedup (id 기준)
    const map = new Map<number, any>();
    for (const r of wrongInstructors) map.set(r.id, { ...r, reason: "강사 단독" });
    for (const r of constructionJobs) {
      if (!map.has(r.id)) map.set(r.id, { ...r, reason: "건설/도배/방수" });
      else map.get(r.id).reason += " + 건설/도배";
    }
    const targets = Array.from(map.values()).sort((a, b) => b.id - a.id);

    if (targets.length === 0) {
      return NextResponse.json({ scanned: 0, deleted: 0, message: "no targets" });
    }

    if (dry) {
      return NextResponse.json({
        dry: true,
        scanned: targets.length,
        sample: targets.slice(0, 50).map(t => ({
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
      sample: deleted.slice(0, 25).map(d => ({ id: d.id, title: (d.title || "").slice(0, 60) })),
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
