import { sql } from "@/app/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// fetch-jobs 의 EXCLUDE_TITLE 와 동일 + SPORTS_WORDS 회사명 부분매칭 false positive 보강용.
// 회사명에 "헬스케어" 같은 비스포츠 단어가 들어있는데 sport=헬스/PT 로 잘못 임포트된 글도 함께 정리.
const EXCLUDE_TITLE = /도장\s*공|도장\s*사원|도장\s*기사|도장\s*작업|도장\s*공사|도장\s*부|도장\s*파트|도장\s*업체|도장\s*협력|도장\s*반|도장\s*팀|도장\s*과|도장\s*직|도장\s*과장|건축\s*도장|건설\s*도장|전착\s*도장|분체\s*도장|자동차\s*도장|스프레이\s*도장|우레탄\s*도장|선박\s*도장|차체\s*도장|에폭시\s*도장|하지\s*엔지니어|도배|미장|방수\s*공사|방수\s*직무|방수\s*기사|타일\s*시공|인테리어\s*마감|건설|토목|중장비|굴삭기|크레인|생산직|생산팀|생산부|생산관리|생산보조|제조직|조립직|용접|프레스|사출|금형|CNC|선반|상하차|지게차|화물|배송기사|납품기사|운전기사|택배|회계|총무|경리|인사담당|마케팅|기획팀|개발자|프로그래머|디자이너|연구원|보조선생님|보육교사|사무직|사무\s*직원|사무용가구|사무용품|관리사무원|영업사원|영업직|납품\s*및\s*영업|납품\s*영업|사회복지사|복지사|간호조무사|요양원|간병인|돌보미|장애아돌보미|조경원|조경관리|하우스키퍼|하우스키핑|룸어텐던트|객실관리|객실정비|객실청소|바리스타|베이커리|카페\s*직원|카페\s*매니저|매점|미화|세차|룸메이드|하우스키핑|홀서빙|식음|외곽\s*미화|호텔\s*프론트|호텔\s*객실|호텔.*프론트|컨트리클럽.*프론트|골프.*프론트|화장품|식품|요양보호사|방문요양|재가요양|주간보호|어르신케어|어르신\s*돌봄|미화원|환경미화|잔디\s*관리|잔디관리|예초|클럽하우스|식당\s*홀|레스토랑\s*조리|주방\s*보조|중식당|한식당|양식당|일식당|중식\s*조리|한식\s*조리|양식\s*조리|일식\s*조리|조리원|조리사|샤워실|간병|청소(?!강사)/i;

// 회사명 비스포츠 표지 — 회사명만으로 SPORTS_WORDS 통과한 false positive 정리
const EXCLUDE_COMPANY = /헬스케어|헬스푸드|헬스플래너|헬스보충|헬스식품|헬스마트|헬스밀/i;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "inspect";

  const rows = await sql`
    SELECT id, title, center_name, sport, deadline, is_closed
    FROM job_posts
    WHERE source = 'work24'
    ORDER BY id ASC
  ` as { id: number; title: string; center_name: string; sport: string; deadline: string; is_closed: boolean }[];

  const matched = rows.filter((r) =>
    EXCLUDE_TITLE.test(r.title) || EXCLUDE_COMPANY.test(r.center_name || "")
  );

  if (mode === "inspect") {
    return NextResponse.json({
      totalWork24: rows.length,
      excludeMatched: matched.length,
      sample: matched.slice(0, 100).map((r) => ({
        id: r.id,
        title: r.title,
        center: r.center_name,
        sport: r.sport,
        deadline: r.deadline,
        is_closed: r.is_closed,
        reason: EXCLUDE_TITLE.test(r.title) ? "title" : "company",
      })),
    });
  }

  if (mode === "delete") {
    if (matched.length === 0) {
      return NextResponse.json({ deleted: 0, note: "no matches" });
    }
    const ids = matched.map((r) => r.id);
    let deleted = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await sql`DELETE FROM job_post_likes WHERE job_post_id = ANY(${batch}::int[])`;
      await sql`DELETE FROM job_post_bookmarks WHERE job_post_id = ANY(${batch}::int[])`;
      const r = await sql`DELETE FROM job_posts WHERE id = ANY(${batch}::int[]) AND source = 'work24' RETURNING id` as { id: number }[];
      deleted += r.length;
    }
    await invalidateCache("jobs:*").catch(() => {});
    return NextResponse.json({ deleted, deletedIds: ids });
  }

  return NextResponse.json({ error: "invalid mode (use inspect or delete)" }, { status: 400 });
}
