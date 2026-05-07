/**
 * 시드 게시글/댓글 닉네임 분포 분석 (read-only).
 * 작성자-댓글자가 같은 카테고리(악기/문구/가전 등)로 묶인 케이스 식별.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), ".env.local") });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const { data: posts, error: pErr } = await supabase
    .from("posts")
    .select("id, category_id, title, author, created_at")
    .eq("password", "__seed_community__")
    .order("id", { ascending: true });
  if (pErr || !posts) { console.error(pErr); return; }

  const postIds = posts.map((p) => p.id);
  const allComments: { id: number; post_id: number; author: string }[] = [];
  // chunk to avoid query length
  for (let i = 0; i < postIds.length; i += 200) {
    const chunk = postIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("comments")
      .select("id, post_id, author")
      .in("post_id", chunk)
      .eq("password", "__seed_community__");
    if (error) { console.error(error); return; }
    if (data) allComments.push(...data);
  }

  const byPost = new Map<number, { id: number; author: string }[]>();
  for (const c of allComments) {
    const arr = byPost.get(c.post_id) ?? [];
    arr.push({ id: c.id, author: c.author });
    byPost.set(c.post_id, arr);
  }

  console.log(`📊 시드 게시글: ${posts.length}개`);
  console.log(`📊 시드 댓글:   ${allComments.length}개\n`);

  // 게시글 작성자 닉네임 unique
  const postAuthors = new Set(posts.map((p) => p.author));
  console.log(`게시글 작성자 unique: ${postAuthors.size}개`);
  console.log(`샘플 20개: ${Array.from(postAuthors).slice(0, 20).join(", ")}\n`);

  // 댓글 작성자 unique
  const commentAuthors = new Set(allComments.map((c) => c.author));
  console.log(`댓글 작성자 unique: ${commentAuthors.size}개`);
  console.log(`샘플 20개: ${Array.from(commentAuthors).slice(0, 20).join(", ")}\n`);

  // 게시글-댓글 작성자가 동일한 풀 추정 — 댓글자가 게시글자와 자주 겹치는 카테고리/풀 그룹
  // 단순 진단: 각 게시글의 댓글자가 게시글자와 "관련된 풀"인 케이스 카운트
  // (정확한 풀 매핑은 어려우니 — 게시글 5개 + 댓글 10개 샘플 출력)
  console.log(`\n--- 샘플 5개 게시글 (작성자 + 댓글자) ---\n`);
  const sample = posts.slice(0, 5);
  for (const p of sample) {
    const cmts = byPost.get(p.id) ?? [];
    console.log(`  [id=${p.id} cat=${p.category_id}] "${p.title.slice(0, 40)}"`);
    console.log(`     작성자: ${p.author}`);
    console.log(`     댓글자: ${cmts.map((c) => c.author).join(", ")}\n`);
  }

  // 마지막 5개 (26차)
  console.log(`--- 마지막 5개 게시글 (26차 악기 풀) ---\n`);
  const last = posts.slice(-5);
  for (const p of last) {
    const cmts = byPost.get(p.id) ?? [];
    console.log(`  [id=${p.id} cat=${p.category_id}] "${p.title.slice(0, 40)}"`);
    console.log(`     작성자: ${p.author}`);
    console.log(`     댓글자: ${cmts.map((c) => c.author).join(", ")}\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
