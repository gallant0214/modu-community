import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { resolveAudience } from "../../messages/route";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/sms/recipients?segment=active|expiring|expired|all|locker_expired&within_days=
 * 선택한 세그먼트에 해당하는 회원(연락처 보유)을 반환 → 문자 수신자로 일괄 선택.
 *   { members: [{ id, name, phone }] }
 * 권한: messages.send.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);
  if (perms["messages.send"] === false) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }

  const url = new URL(request.url);
  const segment = url.searchParams.get("segment") ?? "";
  const withinDays = Math.max(1, Math.min(60, Number(url.searchParams.get("within_days")) || 7));

  let memberIds: number[] = [];
  if (segment === "locker_expired") {
    memberIds = await resolveLockerExpired(ctx.centerId);
  } else if (["all", "active", "expiring", "expired"].includes(segment)) {
    memberIds = await resolveAudience(ctx.centerId, segment, { within_days: withinDays });
  } else {
    return NextResponse.json({ error: "세그먼트가 잘못됨" }, { status: 400 });
  }

  if (memberIds.length === 0) return NextResponse.json({ members: [] });

  // 연락처 보유 회원만 (문자 발송 대상). 이름순.
  const { data } = await supabase
    .from("crm_members")
    .select("id, name, phone")
    .eq("center_id", ctx.centerId)
    .in("id", memberIds);
  const members = (data ?? [])
    .filter((m) => (m.phone ?? "").replace(/\D/g, "").length >= 9)
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "ko"));

  return NextResponse.json({ members });
}

/** 배정된 락커 중 만료일이 지난(회수 안 된) 회원 ID. 무기한(9999)은 제외. */
async function resolveLockerExpired(centerId: number): Promise<number[]> {
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("crm_lockers")
    .select("assigned_member_id, expires_at")
    .eq("center_id", centerId)
    .not("assigned_member_id", "is", null);
  const ids = new Set<number>();
  for (const l of data ?? []) {
    const exp = (l.expires_at ?? "") as string;
    if (!l.assigned_member_id) continue;
    if (!exp || exp.startsWith("9999")) continue;
    if (exp < today) ids.add(l.assigned_member_id);
  }
  return Array.from(ids);
}
