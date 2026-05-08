import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolve } from "node:path";
import { REGION_GROUPS } from "../app/lib/region-data";

config({ path: resolve(process.cwd(), ".env.local") });

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// 22차 등 기존 시드 분포 따라 가중치 부여 (서울 5, 경기 6, 부산 3, 인천 3, 대구 2, 대전 2, 광주 2, 세종 1, 지방 1~2)
const WEIGHTS: Record<string, number> = {
  서울특별시: 5,
  경기도: 6,
  부산광역시: 3,
  인천광역시: 3,
  대구광역시: 2,
  대전광역시: 2,
  광주광역시: 2,
  울산광역시: 1,
  세종특별자치시: 1,
  강원도: 1,
  충청북도: 1,
  충청남도: 1,
  전라북도: 1,
  전라남도: 1,
  경상북도: 1,
  경상남도: 2,
  제주특별자치도: 1,
};

function pickRegion(): string {
  const total = REGION_GROUPS.reduce((s, g) => s + (WEIGHTS[g.name] ?? 1), 0);
  let r = Math.random() * total;
  for (const g of REGION_GROUPS) {
    r -= WEIGHTS[g.name] ?? 1;
    if (r <= 0) {
      const sub = g.subRegions[Math.floor(Math.random() * g.subRegions.length)];
      return `${g.name} - ${sub.name}`;
    }
  }
  const last = REGION_GROUPS[REGION_GROUPS.length - 1];
  const sub = last.subRegions[Math.floor(Math.random() * last.subRegions.length)];
  return `${last.name} - ${sub.name}`;
}

async function main() {
  const { data: posts, error } = await supabase
    .from("posts")
    .select("id, region")
    .eq("password", "__seed_community__")
    .eq("ip_address", "seed_community")
    .gte("id", 1618)
    .lte("id", 1637)
    .order("id");

  if (error || !posts) {
    throw new Error(`fetch failed: ${error?.message}`);
  }

  console.log(`27차 시드 글 ${posts.length}개 region 업데이트 시작`);
  for (const p of posts) {
    const newRegion = pickRegion();
    const { error: updErr } = await supabase
      .from("posts")
      .update({ region: newRegion })
      .eq("id", p.id);
    if (updErr) {
      console.error(`❌ post ${p.id} update failed: ${updErr.message}`);
      continue;
    }
    console.log(`✓ post ${p.id}: "${p.region}" -> "${newRegion}"`);
  }
  console.log("\n=== 완료 ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
