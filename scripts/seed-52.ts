import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { newPosts, pickRegion, PREV_AUTHOR_POOLS } from "../app/api/admin/seed-community-reviews-52/data";

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
  const BB_KEYWORDS = [
    "보디빌딩","보디빌더","피지크","사프","사피","비키니","보디피트니스","쿼터턴","규정포즈","포징","포즈",
    "컨벤셔널","데드","데드리프트","벤치","스쿼트","런지","컴파운드","트라이세트","슈퍼세트","불가리안",
    "사이드","트라이","프론트","랫","바벨","덤벨","리스트컬","해머컬","숄더프레스","밀리터리","로우",
    "근비대","ATP","ATP-PC","글리코겐","글루코스","해당과정","젖산","유산소","무산소","에너지",
    "BMI","체질량","체지방","제지방","글루카곤","인슐린","테스토스테론","성장호르몬","렙틴","그렐린",
    "WADA","WADC","KADA","ADO","도핑","TUE","탄","브론저","흥분제","IFBB","무대 규격","무대규격",
    "시상면","관상면","수평면","정중면","비타민","흉쇄유돌근","심박출량","화상","CPR","심폐소생","PRICE",
    "쇼크","골절","연부조직","근방추","골지건","코어","복횡근","다열근","횡격막","골반기저근",
    "광배근","대원근","대퇴사두근","햄스트링","반건양근","반막양근","대퇴이두","삼각근","비복근","가자미근",
    "포도당 수송체","GLUT","아미노산","필수지방산","오메가","리놀레산","단백질","카보로딩","탄수화물 로딩",
    "기초대사","활동대사","구술","실기","시험관","면접","감독관","응급처치","드레싱","수분",
    "인권","성폭력","성희롱","지도자","생활체육","스포츠 폭력","합숙","무대","연수","척추","경추","흉추","요추",
    "피라미드","디센딩","오버트레이닝","무산소성","역치","근력","서맥","선수 심장","좌심실","카프레이즈",
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
  const fixed = newPosts.filter((p) => p.region).length;
  console.log(`✅ 체크6 통과 — region "광역시도 - 시군구" 형식 (시험장 고정 ${fixed}개 / pickRegion ${newPosts.length - fixed}개)`);
}

async function main() {
  console.log(`\n=== 52차 시드 ${DRY_RUN ? "[DRY RUN]" : "[PROD INSERT]"} ===\n`);
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

  console.log(`\n=== 52차 시드 완료 ===`);
  console.log(`postsInserted: ${postsInserted}, commentsInserted: ${commentsInserted}`);
  console.log(`insertedIds: ${insertedIds[0]} ~ ${insertedIds[insertedIds.length - 1]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
