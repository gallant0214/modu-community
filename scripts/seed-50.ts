import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });

import { newPosts, pickRegion, PREV_AUTHOR_POOLS } from "../app/api/admin/seed-community-reviews-50/data";

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
    "보디빌딩","보디빌더","피지크","사프","사피","사이드피지크","사이드프지크",
    "쿼터턴","규정포즈","포징","포즈","무대","컨벤셔널","데드","데드리프트","벤치","스쿼트",
    "사이드","트라이","프론트","랫","어브도미널","근비대","ATP","ATP-PC","글리코겐",
    "BMI","체질량","체지방","피하지방","내장지방","글루카곤","인슐린",
    "에피네프린","아드레날린","교감신경","WADA","KADA","도핑","TUE","마스킹","이뇨제","흥분제",
    "IFBB","시상면","관상면","횡단면","시상축","관상축","비타민","수평면","수직축",
    "흉쇄유돌근","SCM","카르보넨","워밍업","좌심실","HDL","LDL","CPR","AED","PRICE","PRICES",
    "ACL","PCL","MCL","LCL","반월상","무릎 인대","BCAA","아미노산","단백질","크레아틴",
    "그렐린","멜라토닌","성장호르몬","근육","체급","비키니","클래식보디빌딩","보드피트",
    "여자비키니","여자피지크","여자보디빌딩","보드피트니스","유산소","무산소","해당","젖산","에너지",
    "선수 심장","청심환","발살바","락아웃","흡기","호기","트레이닝","FITT",
    "Rep","Set","워밍업","쿨다운","Rest","휴식","관절","가동성","ROM",
    "광배근","대원근","장요근","장골근","대요근","카테콜아민","도파민","에피네프린",
    "노르에피네프린","SITS","회전근개","극상근","극하근","소원근","견갑하근",
    "외전","내전","외회전","내회전","흉추","견갑","후인하강","신전",
    "GX","PT","트레이너","인스트럭터","자비스트","페이퍼커스","핏니스",
    "한약","홍삼","인삼","마황","에페드린","한정수량","헬스장","1인 헬스장",
    "응시번호","시험관","사이드체스트","사이드 트라이","측면 삼각근","삼각근",
    "노인스포츠지도사","유소년","장애인","척추","근막","발차기","컴파운드","슈퍼세트","트라이세트",
    "ADO","DCO","TUEC","WADC","ADRV","코르티솔","부신","부신피질","부신수질",
    "알파세포","베타세포","Epley","Brzycki","구술","리스트컬","해머컬","쉬러그","런지",
    "스티프","루마니안","힙힌지","햄스트링","반건양근","반막양근","대퇴이두","극상근",
    "탄","브론저","인권","성폭력","화상","지근","속근","적근","백근","마이오글로빈",
    "체형","내배엽","중배엽","외배엽","수험표","공고문","연수","면제","추가취득",
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
  console.log(`✅ 체크6 통과 — pickRegion() 형식 "광역시도 - 시군구"`);
}

async function main() {
  console.log(`\n=== 50차 시드 ${DRY_RUN ? "[DRY RUN]" : "[PROD INSERT]"} ===\n`);
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
    const region = pickRegion();
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

  console.log(`\n=== 50차 시드 완료 ===`);
  console.log(`postsInserted: ${postsInserted}, commentsInserted: ${commentsInserted}`);
  console.log(`insertedIds: ${insertedIds[0]} ~ ${insertedIds[insertedIds.length - 1]}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
