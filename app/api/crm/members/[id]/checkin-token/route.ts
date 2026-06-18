import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/members/[id]/checkin-token
 * 회원의 체크인 토큰 조회 (없으면 자동 생성).
 *
 * POST /api/crm/members/[id]/checkin-token
 * 토큰 새로 발급 (회원이 분실/도용 의심 시).
 */

async function ensureToken(centerId: number, memberId: number): Promise<string | null> {
  const { data } = await supabase
    .from("crm_members")
    .select("checkin_token")
    .eq("id", memberId)
    .eq("center_id", centerId)
    .maybeSingle();
  if (!data) return null;
  if (data.checkin_token) return data.checkin_token;

  const token = crypto.randomBytes(8).toString("hex");
  await supabase
    .from("crm_members")
    .update({ checkin_token: token } as never)
    .eq("id", memberId);
  return token;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const token = await ensureToken(ctx.centerId, memberId);
  if (!token) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json({ token });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const newToken = crypto.randomBytes(8).toString("hex");
  const { error } = await supabase
    .from("crm_members")
    .update({ checkin_token: newToken } as never)
    .eq("id", memberId)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "재발급 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ token: newToken });
}
