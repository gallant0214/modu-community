import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import {
  loadCenterName,
  loadCenterPhone,
  loadCenterAddress,
  loadCenterHours,
  loadJoinLink,
} from "../_engine";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/auto-messages/var-samples
 *
 * 자동 메세지 설정 07 '메세지 입력'의 변수 버튼에 마우스를 올렸을 때 보여줄
 * **센터 실제 값** — 회원이 받을 문구 그대로 보여주기 위한 것.
 *
 * 🚨 운영시간 서식·주소 결합은 발송 엔진과 **같은 함수**(loadCenterHours 등)를 쓴다.
 *   화면에서 따로 조립하면 미리보기와 실제 발송 문구가 어긋난다.
 * 회원별 값(이름·마일리지·출석 등)은 대상 회원이 정해지기 전이라
 * MESSAGE_VARIABLES 의 예시값(sample)을 그대로 쓴다.
 *
 * 권한: 센터 소속이면 조회 가능(읽기 전용).
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  const [center, phone, address, hours, appLink] = await Promise.all([
    loadCenterName(ctx.centerId),
    loadCenterPhone(ctx.centerId),
    loadCenterAddress(ctx.centerId),
    loadCenterHours(ctx.centerId),
    loadJoinLink(ctx.centerId),
  ]);

  // 값이 비어 있으면(센터 설정 미입력) 키를 내려보내지 않는다 → 화면은 예시값을 쓴다.
  const samples: Record<string, string> = {};
  if (center) samples["#센터명#"] = center;
  if (phone) samples["#센터전화#"] = phone;
  if (address) samples["#센터주소#"] = address;
  if (hours) samples["#운영시간#"] = hours;
  if (appLink) samples["#앱설치링크#"] = appLink;

  return NextResponse.json({ samples });
}
