import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { newPosts, MIXED_POOL } from "../app/api/admin/seed-community-reviews/data";

config({ path: resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

function pickRegion(): string {
  const regions: Array<{ region: string; w: number }> = [
    { region: "서울", w: 5 },
    { region: "경기", w: 6 },
    { region: "부산", w: 3 },
    { region: "인천", w: 3 },
    { region: "대구", w: 2 },
    { region: "대전", w: 2 },
    { region: "광주", w: 2 },
    { region: "울산", w: 1 },
    { region: "충남", w: 1 },
    { region: "충북", w: 1 },
    { region: "전북", w: 1 },
    { region: "전남", w: 1 },
    { region: "경북", w: 1 },
    { region: "경남", w: 2 },
    { region: "강원", w: 1 },
    { region: "제주", w: 1 },
    { region: "세종", w: 1 },
  ];
  const total = regions.reduce((sum, r) => sum + r.w, 0);
  let r = Math.random() * total;
  for (const region of regions) {
    r -= region.w;
    if (r <= 0) return region.region;
  }
  return "서울";
}

async function main() {
  console.log("=== 27차 시드 사전 검증 ===");

  // 체크 1: 중복 (title, content)
  const seen = new Set<string>();
  for (const p of newPosts) {
    const key = `${p.title}|||${p.content}`;
    if (seen.has(key)) {
      throw new Error(`중복 게시글: ${p.title}`);
    }
    seen.add(key);
  }
  console.log(`✅ 체크 1 통과: ${newPosts.length}개 게시글 모두 unique`);

  // 체크 2: 카테고리 매핑
  const SPORT_KEYWORDS: Record<number, string[]> = {
    1: ["보디빌딩", "헬스", "포징", "벤치", "데드", "스쿼트", "PT", "트레이너", "사이드 체스트", "단체 포즈"],
    5: ["수영", "IM 100", "자유형", "배영", "평영", "접영", "사이드킥", "글라이딩", "사이드 호흡", "코마개", "이어플러그"],
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
  console.log(`✅ 체크 2 통과: 카테고리 매핑 정확`);

  // 체크 3: 작성자/댓글자 풀 분리
  const authorSet = new Set(newPosts.map((p) => p.author));
  for (const p of newPosts) {
    for (const c of p.comments) {
      if (authorSet.has(c.author)) {
        throw new Error(`댓글자가 작성자 풀과 겹침: ${c.author} (post: ${p.title})`);
      }
    }
    // 한 글 안에서 댓글자 중복 X
    const commentAuthors = p.comments.map((c) => c.author);
    if (new Set(commentAuthors).size !== commentAuthors.length) {
      throw new Error(`한 글 안 댓글자 중복: ${p.title}`);
    }
  }
  for (const a of authorSet) {
    if (MIXED_POOL.includes(a)) {
      throw new Error(`작성자가 MIXED_POOL과 겹침: ${a}`);
    }
  }
  console.log(`✅ 체크 3 통과: 작성자(${authorSet.size}) ≠ 댓글자 풀(${MIXED_POOL.length})`);

  // 체크 (추가): 22-23차 보디빌딩 작성자 풀(문구류)과 충돌 검증
  const PREV_BB_POOL = [
    "물통뚜껑", "삼각자", "클립보드", "형광펜", "볼펜꽂이", "커튼봉", "바인더", "스탠드",
    "메모지", "연필깎이", "지우개", "책갈피", "자석클립", "스테이플러", "책꽂이", "필통",
    "연필꽂이", "포스트잇", "모눈노트", "종이클립", "잉크펜", "컴퍼스", "화이트보드",
  ];
  for (const a of authorSet) {
    if (PREV_BB_POOL.includes(a)) throw new Error(`작성자가 22-23차 보디빌딩 풀과 겹침: ${a}`);
  }
  for (const m of MIXED_POOL) {
    if (PREV_BB_POOL.includes(m)) throw new Error(`MIXED_POOL이 22-23차 보디빌딩 풀과 겹침: ${m}`);
  }
  console.log(`✅ 체크 (추가) 통과: 22-23차 보디빌딩 풀과 충돌 없음`);

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

    // comments_count 갱신
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
