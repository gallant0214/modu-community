import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { invalidateCache } from "@/app/lib/cache";

export const dynamic = "force-dynamic";

// 임시 cleanup 엔드포인트 — work24 자동 임포트로 등록된 비스포츠 글
// (바리스타/베이커리/잔디관리/하우스키퍼 등 EXCLUDE_TITLE 매칭) 일괄 정리.
// 사용 후 디렉터리째 삭제하는 패턴 (이전 cleanup 들과 동일).
//
// 사용법:
//   POST { password: "...", confirm: false } → dry-run, 매칭 글 목록만 반환
//   POST { password: "...", confirm: true  } → 실제 삭제

// fetch-jobs/route.ts 의 EXCLUDE_TITLE 와 동일한 정규식 (사본)
const EXCLUDE_TITLE = /도장\s*공|도장\s*사원|도장\s*기사|도장\s*작업|도장\s*공사|도장\s*부|도장\s*파트|도장\s*업체|도장\s*협력|도장\s*반|도장\s*팀|도장\s*과|도장\s*직|도장\s*과장|건축\s*도장|건설\s*도장|전착\s*도장|분체\s*도장|자동차\s*도장|스프레이\s*도장|우레탄\s*도장|선박\s*도장|차체\s*도장|에폭시\s*도장|하지\s*엔지니어|도배|미장|방수\s*공사|방수\s*직무|방수\s*기사|타일\s*시공|인테리어\s*마감|건설|토목|중장비|굴삭기|크레인|생산직|생산팀|생산부|생산관리|생산보조|제조직|조립직|용접|프레스|사출|금형|CNC|선반|상하차|지게차|화물|배송기사|납품기사|운전기사|택배|회계|총무|경리|인사담당|마케팅|기획팀|개발자|프로그래머|디자이너|연구원|보조선생님|보육교사|사무직|사무\s*직원|사무용가구|사무용품|관리사무원|영업사원|영업직|납품\s*및\s*영업|납품\s*영업|사회복지사|복지사|간호조무사|요양원|간병인|돌보미|장애아돌보미|조경원|조경관리|하우스키퍼|하우스키핑|룸어텐던트|객실관리|객실정비|객실청소|바리스타|베이커리|카페\s*직원|카페\s*매니저|매점|미화|세차|룸메이드|하우스키핑|홀서빙|식음|외곽\s*미화|호텔\s*프론트|호텔\s*객실|호텔.*프론트|컨트리클럽.*프론트|골프.*프론트|화장품|식품|요양보호사|방문요양|재가요양|주간보호|어르신케어|어르신\s*돌봄|미화원|환경미화|잔디\s*관리|잔디관리|예초|클럽하우스|식당\s*홀|레스토랑\s*조리|주방\s*보조|중식당|한식당|양식당|일식당|중식\s*조리|한식\s*조리|양식\s*조리|일식\s*조리|조리원|조리사|샤워실|간병|청소(?!강사)|주차\s*요원|주차\s*안내|주차\s*관리|혼잡\s*교통\s*유도|교통\s*유도\s*경비|교통\s*안내|시설\s*경비|건물\s*경비|상주\s*경비|경비\s*요원|경비\s*원|사우나\s*관리|사우나\s*직원|사우나\s*근무|사우나\s*프론트|사우나\s*안내|가스\s*안전\s*관리|가스\s*기사|가스\s*점검|가스\s*검침|도시가스|건물\s*설비\s*관리|건물\s*시설\s*관리|건물\s*관리\s*기사|소방\s*안전\s*관리|전기\s*안전\s*관리|기계\s*설비\s*관리|설비\s*안전\s*관리|단체\s*급식|구내\s*식당|급식\s*보조|급식\s*조리|급식\s*조리원|급식\s*도우미|급식\s*직원|급식실|식당\s*보조|식당\s*직원|영양사|운전직|스키드\s*로더|스키드로더|중장비\s*운전|지게차\s*운전|굴삭기\s*운전|사무\s*행정|행정\s*업무|행정\s*보조|행정\s*직원|입학\s*상담|학원\s*행정|학원\s*상담|상담\s*직원|식자재|구매\s*담당|구매\s*직원|구매팀|구매\s*MD|식품\s*MD|자재\s*담당|자재\s*관리|매입\s*담당/i;

interface BadPost {
  id: number;
  title: string;
  center_name: string;
  sport: string;
  matched: string;
  created_at: string | null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, confirm } = body as { password?: string; confirm?: boolean };

  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 일치하지 않습니다" },
      { status: 403 }
    );
  }

  // work24 임포트 글 전수 조회
  const { data: posts, error } = await supabase
    .from("job_posts")
    .select("id, title, center_name, sport, created_at")
    .eq("source", "work24");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // EXCLUDE_TITLE 매칭되는 글만 추출
  const matched: BadPost[] = [];
  for (const p of posts || []) {
    const m = (p.title || "").match(EXCLUDE_TITLE);
    if (m) {
      matched.push({
        id: p.id,
        title: p.title,
        center_name: p.center_name,
        sport: p.sport,
        matched: m[0],
        created_at: p.created_at,
      });
    }
  }

  // dry-run: 목록만 반환
  if (!confirm) {
    return NextResponse.json({
      mode: "dry-run",
      total_work24: posts?.length || 0,
      matched_count: matched.length,
      matched: matched.slice(0, 100),
      hint: "삭제하려면 { confirm: true } 로 다시 호출",
    });
  }

  // 실제 삭제 — 50건씩 배치
  const ids = matched.map((m) => m.id);
  let deleted = 0;
  const errors: string[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const { error: delErr, count } = await supabase
      .from("job_posts")
      .delete({ count: "exact" })
      .in("id", batch);
    if (delErr) {
      errors.push(delErr.message);
    } else {
      deleted += count ?? batch.length;
    }
  }

  await invalidateCache("jobs:*").catch(() => {});

  return NextResponse.json({
    mode: "delete",
    total_work24: posts?.length || 0,
    matched_count: matched.length,
    deleted,
    errors: errors.slice(0, 5),
  });
}
