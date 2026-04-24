// ⚠️ 임시 — work24 임포트 중 스포츠와 무관해 보이는 글을 스캔.
// 확인용으로 삭제는 하지 않고 목록만 반환. 검토 후 별도 삭제 엔드포인트에서 일괄 제거.
// 완료 후 이 파일 삭제.
//
// 호출: GET /api/admin/scan-wrong-imports?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

// 제조업/산업 키워드 — description의 "업종: ..." 부분을 매칭
const INDUSTRIAL_KEYWORDS = [
  "제조업", "기계", "금속", "화학", "플라스틱", "반도체", "전자부품", "변압기",
  "자동차", "운송", "물류", "일반목적용", "산업용", "조립", "건설",
  "창호", "토공사", "도금",
];

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. "도장" + 제조업 업종 (이중의미 "도장" = 페인트)
  const industrialLike = INDUSTRIAL_KEYWORDS.map(k => `description ILIKE '%${k}%'`).join(" OR ");
  const paintingCandidates = await sql.unsafe(`
    SELECT id, title, center_name, sport,
           substring(description from '업종:\\s*([^\\n]+)') as industry,
           is_closed
    FROM job_posts
    WHERE source = 'work24'
      AND (title ILIKE '%도장%' OR center_name ILIKE '%도장%')
      AND (${industrialLike})
    ORDER BY id DESC
    LIMIT 30
  `);

  // 2. 명확히 비스포츠 직종 (제목 키워드)
  const industrialTitles = await sql`
    SELECT id, title, center_name, sport,
           substring(description from '업종:\s*([^\n]+)') as industry
    FROM job_posts
    WHERE source = 'work24'
      AND (
        title ILIKE '%조립%'
        OR title ILIKE '%생산%'
        OR title ILIKE '%제조%'
        OR title ILIKE '%용접%'
        OR title ILIKE '%CNC%'
        OR title ILIKE '%선반%'
        OR title ILIKE '%프레스%'
        OR title ILIKE '%사출%'
        OR title ILIKE '%금형%'
        OR title ILIKE '%운전기사%'
        OR title ILIKE '%지게차%'
        OR title ILIKE '%상하차%'
        OR title ILIKE '%택배%'
      )
    ORDER BY id DESC
    LIMIT 30
  ` as any[];

  // 3. 전체 카운트 (중복 제거)
  const countResult = await sql.unsafe(`
    SELECT COUNT(DISTINCT id) as total FROM job_posts
    WHERE source = 'work24'
      AND (
        (
          (title ILIKE '%도장%' OR center_name ILIKE '%도장%')
          AND (${industrialLike})
        )
        OR title ILIKE '%조립%' OR title ILIKE '%생산%' OR title ILIKE '%제조%'
        OR title ILIKE '%용접%' OR title ILIKE '%CNC%' OR title ILIKE '%선반%'
        OR title ILIKE '%프레스%' OR title ILIKE '%사출%' OR title ILIKE '%금형%'
        OR title ILIKE '%운전기사%' OR title ILIKE '%지게차%'
        OR title ILIKE '%상하차%' OR title ILIKE '%택배%'
      )
  `) as any[];

  // 전체 work24 임포트 개수
  const totalWork24Result = await sql`
    SELECT COUNT(*) as total FROM job_posts WHERE source = 'work24'
  ` as any[];

  return NextResponse.json({
    totalWork24Posts: Number(totalWork24Result[0]?.total || 0),
    estimatedWrongImports: Number(countResult[0]?.total || 0),
    paintingCandidatesSample: (paintingCandidates as any[]).map(r => ({
      id: r.id,
      title: r.title,
      center_name: r.center_name,
      sport: r.sport,
      industry: r.industry,
      is_closed: r.is_closed,
    })),
    industrialTitlesSample: industrialTitles.map(r => ({
      id: r.id,
      title: r.title,
      center_name: r.center_name,
      sport: r.sport,
      industry: r.industry,
    })),
    timestamp: new Date().toISOString(),
  });
}
