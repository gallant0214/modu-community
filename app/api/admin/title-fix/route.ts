// ⚠️ 임시 — title 앞 "..." prefix 조사 + 청소 직원 글 등 정리.
// 1회 사용 후 삭제.
//
// dry: GET /api/admin/title-fix?password=<ADMIN_PASSWORD>&dry=1
// 실제: GET /api/admin/title-fix?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  const dry = url.searchParams.get("dry") === "1";
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1) "..." 또는 ".." 로 시작하는 work24 title 표본 (앞에 dot 만 있는 케이스)
    const dotPrefixed = await sql`
      SELECT id, title, center_name
      FROM job_posts
      WHERE source = 'work24'
        AND title ~ '^[.…]+'
      ORDER BY id DESC
      LIMIT 30
    ` as { id: number; title: string; center_name: string }[];

    // 2) 비스포츠 직무 글 (청소/사무용품/영업사원/납품 등)
    const cleaningJobs = await sql`
      SELECT id, title, center_name,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND title ~ '(청소|사무용품|영업사원|영업직|납품 ?및 ?영업|납품영업|사회복지사|복지사|간호조무사|요양원|간병인)'
      ORDER BY id DESC
    ` as { id: number; title: string; center_name: string; industry: string }[];

    if (dry) {
      return NextResponse.json({
        dry: true,
        dotPrefixedCount: dotPrefixed.length,
        dotPrefixedSample: dotPrefixed.map(r => ({
          id: r.id,
          title_with_dots: (r.title || "").slice(0, 80),
          title_after_strip: (r.title || "").replace(/^[.…\s]+/, "").slice(0, 60),
          center_name: (r.center_name || "").slice(0, 25),
        })),
        cleaningJobsCount: cleaningJobs.length,
        cleaningJobsSample: cleaningJobs.slice(0, 30).map(r => ({
          id: r.id,
          title: (r.title || "").slice(0, 50),
          center_name: (r.center_name || "").slice(0, 25),
          industry: (r.industry || "").slice(0, 30),
        })),
      });
    }

    // 실 작업
    // 1) title 앞 dot prefix 제거 — UPDATE
    let updated = 0;
    if (dotPrefixed.length > 0) {
      const result = await sql`
        UPDATE job_posts
        SET title = regexp_replace(title, '^[.…\s]+', '')
        WHERE source = 'work24'
          AND title ~ '^[.…]+'
        RETURNING id
      ` as { id: number }[];
      updated = result.length;
    }

    // 2) 청소 글 삭제
    const cleaningIds = cleaningJobs.map(r => r.id);
    let deletedCleaning = 0;
    if (cleaningIds.length > 0) {
      try { await sql`DELETE FROM job_post_likes WHERE job_post_id = ANY(${cleaningIds})`; } catch {}
      try { await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ANY(${cleaningIds})`; } catch {}
      const del = await sql`
        DELETE FROM job_posts WHERE id = ANY(${cleaningIds}) RETURNING id
      ` as { id: number }[];
      deletedCleaning = del.length;
    }

    invalidateCache("jobs:*").catch(() => {});

    return NextResponse.json({
      titlesUpdated: updated,
      cleaningDeleted: deletedCleaning,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
