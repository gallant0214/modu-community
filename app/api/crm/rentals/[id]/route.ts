import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";

export const dynamic = "force-dynamic";

const PAYMENT_METHODS = ["cash", "card", "transfer", "etc"];

/**
 * PATCH /api/crm/rentals/[id] — 대여권 결제 상세 수정.
 * 금액·할인·부가세·결제수단·담당자·기간 편집은 sales.edit 권한 필요.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const rid = Number(id);
  if (!rid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  // 현재 값 로드 (센터 격리 + status 재계산용 + 락커 sync 판별용)
  const { data: current } = await supabase
    .from("crm_rentals")
    .select("status, expires_at, member_id, item_name, memo")
    .eq("id", rid)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "대여권을 찾을 수 없습니다" }, { status: 404 });

  let body: {
    expires_at?: string;
    start_date?: string;
    memo?: string;
    price_won?: number;
    discount_won?: number;
    vat_included?: boolean;
    payment_method?: string;
    payment_method_custom?: string;
    seller_member_id?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const touchesPayment =
    body.price_won !== undefined ||
    body.discount_won !== undefined ||
    body.vat_included !== undefined ||
    body.payment_method !== undefined ||
    body.seller_member_id !== undefined ||
    body.start_date !== undefined;
  if (touchesPayment) {
    const perms = await loadPermissionsForContext(ctx);
    if (!perms["sales.edit"]) {
      return NextResponse.json({ error: "결제 수정 권한이 없습니다" }, { status: 403 });
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.expires_at) patch.expires_at = body.expires_at;
  if (body.start_date) patch.start_date = body.start_date;
  if (body.memo !== undefined) patch.memo = body.memo?.trim() || null;
  if (body.price_won !== undefined) patch.price_won = Math.max(0, Math.floor(Number(body.price_won) || 0));
  if (body.discount_won !== undefined) patch.discount_won = Math.max(0, Math.floor(Number(body.discount_won) || 0));
  if (body.vat_included !== undefined) patch.vat_included = !!body.vat_included;
  if (body.payment_method !== undefined) {
    if (!PAYMENT_METHODS.includes(body.payment_method)) {
      return NextResponse.json({ error: "결제 수단이 잘못됨" }, { status: 400 });
    }
    patch.payment_method = body.payment_method;
    patch.payment_method_custom =
      body.payment_method === "etc" ? body.payment_method_custom?.trim() || null : null;
  }
  if (body.seller_member_id !== undefined && Number(body.seller_member_id) > 0) {
    patch.seller_member_id = Number(body.seller_member_id);
  }
  // 유효기간 변경 시 status 재계산 (기간제: 만료일 기준. 환불은 유지).
  const cr = current as { status: string; expires_at: string | null };
  if (cr.status !== "refunded" && patch.expires_at !== undefined) {
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const eff = patch.expires_at as string;
    patch.status = !eff || String(eff).slice(0, 10) >= today ? "valid" : "expired";
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_rentals")
    .update(patch as never)
    .eq("id", rid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  // 락커 대여권이면 물리 락커(crm_lockers) 시작/만료일도 자동 동기화.
  // 대여권만 수정되고 락커 배정 정보가 어긋나는 사고를 원천 차단.
  if (patch.start_date !== undefined || patch.expires_at !== undefined) {
    const cr2 = current as {
      member_id: number | null;
      item_name: string | null;
      memo: string | null;
    };
    const itemName = (cr2.item_name ?? "").trim();
    const memo = cr2.memo ?? "";
    const looksLikeLocker =
      /^(락커|상가)/.test(itemName) ||
      memo.includes("락커") ||
      /\d+번/.test(memo) ||
      memo.includes("미배정");
    if (looksLikeLocker && cr2.member_id) {
      const { data: assigned } = await supabase
        .from("crm_lockers")
        .select("id, number, crm_locker_zones!inner(name)")
        .eq("assigned_member_id", cr2.member_id)
        .eq("center_id", ctx.centerId)
        .eq("state", "assigned");
      const list = (assigned ?? []) as unknown as {
        id: number;
        number: number;
        crm_locker_zones: { name: string };
      }[];
      // memo 라벨(예: '여자탈의실 35번') 매칭 우선. 배정 락커가 1개면 그것으로 폴백.
      const matched = list.filter((l) =>
        memo.includes(`${l.crm_locker_zones.name} ${l.number}번`)
      );
      const target =
        matched.length === 1
          ? matched[0]
          : matched.length === 0 && list.length === 1
            ? list[0]
            : null;
      if (target) {
        const lPatch: Record<string, unknown> = {};
        if (patch.start_date !== undefined) lPatch.start_date = patch.start_date;
        if (patch.expires_at !== undefined) lPatch.expires_at = patch.expires_at;
        if (Object.keys(lPatch).length > 0) {
          await supabase
            .from("crm_lockers")
            .update(lPatch as never)
            .eq("id", target.id)
            .eq("center_id", ctx.centerId);
        }
      }
    }
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "rental.update",
    entity_type: "crm_rentals",
    entity_id: rid,
    payload: patch as never,
  });

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/crm/rentals/[id] — 대여권 환불 처리 (status='refunded').
 * sales.refund 권한 필요 (설정 > 권한에서 부여).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const perms = await loadPermissionsForContext(ctx);
  if (!perms["sales.refund"]) {
    return NextResponse.json({ error: "대여권 환불 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const rid = Number(id);
  if (!rid) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const { error } = await supabase
    .from("crm_rentals")
    .update({ status: "refunded" } as never)
    .eq("id", rid)
    .eq("center_id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "환불 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "rental.refund",
    entity_type: "crm_rentals",
    entity_id: rid,
    payload: null,
  });

  return NextResponse.json({ ok: true });
}
