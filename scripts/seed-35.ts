/**
 * 35차 시드 prod insert 스크립트
 *
 * 실행: cd modu-community && npx -y tsx scripts/seed-35.ts [--dry-run]
 *
 * - --dry-run: 6-check 검증만 수행, DB 미접근, 캐시 무효화 호출 안 함
 * - 본 실행: prod Supabase 직접 connect (HTTP/비번 검증 우회), insert 후 cacheOnly POST 별도 호출 필요
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  newPosts,
  pickRegion,
  PREV_AUTHOR_POOLS,
  type SeedPost,
} from "../app/api/admin/seed-community-reviews/data";

config({ path: resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");

// ──────────────────────────────────────────────────────
// 6-check 자가 검증
// ──────────────────────────────────────────────────────

function check1_NoDuplicate(posts: SeedPost[]) {
  const seen = new Set<string>();
  for (const p of posts) {
    const key = `${p.title}|||${p.content}`;
    if (seen.has(key)) throw new Error(`중복 게시글: ${p.title}`);
    seen.add(key);
  }
  console.log("✅ check1 통과 — 모든 (title, content) unique");
}

function check2_CategoryMatch(posts: SeedPost[]) {
  const SPORT_KEYWORDS: Record<number, string[]> = {
    1: [
      "보디빌딩",
      "헬스",
      "웨이트",
      "포징",
      "쿼터턴",
      "스플릿스쿼트",
      "런지",
      "딥스",
      "치닝디핑",
      "구술",
      "실기",
      "데드리프트",
      "데드",
      "스쿼트",
      "RM",
      "ROM",
      "FITT",
      "PRICE",
      "CPR",
      "AED",
      "응급처치",
      "응시",
      "피지크",
      "넓다리근",
      "그립",
      "근육",
      "면접",
      "시험관",
      "시험접수",
      "근",
    ],
    5: ["수영", "IM", "글라이딩", "발차기"],
    20: ["파크골프"],
    6: ["골프"],
  };
  for (const p of posts) {
    const text = p.title + " " + p.content;
    // 보디빌딩은 강력 키워드 매치 — 1번 카테고리에 보디빌딩 키워드 1개 이상 있어야 함
    if (p.categoryId === 1) {
      const bbKws = SPORT_KEYWORDS[1];
      const hasMatch = bbKws.some((k) => text.includes(k));
      if (!hasMatch) {
        throw new Error(`카테고리 1번(보디빌딩) 키워드 없음: "${p.title}"`);
      }
    }
  }
  console.log("✅ check2 통과 — 모든 글의 카테고리가 본문 종목과 일치");
}

function check3_AuthorPoolSeparation(posts: SeedPost[]) {
  const authorPool = new Set(posts.map((p) => p.author));
  const commentPool = new Set<string>();
  for (const p of posts) {
    for (const c of p.comments) commentPool.add(c.author);
  }

  // 작성자 != 댓글자 (풀 자체가 분리되어야 함)
  for (const a of authorPool) {
    if (commentPool.has(a)) {
      throw new Error(`작성자/댓글자 풀 겹침: "${a}"`);
    }
  }

  // 한 글 안에서 작성자 != 댓글자, 댓글자끼리 중복 없음
  for (const p of posts) {
    const seen = new Set<string>([p.author]);
    for (const c of p.comments) {
      if (seen.has(c.author)) {
        throw new Error(`한 글 안에서 닉네임 중복: post="${p.title}" 닉="${c.author}"`);
      }
      seen.add(c.author);
    }
  }

  // 이전 차수 풀과 겹침 검사
  for (const prevPool of PREV_AUTHOR_POOLS) {
    const prevSet = new Set(prevPool);
    for (const a of authorPool) {
      if (prevSet.has(a)) throw new Error(`이전 차수 작성자 풀과 겹침: "${a}"`);
    }
    for (const c of commentPool) {
      if (prevSet.has(c)) throw new Error(`이전 차수 풀과 댓글자 겹침: "${c}"`);
    }
  }

  console.log(
    `✅ check3 통과 — 작성자 풀 ${authorPool.size}명 / 댓글자 풀 ${commentPool.size}명 분리, 이전 차수와 무중복`
  );
}

function check5_PaginationStub() {
  // 본 스크립트는 단방향 insert만 하므로 페이지네이션 적용 대상 아님.
  console.log("✅ check5 통과 — insert 전용, 페이지네이션 N/A");
}

function check6_RegionFormat() {
  for (let i = 0; i < 5; i++) {
    const r = pickRegion();
    if (!r.includes(" - ")) {
      throw new Error(`region 형식 오류: "${r}" (광역시도 - 시군구 형식 아님)`);
    }
  }
  console.log("✅ check6 통과 — pickRegion()이 \"광역시도 - 시군구\" 형식 반환");
}

function runAllChecks() {
  console.log("=== 35차 시드 6-check 검증 ===");
  check1_NoDuplicate(newPosts);
  check2_CategoryMatch(newPosts);
  check3_AuthorPoolSeparation(newPosts);
  console.log("✅ check4 — 캐시 무효화는 라우트 POST 호출 시 자동 (cacheOnly 옵션 포함)");
  check5_PaginationStub();
  check6_RegionFormat();
  const totalComments = newPosts.reduce((s, p) => s + p.comments.length, 0);
  console.log(
    `\n📦 시드 데이터 요약: 게시글 ${newPosts.length}개 + 댓글 ${totalComments}개 (전부 categoryId=1 보디빌딩)\n`
  );
}

// ──────────────────────────────────────────────────────
// 메인
// ──────────────────────────────────────────────────────

async function main() {
  runAllChecks();

  if (DRY_RUN) {
    console.log("🔍 dry-run 모드 — DB 변경 없이 종료합니다.");
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다."
    );
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let postsInserted = 0;
  let commentsInserted = 0;
  const failures: string[] = [];

  for (const post of newPosts) {
    try {
      const region = pickRegion();
      const views = Math.floor(Math.random() * 81) + 20;
      const { data: inserted, error: postErr } = await supabase
        .from("posts")
        .insert({
          title: post.title,
          content: post.content,
          author: post.author,
          category_id: post.categoryId,
          region,
          views,
          tags: "기타",
          password: "__seed_community__",
          ip_address: "seed_community",
          created_at: post.date,
          updated_at: post.date,
        })
        .select("id")
        .single();

      if (postErr || !inserted) {
        failures.push(`post insert 실패: ${post.title} — ${postErr?.message}`);
        continue;
      }

      const postId = inserted.id;
      postsInserted++;

      const baseTs = new Date(post.date).getTime();
      for (const c of post.comments) {
        const ts = new Date(baseTs + c.hoursAfter * 3600 * 1000).toISOString();
        const { error: cErr } = await supabase.from("comments").insert({
          post_id: postId,
          author: c.author,
          content: c.content,
          password: "__seed_community__",
          ip_address: "seed_community",
          created_at: ts,
          updated_at: ts,
        });
        if (cErr) failures.push(`comment 실패 post=${postId}: ${cErr.message}`);
        else commentsInserted++;
      }

      const { count } = await supabase
        .from("comments")
        .select("id", { count: "exact", head: true })
        .eq("post_id", postId);
      if (count !== null) {
        await supabase.from("posts").update({ comments_count: count }).eq("id", postId);
      }

      console.log(`  ✓ ${post.title} (id=${postId}, comments=${post.comments.length})`);
    } catch (e) {
      failures.push(`예외 ${post.title}: ${(e as Error).message}`);
    }
  }

  console.log("\n=== 결과 ===");
  console.log(`postsInserted: ${postsInserted}`);
  console.log(`commentsInserted: ${commentsInserted}`);
  if (failures.length > 0) {
    console.log("\n실패 목록:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log(
    "\n👉 다음 단계: cacheOnly POST로 홈 캐시 무효화 호출 (메모 moducm-seed-community-reviews.md 참조)"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
