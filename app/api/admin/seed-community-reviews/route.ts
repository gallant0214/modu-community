import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/app/lib/supabase";
import { invalidateCache } from "@/app/lib/cache";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

async function flushCommunityCache(categoryIds: number[]) {
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache("categories:*").catch(() => {});
  revalidatePath("/");
  revalidatePath("/community");
  for (const id of categoryIds) revalidatePath(`/category/${id}`);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!(await verifyAdminPassword(body.password))) {
      return NextResponse.json({ success: false, error: "Invalid password" }, { status: 401 });
    }

    if (body.cacheOnly) {
      await flushCommunityCache([1]);
      return NextResponse.json({ success: true, cacheOnly: true, categoryIds: [1] });
    }

    return NextResponse.json({
      success: false,
      error: "Use local tsx script for seeding (cacheOnly:true for cache flush only)",
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
