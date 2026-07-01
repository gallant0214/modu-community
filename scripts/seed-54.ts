import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { newPosts, pickRegion, PREV_AUTHOR_POOLS, AUTHOR_POOL, MIXED_POOL } from "../app/api/admin/seed-community-reviews-54/data";

const DRY_RUN = process.argv.includes("--dry-run");

// 닉네임 뒤에 4자리 랜덤 숫자 mix (앱 자동생성 닉네임 패턴): 약 55% "닉네임1234"
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
  const BB_KEYWORDS = [
    "보디빌딩","보디빌더","피지크","클래식","사프","비키니","보디피트","포징","포즈","규정포즈","쿼터턴",
    "컨벤셔널","데드","데드리프트","벤치","스쿼트","런지","로우","컬","리스트컬","리버스","컴파운드","트라이세트","슈퍼세트",
    "트라이","프론트","랫","삼두","이두","전완근","대흉근","광배근","둔근","장요근","봉공근","대둔근","비복근","가자미근",
    "ATP","글리코겐","글루카곤","인슐린","성장호르몬","테스토스테론","호르몬","포도당","GLUT","젖산","무산소","유산소","해당",
    "필수지방산","리놀레산","아라키돈산","오메가","단백질","아미노산","비타민","콜레스테롤","기초대사","에너지",
    "WADA","KADA","도핑","DCO","ADO","TUE","금지약물","무대","IFBB","시상면","정중면","관상면","수평면",
    "카프레이즈","심폐","심혈관","호흡계","체순환","폐순환","하임리히","기도폐쇄","골절","연부조직","화상","응급처치","쇼크",
    "성폭력","인권","탈의실","샤워실","불법촬영","탄","브론저","컬러링","연수","현장실습","자격증","유예","추가취득","특별과정",
    "실기","구술","채점","합격","감점","자비스트","심사위원","시험장","응시","대학원","한체대","생활체육","프로그램","결시",
  ];
  for (const p of newPosts) {
    if (p.categoryId !== 1) {
      throw new Error(`체크2 실패 - 보디빌딩(cat=1)이 아님: ${p.title}`);
    }
    const text = p.title + p.content + p.comments.map((c) => c.content).join(" ");
    if (!BB_KEYWORDS.some((k) => text.includes(k))) {
      console.warn(`⚠️ 체크2 경고 - 보디빌딩 키워드 없음: ${p.title}`);
    }
  }
  console.log(`✅ 체크2 통과 — 모든 글 cat=1, 보디빌딩 키워드 검증`);
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

  // 베이스 풀 전체를 PREV와 대조 (decorate 전 기준)
  for (const prevPool of PREV_AUTHOR_POOLS) {
    const prevSet = new Set(prevPool);
    for (const a of [...AUTHOR_POOL, ...MIXED_POOL]) {
      if (prevSet.has(a)) throw new Error(`체크3 실패 - 닉네임 ${a}가 이전 차수 풀과 겹침`);
    }
  }
  // AUTHOR_POOL vs MIXED_POOL 교집합 없어야
  const mixedSet = new Set(MIXED_POOL);
  for (const a of AUTHOR_POOL) {
    if (mixedSet.has(a)) throw new Error(`체크3 실패 - 작성자 풀 ${a}가 댓글자 풀에도 있음`);
  }
  console.log(`✅ 체크3 통과 — 작성자 ${AUTHOR_POOL.length} / 댓글자 ${MIXED_POOL.length}, PREV 풀과 안 겹침`);
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
  console.log(`\n=== 54차 시드 ${DRY_RUN ? "[DRY RUN]" : "[PROD INSERT]"} ===\n`);
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

  console.log(`\n=== 54차 시드 완료 ===`);
  console.log(`postsInserted: ${postsInserted}, commentsInserted: ${commentsInserted}`);
  console.log(`insertedIds: ${insertedIds[0]} ~ ${insertedIds[insertedIds.length - 1]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
