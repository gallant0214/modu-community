// ⚠️ 임시 — 모든 work24 글의 직무내용을 줄바꿈 유지된 형태로 다시 추출.
// 1회 사용 후 삭제.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

function extractJobDuty(html: string): string | null {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  const dutyIdx = cleaned.indexOf("직무내용");
  if (dutyIdx < 0) return null;

  const after = cleaned.slice(dutyIdx + "직무내용".length);
  const endMarkers = ["모집 인원", "더보기", "접기"];
  let endIdx = after.length;
  for (const m of endMarkers) {
    const i = after.indexOf(m);
    if (i >= 0 && i < endIdx) endIdx = i;
  }

  const section = after.slice(0, endIdx);
  const text = section
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:li|p|div|tr|h[1-6]|ol|ul)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (text.length < 5) return null;
  return text.slice(0, 2000);
}

/**
 * 기존 description 에서 [직무내용]\n... \n[메타데이터들] 형태에서
 * 메타데이터 부분만 분리.
 */
function splitDescription(desc: string): { jobDutyOld: string | null; meta: string } {
  if (!desc) return { jobDutyOld: null, meta: "" };

  // 메타데이터 시작 marker (근무형태/급여/학력/경력/업종/근무지 중 하나로 시작하는 라인)
  const metaStartRe = /(?:^|\n)(근무형태:|급여:|학력:|경력:|업종:|근무지:)/;
  const m = desc.match(metaStartRe);
  if (!m || m.index === undefined) return { jobDutyOld: null, meta: desc };

  const beforeMeta = desc.slice(0, m.index).trim();
  const meta = desc.slice(m.index).trim();

  // [직무내용] 헤더 제거
  const jobDuty = beforeMeta.replace(/^\[직무내용\]\s*/, "").trim();
  return { jobDutyOld: jobDuty || null, meta };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);

  // 모든 work24 글 (description 에 [직무내용] 있든 없든)
  const rows = await sql`
    SELECT id, source_id, description
    FROM job_posts
    WHERE source = 'work24' AND source_id IS NOT NULL
    ORDER BY id DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as { id: number; source_id: string; description: string | null }[];

  if (rows.length === 0) {
    return NextResponse.json({ processed: 0, hasMore: false });
  }

  const results: { id: number; jobDuty: string | null; meta: string }[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const fetched = await Promise.all(
      batch.map(async r => {
        const { meta } = splitDescription(r.description || "");
        const detailUrl = `https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${r.source_id}&infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet`;
        try {
          const res = await fetch(detailUrl, {
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; moducm-bot/1.0)" },
          });
          if (!res.ok) return { jobDuty: null, meta };
          const html = await res.text();
          return { jobDuty: extractJobDuty(html), meta };
        } catch {
          return { jobDuty: null, meta };
        }
      })
    );
    batch.forEach((r, idx) => results.push({ id: r.id, ...fetched[idx] }));
  }

  let updated = 0;
  for (const r of results) {
    if (!r.jobDuty) continue;
    const newDesc = `[직무내용]\n${r.jobDuty}\n${r.meta}`.trim();
    await sql`UPDATE job_posts SET description = ${newDesc} WHERE id = ${r.id}`;
    updated++;
  }

  if (updated > 0) {
    invalidateCache("jobs:*").catch(() => {});
  }

  return NextResponse.json({
    processed: rows.length,
    updated,
    skipped: rows.length - updated,
    hasMore: rows.length === limit,
  });
}
