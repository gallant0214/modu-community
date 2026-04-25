// ⚠️ 임시 — "도장" 이 들어있지만 무술 종목 단어가 없는 글 일괄 삭제.
// 강화된 isSportsRelated 룰과 동일 기준 적용. 실행 1회 후 파일 삭제.
//
// 호출: GET /api/admin/cleanup-painting?password=<ADMIN_PASSWORD>
//       GET /api/admin/cleanup-painting?password=...&dry=1  (스캔만)

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

const MARTIAL_ARTS_REGEX = "(태권도|유도|검도|합기도|주짓수|킥복싱|무에타이|복싱|권투|무술)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  const dry = url.searchParams.get("dry") === "1";
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 대상: source='work24' AND title 에 "도장" 있음 AND title/center_name 둘 다 무술 키워드 없음
    const targets = await sql`
      SELECT id, title, center_name,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND title ~ '도장'
        AND title !~ ${MARTIAL_ARTS_REGEX}
        AND center_name !~ ${MARTIAL_ARTS_REGEX}
      ORDER BY id DESC
    ` as { id: number; title: string; center_name: string; industry: string }[];

    if (targets.length === 0) {
      return NextResponse.json({ scanned: 0, deleted: 0, message: "no targets" });
    }

    if (dry) {
      // 스캔만 — 샘플 반환
      return NextResponse.json({
        dry: true,
        scanned: targets.length,
        sample: targets.slice(0, 50).map(t => ({
          id: t.id,
          title: (t.title || "").slice(0, 60),
          center_name: (t.center_name || "").slice(0, 30),
          industry: (t.industry || "").slice(0, 50),
        })),
      });
    }

    const ids = targets.map(t => t.id);

    // 좋아요/북마크 정리
    try { await sql`DELETE FROM job_post_likes WHERE job_post_id = ANY(${ids})`; } catch {}
    try { await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ANY(${ids})`; } catch {}

    // 본 데이터 삭제
    const deleted = await sql`
      DELETE FROM job_posts WHERE id = ANY(${ids}) RETURNING id, title
    ` as { id: number; title: string }[];

    invalidateCache("jobs:*").catch(() => {});

    return NextResponse.json({
      scanned: targets.length,
      deleted: deleted.length,
      sample: deleted.slice(0, 20).map(d => ({ id: d.id, title: (d.title || "").slice(0, 60) })),
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
