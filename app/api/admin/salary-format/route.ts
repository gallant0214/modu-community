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

    const pattern = "(\\d[\\d,]*\\s*(?:만원|원))[^\\d\\uAC00-\\uD7A3]+(\\d[\\d,]*\\s*(?:만원|원))";

    function transformSalary(salary: string): string {
      // callback 형태로 replace — 치환 문자열 파싱 회피
      const re = new RegExp(pattern, "g");
      let result = salary.replace(re, (_m, a, b) => `${a} ~ ${b}`);
      // 동일 금액 collapse
      const reCollapse = new RegExp("(.+?)\\s*~\\s*\\1", "g");
      result = result.replace(reCollapse, "$1");
      return result;
    }

    const reFind = new RegExp(pattern);
    const targets = allWork24.filter(r => reFind.test(r.salary));

    if (dry) {
      return NextResponse.json({
        dry: true,
        totalWork24: allWork24.length,
        targetCount: targets.length,
        sample: targets.slice(0, 10).map(r => {
          const after = transformSalary(r.salary);
          return {
            id: r.id,
            before: r.salary,
            after,
            changed: r.salary !== after,
            beforeLen: r.salary.length,
            afterLen: after.length,
          };
        }),
      });
    }

    let updated = 0;
    for (const r of targets) {
      const newSal = transformSalary(r.salary);
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
