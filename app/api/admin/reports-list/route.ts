import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { loadEnrichedReports } from "@/app/lib/admin-data";

export const dynamic = "force-dynamic";

// POST /api/admin/reports-list — 신고 목록 + 신고자/작성자 닉네임·이메일 보강
// body: { password }
export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (!(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }
  try {
    const reports = await loadEnrichedReports();
    return NextResponse.json({ reports });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "신고 목록을 불러올 수 없습니다" }, { status: 500 });
  }
}
