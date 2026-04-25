// ⚠️ 임시 — work24 임포트 중 새 strict 필터 기준에 맞지 않는 글 일괄 정리.
// 실행 1회 후 파일 삭제 예정.
//
// dry-run:  GET /api/admin/inspect-wrong-sport?password=<ADMIN_PASSWORD>&dry=1
// 실제 삭제: GET /api/admin/inspect-wrong-sport?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

// fetch-jobs/route.ts 의 EXCLUDE_TITLE 과 동일 — 모호한 키워드(매장관리/판매/조리/시설관리)는
// 업종 기반 EXCLUDE_IND 에 위임. 명백히 비스포츠인 단어만 여기에 둠.
// 어린이집 체육강사 같은 글이 있으니 "어린이집" 단독 매칭은 제외.
// "보조선생님" / "보육교사" 처럼 명백히 비-스포츠 직무명만 매칭.
const TITLE_BAD =
  "(회계|총무|경리|인사담당|마케팅|기획팀|개발자|프로그래머|디자이너|연구원|보조선생님|보육교사|사무직|사무\\s*직원|사무용가구|관리사무원)";

const IND_BAD =
  "(의약품|가구\\s*소매|가구\\s*도매|사무용가구|운동\\s*및\\s*경기용품\\s*소매|운동\\s*및\\s*경기용품\\s*도매|체조.*장비\\s*제조|체력단련용\\s*장비\\s*제조|운동기구\\s*제조|운동기구\\s*도매|운동기구\\s*소매|시설관리\\s*공단|인력\\s*공급|인력공급|인사관리\\s*서비스|고용\\s*알선|임시\\s*및\\s*일용\\s*인력|상용\\s*인력|광물제품\\s*제조|비금속\\s*광물|목재가구\\s*제조|가구\\s*제조업)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  const dry = url.searchParams.get("dry") === "1";
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 대상: title 에 비스포츠 키워드 OR description 에 비스포츠 업종 패턴
    const targets = await sql`
      SELECT id, title, center_name, sport,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND (title ~ ${TITLE_BAD} OR description ~ ${IND_BAD})
      ORDER BY id DESC
    ` as { id: number; title: string; center_name: string; sport: string; industry: string }[];

    if (targets.length === 0) {
      return NextResponse.json({ scanned: 0, deleted: 0, message: "no targets" });
    }

    if (dry) {
      return NextResponse.json({
        dry: true,
        scanned: targets.length,
        sample: targets.slice(0, 50).map(t => ({
          id: t.id,
          title: (t.title || "").slice(0, 50),
          center_name: (t.center_name || "").slice(0, 25),
          sport: t.sport,
          industry: (t.industry || "").slice(0, 35),
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
