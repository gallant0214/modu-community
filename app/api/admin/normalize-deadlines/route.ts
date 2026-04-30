import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 임시 정규화 엔드포인트 — work24 임포트 글의 옛 마감일 표기를 정리.
//   "채용시까지 (2026-05-12)" → "2026-05-12"
//   "채용시까지" (날짜 없음) → ""
//
// 사용법:
//   POST { password: "...", confirm: false } → dry-run, 매칭 건수/샘플 100건 반환
//   POST { password: "...", confirm: true  } → 실제 UPDATE + Upstash 캐시 무효화

interface UpdateRow {
  id: number;
  oldDeadline: string;
  newDeadline: string;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, confirm } = body as { password?: string; confirm?: boolean };

  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 일치하지 않습니다" },
      { status: 403 }
    );
  }

  const { data: rows, error } = await supabase
    .from("job_posts")
    .select("id, deadline")
    .eq("source", "work24")
    .like("deadline", "채용시까지%");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const updates: UpdateRow[] = (rows || []).map((p) => {
    const m = p.deadline?.match(/(\d{4}-\d{2}-\d{2})/);
    return {
      id: p.id as number,
      oldDeadline: p.deadline as string,
      newDeadline: m ? m[1] : "",
    };
  });

  if (!confirm) {
    return NextResponse.json({
      mode: "dry-run",
      total: updates.length,
      sample: updates.slice(0, 100),
      hint: "실행하려면 { confirm: true } 로 다시 호출",
    });
  }

  // 실제 UPDATE — 50개씩 배치 병렬
  let updated = 0;
  const errors: string[] = [];
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    const results = await Promise.all(
      batch.map((u) =>
        supabase
          .from("job_posts")
          .update({ deadline: u.newDeadline })
          .eq("id", u.id),
      ),
    );
    for (const r of results) {
      if (r.error) errors.push(r.error.message);
      else updated++;
    }
  }

  await invalidateCache("jobs:*").catch(() => {});

  return NextResponse.json({
    mode: "update",
    total: updates.length,
    updated,
    errors: errors.slice(0, 5),
  });
}
