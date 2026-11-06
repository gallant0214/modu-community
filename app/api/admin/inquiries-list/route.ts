import { NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { loadEnrichedInquiries } from "@/app/lib/admin-data";

export const dynamic = "force-dynamic";

// POST /api/admin/inquiries-list — 문의 목록 + 작성자 현재 닉네임/이메일 보강
// body: { password }
export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  const adminErr = await verifyAdmin(req, password);
  if (adminErr) return adminErr;
  try {
    const inquiries = await loadEnrichedInquiries();
    return NextResponse.json({ inquiries });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "문의 목록을 불러올 수 없습니다" }, { status: 500 });
  }
}
