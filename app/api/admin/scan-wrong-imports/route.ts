// ⚠️ 임시 — work24 임포트 중 스포츠와 무관해 보이는 글 스캔 (삭제 X, 조회만)
// 확인 후 삭제 예정.
//
// 호출: GET /api/admin/scan-wrong-imports?password=<ADMIN_PASSWORD>

export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/app/lib/db";

// description 의 "업종: ..." 부분에 나타나면 산업/제조업 → 비스포츠
const INDUSTRY_REGEX = "(제조업|기계|금속|화학|플라스틱|반도체|전자부품|변압기|자동차|운송|물류|일반목적용|산업용|조립|건설|창호|토공사|도금)";

// 제목 자체가 비스포츠 직종인 경우
const INDUSTRIAL_TITLE_REGEX = "(조립|생산|제조|용접|CNC|선반|프레스|사출|금형|운전기사|지게차|상하차|택배|도장공|도장사원|도장기사|도장작업|분체도장|자동차 도장|스프레이도장)";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pw = url.searchParams.get("password");
  if (pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // 1. "도장" 단어 + 제조업 업종 (이중의미 페인트)
    const paintingCandidates = await sql`
      SELECT id, title, center_name, sport,
             substring(description from '업종:\s*([^\n]+)') as industry,
             is_closed
      FROM job_posts
      WHERE source = 'work24'
        AND (title ~ '도장' OR center_name ~ '도장')
        AND description ~ ${INDUSTRY_REGEX}
      ORDER BY id DESC
      LIMIT 30
    ` as any[];

    // 2. 제목이 명백히 비스포츠 직종
    const industrialTitles = await sql`
      SELECT id, title, center_name, sport,
             substring(description from '업종:\s*([^\n]+)') as industry
      FROM job_posts
      WHERE source = 'work24'
        AND title ~ ${INDUSTRIAL_TITLE_REGEX}
      ORDER BY id DESC
      LIMIT 30
    ` as any[];

    // 3. 전체 오분류 추정 카운트 (중복 제거)
    const countResult = await sql`
      SELECT COUNT(DISTINCT id) as total FROM job_posts
      WHERE source = 'work24'
        AND (
          (
            (title ~ '도장' OR center_name ~ '도장')
            AND description ~ ${INDUSTRY_REGEX}
          )
          OR title ~ ${INDUSTRIAL_TITLE_REGEX}
        )
    ` as any[];

    const totalWork24 = await sql`
      SELECT COUNT(*) as total FROM job_posts WHERE source = 'work24'
    ` as any[];

    return NextResponse.json({
      totalWork24Posts: Number(totalWork24[0]?.total || 0),
      estimatedWrongImports: Number(countResult[0]?.total || 0),
      paintingCandidatesSample: paintingCandidates.map(r => ({
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e), stack: e?.stack?.slice(0, 500) }, { status: 500 });
  }
}
