// ⚠️ 임시 — 급여 포맷 정규화 백필. 1회 사용 후 삭제.

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
    // work24 임포트 글의 salary 샘플
    const allWork24 = await sql`
      SELECT id, salary FROM job_posts
      WHERE source = 'work24' AND salary IS NOT NULL AND salary != ''
      ORDER BY id DESC
    ` as { id: number; salary: string }[];

    // JS 정규식으로 변환 대상 식별 (PostgreSQL regex 신뢰성 문제 회피)
    const reFind = /(\d[\d,]*\s*(?:만원|원))\s+(\d[\d,]*\s*(?:만원|원))/;
    const targets = allWork24.filter(r => reFind.test(r.salary));

    if (dry) {
      const reTransform = /(\d[\d,]*\s*(?:만원|원))\s+(\d[\d,]*\s*(?:만원|원))/g;
      const reCollapseSame = /(.+?)\s*~\s*\1/g;
      return NextResponse.json({
        dry: true,
        totalWork24: allWork24.length,
        targetCount: targets.length,
        sample: targets.slice(0, 20).map(r => ({
          id: r.id,
          before: r.salary,
          after: r.salary.replace(reTransform, "$1 ~ $2").replace(reCollapseSame, "$1"),
        })),
      });
    }

    // 실 UPDATE — JS 로 변환 후 한 건씩 UPDATE
    const reTransform = /(\d[\d,]*\s*(?:만원|원))\s+(\d[\d,]*\s*(?:만원|원))/g;
    const reCollapseSame = /(.+?)\s*~\s*\1/g;
    let updated = 0;
    for (const r of targets) {
      const newSal = r.salary.replace(reTransform, "$1 ~ $2").replace(reCollapseSame, "$1");
      if (newSal !== r.salary) {
        await sql`UPDATE job_posts SET salary = ${newSal} WHERE id = ${r.id}`;
        updated++;
      }
    }

    invalidateCache("jobs:*").catch(() => {});

    return NextResponse.json({
      updated,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
