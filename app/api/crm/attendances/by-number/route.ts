import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/attendances/by-number?no=123
 * 출석번호(attendance_no)로 활성 회원 조회. 터치출석용.
 *
 * 동일 번호가 여러 명이면 전부 반환 → 클라이언트에서 본인 이름 선택.
 * 응답: { members: [{ id, name, phone }] }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const no = (url.searchParams.get("no") || "").trim();
  if (!no) {
    return NextResponse.json({ error: "출석번호를 입력해 주세요" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("crm_members")
    .select("id, name, phone")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .eq("attendance_no", no)
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ members: data ?? [] });
}
