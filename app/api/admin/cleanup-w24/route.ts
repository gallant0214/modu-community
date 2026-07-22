import { supabase } from "@/app/lib/supabase";
import { EXCLUDE_TITLE } from "@/app/lib/job-title-filter";
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
const SPORTS_WORDS = /태권도|(?<![가-힣])유도|검도|복싱|권투|합기도|주짓수|킥복싱|무에타이|무술|헬스(?!케어)|피트니스|트레이너|크로스핏|필라테스|요가|발레|에어로빅|무용|줄넘기|수영(?![구동로시군면읍리만역점])|골프|테니스|배드민턴|탁구|축구|풋살|농구|배구|야구|클라이밍|암벽|볼더링|승마|체조|댄스|양궁|펜싱|사격|스키(?![드니마핑터])|스노보드|스케이트|볼링|스쿼시|스포츠|체육|운동|스포츠지도사|체육지도사|체육교사|스포츠강사|체육강사|운동강사|헬스강사|수영강사|골프강사|테니스강사|요가강사|필라테스강사|태권도강사|유도강사|검도강사|레슨|인스트럭터|레저|생활체육|체력단련|PT|GYM|짐|웰니스|피지컬|유아체육|유소년|어린이체육|장애인체육|장애인스포츠|노인체육|노인스포츠|실버체육|호텔피트니스|호텔스파|운동처방|국민체육|체육회|체육진흥|종합운동장|문화체육/i;

// fetch-jobs/route.ts 의 EXCLUDE_DESC 와 동일한 정규식 (사본). description 에 들어가면 비-체육 직무로 판단.
const EXCLUDE_DESC = /기계설비\s*성능\s*점검|기계설비\s*유지관리|기계설비\s*운영|시설물\s*영선|기계\s*운영\s*지원|볼링장\s*기계\s*등\s*운영|볼링장\s*기계\s*운영|기계설비\s*시운전|기계설비\s*인수관리|영선\s*업무|영선\s*보수|영선\s*및\s*하자|워크웨어\s*및\s*아웃도어|아웃도어\s*및\s*잡화|매장\s*판매\s*관리|아웃도어\s*판매\s*관리|워크웨어\s*매장\s*관리|차량\s*운전\s*업무|업무용\s*차량\s*운전|전기안전관리자|전기\s*안전\s*관리자|전기설비\s*안전점검|전기설비\s*안전\s*점검|전기설비의\s*안전점검|수전설비|태양광.*저압|고압\s*및\s*저압의\s*전기설비|반찬\s*조리\s*업무|반찬조리\s*업무|위생\s*관리\s*및\s*정리|식기세척기\s*구비|객실\s*체크인\s*체크아웃|체크인\s*체크아웃|객실\s*체크인|식당\s*조리원|조리원\s*모집|조리원\s*채용|조리원\s*구인|진료실\s*전반|진료\s*서포트|원장님\s*진료|진료전\s*업무\s*준비|진료\s*보조\s*업무|시설물\s*관리원\s*구인|골프연습장\s*시설물|골프장\s*현관에서\s*고객응대|현관에서\s*고객응대|골프백\s*상하차\s*관리|스포츠\s*의류\s*제작|사격복\s*제작|의류\s*제작|미싱사\s*채용|미싱사\s*모집|토양환경보전법|토양환경\s*보전법|기술인력\s*해당\s*분야|폐기물\s*처리|폐기물처리|대기환경\s*기사|수질환경\s*기사|화학공학|응용지질|산업위생|자원공학|토목시공|만2세반\s*보육과정|만\s*[0-9]세반\s*보육과정|보육과정|보수교육수료증|장기미종사\s*직무교육/i;

// fetch-jobs/route.ts 의 EXCLUDE_TITLE 와 동일한 정규식 (사본)

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
    .select("id, title, center_name, sport, description, created_at")
    .eq("source", "work24");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 1) EXCLUDE_TITLE 매칭 또는
  // 2) EXCLUDE_DESC 매칭 (description 의 직무 키워드) 또는
  // 3) 제목·회사명 어디에도 SPORTS_WORDS 키워드가 없는 글 (현재 fetch-jobs 통과 조건 미달)
  const matched: BadPost[] = [];
  for (const p of posts || []) {
    const title = p.title || "";
    const center = p.center_name || "";
    const desc = (p as { description?: string | null }).description || "";
    const m = title.match(EXCLUDE_TITLE);
    if (m) {
      matched.push({
        id: p.id, title, center_name: center, sport: p.sport,
        matched: `EXCLUDE_TITLE: ${m[0]}`,
        created_at: p.created_at,
      });
      continue;
    }
    const md = desc.match(EXCLUDE_DESC);
    if (md) {
      matched.push({
        id: p.id, title, center_name: center, sport: p.sport,
        matched: `EXCLUDE_DESC: ${md[0]}`,
        created_at: p.created_at,
      });
      continue;
    }
    if (!SPORTS_WORDS.test(title) && !SPORTS_WORDS.test(center)) {
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
