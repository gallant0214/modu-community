import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { invalidateCache } from "@/app/lib/cache";

async function flushCommunityCache(categoryIds: number[]) {
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache("categories:*").catch(() => {});
  revalidatePath("/");
  revalidatePath("/community");
  for (const id of categoryIds) revalidatePath(`/category/${id}`);
}

export async function POST(req: NextRequest) {
  const { password, cacheOnly } = await req.json().catch(() => ({}));
  const ok = await verifyAdminPassword(password);
  if (!ok) {
    return NextResponse.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 401 });
  }

  if (cacheOnly) {
    await flushCommunityCache([5]);
    return NextResponse.json({ success: true, cacheOnly: true });
  }

  return NextResponse.json({ error: "Use local script for 31차 seed." }, { status: 400 });
}
