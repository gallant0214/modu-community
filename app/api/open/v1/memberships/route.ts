import { errDetail } from "@/app/lib/api-error";
import { NextResponse } from "next/server";
import { requireApiKey } from "@/app/lib/crm-api-key-auth";
import { loadOpenMemberships, openApiResponse, OPEN_MEMBERSHIP_COLUMNS } from "@/app/lib/crm-open-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/open/v1/memberships[?only=active][&format=csv] — 회원권 목록. only=active 면 이용 중·예정만 */
export async function GET(request: Request) {
  const key = await requireApiKey(request, "members");
  if (key instanceof NextResponse) return key;
  const url = new URL(request.url);
  const onlyActive = url.searchParams.get("only") === "active";
  try {
    const rows = await loadOpenMemberships(key.centerId, onlyActive);
    return openApiResponse(url, {
      name: "memberships",
      centerName: key.centerName,
      columns: OPEN_MEMBERSHIP_COLUMNS,
      rows,
      meta: { only: onlyActive ? "active" : "all" },
    });
  } catch (e) {
    return NextResponse.json({ error: "조회 실패", detail: errDetail(e) }, { status: 500 });
  }
}
