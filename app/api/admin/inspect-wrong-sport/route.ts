// ⚠️ 임시 — 잘못 분류된 work24 글의 실제 DB 저장값 조사용. 1회 사용 후 삭제.
//
// 호출: GET /api/admin/inspect-wrong-sport?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. 사용자가 제보한 글 (제목 포함 검색)
  const reportedPost = await sql`
    SELECT id, title, center_name, sport, description, region_name, source_id, contact, contact_type
    FROM job_posts
    WHERE source = 'work24' AND title LIKE '%이노프%'
    LIMIT 5
  ` as any[];

  // 2. work24 임포트 중 의심 패턴 — 제조/사무/영업 단어가 title 에 있는데 sport 가 스포츠로 분류된 것
  const suspicious = await sql`
    SELECT id, title, center_name, sport,
           substring(description from '업종:\s*([^\n]+)') as industry
    FROM job_posts
    WHERE source = 'work24'
      AND sport IN ('댄스스포츠', '헬스/PT', '필라테스', '요가', '수영', '골프')
      AND (
        title ~ '(영업|사무|관리.*직원|회계|총무|경리|인사|마케팅|기획|개발자|프로그래머|디자이너|연구|사원모집|보조|단순)'
        OR description ~ '(제조업|기계|금속|화학|플라스틱|가구|부품|광물|반도체|도금|성형|제조)'
      )
    ORDER BY id DESC
    LIMIT 30
  ` as any[];

  // 3. 전체 sport 별 분포
  const sportDist = await sql`
    SELECT sport, COUNT(*)::int as cnt
    FROM job_posts
    WHERE source = 'work24'
    GROUP BY sport
    ORDER BY cnt DESC
  ` as { sport: string; cnt: number }[];

  return NextResponse.json({
    reportedPostFull: reportedPost,
    suspiciousCount: suspicious.length,
    suspiciousSample: suspicious.slice(0, 20),
    sportDistribution: sportDist,
    timestamp: new Date().toISOString(),
  });
}
