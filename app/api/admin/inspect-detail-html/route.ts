// ⚠️ 임시 — W24 상세 페이지 HTML 에서 모집요강 섹션 위치/구조 조사용. 1회 후 삭제.
//
// 호출: GET /api/admin/inspect-detail-html?password=<ADMIN_PASSWORD>&id=<job_post_id>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  const id = Number(url.searchParams.get("id")) || 0;
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 대상 글 찾기 (id 지정 또는 최신 work24 글)
  const rows = id > 0
    ? await sql`SELECT id, title, contact, description FROM job_posts WHERE id = ${id}` as any[]
    : await sql`SELECT id, title, contact, description FROM job_posts WHERE source = 'work24' ORDER BY id DESC LIMIT 1` as any[];

  if (rows.length === 0) return NextResponse.json({ error: "no job_post found" });
  const row = rows[0];

  // wantedInfoUrl 은 contact_type='고용24' 일 때 contact 에 들어있음. 아니면 description 등에서 못 찾을 수 있음.
  // 일단 work24 source 의 wantedAuthNo (source_id) 로 직접 URL 구성.
  const sourceIdRows = await sql`SELECT source_id FROM job_posts WHERE id = ${row.id}` as { source_id: string }[];
  const wantedAuthNo = sourceIdRows[0]?.source_id;
  if (!wantedAuthNo) return NextResponse.json({ error: "no source_id", row });

  const detailUrl = `https://www.work24.go.kr/wk/a/b/1500/empDetailAuthView.do?wantedAuthNo=${wantedAuthNo}&infoTypeCd=VALIDATION&infoTypeGroup=tb_workinfoworknet`;

  let html = "";
  try {
    const res = await fetch(detailUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; moducm-bot/1.0)" },
    });
    html = await res.text();
  } catch (e: any) {
    return NextResponse.json({ error: "fetch failed", detail: e?.message });
  }

  // 모집요강 keyword 위치 + 주변 컨텍스트 추출
  const idx = html.indexOf("모집요강");
  const directIdx = html.indexOf("직무내용");

  // 주변 1500자 미리보기 (HTML 그대로 — 구조 확인용)
  const around = (i: number, n = 1500) => i < 0 ? null : html.slice(Math.max(0, i - 200), i + n);

  // 텍스트만 추출 시도 (태그 제거)
  function stripTags(s: string): string {
    return s
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  const aroundJobDuty = stripTags(around(directIdx, 1500) || "");

  return NextResponse.json({
    targetId: row.id,
    title: row.title,
    detailUrl,
    htmlBytes: html.length,
    moziKwIdx: idx,
    jobDutyIdx: directIdx,
    moziAroundRaw: around(idx, 800)?.slice(0, 4000),
    jobDutyText: aroundJobDuty.slice(0, 2000),
  });
}
