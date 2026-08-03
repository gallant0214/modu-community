import { NextResponse, after } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { notifyCenterMembers } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/notices — 센터 공지사항 목록 (최신순). admin.
 * 추후 회원 전용 앱은 status='active' AND is_published 인 공지를 별도 조회.
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  const { data, error } = await supabase
    .from("crm_center_notices")
    .select("id, title, body, is_published, created_at, updated_at")
    .eq("center_id", ctx.centerId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "조회 실패", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ notices: data ?? [] });
}

/**
 * POST /api/crm/notices — 공지 추가 (admin).
 * body: { title, body?, is_published? }
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let body: { title?: string; body?: string; is_published?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const title = body.title?.trim();
  if (!title) return NextResponse.json({ error: "제목을 입력해 주세요" }, { status: 400 });
  if (title.length > 100) return NextResponse.json({ error: "제목은 100자 이내로 입력해 주세요" }, { status: 400 });

  const { data, error } = await supabase
    .from("crm_center_notices")
    .insert({
      center_id: ctx.centerId,
      title,
      body: body.body?.trim() || "",
      is_published: body.is_published !== false,
      status: "active",
      created_by_uid: ctx.uid,
    })
    .select("id, title, body, is_published, created_at, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "추가 실패", detail: error.message }, { status: 500 });
  }

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "notice.create",
    entity_type: "crm_center_notices",
    entity_id: data.id,
    payload: { title } as never,
  });

  // 게시된 공지는 회원 앱 알림함/푸시로 브로드캐스트
  if (data.is_published) {
    after(async () => {
      await notifyCenterMembers(
        ctx.centerId,
        "notice",
        "새 공지사항",
        title,
        { noticeId: String(data.id) }
      ).catch(() => {});
    });
  }

  return NextResponse.json({ notice: data });
}
