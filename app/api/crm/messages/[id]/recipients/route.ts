import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/messages/[id]/recipients
 * 특정 발송(broadcast)의 수신자 목록. 이름·연락처·읽음 여부 포함.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const broadcastId = Number(id) || 0;
  if (!broadcastId) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  // 이 센터의 발송인지 확인 (격리)
  const { data: broadcast } = await supabase
    .from("crm_message_broadcasts")
    .select("id, title, created_at")
    .eq("id", broadcastId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!broadcast) {
    return NextResponse.json({ error: "발송 내역을 찾을 수 없어요" }, { status: 404 });
  }

  const { data: recipients, error } = await supabase
    .from("crm_message_recipients")
    .select("member_id, status, read_at, created_at")
    .eq("broadcast_id", broadcastId)
    .eq("center_id", ctx.centerId)
    .order("created_at", { ascending: true });
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }

  const memberIds = Array.from(
    new Set((recipients ?? []).map((r) => r.member_id).filter((v): v is number => !!v))
  );
  const nameMap = new Map<number, { name: string; phone: string | null }>();
  if (memberIds.length > 0) {
    const { data: members } = await supabase
      .from("crm_members")
      .select("id, name, phone")
      .eq("center_id", ctx.centerId)
      .in("id", memberIds);
    for (const m of members ?? []) nameMap.set(m.id, { name: m.name, phone: m.phone });
  }

  const list = (recipients ?? []).map((r) => ({
    member_id: r.member_id,
    name: nameMap.get(r.member_id)?.name ?? "(알 수 없음)",
    phone: nameMap.get(r.member_id)?.phone ?? null,
    read: r.status === "read",
    read_at: r.read_at,
  }));

  return NextResponse.json({
    broadcast: { id: broadcast.id, title: broadcast.title },
    recipients: list,
  });
}
