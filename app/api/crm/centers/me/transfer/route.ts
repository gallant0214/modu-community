import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { getFirebaseAdmin } from "@/app/lib/firebase-admin";
import { getAuth } from "firebase-admin/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/centers/me/transfer
 * body: { firebase_uid }
 *
 * 센터 운영권 양도. 원조 대표자(crm_centers.owner_uid = 본인) 만 가능.
 *
 * 처리 순서:
 *  1) 대상 사용자가 nicknames 에 존재해야 함 (모두의 지도사 가입자)
 *  2) 대상의 멤버십 upsert: role='owner', status='active'
 *  3) 본인 멤버십 → role='admin' (강등). access_level 은 admin 유지.
 *  4) crm_centers.owner_uid 를 대상 firebase_uid 로 업데이트
 *  5) 감사 로그
 *
 * 양도 후 본인은 admin 으로 남아 데이터 접근은 가능하지만,
 * 추후 탈퇴/퇴사 처리는 본인이 직접 결정.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  if (ctx.role !== "owner") {
    return NextResponse.json(
      { error: "대표자만 센터를 양도할 수 있습니다" },
      { status: 403 }
    );
  }

  // 원조 대표자 확인 (다중 owner 보호)
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
      { error: "센터를 처음 등록한 대표자만 양도할 수 있습니다" },
      { status: 403 }
    );
  }

  let body: { firebase_uid?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const targetUid = body.firebase_uid?.trim();
  if (!targetUid) {
    return NextResponse.json({ error: "양도 받을 사용자를 선택해 주세요" }, { status: 400 });
  }
  if (targetUid === ctx.uid) {
    return NextResponse.json({ error: "본인에게는 양도할 수 없습니다" }, { status: 400 });
  }

  // 대상 사용자 검증
  const { data: nick } = await supabase
    .from("nicknames")
    .select("name")
    .eq("firebase_uid", targetUid)
    .maybeSingle();
  if (!nick) {
    return NextResponse.json(
      { error: "양도 받을 사용자를 찾을 수 없습니다" },
      { status: 404 }
    );
  }

  // Firebase Auth 이메일 조회 (멤버십 row 표시용)
  let targetEmail: string | null = null;
  try {
    const fbUser = await getAuth(getFirebaseAdmin()).getUser(targetUid);
    targetEmail = fbUser.email ?? null;
  } catch {
    // 이메일 조회 실패는 치명적 아님
  }

  // 1) 대상의 멤버십 upsert
  const { data: existing } = await supabase
    .from("crm_center_members")
    .select("id, status")
    .eq("center_id", ctx.centerId)
    .eq("firebase_uid", targetUid)
    .maybeSingle();

  if (existing) {
    const { error: upErr } = await supabase
      .from("crm_center_members")
      .update({
        role: "owner",
        status: "active",
        access_level: "admin",
        left_at: null,
      } as never)
      .eq("id", existing.id);
    if (upErr) {
      return NextResponse.json(
        { error: "대상 멤버 갱신 실패", detail: upErr.message },
        { status: 500 }
      );
    }
  } else {
    const { error: insErr } = await supabase.from("crm_center_members").insert({
      center_id: ctx.centerId,
      firebase_uid: targetUid,
      role: "owner",
      display_name: nick.name,
      email: targetEmail,
      access_level: "admin",
      is_solo_owner: false,
      status: "active",
    });
    if (insErr) {
      return NextResponse.json(
        { error: "대상 멤버 등록 실패", detail: insErr.message },
        { status: 500 }
      );
    }
  }

  // 2) 본인 → admin 강등
  const { error: demoteErr } = await supabase
    .from("crm_center_members")
    .update({ role: "admin" } as never)
    .eq("id", ctx.centerMemberId);
  if (demoteErr) {
    return NextResponse.json(
      { error: "권한 변경 실패", detail: demoteErr.message },
      { status: 500 }
    );
  }

  // 3) centers.owner_uid 업데이트
  const { error: ownerErr } = await supabase
    .from("crm_centers")
    .update({ owner_uid: targetUid } as never)
    .eq("id", ctx.centerId);
  if (ownerErr) {
    return NextResponse.json(
      { error: "센터 대표자 변경 실패", detail: ownerErr.message },
      { status: 500 }
    );
  }

  // 4) 감사 로그
  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "center.transfer",
    entity_type: "crm_centers",
    entity_id: ctx.centerId,
    payload: { to: targetUid, to_name: nick.name } as never,
  });

  return NextResponse.json({
    ok: true,
    newOwnerName: nick.name,
  });
}
