// 기존 회원 얼굴 사진 썸네일을 face_image_data(360px)에서 고화질 144px 로 재생성.
// 실행: npx tsx scripts/regen-face-thumbs.ts
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 없음");
  process.exit(1);
}
const supabase = createClient(url, key);

const THUMB = 144;
const CENTER_ID = 1;

function stripDataUrl(dataUrl: string): Buffer | null {
  const m = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!m) return null;
  return Buffer.from(m[1], "base64");
}

async function main() {
  const { data: rows, error } = await supabase
    .from("crm_members")
    .select("id, name, face_image_data")
    .eq("center_id", CENTER_ID)
    .not("face_image_data", "is", null);
  if (error) {
    console.error("조회 실패:", error.message);
    process.exit(1);
  }
  console.log(`대상: ${rows?.length ?? 0}명`);

  let ok = 0;
  let skip = 0;
  let fail = 0;
  for (const r of rows ?? []) {
    const buf = stripDataUrl(r.face_image_data as string);
    if (!buf) {
      skip++;
      continue;
    }
    try {
      const out = await sharp(buf)
        .resize(THUMB, THUMB, { fit: "cover", position: "centre" })
        .jpeg({ quality: 90 })
        .toBuffer();
      const thumb = `data:image/jpeg;base64,${out.toString("base64")}`;
      const { error: updErr } = await supabase
        .from("crm_members")
        .update({ face_image_thumb: thumb })
        .eq("id", r.id)
        .eq("center_id", CENTER_ID);
      if (updErr) {
        console.error(`  [${r.id}] ${r.name} 업데이트 실패:`, updErr.message);
        fail++;
      } else {
        ok++;
        if (ok % 20 === 0) console.log(`  ...${ok}건 완료`);
      }
    } catch (e) {
      console.error(`  [${r.id}] ${r.name} 처리 실패:`, e instanceof Error ? e.message : e);
      fail++;
    }
  }
  console.log(`완료 — 성공 ${ok}, 스킵 ${skip}, 실패 ${fail}`);
}

main().then(() => process.exit(0));
