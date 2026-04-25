// ⚠️ 임시 — 급여 포맷 정규화. 1회 사용 후 삭제.

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
    const allWork24 = await sql`
      SELECT id, salary FROM job_posts
      WHERE source = 'work24' AND salary IS NOT NULL AND salary != ''
      ORDER BY id DESC
    ` as { id: number; salary: string }[];

    // new RegExp 로 동적 생성 (build minification 회피)
    const pattern = "(\\d[\\d,]*\\s*(?:만원|원))[^\\d\\uAC00-\\uD7A3]+(\\d[\\d,]*\\s*(?:만원|원))";
    const reTransform = new RegExp(pattern, "g");
    const reFind = new RegExp(pattern);
    const reCollapseSame = /(.+?)\s*~\s*\1/g;

    const targets = allWork24.filter(r => reFind.test(r.salary));

    if (dry) {
      return NextResponse.json({
        dry: true,
        regexSource: reTransform.source,
        totalWork24: allWork24.length,
        targetCount: targets.length,
        sample: targets.slice(0, 8).map(r => {
          const after = r.salary.replace(reTransform, "$1 ~ $2").replace(reCollapseSame, "$1");
          // 정규식이 매칭하는지 직접 확인
          const matchResult = r.salary.match(new RegExp(pattern));
          return {
            id: r.id,
            before: r.salary,
            after,
            changed: r.salary !== after,
            matched: !!matchResult,
            matchedGroups: matchResult ? matchResult.slice(0, 3) : null,
          };
        }),
      });
    }

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
