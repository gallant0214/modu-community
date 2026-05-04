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

// fetch-jobs/route.ts 의 SPORTS_WORDS 와 동일 (제목/회사명에 하나라도 매칭되어야 통과)
// 시설관리공단 단독은 의도적으로 제외 — 일반 시설관리공단(중랑구 등) 사무·돌봄 통과 차단
const SPORTS_WORDS = /태권도|(?<![가-힣])유도|검도|복싱|권투|합기도|주짓수|킥복싱|무에타이|무술|헬스(?!케어)|피트니스|트레이너|크로스핏|필라테스|요가|발레|에어로빅|무용|줄넘기|수영(?![구동로시군면읍리만])|골프|테니스|배드민턴|탁구|축구|풋살|농구|배구|야구|클라이밍|암벽|볼더링|승마|체조|댄스|양궁|펜싱|사격|스키(?![드니마핑터])|스노보드|스케이트|볼링|스쿼시|스포츠|체육|운동|스포츠지도사|체육지도사|체육교사|스포츠강사|체육강사|운동강사|헬스강사|수영강사|골프강사|테니스강사|요가강사|필라테스강사|태권도강사|유도강사|검도강사|레슨|인스트럭터|레저|생활체육|체력단련|PT|GYM|짐|웰니스|피지컬|유아체육|유소년|어린이체육|장애인체육|장애인스포츠|노인체육|노인스포츠|실버체육|호텔피트니스|호텔스파|운동처방|국민체육|체육회|체육진흥|종합운동장|문화체육/i;

