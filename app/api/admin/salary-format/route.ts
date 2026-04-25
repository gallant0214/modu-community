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

    // .replace() 가 알 수 없는 이유로 작동 안 함 → match() + 수동 substring 으로 변환.
    function transformSalary(salary: string): string {
      const re = /(\d[\d,]*\s*(?:만원|원))[^\d가-힣]+(\d[\d,]*\s*(?:만원|원))/;
      let result = salary;
      while (true) {
        const m = result.match(re);
        if (!m || m.index === undefined) break;
        const a = m[1];
        const b = m[2];
        if (a === b) break; // 같은 금액이면 변환 의미 없음
        const insertion = `${a} ~ ${b}`;
        result = result.slice(0, m.index) + insertion + result.slice(m.index + m[0].length);
        // 다음 검색은 변환 후 부분에서 다시 시도하지만 무한루프 방지 위해 break
        // (한 salary 안에 두 개 이상 range 있을 일은 없음)
        break;
      }
      return result;
    }

    const reFind = /(\d[\d,]*\s*(?:만원|원))[^\d가-힣]+(\d[\d,]*\s*(?:만원|원))/;
    const targets = allWork24.filter(r => reFind.test(r.salary));

    if (dry) {
      return NextResponse.json({
        dry: true,
        totalWork24: allWork24.length,
        targetCount: targets.length,
        sample: targets.slice(0, 8).map(r => {
          const after = transformSalary(r.salary);
          return {
            id: r.id,
            before: r.salary,
            after,
            changed: r.salary !== after,
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
