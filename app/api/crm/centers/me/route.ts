import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/crm/centers/me — 센터 탈퇴 (영구 삭제)
 *
 * 권한: 센터의 원조 대표자(crm_centers.owner_uid) 본인만.
 *  - role='owner' 이라도 owner_uid 가 본인이 아니면 차단 (다중 대표자 보호)
 *
 * 모든 child 테이블은 ON DELETE CASCADE 로 자동 삭제:
 *  - crm_center_members / crm_trainer_permissions
 *  - crm_members
 *  - crm_passes
 *  - crm_reservations
 *  - crm_payout_rules
 *  - crm_center_settings
 *  - crm_audit_logs
 *
 * 멤버 본인이 해당 센터의 다른 사용자로 가입한 경우엔 그쪽도 함께 사라짐.
 */
export async function DELETE(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "대표자만 센터를 탈퇴할 수 있습니다" },
      { status: 403 }
    );
  }

  // 원조 대표자(owner_uid) 본인이 맞는지 확인
  const { data: center } = await supabase
    .from("crm_centers")
    .select("id, owner_uid")
    .eq("id", ctx.centerId)
    .maybeSingle();

  if (!center) {
    return NextResponse.json({ error: "센터를 찾을 수 없습니다" }, { status: 404 });
  }
  if (center.owner_uid !== ctx.uid) {
    return NextResponse.json(
      { error: "센터를 처음 등록한 대표자만 탈퇴할 수 있습니다" },
      { status: 403 }
    );
  }

  const { error } = await supabase
    .from("crm_centers")
    .delete()
    .eq("id", ctx.centerId);

  if (error) {
    return NextResponse.json({ error: "탈퇴 실패", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
