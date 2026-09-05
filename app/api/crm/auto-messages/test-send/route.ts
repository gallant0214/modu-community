import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { ctxHasPermission } from "@/app/lib/crm-permissions";
import { sendCrmSms, loadPushableMembers, smsAllowedForCenter } from "@/app/lib/crm-sms";
import { sendPushToMember } from "@/app/lib/member-notify";
import { renderMessage, loadCenterName, loadJoinLink, kstYmd } from "../_engine";

export const dynamic = "force-dynamic";

type TestMethod = "sms" | "push" | "smart";

/**
 * POST /api/crm/auto-messages/test-send
 * body: { member_id: number, body: string, method?: "sms" | "push" | "smart" }
 *
 * 자동 메세지 설정 화면에서 작성 중인 문구를 특정 회원에게 **실제로 1건** 보내본다.
 * 저장 전 문구 확인용이라 큐(crm_auto_message_queue)에는 적재하지 않는다.
 *   sms   : 문자
 *   push  : 앱 푸시 (앱 미설치·미로그인이면 실패)
 *   smart : 앱 설치돼 있으면 푸시, 아니면 문자 (실제 자동 발송과 같은 규칙)
 * 치환 변수 중 상품/만료일처럼 트리거가 있어야 정해지는 값은 예시값으로 채운다.
 * 권한: messages.send
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;
  if (!(await ctxHasPermission(ctx, "messages.send"))) {
    return NextResponse.json({ error: "메세지 전송 권한이 없습니다" }, { status: 403 });
  }

  let body: { member_id?: number; body?: string; method?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const memberId = Number(body.member_id) || 0;
  const template = (body.body ?? "").trim();
  const method: TestMethod =
    body.method === "push" || body.method === "smart" ? body.method : "sms";
  if (!memberId) return NextResponse.json({ error: "수신인을 선택해 주세요" }, { status: 400 });
  if (!template) return NextResponse.json({ error: "메세지 내용을 입력해 주세요" }, { status: 400 });

  const { data: member } = await supabase
    .from("crm_members")
    .select("id, name, phone")
    .eq("id", memberId)
    .eq("center_id", ctx.centerId)
    .maybeSingle();
  if (!member) return NextResponse.json({ error: "회원을 찾을 수 없습니다" }, { status: 404 });

  const center = await loadCenterName(ctx.centerId);
  const appLink = await loadJoinLink(ctx.centerId);
  // 트리거 실행 없이 보내는 미리보기라, 조건에서 정해지는 값은 예시로 채운다.
  const msg = renderMessage(template, {
    center,
    name: member.name,
    product: "(예시) 헬스 3개월",
    expiry: kstYmd(),
    payment: "(예시) 150,000원",
    appLink,
    basis: "(예시) 만료 7일 전",
    lastVisit: kstYmd(),
  });

  // 스마트 전송은 실제 자동 발송과 동일하게 앱 설치 여부로 채널을 가른다.
  const pushable = (await loadPushableMembers(ctx.centerId, [memberId])).has(memberId);
  const useChannel: "sms" | "push" =
    method === "smart" ? (pushable ? "push" : "sms") : method;

  if (useChannel === "push") {
    if (!pushable) {
      return NextResponse.json(
        {
          error: `${member.name} 님은 회원 앱이 설치·로그인돼 있지 않아 푸시를 받을 수 없어요. 문자 또는 스마트 전송으로 보내보세요.`,
        },
        { status: 400 }
      );
    }
    const tokens = await sendPushToMember(memberId, "auto_message", center, msg);
    if (tokens <= 0) {
      return NextResponse.json({ error: "푸시 발송에 실패했어요(등록된 기기 없음)" }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      channel: "push",
      to: { id: member.id, name: member.name },
      msg,
      message:
        method === "smart"
          ? `${member.name} 님(앱 설치)에게 앱 푸시로 테스트 발송했어요`
          : `${member.name} 님에게 앱 푸시로 테스트 발송했어요`,
    });
  }

  // 문자
  if (!smsAllowedForCenter(ctx.centerId)) {
    return NextResponse.json({ error: "이 센터는 문자 발송이 잠금 상태예요." }, { status: 403 });
  }
  if (!member.phone) {
    return NextResponse.json({ error: `${member.name} 님은 연락처가 없어요` }, { status: 400 });
  }
  const result = await sendCrmSms({
    centerId: ctx.centerId,
    uid: ctx.uid,
    receivers: [member.phone],
    msg,
    title: center,
    tag: "테스트발송",
  });
  if (!result.ok) {
    return NextResponse.json({ error: `발송 실패: ${result.message}` }, { status: 502 });
  }
  return NextResponse.json({
    ok: true,
    channel: "sms",
    to: { id: member.id, name: member.name, phone: member.phone },
    msg,
    message:
      method === "smart"
        ? `${member.name} 님(앱 미설치)에게 문자로 테스트 발송했어요`
        : `${member.name} 님에게 문자로 테스트 발송했어요`,
  });
}
