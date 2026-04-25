// ⚠️ 임시 — 기존 work24 글에 직무내용(모집요강) 백필.
// 한 번에 100건 처리, hasMore 면 offset 늘려서 재호출.

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
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  if (text.length < 5) return null;
  return text.slice(0, 2000);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  // 대상: work24 글 중 description 에 "[직무내용]" 마커 없는 것
  const rows = await sql`
    SELECT id, source_id, description
    FROM job_posts
    WHERE source = 'work24'
      AND source_id IS NOT NULL
      AND (description IS NULL OR description NOT LIKE '%[직무내용]%')
    ORDER BY id DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as { id: number; source_id: string; description: string | null }[];

  if (rows.length === 0) {
    return NextResponse.json({ offset, processed: 0, hasMore: false, message: "no more rows" });
  }

  // 병렬 10개씩 상세 HTML fetch
  const results: { id: number; jobDuty: string | null; existingDesc: string | null }[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const fetched = await Promise.all(
      batch.map(async r => {
        const detailUrl = `https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${r.source_id}&infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet`;
        try {
          const res = await fetch(detailUrl, {
            signal: AbortSignal.timeout(8000),
            headers: { "User-Agent": "Mozilla/5.0 (compatible; moducm-bot/1.0)" },
          });
          if (!res.ok) return null;
          const html = await res.text();
          return extractJobDuty(html);
        } catch {
          return null;
        }
      })
    );
    batch.forEach((r, idx) => results.push({ id: r.id, jobDuty: fetched[idx], existingDesc: r.description }));
  }

  // DB UPDATE — 직무내용을 description 맨 앞에 추가
  let updated = 0;
  for (const r of results) {
    if (!r.jobDuty) continue;
    const newDesc = `[직무내용]\n${r.jobDuty}\n${r.existingDesc || ""}`.trim();
    await sql`UPDATE job_posts SET description = ${newDesc} WHERE id = ${r.id}`;
    updated++;
  }

  if (updated > 0) {
    invalidateCache("jobs:*").catch(() => {});
  }

  return NextResponse.json({
    offset,
    processed: rows.length,
    updated,
    skipped: rows.length - updated,
    hasMore: rows.length === limit,
    timestamp: new Date().toISOString(),
  });
}
