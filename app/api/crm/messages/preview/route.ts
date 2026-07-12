import { NextResponse } from "next/server";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { resolveAudience } from "../route";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/messages/preview
 * body: { audience_kind, member_ids?, within_days? }
 * → { count: number }
 * 대상 유형 선택 시 실제 몇 명에게 갈지 미리 보여주기 위한 endpoint.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "manager" });
  if (isCrmError(ctx)) return ctx;

  let body: {
    audience_kind?: string;
    member_ids?: number[];
    within_days?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  const kind = body.audience_kind ?? "";
  const validKinds = ["all", "active", "expiring", "expired", "unassigned", "individual"];
  if (!validKinds.includes(kind)) {
    return NextResponse.json({ error: "대상 유형이 잘못됨" }, { status: 400 });
  }

  const memberIds = await resolveAudience(ctx.centerId, kind, {
    member_ids: body.member_ids ?? [],
    within_days: body.within_days ?? 7,
  });

  return NextResponse.json({ count: memberIds.length });
}
