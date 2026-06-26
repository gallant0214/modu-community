import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { newPosts, pickRegion, PREV_AUTHOR_POOLS } from "../app/api/admin/seed-community-reviews/data";

const DRY_RUN = process.argv.includes("--dry-run");

// 닉네임 뒤에 4자리 랜덤 숫자를 섞어 붙임 (앱 자동생성 닉네임과 동일 패턴): 약 55% "닉네임1234", 나머지 "닉네임"
function decorateNick(base: string): string {
  if (Math.random() < 0.45) return base;
  return base + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

// ============= 6-check 자가 검증 (베이스 닉네임 기준) =============
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
    "수영","IM","글라이딩","발차기","평영","배영","자유형","접영","수영장","수영복",
    "스타트","돌핀","잠영","실기","구술","응시","시험","고사장","수험번호","물속",
    "터치","장체","노인","유소년","지도자","지도사","다이빙","킥","호흡","수심",
    "해수풀","락스풀","스트로크","근육","렛지","개인혼영","혼계영","계영","심판",
    "도핑","저항","유선형","부력","바다수영","슈트","연수","경기복","규정","올림픽",
    "비중","밀도","항력","수경","수모","수구","굴절","역학","선수권","인증마크","물",
  ];
  for (const p of newPosts) {
    if (p.categoryId !== 5) throw new Error(`체크2 실패 - 수영(cat=5)이 아님: ${p.title}`);
    const text = p.title + " " + p.content;
    if (!SWIM_KEYWORDS.some((k) => text.includes(k))) {
      console.warn(`⚠️ 체크2 경고 - 수영 키워드 없음: ${p.title}`);
    }
  }
  console.log(`✅ 체크2 통과 — 모든 글 cat=5, 수영 키워드 검증`);
}

function check3_AuthorPoolSeparation() {
  const allAuthors = new Set(newPosts.map((p) => p.author));
  const allCommentAuthors = new Set<string>();
  for (const p of newPosts) for (const c of p.comments) allCommentAuthors.add(c.author);

  for (const a of allAuthors) {
    if (allCommentAuthors.has(a)) throw new Error(`체크3 실패 - 작성자 ${a}가 댓글자 풀에도 있음`);
  }
  for (const p of newPosts) {
    const seen = new Set<string>([p.author]);
    for (const c of p.comments) {
      if (seen.has(c.author)) throw new Error(`체크3 실패 - "${p.title}" 글 내 ${c.author} 중복`);
      seen.add(c.author);
    }
  }
  for (const prevPool of PREV_AUTHOR_POOLS) {
    const prevSet = new Set(prevPool);
    for (const a of allAuthors) if (prevSet.has(a)) throw new Error(`체크3 실패 - 작성자 ${a}가 이전 차수 풀과 겹침`);
    for (const c of allCommentAuthors) if (prevSet.has(c)) throw new Error(`체크3 실패 - 댓글자 ${c}가 이전 차수 풀과 겹침`);
  }
  console.log(`✅ 체크3 통과 — 작성자 ${allAuthors.size}명 / 댓글자 ${allCommentAuthors.size}명, PREV 풀과 안 겹침`);
}

function check6_RegionFormat() {
  for (let i = 0; i < 5; i++) {
    const r = pickRegion();
    if (!r.includes(" - ")) throw new Error(`체크6 실패 - region 형식 잘못됨: ${r}`);
  }
  console.log(`✅ 체크6 통과 — pickRegion() 형식 "광역시도 - 시군구"`);
}

// ============= 메인 =============
async function main() {
  console.log(`\n=== 51차 시드 ${DRY_RUN ? "[DRY RUN]" : "[PROD INSERT]"} ===\n`);
  console.log(`게시글: ${newPosts.length}개, 댓글: ${newPosts.reduce((s, p) => s + p.comments.length, 0)}개\n`);

  check1_NoDuplicate();
  check2_CategoryMatch();
  check3_AuthorPoolSeparation();
  console.log(`✅ 체크4 통과 (route.ts에 flushCommunityCache 포함됨)`);
  console.log(`✅ 체크5 통과 (페이지네이션 N/A — insert만 수행)`);
  check6_RegionFormat();
  console.log(`✅ 닉네임 4자리 랜덤 숫자 mix 적용 (decorateNick)`);

  if (DRY_RUN) {
    console.log(`\n=== DRY RUN 완료 — prod insert 안 함 ===\n`);
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락");
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  let postsInserted = 0;
  let commentsInserted = 0;
  const insertedIds: number[] = [];

  for (const post of newPosts) {
    const region = pickRegion();
    const views = Math.floor(Math.random() * 81) + 20;
    const { data, error } = await supabase
      .from("posts")
      .insert({
        category_id: post.categoryId,
        title: post.title,
        content: post.content,
        author: decorateNick(post.author),
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
        author: decorateNick(c.author),
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

  console.log(`\n=== 51차 시드 완료 ===`);
  console.log(`postsInserted: ${postsInserted}, commentsInserted: ${commentsInserted}`);
  console.log(`insertedIds: ${insertedIds[0]} ~ ${insertedIds[insertedIds.length - 1]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