// fetch-jobs/route.ts 의 EXCLUDE_TITLE 와 동일한 정규식 (사본)
const EXCLUDE_TITLE = /도장\s*공|도장\s*사원|도장\s*기사|도장\s*작업|도장\s*공사|도장\s*부|도장\s*파트|도장\s*업체|도장\s*협력|도장\s*반|도장\s*팀|도장\s*과|도장\s*직|도장\s*과장|건축\s*도장|건설\s*도장|전착\s*도장|분체\s*도장|자동차\s*도장|스프레이\s*도장|우레탄\s*도장|선박\s*도장|차체\s*도장|에폭시\s*도장|하지\s*엔지니어|도배|미장|방수\s*공사|방수\s*직무|방수\s*기사|타일\s*시공|인테리어\s*마감|건설|토목|중장비|굴삭기|크레인|생산직|생산팀|생산부|생산관리|생산보조|제조직|조립직|용접|프레스|사출|금형|CNC|선반|상하차|지게차|화물|배송기사|납품기사|운전기사|택배|회계|총무|경리|인사담당|마케팅|기획팀|개발자|프로그래머|디자이너|연구원|보조선생님|보육교사|사무직|사무\s*직원|사무용가구|사무용품|관리사무원|영업사원|영업직|납품\s*및\s*영업|납품\s*영업|사회복지사|복지사|간호조무사|요양원|간병인|돌보미|장애아돌보미|조경원|조경관리|하우스키퍼|하우스키핑|룸어텐던트|객실관리|객실정비|객실청소|바리스타|베이커리|카페\s*직원|카페\s*매니저|매점|미화|세차|룸메이드|하우스키핑|홀서빙|식음|외곽\s*미화|호텔\s*프론트|호텔\s*객실|호텔.*프론트|컨트리클럽.*프론트|골프.*프론트|화장품|식품|요양보호사|방문요양|재가요양|주간보호|어르신케어|어르신\s*돌봄|돌봄\s*인력|긴급\s*돌봄|발달장애인\s*돌봄|발달장애인\s*활동|발달장애인\s*주간|발달장애인\s*방과후|장애인\s*활동\s*지원|장애인\s*돌봄|주간\s*활동\s*서비스|방과후\s*활동\s*서비스|활동서비스\s*제공|미화원|환경미화|레스토랑\s*지배인|지배인\s*모집|남자\s*락커|여자\s*락커|락커\s*근무|락커\s*직원|락커룸|라커룸|시설\s*기사|시설기사|반도체|장비\s*제조|반도체\s*장비|워크웨어|아웃도어\s*판매|매장\s*판매|판매\s*관리|잡화\s*판매|캠핑장|캠프\s*관리|체험\s*안내|체험안내원|관광\s*안내|아라나비|콘도\s*프론트|리조트\s*프론트|숙박\s*프론트|체크인.*체크아웃|요양병원|요양\s*병원|간호과장|간호사\s*모집|간호\s*업무|QPS\s*담당|병원\s*간호사|행정사무원|사무원\s*채용|사무원\s*모집|장기기증|주차\s*유도|주차유도원|주차유도|관제실\s*근무|관제\s*요원|중국어\s*가능|중국어\s*회화|관광객\s*유치|여행업|종합여행|관리직원\s*모집|협력업체\s*모집|공식\s*협력업체|총판\s*판매|프로젝터\s*판매|빔\s*프로젝터|AS\s*업무|유지보수\s*직원|홀서비스|집기\s*정리|테이블\s*세팅|홀서빙\s*채용|잔디\s*관리|잔디관리|예초|클럽하우스|식당\s*홀|레스토랑\s*조리|주방\s*보조|중식당|한식당|양식당|일식당|중식\s*조리|한식\s*조리|양식\s*조리|일식\s*조리|조리원|조리사|샤워실|간병|청소(?!강사)|주차\s*요원|주차\s*안내|주차\s*관리|혼잡\s*교통\s*유도|교통\s*유도\s*경비|교통\s*안내|시설\s*경비|건물\s*경비|상주\s*경비|경비\s*요원|경비\s*원|사우나\s*관리|사우나\s*직원|사우나\s*근무|사우나\s*프론트|사우나\s*안내|가스\s*안전\s*관리|가스\s*기사|가스\s*점검|가스\s*검침|도시가스|건물\s*설비\s*관리|건물\s*시설\s*관리|건물\s*관리\s*기사|소방\s*안전\s*관리|전기\s*안전\s*관리|기계\s*설비\s*관리|설비\s*안전\s*관리|단체\s*급식|구내\s*식당|급식\s*보조|급식\s*조리|급식\s*조리원|급식\s*도우미|급식\s*직원|급식실|식당\s*보조|식당\s*직원|영양사|운전직|스키드\s*로더|스키드로더|중장비\s*운전|지게차\s*운전|굴삭기\s*운전|사무\s*행정|행정\s*업무|행정\s*보조|행정\s*직원|입학\s*상담|학원\s*행정|학원\s*상담|상담\s*직원|식자재|구매\s*담당|구매\s*직원|구매팀|구매\s*MD|식품\s*MD|자재\s*담당|자재\s*관리|매입\s*담당|시니어\s*인턴|환경\s*시설\s*관리|시설\s*관리(?!\s*공단)|봉입\s*기계|봉입기계|DM\s*자동|기계\s*운영\s*사원|기계\s*조작|우편물\s*봉입|홀\s*서빙|조리\s*담당|치매|말벗|가사\s*도움|현관\s*직원|현관\s*근무|현관\s*안내|행정\s*지원|요양\s*등급|케어해주실|이수자|등급\s*할머|등급\s*할아버|등급\s*어르신|레스토랑\s*홀/i;

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

  // 1) EXCLUDE_TITLE 매칭 또는
  // 2) 제목·회사명 어디에도 SPORTS_WORDS 키워드가 없는 글 (현재 fetch-jobs 통과 조건 미달)
  const matched: BadPost[] = [];
  for (const p of posts || []) {
    const title = p.title || "";
    const center = p.center_name || "";
    const m = title.match(EXCLUDE_TITLE);
    if (m) {
      matched.push({
        id: p.id, title, center_name: center, sport: p.sport,
        matched: `EXCLUDE: ${m[0]}`,
        created_at: p.created_at,
      });
    } else if (!SPORTS_WORDS.test(title) && !SPORTS_WORDS.test(center)) {
      matched.push({
        id: p.id, title, center_name: center, sport: p.sport,
        matched: "no SPORTS keyword (title/center)",
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
