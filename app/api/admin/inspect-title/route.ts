// ⚠️ 임시 — 잘려보이는 title 의 실제 DB 저장 형태 + W24 원본 응답 확인.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

const API_KEY = process.env.WORK24_API_KEY || "";
const BASE_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo210L01.do";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 무열대 체력단련장 글 찾기
  const rows = await sql`
    SELECT id, title, center_name, source_id, deadline, is_closed, created_at
    FROM job_posts
    WHERE source = 'work24' AND (title LIKE '%력단련장%' OR center_name LIKE '%무열대%')
    ORDER BY id DESC
    LIMIT 5
  ` as any[];

  // 각 row 의 title 첫 10자 char code 확인
  const stored = rows.map(r => ({
    id: r.id,
    title: r.title,
    center_name: r.center_name,
    source_id: r.source_id,
    deadline: r.deadline,
    is_closed: r.is_closed,
    created_at: r.created_at,
    titleFirstChars: Array.from((r.title || "").slice(0, 10)).map((c: any) => `${c}(U+${c.charCodeAt(0).toString(16).toUpperCase()})`).join(" "),
  }));

  // W24 API 에서 무열대 키워드로 검색
  let w24Sample: any[] = [];
  if (API_KEY) {
    try {
      const apiUrl = `${BASE_URL}?authKey=${API_KEY}&callTp=L&returnType=XML&startPage=1&display=20&keyword=${encodeURIComponent("체력단련장")}`;
      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
      const xml = await res.text();
      const blocks = xml.match(/<wanted>([\s\S]*?)<\/wanted>/g) || [];
      w24Sample = blocks.slice(0, 10).map(b => {
        const titleMatch = b.match(/<title>([\s\S]*?)<\/title>/);
        const wantedAuthNoMatch = b.match(/<wantedAuthNo>([\s\S]*?)<\/wantedAuthNo>/);
        const companyMatch = b.match(/<company>([\s\S]*?)<\/company>/);
        const t = titleMatch?.[1] || "";
        return {
          wantedAuthNo: wantedAuthNoMatch?.[1] || "",
          company: companyMatch?.[1] || "",
          title: t,
          titleFirstChars: Array.from(t.slice(0, 10)).map((c: any) => `${c}(U+${c.charCodeAt(0).toString(16).toUpperCase()})`).join(" "),
        };
      });
    } catch (e: any) {
      w24Sample = [{ error: e?.message }];
    }
  }

  return NextResponse.json({
    stored,
    w24Sample,
  });
}
