import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

const MEMBER_TYPES = ["provisional", "full", "matched"] as const;
const GENDERS = ["M", "F", "N"] as const;

/**
 * GET /api/crm/members?q=&limit=
 *
 * 본인 센터의 회원 목록.
 * trainer/manager 는 본인이 담당(crm_passes.trainer_member_id)인 회원만.
 * owner/admin 은 센터 전체.
 *
 * [[feedback-crm-data-isolation]] 적용.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 1), 200);

  let allowedMemberIds: number[] | null = null;
  if (ctx.role === "trainer" || ctx.role === "manager") {
    const { data: passes } = await supabase
      .from("crm_passes")
      .select("member_id")
      .eq("center_id", ctx.centerId)
      .eq("trainer_member_id", ctx.centerMemberId);
    allowedMemberIds = Array.from(new Set((passes ?? []).map((p) => p.member_id)));
    if (allowedMemberIds.length === 0) {
      return NextResponse.json({ members: [] });
    }
  }

  let query = supabase
    .from("crm_members")
    .select(
      "id, member_type, name, phone, email, birth, gender, linked_firebase_uid, memo, status, created_at"
    )
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (allowedMemberIds) query = query.in("id", allowedMemberIds);
  if (q) {
    // name 또는 phone LIKE 매칭
    query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ members: data ?? [] });
}

/**
 * POST /api/crm/members
 *
 * 회원 등록 (3종):
 *   - provisional (가회원): name + phone 만, linked_firebase_uid 없이
 *   - full (정회원): 가입대행 — 별도 인증 시스템이 필요. 1차 v1 에선 provisional 과 동일하게 처리하되 type 만 다름
 *   - matched (매칭회원): linked_firebase_uid 필수 (기존 moducm 사용자)
 *
 * owner/admin 만 진입 (trainer/manager 는 본인 회원 등록 불가).
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: {
    member_type?: string;
    name?: string;
    phone?: string;
    email?: string;
    birth?: string;
    gender?: string;
    linked_firebase_uid?: string;
    memo?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberType = body.member_type;
  if (!memberType || !MEMBER_TYPES.includes(memberType as (typeof MEMBER_TYPES)[number])) {
    return NextResponse.json({ error: "회원 유형이 잘못됨" }, { status: 400 });
  }
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
  const phone = body.phone?.trim();
  if (!phone) return NextResponse.json({ error: "연락처를 입력해주세요" }, { status: 400 });

  if ((memberType === "matched" || memberType === "full") && !body.linked_firebase_uid) {
    return NextResponse.json({ error: "정회원/매칭회원은 사용자 식별자가 필요합니다" }, { status: 400 });
  }

  const insert = {
    center_id: ctx.centerId,
    member_type: memberType,
    name,
    phone,
    email: body.email?.trim() || null,
    birth: body.birth || null,
    gender:
      body.gender && GENDERS.includes(body.gender as (typeof GENDERS)[number])
        ? body.gender
        : null,
    linked_firebase_uid: body.linked_firebase_uid || null,
    memo: body.memo?.trim() || null,
    status: "active" as const,
  };

  const { data, error } = await supabase
    .from("crm_members")
    .insert(insert)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "등록 실패", detail: error?.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "member.create",
    entity_type: "member",
    entity_id: data.id,
    payload: { member_type: memberType, name } as never,
  });

  return NextResponse.json({ ok: true, memberId: data.id });
}
