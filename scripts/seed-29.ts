import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { REGION_GROUPS } from "../app/lib/region-data";
import { newPosts, MIXED_POOL } from "../app/api/admin/seed-community-reviews/data";

config({ path: resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const WEIGHTS: Record<string, number> = {
  서울특별시: 5,
  경기도: 6,
  부산광역시: 3,
  인천광역시: 3,
  대구광역시: 2,
  대전광역시: 2,
  광주광역시: 2,
  울산광역시: 1,
  세종특별자치시: 1,
  강원도: 1,
  충청북도: 1,
  충청남도: 1,
  전라북도: 1,
  전라남도: 1,
  경상북도: 1,
  경상남도: 2,
  제주특별자치도: 1,
};

function pickRegion(): string {
  const total = REGION_GROUPS.reduce((s, g) => s + (WEIGHTS[g.name] ?? 1), 0);
  let r = Math.random() * total;
  for (const g of REGION_GROUPS) {
    r -= WEIGHTS[g.name] ?? 1;
    if (r <= 0) {
      const sub = g.subRegions[Math.floor(Math.random() * g.subRegions.length)];
      return `${g.name} - ${sub.name}`;
    }
  }
  const last = REGION_GROUPS[REGION_GROUPS.length - 1];
  const sub = last.subRegions[Math.floor(Math.random() * last.subRegions.length)];
  return `${last.name} - ${sub.name}`;
}

async function main() {
  console.log("=== 29차 시드 사전 검증 (6-check + 누적 풀) ===");

  // 체크 1: 중복
  const seen = new Set<string>();
  for (const p of newPosts) {
    const key = `${p.title}|||${p.content}`;
    if (seen.has(key)) throw new Error(`중복 게시글: ${p.title}`);
    seen.add(key);
  }
  console.log(`✅ 체크 1: ${newPosts.length}개 모두 unique`);

  // 체크 2: 카테고리 매핑
  const SPORT_KEYWORDS: Record<number, string[]> = {
    1: ["보디빌딩", "헬스", "포징", "벤치", "데드", "스쿼트", "PT", "트레이너", "근육", "EPOC", "ATP", "포즈", "피지크", "구술", "시험복", "포스파겐", "바벨", "리스트컬", "심폐소생술", "CPR", "슈퍼세트", "컴파운드", "트라이세트", "자이언트세트"],
  };
  for (const p of newPosts) {
    const text = p.title + " " + p.content;
    const matched: number[] = [];
    for (const [cid, kws] of Object.entries(SPORT_KEYWORDS)) {
      if (kws.some((k) => text.includes(k))) matched.push(Number(cid));
    }
    if (matched.length > 0 && !matched.includes(p.categoryId)) {
      throw new Error(`카테고리 불일치: cat=${p.categoryId}, expected=${matched.join("|")}, title="${p.title}"`);
    }
  }
  console.log(`✅ 체크 2: 카테고리 매핑 정확`);

  // 체크 3: 작성자/댓글자 풀 분리
  const authorSet = new Set(newPosts.map((p) => p.author));
  for (const p of newPosts) {
    for (const c of p.comments) {
      if (authorSet.has(c.author)) throw new Error(`댓글자가 작성자 풀과 겹침: ${c.author} (post: ${p.title})`);
    }
    const commentAuthors = p.comments.map((c) => c.author);
    if (new Set(commentAuthors).size !== commentAuthors.length) {
      throw new Error(`한 글 안 댓글자 중복: ${p.title}`);
    }
  }
  for (const a of authorSet) {
    if (MIXED_POOL.includes(a)) throw new Error(`작성자가 MIXED_POOL과 겹침: ${a}`);
  }
  console.log(`✅ 체크 3: 작성자(${authorSet.size}) ≠ 댓글자 풀(${MIXED_POOL.length})`);

  // 체크 4: 누적 풀 검증 (22-23차/27차/28차)
  const PREV_BB_POOL = [
    "물통뚜껑", "삼각자", "클립보드", "형광펜", "볼펜꽂이", "커튼봉", "바인더", "스탠드",
    "메모지", "연필깎이", "지우개", "책갈피", "자석클립", "스테이플러", "책꽂이", "필통",
    "연필꽂이", "포스트잇", "모눈노트", "종이클립", "잉크펜", "컴퍼스", "화이트보드",
  ];
  const PREV_27_AUTHORS = [
    "헬커스고민러", "사이드체스트벽", "추가취득생", "신청부족걱정", "포징숨막힘",
    "PT방향엇갈림", "단체포징초보", "295점생존러",
    "1분50초벽", "25m50m고민", "배영25초벽", "코로물난리", "이어플러그픽",
    "글라이딩고민러", "20대정체러", "수영실기시작", "10년만의IM", "보완순위정리",
    "유튜브카카오믹", "발차기약점",
  ];
  const PREV_28_AUTHORS = [
    "피지크범위고민", "EPOC산소부채", "10페이지1주", "자비스트큰병", "구어체질문러",
    "3대근육답변", "ATPPCr답변", "마감14일러", "시험복깔끔", "다이어트복고민",
    "사진묘사고민", "51개5개관문", "5회독1주",
  ];
  const ALL_PREV = [...PREV_BB_POOL, ...PREV_27_AUTHORS, ...PREV_28_AUTHORS];
  for (const a of authorSet) {
    if (ALL_PREV.includes(a)) throw new Error(`작성자가 이전 차수 풀과 겹침: ${a}`);
  }
  for (const m of MIXED_POOL) {
    if (ALL_PREV.includes(m)) throw new Error(`MIXED_POOL이 이전 차수 풀과 겹침: ${m}`);
  }
  console.log(`✅ 체크 4: 22-23/27/28차 누적 풀(${ALL_PREV.length}개)과 충돌 없음`);

  // 체크 6: region 형식
  const testRegion = pickRegion();
  if (!testRegion.includes(" - ") || !REGION_GROUPS.some((g) => testRegion.startsWith(g.name + " - "))) {
    throw new Error(`region 형식 위반: ${testRegion}`);
  }
  console.log(`✅ 체크 6: region 형식 정상 (e.g. "${testRegion}")`);

  console.log("\n=== 시드 시작 ===");
  let postsInserted = 0;
  let commentsInserted = 0;
  const insertedPostIds: number[] = [];

  for (const post of newPosts) {
    const region = pickRegion();
    const views = Math.floor(Math.random() * 81) + 20;

    const { data: insertedPost, error: postErr } = await supabase
      .from("posts")
      .insert({
        title: post.title,
        content: post.content,
        category_id: post.categoryId,
        author: post.author,
        region,
        tags: "기타",
        views,
        password: "__seed_community__",
        ip_address: "seed_community",
        created_at: post.date,
        likes: 0,
        comments_count: 0,
      })
      .select("id")
      .single();

    if (postErr || !insertedPost) {
      console.error(`❌ post insert failed: ${post.title} - ${postErr?.message}`);
      continue;
    }

    postsInserted++;
    const postId = insertedPost.id;
    insertedPostIds.push(postId);

    for (const comment of post.comments) {
      const baseDate = new Date(post.date);
      const offsetMs = (1 + Math.floor(Math.random() * 47)) * 60 * 60 * 1000;
      const commentDate = new Date(baseDate.getTime() + offsetMs).toISOString();

      const { error: commentErr } = await supabase.from("comments").insert({
        post_id: postId,
        author: comment.author,
        password: "__seed_community__",
        content: comment.content,
        ip_address: "seed_community",
        created_at: commentDate,
        likes: 0,
      });

      if (!commentErr) commentsInserted++;
      else console.error(`❌ comment insert failed for post ${postId}: ${commentErr.message}`);
    }

    const { count } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);
    if (count !== null) {
      await supabase.from("posts").update({ comments_count: count }).eq("id", postId);
    }

    process.stdout.write(`✓ post ${postId} (cat=${post.categoryId}, region=${region}, comments=${post.comments.length})\n`);
  }

  console.log(`\n=== 결과 ===`);
  console.log(`postsInserted: ${postsInserted}`);
  console.log(`commentsInserted: ${commentsInserted}`);
  console.log(`insertedPostIds: ${insertedPostIds.join(", ")}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
