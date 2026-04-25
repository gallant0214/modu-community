// ⚠️ 임시 — 기존 work24 임포트 글의 급여 포맷 정규화 (두 금액 사이 ' ~ ' 삽입).
// 1회 사용 후 삭제.
//
// dry: GET /api/admin/salary-format?password=<ADMIN_PASSWORD>&dry=1
// 실: GET /api/admin/salary-format?password=<ADMIN_PASSWORD>

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
    // 두 금액이 공백만으로 연결된 패턴 찾기
    // 예: "연봉 3,600만원 6,000만원" / "시급 20000원 30000원"
    const targets = await sql`
      SELECT id, salary
      FROM job_posts
      WHERE source = 'work24'
        AND salary ~ '\d[0-9,]*\s?(만원|원)\s+\d[0-9,]*\s?(만원|원)'
    ` as { id: number; salary: string }[];

    if (dry) {
      return NextResponse.json({
        dry: true,
        targetCount: targets.length,
        sample: targets.slice(0, 20).map(r => ({
          id: r.id,
          before: r.salary,
          after: (r.salary || "").replace(
            /(\d[\d,]*\s*(?:만원|원))\s+(\d[\d,]*\s*(?:만원|원))/g,
            "$1 ~ $2"
          ),
        })),
      });
    }

    // 실 UPDATE — postgres regexp_replace
    const updated = await sql`
      UPDATE job_posts
      SET salary = regexp_replace(
        salary,
        '(\d[0-9,]*\s?(만원|원))\s+(\d[0-9,]*\s?(만원|원))',
        '\1 ~ \3',
        'g'
      )
      WHERE source = 'work24'
        AND salary ~ '\d[0-9,]*\s?(만원|원)\s+\d[0-9,]*\s?(만원|원)'
      RETURNING id
    ` as { id: number }[];

    invalidateCache("jobs:*").catch(() => {});

    return NextResponse.json({
      updated: updated.length,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
