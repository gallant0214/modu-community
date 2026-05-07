/**
 * Dry-run: 시드 댓글 author 재할당 미리보기.
 * 실제 UPDATE 안 함 — 변경 매핑만 출력.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { MIXED_POOL } from "./_mixed-nick-pool";

config({ path: resolve(process.cwd(), ".env.local") });
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function main() {
  const { data: posts } = await supabase
    .from("posts")
    .select("id, category_id, title, author")
    .eq("password", "__seed_community__")
    .order("id", { ascending: true });
  if (!posts) return;

  const postIds = posts.map((p) => p.id);
  const allComments: { id: number; post_id: number; author: string }[] = [];
  for (let i = 0; i < postIds.length; i += 200) {
    const chunk = postIds.slice(i, i + 200);
    const { data } = await supabase
      .from("comments")
      .select("id, post_id, author")
      .in("post_id", chunk)
      .eq("password", "__seed_community__");
    if (data) allComments.push(...data);
  }

  const byPost = new Map<number, { id: number; author: string }[]>();
  for (const c of allComments) {
    const arr = byPost.get(c.post_id) ?? [];
    arr.push({ id: c.id, author: c.author });
    byPost.set(c.post_id, arr);
  }

  // 각 게시글마다 댓글 N개에 새 풀에서 N개 픽 (한 글 안에서 중복 X, 작성자와 중복 X)
  let totalReassign = 0;
  let collisionAvoided = 0;
  const samples: { postId: number; cat: number; title: string; postAuthor: string; before: string[]; after: string[] }[] = [];

  for (const p of posts) {
    const cmts = byPost.get(p.id) ?? [];
    if (cmts.length === 0) continue;
    const shuffled = shuffle(MIXED_POOL).filter((n) => n !== p.author);
    if (shuffled.length < cmts.length) continue; // 풀 부족 (실제론 발생 X)
    const picked = shuffled.slice(0, cmts.length);
    if (samples.length < 8) {
      samples.push({
        postId: p.id, cat: p.category_id, title: p.title, postAuthor: p.author,
        before: cmts.map((c) => c.author),
        after: picked,
      });
    }
    totalReassign += cmts.length;
  }

  console.log(`📋 Dry-run 결과\n`);
  console.log(`  영향 게시글: ${posts.length}개`);
  console.log(`  영향 댓글:   ${totalReassign}개`);
  console.log(`  새 풀 크기:  ${MIXED_POOL.length}개\n`);
  console.log(`  ※ 게시글 작성자(author)는 그대로 유지`);
  console.log(`  ※ 한 게시글 안에서 댓글자끼리/작성자와 중복 X\n`);

  console.log(`--- 변경 샘플 8개 ---\n`);
  for (const s of samples) {
    console.log(`[id=${s.postId} cat=${s.cat}] "${s.title.slice(0, 50)}"`);
    console.log(`  작성자(유지): ${s.postAuthor}`);
    console.log(`  Before 댓글자: ${s.before.join(", ")}`);
    console.log(`  After  댓글자: ${s.after.join(", ")}\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
