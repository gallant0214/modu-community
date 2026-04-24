// ⚠️ 임시 엔드포인트 — W24 상세 페이지 HTML 에서 담당자 전화/이메일이
// 실제로 얼마나 추출되는지 샘플 5건으로 검증. 확인 완료 후 삭제 예정.
//
// 호출: GET /api/admin/w24-detail-sample?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

function extractPhone(text: string): string | null {
  if (!text) return null;
  const re = /(?<!\d)(01[016-9]|02|0[3-6][1-5]|070)[-.\s)]?(\d{3,4})[-.\s]?(\d{4})(?!\d)/;
  const m = text.match(re);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function extractEmail(text: string): string | null {
  if (!text) return null;
  const m = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0] : null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 최근 work24 임포트 5건의 URL 가져오기 (contact_type='고용24' 가 URL 저장본)
  const rows = await sql`
    SELECT id, title, center_name, contact, contact_type, source_id
    FROM job_posts
    WHERE source = 'work24' AND contact_type = '고용24' AND contact LIKE 'http%'
    ORDER BY created_at DESC
    LIMIT 5
  `;

  const results: any[] = [];

  for (const row of rows as any[]) {
    const detailUrl: string = row.contact;
    try {
      const res = await fetch(detailUrl, {
        signal: AbortSignal.timeout(8000),
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; moducm-bot/1.0)",
          "Accept": "text/html,application/xhtml+xml,*/*",
        },
      });
      const html = await res.text();

      // 한글 인코딩 — work24는 UTF-8. 혹시 EUC-KR 이면 깨진 문자에 전화/이메일 있어도 놓침
      const phone = extractPhone(html);
      const email = extractEmail(html);

      // HTML 에서 "<body>" 이후만 뽑아서 크기 확인 (페이지 헤더 제외)
      const bodyStart = html.toLowerCase().indexOf("<body");
      const bodyHtml = bodyStart > 0 ? html.slice(bodyStart) : html;

      results.push({
        id: row.id,
        title: row.title,
        center_name: row.center_name,
        detailUrl,
        httpStatus: res.status,
        htmlBytes: html.length,
        bodyBytes: bodyHtml.length,
        phone,
        email,
        // 디버깅용: 연락처 키워드 주변 텍스트
        nearContact: (() => {
          const text = bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
          const idx = text.search(/담당자|연락처|채용문의|전화|이메일|TEL|E-?mail/i);
          return idx >= 0 ? text.slice(Math.max(0, idx - 40), idx + 200) : null;
        })(),
      });
    } catch (e: any) {
      results.push({
        id: row.id,
        title: row.title,
        detailUrl,
        error: e?.message || String(e),
      });
    }
  }

  const summary = {
    total: results.length,
    phoneExtracted: results.filter(r => r.phone).length,
    emailExtracted: results.filter(r => r.email).length,
    neither: results.filter(r => !r.phone && !r.email && !r.error).length,
    errors: results.filter(r => r.error).length,
  };

  return NextResponse.json({ summary, results });
}
