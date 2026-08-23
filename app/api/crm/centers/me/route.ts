import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { verifyCenterIdentity } from "@/app/lib/crm-center-verify";

export const dynamic = "force-dynamic";

const PROFILE_COLUMNS =
  "id, name, kind, region_sido, region_sigungu, phone, business_no, address, naver_url, google_url, instagram_id, youtube_url, operating_hours, logo_data_url, status" as unknown as "*";

/**
 * GET /api/crm/centers/me — 센터 프로필 조회 (센터 정보 탭용)
 * 센터 소속 모든 role 접근 가능 (조회만).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_centers")
    .select(PROFILE_COLUMNS)
    .eq("id", ctx.centerId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "센터를 찾을 수 없어요" }, { status: 404 });
  return NextResponse.json({ center: data });
}

/**
 * PATCH /api/crm/centers/me — 센터 프로필 수정
 * 권한: owner 또는 admin 만.
 */
export async function PATCH(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  if (!(await ctxHasPermission(ctx, "settings.edit"))) {
    return NextResponse.json({ error: "센터 설정 권한이 없습니다" }, { status: 403 });
  }

  let body: {
    name?: string;
    phone?: string | null;
    address?: string | null;
    naver_url?: string | null;
    google_url?: string | null;
    instagram_id?: string | null;
    youtube_url?: string | null;
    operating_hours?: string | null;
    /** 사이드바 로고 (data URL png). 빈 문자열/null → 로고 삭제 */
    logo_data_url?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const v = String(body.name).trim();
    if (!v) return NextResponse.json({ error: "센터명을 입력해 주세요" }, { status: 400 });
    patch.name = v;
  }
  const setNullable = (key: string, val: string | null | undefined) => {
    if (val === undefined) return;
    const trimmed = val === null ? "" : String(val).trim();
    patch[key] = trimmed || null;
  };
  setNullable("phone", body.phone ?? undefined);
  setNullable("address", body.address ?? undefined);
  setNullable("naver_url", body.naver_url ?? undefined);
  setNullable("google_url", body.google_url ?? undefined);
  setNullable("instagram_id", (body.instagram_id ?? undefined) ?
    body.instagram_id!.replace(/^@/, "") : body.instagram_id);
  setNullable("youtube_url", body.youtube_url ?? undefined);
  setNullable("operating_hours", body.operating_hours ?? undefined);
  // 로고: data URL(png) 문자열 저장, 빈 값이면 삭제. 과도한 용량 방지(~2MB).
  if (body.logo_data_url !== undefined) {
    const v = body.logo_data_url === null ? "" : String(body.logo_data_url).trim();
    if (v && !v.startsWith("data:image/")) {
      return NextResponse.json({ error: "로고 이미지 형식이 올바르지 않습니다" }, { status: 400 });
    }
    if (v.length > 2_000_000) {
      return NextResponse.json({ error: "로고 이미지 용량이 너무 큽니다" }, { status: 400 });
    }
    patch.logo_data_url = v || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 항목이 없습니다" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_centers")
    .update(patch as never)
    .eq("id", ctx.centerId);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }

  // 감사 로그: 로고 data URL 은 용량이 커서 값 대신 변경 여부만 기록
  const auditPayload = { ...patch } as Record<string, unknown>;
  if ("logo_data_url" in auditPayload) {
    auditPayload.logo_data_url = auditPayload.logo_data_url ? "(변경됨)" : "(삭제됨)";
  }
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "center.profile.update",
    entity_type: "crm_centers",
    entity_id: ctx.centerId,
    payload: auditPayload as never,
  });

  return NextResponse.json({ ok: true });
}

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
    .select("id, owner_uid, business_no")
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

  // 본인 확인: 센터명·대표자명·대표자 휴대폰·사업자번호·대표자 주민번호 전부 일치해야 함
  let body: {
    center_name?: string;
    owner_name?: string;
    owner_phone?: string;
    business_no?: string;
    resident_no?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    /* 아래 검증에서 차단 */
  }
  const verifyError = await verifyCenterIdentity(ctx.centerId, ctx.uid, body);
  if (verifyError) {
    return NextResponse.json({ error: verifyError }, { status: 400 });
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
