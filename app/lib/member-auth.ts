import "server-only";
import { NextResponse } from "next/server";
import { verifyAuth } from "./firebase-admin";
import { supabase } from "./supabase";

/**
 * 회원 앱(모두의 회원) 인증 컨텍스트.
 *
 * 직원용 [[crm-auth]] (requireCrmContext) 과 별개 — 회원은 crm_center_members 가 아니라
 * crm_members.linked_firebase_uid 로 식별한다.
 *
 * 연동 방식(v1): 구글/애플 Firebase 로그인 → 전화번호로 crm_members 를 찾아
 * linked_firebase_uid 를 채워 연결(POST /api/member/link).
 * 추후: 초대 링크 딥링크로 자동 연동 예정.
 *
 * 한 회원이 여러 센터에 등록돼 있을 수 있으나 v1 은 센터 전환 UI 가 없으므로
 * 최신 등록 1건을 활성 컨텍스트로 선택한다.
 */
export interface MemberContext {
  uid: string;
  memberId: number;
  centerId: number;
  centerName: string;
  name: string;
  phone: string;
}

/** 아직 어떤 센터에도 연동되지 않은 로그인 사용자 */
export const MEMBER_NOT_LINKED = "MEMBER_NOT_LINKED";

export async function requireMemberContext(
  request: Request
): Promise<NextResponse | MemberContext> {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("crm_members")
    .select("id, center_id, name, phone, status, created_at")
    .eq("linked_firebase_uid", user.uid)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "DB 오류", detail: error.message }, { status: 500 });
  }

  const member = rows?.[0];
  if (!member) {
    // 로그인은 됐지만 센터 연동 전 — 앱에서 전화번호 연동 온보딩으로 유도
    return NextResponse.json({ error: MEMBER_NOT_LINKED }, { status: 409 });
  }

  const { data: center } = await supabase
    .from("crm_centers")
    .select("name")
    .eq("id", member.center_id)
    .maybeSingle();

  return {
    uid: user.uid,
    memberId: member.id,
    centerId: member.center_id,
    centerName: center?.name ?? "",
    name: member.name,
    phone: member.phone ?? "",
  };
}

export function isMemberError(
  ctx: NextResponse | MemberContext
): ctx is NextResponse {
  return ctx instanceof NextResponse;
}

export interface LinkedMemberCenter {
  memberId: number;
  centerId: number;
  centerName: string;
  name: string;
  phone: string;
}

/**
 * 로그인 사용자가 연동된 모든 (센터 x 회원) 목록. 회원 앱 bootstrap 용.
 * 한 사람이 여러 센터에 회원으로 등록돼 있을 수 있어 배열로 반환한다.
 */
export async function listLinkedMembers(
  request: Request
): Promise<NextResponse | LinkedMemberCenter[]> {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const { data: rows, error } = await supabase
    .from("crm_members")
    .select("id, center_id, name, phone, created_at")
    .eq("linked_firebase_uid", user.uid)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: "DB 오류", detail: error.message }, { status: 500 });
  }

  const members = rows ?? [];
  if (members.length === 0) return [];

  const centerIds = Array.from(new Set(members.map((m) => m.center_id)));
  const { data: centers } = await supabase
    .from("crm_centers")
    .select("id, name")
    .in("id", centerIds);
  const nameMap = new Map((centers ?? []).map((c) => [c.id, c.name]));

  return members.map((m) => ({
    memberId: m.id,
    centerId: m.center_id,
    centerName: nameMap.get(m.center_id) ?? "",
    name: m.name,
    phone: m.phone ?? "",
  }));
}

/**
 * 특정 센터에 대한 회원 컨텍스트. 회원 앱의 대부분 엔드포인트가 ?centerId= 로 호출.
 * 해당 센터에 이 사용자와 연동된 회원이 없으면 403.
 */
export async function requireMemberForCenter(
  request: Request,
  centerId: number
): Promise<NextResponse | MemberContext> {
  const user = await verifyAuth(request);
  if (!user) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  if (!centerId || Number.isNaN(centerId)) {
    return NextResponse.json({ error: "센터를 선택해주세요" }, { status: 400 });
  }

  const { data: member, error } = await supabase
    .from("crm_members")
    .select("id, center_id, name, phone")
    .eq("linked_firebase_uid", user.uid)
    .eq("center_id", centerId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "DB 오류", detail: error.message }, { status: 500 });
  }
  if (!member) {
    return NextResponse.json({ error: "이 센터에 연결된 회원 정보가 없어요" }, { status: 403 });
  }

  const { data: center } = await supabase
    .from("crm_centers")
    .select("name")
    .eq("id", centerId)
    .maybeSingle();

  return {
    uid: user.uid,
    memberId: member.id,
    centerId: member.center_id,
    centerName: center?.name ?? "",
    name: member.name,
    phone: member.phone ?? "",
  };
}
