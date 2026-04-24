// ⚠️ 임시 — 스캔으로 확인된 34건(도장=페인트 + 산업 직종) 일괄 삭제.
// 실행 1회 후 이 파일 삭제.
//
// 호출: GET /api/admin/delete-wrong-imports?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

const INDUSTRY_REGEX = "(제조업|기계|금속|화학|플라스틱|반도체|전자부품|변압기|자동차|운송|물류|일반목적용|산업용|조립|건설|창호|토공사|도금|성형|가공|수리업|단조|적층|표면처리|오락용품 제조)";
const INDUSTRIAL_TITLE_REGEX = "(조립|생산|제조|용접|CNC|선반|프레스|사출|금형|운전기사|지게차|상하차|택배|도장공|도장사원|도장기사|도장작업|분체도장|자동차 도장|스프레이도장)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 먼저 삭제 대상 선별해서 관련 테이블(likes/bookmarks) 정리
    const targets = await sql`
      SELECT id FROM job_posts
      WHERE source = 'work24'
        AND (
          (
            (title ~ '도장' OR center_name ~ '도장')
            AND description ~ ${INDUSTRY_REGEX}
          )
          OR title ~ ${INDUSTRIAL_TITLE_REGEX}
        )
    ` as { id: number }[];

    const ids = targets.map(r => r.id);

    if (ids.length === 0) {
      return NextResponse.json({ deleted: 0, message: "no targets" });
    }

    // 관련 좋아요/북마크 정리
    try { await sql`DELETE FROM job_post_likes WHERE job_post_id = ANY(${ids})`; } catch {}
    try { await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ANY(${ids})`; } catch {}

    // 본 데이터 삭제
    const deleted = await sql`
      DELETE FROM job_posts
      WHERE id = ANY(${ids})
      RETURNING id, title, center_name
    ` as { id: number; title: string; center_name: string }[];

    // /jobs 캐시 무효화
    invalidateCache("jobs:*").catch(() => {});

    return NextResponse.json({
      deleted: deleted.length,
      deletedIds: deleted.map(r => r.id),
      sample: deleted.slice(0, 10).map(r => ({ id: r.id, title: r.title, center_name: r.center_name })),
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
