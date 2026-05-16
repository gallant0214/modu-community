// 31차 시드: 수영 12개
// 카톡 출처: 2026-05-13~16 생활체육스포츠지도사 2급 수영
// 6-check + 누적 풀(22-23/27/28/29/30차) 검증
// ⚠️ 31차부터: 작성자 닉네임도 글과 무관 — AUTHOR_POOL 분리
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { REGION_GROUPS } from "../app/lib/region-data";
import { AUTHOR_POOL, MIXED_POOL, newPosts } from "../app/api/admin/seed-community-reviews/data";

config({ path: resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// 누적 작성자 풀 (이전 차수)
const PREV_BB_22_23 = [
  "물통뚜껑", "삼각자", "클립보드", "형광펜", "볼펜꽂이", "커튼봉", "바인더", "스탠드",
  "메모지", "연필깎이", "지우개", "책갈피", "자석클립", "스테이플러", "책꽂이", "필통",
  "연필꽂이", "포스트잇", "모눈노트", "종이클립", "잉크펜", "컴퍼스", "화이트보드",
];
const PREV_27_AUTHORS = [
  "헬커스고민러", "사이드체스트벽", "추가취득생", "신청부족걱정", "포징숨막힘",
  "PT방향엇갈림", "단체포징초보", "295점생존러", "1분50초벽", "25m50m고민",
  "배영25초벽", "코로물난리", "이어플러그픽", "글라이딩고민러", "20대정체러",
  "수영실기시작", "10년만의IM", "보완순위정리", "유튜브카카오믹", "발차기약점",
];
const PREV_28_AUTHORS = [
  "피지크범위고민", "EPOC산소부채", "10페이지1주", "자비스트큰병", "구어체질문러",
  "3대근육답변", "ATPPCr답변", "마감14일러", "시험복깔끔", "다이어트복고민",
  "사진묘사고민", "51개5개관문", "5회독1주",
];
const PREV_29_AUTHORS = [
  "CPR호흡차이", "4종세트구분", "에너지3원천", "10kg한달목표", "응시사진깔끔러",
  "30분51카드", "73개정리러", "클래식포즈범위", "데드무릎각도", "잔여인원노림",
  "리스트컬방향", "ATPPCr시스템3",
];
const PREV_30_AUTHORS = [
  "물속출발고민", "1분30초벽", "다이빙시험장", "기록입증만", "25m25초벽",
  "출발글라이딩", "회전근개수영", "75m인터벌", "물안잡기", "자비스트영상",
  "어깨회전근개", "1년준비계속",
];
const ALL_PREV_AUTHORS = new Set([
  ...PREV_BB_22_23, ...PREV_27_AUTHORS, ...PREV_28_AUTHORS,
  ...PREV_29_AUTHORS, ...PREV_30_AUTHORS,
]);

function validate() {
  // 1. (title, content) unique
  const seen = new Set<string>();
  for (const p of newPosts) {
    const key = `${p.title}|||${p.content}`;
    if (seen.has(key)) throw new Error(`중복 글: ${p.title}`);
    seen.add(key);
  }

  // 2. categoryId 매핑 검증
  const SPORT: Record<number, string[]> = {
    1: ["보디빌딩", "사이드체스트", "포징", "자비스트"],
    5: ["수영", "다이빙", "배영", "자유형", "글라이딩", "인터벌", "IM", "스트로크", "킥", "물속", "라이프가드", "수영장", "구술", "마스터즈", "영법", "추가취득", "시험장", "수온"],
  };
  for (const p of newPosts) {
    const text = p.title + " " + p.content;
    const expected = SPORT[p.categoryId] ?? [];
    const hit = expected.some((k) => text.includes(k));
    if (!hit) {
      console.warn(`⚠️ 카테고리 키워드 미히트 cat=${p.categoryId} "${p.title}"`);
    }
  }

  // 3. 작성자 풀 / 댓글자 풀 분리
  const authorPool = new Set(newPosts.map((p) => p.author));
  const authorPoolDecl = new Set(AUTHOR_POOL);
  const mixedSet = new Set(MIXED_POOL);

  // 3-1. 모든 게시글 작성자가 AUTHOR_POOL 안에서 픽되었는지
  for (const a of authorPool) {
    if (!authorPoolDecl.has(a)) {
      throw new Error(`게시글 작성자 ${a} 가 AUTHOR_POOL 밖`);
    }
  }
  // 3-2. AUTHOR_POOL ∩ MIXED_POOL = ∅
  for (const a of AUTHOR_POOL) {
    if (mixedSet.has(a)) throw new Error(`AUTHOR_POOL ${a} 가 MIXED_POOL 에도 있음`);
  }
  // 3-3. 댓글자는 모두 MIXED_POOL, 한 글 안 중복 X, 작성자와 동일 X
  for (const p of newPosts) {
    const seenInPost = new Set<string>();
    for (const c of p.comments) {
      if (c.author === p.author) throw new Error(`"${p.title}": 댓글자 ${c.author} = 작성자`);
      if (seenInPost.has(c.author)) throw new Error(`"${p.title}": 댓글자 ${c.author} 중복`);
      seenInPost.add(c.author);
      if (!mixedSet.has(c.author)) {
        throw new Error(`"${p.title}": 댓글자 ${c.author} 가 MIXED_POOL 밖`);
      }
    }
  }

  // 4. 누적 풀 충돌
  for (const a of AUTHOR_POOL) {
    if (ALL_PREV_AUTHORS.has(a)) throw new Error(`AUTHOR_POOL ${a} 가 이전 차수 풀과 충돌`);
  }
  for (const m of MIXED_POOL) {
    if (ALL_PREV_AUTHORS.has(m)) throw new Error(`MIXED_POOL ${m} 가 이전 차수 작성자 풀과 충돌`);
  }

  console.log("✅ 6-check 통과:", newPosts.length, "게시글,", MIXED_POOL.length, "댓글자 풀,", AUTHOR_POOL.length, "작성자 풀");
}

// 지역 가중치 픽
const REGION_WEIGHTS: Record<string, number> = {
  서울특별시: 5, 경기도: 6, 부산광역시: 3, 인천광역시: 3, 대구광역시: 2, 대전광역시: 2,
  광주광역시: 2, 울산광역시: 2, 세종특별자치시: 1, 강원특별자치도: 2, 충청북도: 2,
  충청남도: 2, 전북특별자치도: 2, 전라남도: 2, 경상북도: 2, 경상남도: 2, 제주특별자치도: 1,
};
function pickRegion(): string {
  const weighted: { name: string; subs: typeof REGION_GROUPS[0]["subRegions"] }[] = [];
  for (const g of REGION_GROUPS) {
    const w = REGION_WEIGHTS[g.name] ?? 1;
    for (let i = 0; i < w; i++) weighted.push({ name: g.name, subs: g.subRegions });
  }
  const pick = weighted[Math.floor(Math.random() * weighted.length)];
  const sub = pick.subs[Math.floor(Math.random() * pick.subs.length)];
  return `${pick.name} - ${sub.name}`;
}

function offsetHours(iso: string, hours: number): string {
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString();
}

async function run() {
  validate();

  let postsInserted = 0;
  let commentsInserted = 0;
  const insertedIds: number[] = [];

  for (const post of newPosts) {
    const region = pickRegion();
    const views = Math.floor(Math.random() * 81) + 20;

    const { data: postRow, error: postErr } = await supabase
      .from("posts")
      .insert({
        title: post.title,
        content: post.content,
        category_id: post.categoryId,
        author: post.author,
        password: "__seed_community__",
        ip_address: "seed_community",
        tags: "기타",
        region,
        views,
        created_at: post.date,
        comments_count: 0,
      })
      .select("id")
      .single();

    if (postErr || !postRow) {
      console.error(`❌ post insert 실패 "${post.title}":`, postErr?.message);
      continue;
    }
    postsInserted++;
    insertedIds.push(postRow.id);

    for (const c of post.comments) {
      const hoursOffset = Math.floor(Math.random() * 47) + 1;
      const commentDate = offsetHours(post.date, hoursOffset);
      const { error: cErr } = await supabase.from("comments").insert({
        post_id: postRow.id,
        author: c.author,
        content: c.content,
        password: "__seed_community__",
        ip_address: "seed_community",
        created_at: commentDate,
      });
      if (cErr) {
        console.error(`  ❌ comment insert 실패 (${c.author}):`, cErr.message);
        continue;
      }
      commentsInserted++;
    }

    const { count } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postRow.id);
    if (count !== null) {
      await supabase.from("posts").update({ comments_count: count }).eq("id", postRow.id);
    }
  }

  console.log(
    `\n✅ 31차 완료: postsInserted=${postsInserted}, commentsInserted=${commentsInserted}`
  );
  console.log(`   post id 범위: ${insertedIds[0]} ~ ${insertedIds[insertedIds.length - 1]}`);
}

run().catch((e) => {
  console.error("❌ run 실패:", e);
  process.exit(1);
});
