import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { loadPermissionsForContext } from "@/app/lib/crm-permissions";
import { sendPushToMember } from "@/app/lib/member-notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/members/[id]/notify  { text }
 * 회원 앱으로 자유 문구 푸시 발송 (+ 앱 알림함 기록).
 * 권한: messages.send. 회원이 앱 미연동이면 알림함엔 남지만 푸시는 안 감(sent=0).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  const perms = await loadPermissionsForContext(ctx);
  if (perms["messages.send"] === false) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }

  const { id } = await params;
  const memberId = Number(id);
  if (!memberId) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "메세지를 입력해 주세요" }, { status: 400 });
  if (text.length > 2000)
    return NextResponse.json({ error: "메세지가 너무 길어요(2000자 이내)" }, { status: 400 });

  // 대상 회원이 이 센터 소속인지 확인 (데이터 격리) + 앱 연동/센터명
  const { data: member } = await supabase
    .from("crm_members")
    .select("id, linked_firebase_uid")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });
  const linked = (member as { linked_firebase_uid?: string | null }).linked_firebase_uid;

  const { data: center } = await supabase
    .from("crm_centers")
    .select("name")
    .eq("id", ctx.centerId)
    .maybeSingle();
  const title = (center as { name?: string } | null)?.name || "센터 메세지";

  const sent = await sendPushToMember(memberId, "center_message", title, text);

  return NextResponse.json({
    ok: true,
    sent, // 실제 푸시 전송된 기기 수
    linked: !!linked,
    message: linked
      ? sent > 0
        ? "앱으로 전송했어요."
        : "앱 알림함에 저장했어요. (등록된 기기 없음 — 앱 실행 시 확인)"
      : "회원이 앱 미연동이라 푸시는 전송되지 않았어요.",
  });
}
