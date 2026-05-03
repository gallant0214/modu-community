import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// W24 자동 임포트로 들어온 제목들 중 트레일링 "..." / "…" 으로 잘려있는
// 글들을 보정하는 일회성 backfill 엔드포인트.
//
// 동작:
//   1) source='work24' AND title LIKE '%...' OR '%…' 매칭
//   2) 가능하면 W24 상세 페이지(contact 가 URL 인 경우 그대로 사용,
//      아니면 wantedAuthNo 로 표준 URL 추정) 에서 풀 제목 재추출
//   3) 못 구하면 트레일링 "..."/"…" 만 제거 (UI 에 잘림 표시 안 보이게)
//
// 사용법:
//   POST { password: "...", confirm: false } → dry-run, 매칭 글 카운트 + 샘플 100개
//   POST { password: "...", confirm: true  } → 실제 업데이트

const ELLIPSIS_TAIL_RE = /[…]|\.{2,}\s*$/;

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

function stripEllipsis(s: string): string {
  return s.replace(/[…\s]*\.{2,}\s*$/g, "").replace(/\s*…\s*$/g, "").trim();
}

function endsWithEllipsis(s: string): boolean {
  return /\.{3,}\s*$|…\s*$/.test(s);
}

/**
 * fetch-jobs/route.ts 의 extractFullTitle 와 동일한 로직.
 * 여러 후보 중 가장 길고 trailing 이 깔끔한 것을 선택.
 */
function extractFullTitle(html: string, companyName?: string): string | null {
  const candidates: string[] = [];

  const m1 = html.match(/<div[^>]*class="[^"]*\bemp_sumup_wrp\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (m1) {
    const t = decodeEntities(m1[1].replace(/<[^>]+>/g, "")).trim().replace(/\s+/g, " ");
    if (t.length >= 5) candidates.push(t);
  }
  const m2 = html.match(/<meta\s+[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i);
  if (m2) {
    const t = decodeEntities(m2[1]).trim().replace(/\s+/g, " ");
    if (t.length >= 5) candidates.push(t);
  }
  const m3 = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (m3) {
    const t = decodeEntities(m3[1]).trim().replace(/\s+/g, " ");
    if (t.length >= 5) candidates.push(t);
  }

  if (candidates.length === 0) return null;

  const cleaned = candidates
    .map((raw) => {
      let t = raw;
      t = t.replace(/^\[?\s*고용24\s*[\]\-:|·]?\s*/, "").trim();
      if (companyName) {
        const cn = companyName.trim();
        if (cn && t.startsWith(cn)) t = t.slice(cn.length).trim();
      }
      if (t.length < 5 || t.startsWith("채용정보") || t.startsWith("...") || t.startsWith("…")) return null;
      const stripped = stripEllipsis(t);
      if (stripped.length < 5) return null;
      return stripped;
    })
    .filter((x): x is string => !!x);

  if (cleaned.length === 0) return null;
  cleaned.sort((a, b) => b.length - a.length);
  return cleaned[0].slice(0, 300);
}

async function tryFetchFullTitle(url: string, companyHint?: string): Promise<string | null> {
  if (!url || !url.startsWith("http")) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; moducm-bot/1.0)",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();
    return extractFullTitle(html, companyHint);
  } catch {
    return null;
  }
}

interface JobRow {
  id: number;
  title: string;
  center_name: string | null;
  contact_type: string | null;
  contact: string | null;
  source_id: string | null;
}

interface FixResult {
  id: number;
  before: string;
  after: string;
  source: "detail-fetch" | "strip-only" | "no-change";
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, confirm, limit } = body as { password?: string; confirm?: boolean; limit?: number };

  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  // 1) 매칭 후보 조회 — title 이 ... 또는 … 로 끝나는 work24 글
  const { data: posts, error } = await supabase
    .from("job_posts")
    .select("id, title, center_name, contact_type, contact, source_id")
    .eq("source", "work24")
    .or("title.like.%...,title.like.%…")
    .order("id", { ascending: false })
    .limit(typeof limit === "number" && limit > 0 ? Math.min(limit, 1000) : 1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = (posts || []).filter((p) => p.title && ELLIPSIS_TAIL_RE.test(p.title)) as JobRow[];

  // dry-run: 카운트 + 샘플
  if (!confirm) {
    return NextResponse.json({
      mode: "dry-run",
      total_candidates: candidates.length,
      sample: candidates.slice(0, 100).map((p) => ({
        id: p.id,
        title: p.title,
        will_try_detail_fetch: !!(p.contact_type === "고용24" && p.contact?.startsWith("http")),
      })),
      hint: "실제 업데이트하려면 { confirm: true } 로 다시 호출",
    });
  }

  // 실제 업데이트 — 동시 5개씩 (W24 부하 고려)
  const results: FixResult[] = [];
  const errors: string[] = [];

  const CONCURRENCY = 5;
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (row): Promise<FixResult | null> => {
        const before = row.title;
        // 1) 상세 URL 이 있으면 fetch 해서 풀 제목 시도
        const detailUrl = row.contact_type === "고용24" && row.contact?.startsWith("http") ? row.contact : null;
        let after: string | null = null;
        let source: FixResult["source"] = "no-change";

        if (detailUrl) {
          const fetched = await tryFetchFullTitle(detailUrl, row.center_name || undefined);
          if (fetched && fetched.length > 0 && !endsWithEllipsis(fetched) && fetched !== before) {
            after = fetched;
            source = "detail-fetch";
          }
        }

        // 2) 못 구하면 트레일링 점만 제거
        if (!after) {
          const stripped = stripEllipsis(before);
          if (stripped !== before && stripped.length >= 5) {
            after = stripped;
            source = "strip-only";
          }
        }

        if (!after) return { id: row.id, before, after: before, source: "no-change" };
        return { id: row.id, before, after, source };
      }),
    );

    // DB 업데이트 — 변경된 것만
    for (const r of batchResults) {
      if (!r) continue;
      results.push(r);
      if (r.source === "no-change") continue;
      const { error: upErr } = await supabase
        .from("job_posts")
        .update({ title: r.after })
        .eq("id", r.id);
      if (upErr) errors.push(`id=${r.id}: ${upErr.message}`);
    }
  }

  // 캐시 무효화
  await invalidateCache("jobs:*").catch(() => {});

  const updatedCount = results.filter((r) => r.source !== "no-change").length;
  return NextResponse.json({
    mode: "update",
    total_candidates: candidates.length,
    updated: updatedCount,
    by_source: {
      detail_fetch: results.filter((r) => r.source === "detail-fetch").length,
      strip_only: results.filter((r) => r.source === "strip-only").length,
      no_change: results.filter((r) => r.source === "no-change").length,
    },
    sample_changes: results.filter((r) => r.source !== "no-change").slice(0, 20),
    errors: errors.slice(0, 10),
  });
}
