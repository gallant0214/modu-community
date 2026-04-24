// ⚠️ 임시 엔드포인트 — 기존 DB 의 work24 임포트 글 중 contact_type='고용24'
// (URL 저장 상태) 인 건들을 상세 HTML 파싱해서 전화/이메일로 업데이트.
// 완료 후 삭제 예정.
//
// 호출: GET /api/admin/backfill-w24-contacts?password=<ADMIN_PASSWORD>&offset=0&limit=100

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";
import { invalidateCache } from "@/app/lib/cache";

function extractPhone(text: string): string | null {
  if (!text) return null;
  const re = /(?<!\d)(01[016-9]|02|0[3-6][1-5]|070)[-.\s)]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/;
  const m = text.match(re);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function extractEmail(text: string): string | null {
  if (!text) return null;
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

async function fetchDetailContact(url: string): Promise<{ phone: string | null; email: string | null }> {
  if (!url || !url.startsWith("http")) return { phone: null, email: null };
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; moducm-bot/1.0)",
        "Accept": "text/html,application/xhtml+xml,*/*",
      },
    });
    if (!res.ok) return { phone: null, email: null };
    const html = await res.text();
    return { phone: extractPhone(html), email: extractEmail(html) };
  } catch {
    return { phone: null, email: null };
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 100));

  // 대상: source='work24' AND contact_type='고용24' (URL 저장 상태만)
  const rows = await sql`
    SELECT id, contact
    FROM job_posts
    WHERE source = 'work24'
      AND contact_type = '고용24'
      AND contact LIKE 'http%'
    ORDER BY id DESC
    LIMIT ${limit} OFFSET ${offset}
  ` as { id: number; contact: string }[];

  if (rows.length === 0) {
    return NextResponse.json({ offset, limit, processed: 0, hasMore: false, message: "no more rows" });
  }

  // 상세 HTML 병렬 fetch (10개씩)
  const updates: { id: number; phone: string | null; email: string | null }[] = [];
  for (let i = 0; i < rows.length; i += 10) {
    const batch = rows.slice(i, i + 10);
    const results = await Promise.all(batch.map(r => fetchDetailContact(r.contact)));
    batch.forEach((r, idx) => updates.push({ id: r.id, ...results[idx] }));
  }

  // DB UPDATE
  let updatedPhone = 0;
  let updatedEmail = 0;
  let unchanged = 0;
  for (const u of updates) {
    if (u.phone) {
      await sql`UPDATE job_posts SET contact_type = ${"연락처"}, contact = ${u.phone} WHERE id = ${u.id}`;
      updatedPhone++;
    } else if (u.email) {
      await sql`UPDATE job_posts SET contact_type = ${"이메일"}, contact = ${u.email} WHERE id = ${u.id}`;
      updatedEmail++;
    } else {
      unchanged++;
    }
  }

  // 변경 있으면 Upstash /jobs 캐시 무효화
  if (updatedPhone + updatedEmail > 0) {
    invalidateCache("jobs:*").catch(() => {});
  }

  return NextResponse.json({
    offset,
    limit,
    processed: rows.length,
    updatedPhone,
    updatedEmail,
    unchanged,
    hasMore: rows.length === limit,
    timestamp: new Date().toISOString(),
  });
}
