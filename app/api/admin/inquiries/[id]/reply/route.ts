import { sql } from "@/app/lib/db";
import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { sanitize, validateLength } from "@/app/lib/security";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { password, reply } = body;

  const authError = await verifyAdmin(request, password);
  if (authError) return authError;

  if (!reply?.trim()) {
    return NextResponse.json({ error: "답글 내용을 입력해주세요" }, { status: 400 });
  }

  await sql`UPDATE inquiries SET reply = ${sanitize(validateLength(reply.trim(), 5000))}, replied_at = NOW() WHERE id = ${Number(id)}`;
  return NextResponse.json({ success: true });
}
