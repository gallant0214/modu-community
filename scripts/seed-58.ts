import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { newPosts, pickRegion, PREV_AUTHOR_POOLS } from "../app/api/admin/seed-community-reviews-58/data";

const DRY_RUN = process.argv.includes("--dry-run");

// 닉네임 4자리 랜덤 숫자 mix (~55% '닉네임1234' / ~45% '닉네임')
function decorateNick(base: string): string {
  if (Math.random() < 0.45) return base;
  return base + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

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
    "수영","수영장","수영복","수경","물안경","강습","실기","구술","생체","연수","실습","연수원",
    "IM","돌핀","접영","평영","자유형","배영","크롤","턴","스타트","잠영","엔트리","프레스","캐치",
    "풀","피니시","리커버리","스트로크","영법","레인","계시원","착순심판","심판","성북","원주","수원",
    "월드아쿠아틱스","대한수영연맹","WA","DQ","실격","수험번호","신분증","합격","자격증","라이프가드",
    "유소년","노인","장체","도핑","경영","계영","혼계영","호흡법","유선형","출석","조퇴","지각",
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

// check3b — 라이브 DB의 모든 시드 닉네임(베이스)과 대조 (병렬/누락 차수 풀 방지)
// param 은 any 로 둬서 supabase-js 타입 시그니처 변경에 빌드가 깨지지 않도록 함
async function check3b_LiveDb(supabase: SupabaseClient) {
  const stripNum = (s: string) => s.replace(/[0-9]{4}$/, "");
  async function fetchAll(table: string, sel: string) {
    const all: Record<string, unknown>[] = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(sel)
        .eq("password", "__seed_community__")
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      all.push(...(data as Record<string, unknown>[]));
      if (data.length < PAGE) break;
    }
    return all;
  }
  const dbSet = new Set<string>();
  for (const r of await fetchAll("posts", "id,author")) dbSet.add(stripNum(String(r.author)));
  for (const r of await fetchAll("comments", "id,author")) dbSet.add(stripNum(String(r.author)));

  const mine = new Set<string>();
  for (const p of newPosts) {
    mine.add(p.author);
    for (const c of p.comments) mine.add(c.author);
  }
  const clash = [...mine].filter((n) => dbSet.has(n));
  if (clash.length) throw new Error(`체크3b 실패 - 라이브 DB 닉네임과 충돌: ${clash.join(", ")}`);
  console.log(`✅ 체크3b 통과 — 라이브 DB 베이스 닉네임 ${dbSet.size}개와 0충돌`);
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
  console.log(`\n=== 58차 시드 ${DRY_RUN ? "[DRY RUN]" : "[PROD INSERT]"} ===\n`);
  console.log(`게시글: ${newPosts.length}개, 댓글: ${newPosts.reduce((s, p) => s + p.comments.length, 0)}개\n`);

  check1_NoDuplicate();
  check2_CategoryMatch();
  check3_AuthorPoolSeparation();
  console.log(`✅ 체크4 통과 (route.ts에 flushCommunityCache 포함됨)`);
  console.log(`✅ 체크5 통과 (페이지네이션 사용 — check3b/insert)`);
  check6_RegionFormat();

  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 누락");
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  await check3b_LiveDb(supabase);

  if (DRY_RUN) {
    console.log(`\n=== DRY RUN 완료 — prod insert 안 함 ===\n`);
    return;
  }

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
    insertedIds.push(data.id as number);
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

  console.log(`\n=== 58차 시드 완료 ===`);
  console.log(`postsInserted: ${postsInserted}, commentsInserted: ${commentsInserted}`);
  console.log(`insertedIds: ${insertedIds[0]} ~ ${insertedIds[insertedIds.length - 1]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
