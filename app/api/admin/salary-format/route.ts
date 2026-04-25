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
    const allWork24 = await sql`
      SELECT id, salary FROM job_posts
      WHERE source = 'work24' AND salary IS NOT NULL AND salary != ''
      ORDER BY id DESC
    ` as { id: number; salary: string }[];

    // 두 금액(만원/원) 사이의 분리자가 한글/숫자/만원/원이 아닌 어떤 문자라도 매칭
    // (NBSP, U+3000 등 모든 공백 + 특수 문자 포괄)
    const reTransform = /(\d[\d,]*\s*(?:만원|원))[^\d가-힣]+(\d[\d,]*\s*(?:만원|원))/g;
    const reFind = /(\d[\d,]*\s*(?:만원|원))[^\d가-힣]+(\d[\d,]*\s*(?:만원|원))/;
    const reCollapseSame = /(.+?)\s*~\s*\1/g;

    const targets = allWork24.filter(r => reFind.test(r.salary));

    if (dry) {
      return NextResponse.json({
        dry: true,
        totalWork24: allWork24.length,
        targetCount: targets.length,
        sample: targets.slice(0, 15).map(r => {
          const after = r.salary.replace(reTransform, "$1 ~ $2").replace(reCollapseSame, "$1");
          // 디버그: salary 의 분리자 추정 부분 char code 확인
          const middleMatch = r.salary.match(/만원([^\d가-힣]+)\d/);
          const middleCharCodes = middleMatch
            ? Array.from(middleMatch[1]).map(c => c.charCodeAt(0).toString(16)).join(",")
            : "(none)";
          return {
            id: r.id,
            before: r.salary,
            after,
            changed: before_after_diff(r.salary, after),
            middleCharCodes,
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

function before_after_diff(before: string, after: string): boolean {
  return before !== after;
}
