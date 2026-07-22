import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { residentDecrypt } from "@/app/lib/crm-identity";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/staff/[id]/resident
 * 직원의 주민번호 원문을 복호화해서 반환. 조회 정책:
 *  - 본인 (ctx.centerMemberId === 대상 id)
 *  - 대표자 (ctx.role === "owner")
 * 그 외는 403. 성공 시 crm_audit_logs 에 조회 로그 기록.
 * RESIDENT_ENC_KEY 미설정 또는 encrypted 컬럼 미저장이면 404 반환.
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

  // 조회 권한: 본인 또는 대표자
  const isSelf = ctx.centerMemberId === targetId;
  const isOwner = ctx.role === "owner";
  if (!isSelf && !isOwner) {
    return NextResponse.json({ error: "주민번호 조회 권한이 없어요" }, { status: 403 });
  }

  const { data: row, error } = await supabase
    .from("crm_center_members")
    // types 캐시에 아직 없어서 unknown 캐스팅으로 우회. 마이그 실행 후 재생성 시 정리.
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

  const encField = (row as unknown as { resident_encrypted: string | null }).resident_encrypted;
  if (!encField) {
    return NextResponse.json(
      { error: "암호화된 원본이 저장돼 있지 않아요. 다시 입력해 저장해 주세요." },
      { status: 404 }
    );
  }

  const plain = residentDecrypt(encField);
  if (!plain) {
    return NextResponse.json(
      { error: "복호화 실패. 관리자에게 문의해 주세요 (환경변수 확인 필요)." },
      { status: 500 }
    );
  }

  // 감사 로그: 누가 언제 누구의 주민번호를 조회했는지
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "staff.resident.view",
    entity_type: "crm_center_members",
    entity_id: targetId,
    payload: { self: isSelf, viewer_role: ctx.role } as never,
  });

  return NextResponse.json({ resident_no: plain });
}
