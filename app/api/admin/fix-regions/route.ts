import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { REGION_GROUPS } from "@/app/lib/region-data";

export const dynamic = "force-dynamic";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 짧은 지역명 → 실제 REGION_GROUPS code 매핑
const shortNameToCode: Record<string, string> = {
  서울: "SEOUL",
  경기: "GYEONGGI",
  부산: "BUSAN",
  인천: "INCHEON",
  대구: "DAEGU",
  대전: "DAEJEON",
  광주: "GWANGJU",
  울산: "ULSAN",
  세종: "SEJONG",
  경남: "GYEONGNAM",
  경북: "GYEONGBUK",
  충남: "CHUNGNAM",
  충북: "CHUNGBUK",
  전남: "JEONNAM",
  전북: "JEONBUK",
  강원: "GANGWON",
  제주: "JEJU",
};

export async function POST(request: Request) {
  const { password } = await request.json().catch(() => ({ password: "" }));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json(
      { error: "관리자 비밀번호가 일치하지 않습니다" },
      { status: 403 }
    );
  }

  // 짧은 지역명(예: "서울", "경기")으로 저장된 게시글 찾기
  const shortNames = Object.keys(shortNameToCode);
  let updated = 0;

  for (const shortName of shortNames) {
    const { data: posts } = await supabase
      .from("posts")
      .select("id")
      .eq("region", shortName);

    for (const post of posts || []) {
      const code = shortNameToCode[shortName];
      const group = REGION_GROUPS.find((g) => g.code === code);
      if (!group) continue;

      const sub = pick(group.subRegions);
      const fullRegion = `${group.name} - ${sub.name}`;

      await supabase.from("posts").update({ region: fullRegion }).eq("id", post.id);
      updated++;
    }
  }

  return NextResponse.json({ success: true, updated });
}
