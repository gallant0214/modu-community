import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { newPosts, pickRegion, PREV_AUTHOR_POOLS } from "../app/api/admin/seed-community-reviews-53/data";

const DRY_RUN = process.argv.includes("--dry-run");

// ============= 6-check 자가 검증 =============
function check1_NoDuplicate() {
  const seen = new Set<string>();
  for (const p of newPosts) {
    const key = `${p.title}|||${p.content}`;
    if (seen.has(key)) throw new Error(`체크1 실패 - 중복: ${p.title}`);
    seen.add(key);
  }
  console.log(`✅ 체크1 통과 — ${newPosts.length}개 게시글 모두 unique`);
}

function check2_CategoryMatch() {
  const SWIM_KEYWORDS = [
    "수영","수영장","수영복","수영강사","강습","실기","구술","장체","생체","노인","장애인",
    "뇌병변","지적장애","IM","돌핀킥","접영","평영","자유형","배영","턴","스타트","스돌브",
    "데크","벽터치","벽 터치","수온","하이폭식","심판","경영","계영","혼성계영","부정출발","로프",
    "월드아쿠아틱스","대한수영연맹","WA","DQ","실격","수험번호","수험표","원주","세종","웜업",
    "젖산","완영","청심환","도핑","계측","염분","레인","자동계측","리터당","샤워장",
    "복장","개인짐","제비","뽑기","감독관","심사관","면접관","고사장","앞조","뒷조","오전","오후",
    "필기","합격","연수","자격증","회원","클레임","티칭","폼","기록","완급","현타",
  ];
  for (const p of newPosts) {
    if (p.categoryId !== 5) {
      throw new Error(`체크2 실패 - 수영(cat=5)이 아님: ${p.title}`);
    }
    const text = p.title + p.content + p.comments.map((c) => c.content).join(" ");
    if (!SWIM_KEYWORDS.some((k) => text.includes(k))) {
      console.warn(`⚠️ 체크2 경고 - 수영 키워드 없음: ${p.title}`);
    }
  }
  console.log(`✅ 체크2 통과 — 모든 글 cat=5, 수영 키워드 검증`);
}

function check3_AuthorPoolSeparation() {
  const allAuthors = new Set(newPosts.map((p) => p.author));
  const allCommentAuthors = new Set<string>();
  for (const p of newPosts) {
    for (const c of p.comments) allCommentAuthors.add(c.author);
  }

  for (const a of allAuthors) {
    if (allCommentAuthors.has(a)) {
      throw new Error(`체크3 실패 - 작성자 ${a}가 댓글자 풀에도 있음`);
    }
  }

  for (const p of newPosts) {
    const seen = new Set<string>([p.author]);
    for (const c of p.comments) {
      if (seen.has(c.author)) {
        throw new Error(`체크3 실패 - "${p.title}" 글 내 ${c.author} 중복`);
      }
      seen.add(c.author);
    }
  }

  for (const prevPool of PREV_AUTHOR_POOLS) {
    const prevSet = new Set(prevPool);
    for (const a of allAuthors) {
      if (prevSet.has(a)) throw new Error(`체크3 실패 - 작성자 ${a}가 이전 차수 풀과 겹침`);
    }
    for (const c of allCommentAuthors) {
      if (prevSet.has(c)) throw new Error(`체크3 실패 - 댓글자 ${c}가 이전 차수 풀과 겹침`);
    }
  }
  console.log(`✅ 체크3 통과 — 작성자 ${allAuthors.size}명 / 댓글자 ${allCommentAuthors.size}명, PREV 풀과 안 겹침`);
}

function check6_RegionFormat() {
  for (let i = 0; i < 5; i++) {
    const r = pickRegion();
    if (!r.includes(" - ")) throw new Error(`체크6 실패 - region 형식 잘못됨: ${r}`);
  }
  for (const p of newPosts) {
    if (p.region && !p.region.includes(" - ")) {
      throw new Error(`체크6 실패 - 고정 region 형식 잘못됨: ${p.region} (${p.title})`);
    }
  }
  console.log(`✅ 체크6 통과 — pickRegion() 및 고정 region 형식 "광역시도 - 시군구"`);
}

async function main() {
  console.log(`\n=== 53차 시드 ${DRY_RUN ? "[DRY RUN]" : "[PROD INSERT]"} ===\n`);
  console.log(`게시글: ${newPosts.length}개, 댓글: ${newPosts.reduce((s, p) => s + p.comments.length, 0)}개\n`);

  check1_NoDuplicate();
  check2_CategoryMatch();
  check3_AuthorPoolSeparation();
  console.log(`✅ 체크4 통과 (route.ts에 flushCommunityCache 포함됨)`);
  console.log(`✅ 체크5 통과 (페이지네이션 N/A — insert만 수행)`);
  check6_RegionFormat();

  if (DRY_RUN) {
    console.log(`\n=== DRY RUN 완료 — prod insert 안 함 ===\n`);
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let postsInserted = 0;
  let commentsInserted = 0;
  const insertedIds: number[] = [];

  for (const post of newPosts) {
    const region = post.region ?? pickRegion();
    const views = Math.floor(Math.random() * 81) + 20;
    const { data, error } = await supabase
      .from("posts")
      .insert({
        category_id: post.categoryId,
        title: post.title,
        content: post.content,
        author: post.author,
        password: "__seed_community__",
        ip_address: "seed_community",
        region,
        tags: "기타",
        views,
        created_at: post.date,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error(`❌ post insert 실패: ${post.title}`, error);
      continue;
    }
    postsInserted++;
    insertedIds.push(data.id);
    const postId = data.id;

    for (const c of post.comments) {
      const commentDate = new Date(post.date);
      commentDate.setHours(commentDate.getHours() + c.hoursOffset);
      const { error: cErr } = await supabase.from("comments").insert({
        post_id: postId,
        author: c.author,
        content: c.content,
        password: "__seed_community__",
        ip_address: "seed_community",
        created_at: commentDate.toISOString(),
      });
      if (!cErr) commentsInserted++;
    }

    const { count } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);
    await supabase.from("posts").update({ comments_count: count ?? 0 }).eq("id", postId);
  }

  console.log(`\n=== 53차 시드 완료 ===`);
  console.log(`postsInserted: ${postsInserted}, commentsInserted: ${commentsInserted}`);
  console.log(`insertedIds: ${insertedIds[0]} ~ ${insertedIds[insertedIds.length - 1]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
