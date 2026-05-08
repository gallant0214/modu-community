import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { invalidateCache } from "@/app/lib/cache";
import { verifyAdminPassword } from "@/app/lib/admin-auth";

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!(await verifyAdminPassword(body.password))) {
    return NextResponse.json({ success: false }, { status: 401 });
  }
  await invalidateCache("posts:*").catch(() => {});
  await invalidateCache("categories:*").catch(() => {});
  revalidatePath("/");
  revalidatePath("/community");
  revalidatePath("/category/1");
  revalidatePath("/category/5");
  return NextResponse.json({ success: true });
}
