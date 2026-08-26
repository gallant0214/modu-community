import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { residentDecrypt } from "@/app/lib/crm-identity";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/staff/[id]/resident
 * 직원의 주민번호 원문 반환. 조회 정책:
 *  - 본인 (ctx.centerMemberId === 대상 id)
 *  - 대표자 (ctx.role === "owner")
 * 그 외는 403. 성공 시 crm_audit_logs 에 조회 로그 기록.
 * 저장된 원본이 없으면 404 (재입력 필요).
 *
 * 저장 방식: crm_center_members.resident_encrypted 에 평문 문자열 그대로 저장.
 * (컬럼명은 마이그 이력상 이름만 encrypted, 실제 데이터는 평문)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const { id } = await params;
  const targetId = Number(id);
  if (!Number.isFinite(targetId) || targetId <= 0) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const isSelf = ctx.centerMemberId === targetId;
  const isOwner = ctx.role === "owner";
  if (!isSelf && !isOwner) {
    return NextResponse.json({ error: "주민번호 조회 권한이 없어요" }, { status: 403 });
  }

  const { data: row, error } = await supabase
    .from("crm_center_members")
    // types 캐시에 아직 없어서 unknown 캐스팅으로 우회
    .select("id, resident_encrypted" as unknown as "*")
    .eq("id", targetId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "직원을 찾을 수 없어요" }, { status: 404 });
  }

  const stored = (row as unknown as { resident_encrypted: string | null }).resident_encrypted;
  if (!stored) {
    return NextResponse.json(
      { error: "저장된 주민번호가 없어요. 오른쪽 [변경] 버튼으로 입력해 주세요." },
      { status: 404 }
    );
  }

  // H4: 암호문(AES-GCM hex) 우선 복호화. 실패 시 레거시 평문(13자리)만 하위호환 처리.
  let digits = residentDecrypt(stored);
  if (!digits) {
    const legacy = stored.replace(/[^0-9]/g, "");
    digits = legacy.length === 13 ? legacy : null;
  }
  if (!digits || digits.length !== 13) {
    return NextResponse.json(
      { error: "주민번호를 복호화할 수 없어요. 서버 암호화 키(RESIDENT_ENC_KEY) 설정을 확인해 주세요." },
      { status: 500 }
    );
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "staff.resident.view",
    entity_type: "crm_center_members",
    entity_id: targetId,
    payload: { self: isSelf, viewer_role: ctx.role } as never,
  });

  return NextResponse.json({ resident_no: digits });
}
