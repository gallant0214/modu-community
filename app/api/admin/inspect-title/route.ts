// ⚠️ 임시 — 비스포츠 정리 + title 백필 통합 엔드포인트.
// 1회 사용 후 삭제.
//
// 1) 조경원/하우스키퍼 등 비스포츠 글 삭제:
//    GET /api/admin/inspect-title?password=<>&mode=delete-junk[&dry=1]
//
// 2) title 백필 (잘린 title 을 detail HTML 의 풀 title 로 교체):
//    GET /api/admin/inspect-title?password=<>&mode=title-backfill&offset=0&limit=50

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

function decodeEntities(s: string): string {
  let out = s;
  for (let i = 0; i < 2; i++) {
    out = out
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, " ");
  }
  return out;
}

function extractFullTitle(html: string): string | null {
  const titleTag = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleTag) {
    let t = decodeEntities(titleTag[1]).trim();
    t = t.replace(/\s*[-|]\s*(워크넷|고용24|work24).*$/i, "").trim();
    if (t.length >= 5 && !t.includes("...")) return t.slice(0, 300);
  }
  const h2 = html.match(/<h2[^>]*class="[^"]*recruit[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)
    || html.match(/<strong[^>]*class="[^"]*tit[^"]*"[^>]*>([\s\S]*?)<\/strong>/i);
  if (h2) {
    const t = decodeEntities(h2[1].replace(/<[^>]+>/g, "")).trim();
    if (t.length >= 5 && !t.startsWith("...")) return t.slice(0, 300);
  }
  return null;
}

const JUNK_TITLE_REGEX = "(조경원|조경관리|하우스키퍼|하우스키핑|룸어텐던트|객실관리|객실정비|객실청소)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mode = url.searchParams.get("mode");
  const dry = url.searchParams.get("dry") === "1";

  // === 모드 1: 비스포츠 정리 ===
  if (mode === "delete-junk") {
    const targets = await sql`
      SELECT id, title, center_name FROM job_posts
      WHERE source = 'work24' AND title ~ ${JUNK_TITLE_REGEX}
      ORDER BY id DESC
    ` as { id: number; title: string; center_name: string }[];

    if (dry) {
      return NextResponse.json({
        mode, dry: true, count: targets.length,
        sample: targets.slice(0, 30).map(r => ({ id: r.id, title: r.title.slice(0, 50), center_name: r.center_name })),
      });
    }
    const ids = targets.map(t => t.id);
    if (ids.length === 0) return NextResponse.json({ mode, deleted: 0, message: "no targets" });

    try { await sql`DELETE FROM job_post_likes WHERE job_post_id = ANY(${ids})`; } catch {}
    try { await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ANY(${ids})`; } catch {}
    const del = await sql`DELETE FROM job_posts WHERE id = ANY(${ids}) RETURNING id` as { id: number }[];
    invalidateCache("jobs:*").catch(() => {});
    return NextResponse.json({ mode, deleted: del.length });
  }

  // === 모드 2: title 백필 ===
  if (mode === "title-backfill") {
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));

    const rows = await sql`
      SELECT id, source_id, title FROM job_posts
      WHERE source = 'work24' AND source_id IS NOT NULL
      ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}
    ` as { id: number; source_id: string; title: string }[];

    if (rows.length === 0) {
      return NextResponse.json({ mode, processed: 0, hasMore: false });
    }

    const results: { id: number; oldTitle: string; newTitle: string | null }[] = [];
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
            return extractFullTitle(html);
          } catch { return null; }
        })
      );
      batch.forEach((r, idx) => results.push({ id: r.id, oldTitle: r.title, newTitle: fetched[idx] }));
    }

    let updated = 0;
    for (const r of results) {
      if (!r.newTitle) continue;
      // 새 title 이 더 길거나 (잘림 보강) 또는 다른 경우만 업데이트
      if (r.newTitle.length > r.oldTitle.length || r.newTitle !== r.oldTitle) {
        await sql`UPDATE job_posts SET title = ${r.newTitle} WHERE id = ${r.id}`;
        updated++;
      }
    }
    if (updated > 0) invalidateCache("jobs:*").catch(() => {});

    return NextResponse.json({
      mode, processed: rows.length, updated,
      hasMore: rows.length === limit,
    });
  }

  return NextResponse.json({ error: "unknown mode. use ?mode=delete-junk or ?mode=title-backfill" });
}
