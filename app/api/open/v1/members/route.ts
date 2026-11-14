import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { requireApiKey } from "@/app/lib/crm-api-key-auth";
import { loadOpenMembers, openApiResponse, OPEN_MEMBER_COLUMNS } from "@/app/lib/crm-open-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/open/v1/members[?format=csv] — 회원 목록 (CRM 회원 목록과 같은 상태·만료일 계산) */
export async function GET(request: Request) {
  const key = await requireApiKey(request, "members");
  if (key instanceof NextResponse) return key;
  try {
    const rows = await loadOpenMembers(key.centerId);
    return openApiResponse(new URL(request.url), { name: "members", centerName: key.centerName, columns: OPEN_MEMBER_COLUMNS, rows });
  } catch (e) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(e) }, { status: 500 });
  }
}
