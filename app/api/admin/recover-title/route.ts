// ⚠️ 긴급 복구 — title 백필이 SEO 메타 title 로 덮어쓴 것 복구.
// 1) raw inspect: detail HTML 에서 진짜 채용 제목 element 위치 찾기
// 2) recover: 진짜 채용 제목으로 다시 백필

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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const mode = url.searchParams.get("mode");

  // === inspect: 한 글의 detail HTML 에서 h1~h3/strong 태그 다 출력 ===
  if (mode === "inspect") {
    const rows = await sql`
      SELECT id, source_id, title, center_name FROM job_posts
      WHERE source = 'work24' AND source_id IS NOT NULL
      ORDER BY id DESC LIMIT 1
    ` as any[];
    if (!rows[0]) return NextResponse.json({ error: "no row" });
    const r = rows[0];
    const detailUrl = `https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${r.source_id}&infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet`;
    const res = await fetch(detailUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; moducm-bot/1.0)" },
    });
    const html = await res.text();
    // 모든 h1~h6, strong (with class) 태그 추출
    const headings: { tag: string; cls: string; text: string }[] = [];
    const reHeading = /<(h[1-6]|strong|div)([^>]*?)>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = reHeading.exec(html)) !== null) {
      const tag = m[1];
      const attrs = m[2] || "";
      const inner = m[3];
      const clsMatch = attrs.match(/class\s*=\s*["']([^"']*)["']/);
      const cls = clsMatch?.[1] || "";
      const text = decodeEntities(inner.replace(/<[^>]+>/g, "")).trim().replace(/\s+/g, " ");
      if (text.length >= 3 && text.length <= 200) {
        headings.push({ tag, cls, text });
      }
    }
    return NextResponse.json({
      stored: { id: r.id, title: r.title, center_name: r.center_name },
      detailUrl,
      headingsCount: headings.length,
      headings: headings.slice(0, 80),
    });
  }

  // === recover: 'title' 컬럼이 SEO 메타로 덮인 글들 복구 ===
  if (mode === "recover") {
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 50));
    const rows = await sql`
      SELECT id, source_id, title, center_name FROM job_posts
      WHERE source = 'work24' AND source_id IS NOT NULL
        AND title LIKE '채용정보%'
      ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}
    ` as { id: number; source_id: string; title: string; center_name: string }[];

    if (rows.length === 0) {
      return NextResponse.json({ mode, processed: 0, hasMore: false });
    }

    const results: { id: number; old: string; new: string | null }[] = [];
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
            // work24 detail 페이지의 진짜 채용제목은 <strong class="t1_b ..."> 또는
            // <h3 class="t1_b"> / 비슷한 본문 제목 영역에 있음. 실제 위치는 inspect 로
            // 확인 필요. 일단 여러 패턴 시도:
            const patterns = [
              /<strong[^>]*class="[^"]*\bt1_b\b[^"]*"[^>]*>([\s\S]*?)<\/strong>/i,
              /<h3[^>]*class="[^"]*\bt1_b\b[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
              /<h3[^>]*class="[^"]*tit[^"]*"[^>]*>([\s\S]*?)<\/h3>/i,
              /<strong[^>]*class="[^"]*tit[^"]*"[^>]*>([\s\S]*?)<\/strong>/i,
              /<div[^>]*class="[^"]*recruit_tit[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            ];
            for (const re of patterns) {
              const m = html.match(re);
              if (m) {
                const t = decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim().replace(/\s+/g, " ");
                if (t.length >= 5 && !t.startsWith("채용정보") && !t.startsWith("...")) return t.slice(0, 300);
              }
            }
            return null;
          } catch { return null; }
        })
      );
      batch.forEach((r, idx) => results.push({ id: r.id, old: r.title, new: fetched[idx] }));
    }

    let updated = 0;
    let fallback = 0;
    for (const r of results) {
      if (r.new) {
        await sql`UPDATE job_posts SET title = ${r.new} WHERE id = ${r.id}`;
        updated++;
      } else {
        // 새 title 추출 실패 → center_name 으로 fallback (SEO 메타보다는 나음)
        const row = rows.find(x => x.id === r.id);
        if (row) {
          const fb = `${row.center_name} 채용`;
          await sql`UPDATE job_posts SET title = ${fb} WHERE id = ${r.id}`;
          fallback++;
        }
      }
    }
    if (updated + fallback > 0) invalidateCache("jobs:*").catch(() => {});

    return NextResponse.json({
      mode, processed: rows.length, updated, fallback,
      hasMore: rows.length === limit,
    });
  }

  return NextResponse.json({ error: "use ?mode=inspect or ?mode=recover" });
}
