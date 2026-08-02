import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireMemberForCenter, isMemberError } from "@/app/lib/member-auth";
import { digitsOnly } from "@/app/lib/crm-identity";

export const dynamic = "force-dynamic";

function hyphenPhone(d: string): string {
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

/**
 * GET /api/crm/member-app/profile?centerId=
 * 내 회원 상세 정보 (이름/생년월일/전화/이메일/주소).
 */
export async function GET(request: Request) {
  const centerId = Number(new URL(request.url).searchParams.get("centerId"));
  const ctx = await requireMemberForCenter(request, centerId);
  if (isMemberError(ctx)) return ctx;

  const { data } = await supabase
    .from("crm_members")
    .select("id, name, birth, phone, email, address, gender")
    .eq("id", ctx.memberId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: "회원 정보를 찾을 수 없습니다" }, { status: 404 });

  return NextResponse.json({
    profile: {
      id: data.id,
      name: data.name,
      birth: data.birth,
      phone: data.phone,
      email: data.email,
      address: data.address,
      gender: data.gender,
    },
  });
}

/**
 * PATCH /api/crm/member-app/profile  { centerId, name?, birth?, phone?, email?, address? }
 * 본인 회원 정보 수정. 넘어온 필드만 갱신.
 */
export async function PATCH(request: Request) {
  let body: {
    centerId?: number;
    name?: string;
    birth?: string | null;
    phone?: string;
    email?: string | null;
    address?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const ctx = await requireMemberForCenter(request, Number(body.centerId));
  if (isMemberError(ctx)) return ctx;

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const n = (body.name ?? "").trim();
    if (!n) return NextResponse.json({ error: "이름을 입력해주세요" }, { status: 400 });
    patch.name = n;
  }
  if (body.phone !== undefined) {
    const d = digitsOnly(body.phone);
    if (d.length < 10) return NextResponse.json({ error: "연락처를 정확히 입력해주세요" }, { status: 400 });
    patch.phone = hyphenPhone(d);
  }
  if (body.birth !== undefined) {
    const b = body.birth;
    if (b && !/^\d{4}-\d{2}-\d{2}$/.test(b)) {
      return NextResponse.json({ error: "생년월일 형식이 올바르지 않아요" }, { status: 400 });
    }
    patch.birth = b || null;
  }
  if (body.email !== undefined) {
    const e = (body.email ?? "").trim();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return NextResponse.json({ error: "이메일 형식이 올바르지 않아요" }, { status: 400 });
    }
    patch.email = e || null;
  }
  if (body.address !== undefined) {
    patch.address = (body.address ?? "").trim() || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "변경할 내용이 없어요" }, { status: 400 });
  }

  const { error } = await supabase
    .from("crm_members")
    .update(patch as never)
    .eq("id", ctx.memberId)
    .eq("center_id", ctx.centerId)
    .eq("linked_firebase_uid", ctx.uid);
  if (error) {
    return NextResponse.json({ error: "수정 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
