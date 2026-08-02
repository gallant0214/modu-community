import { NextResponse } from "next/server";
import { listLinkedMembers } from "@/app/lib/member-auth";

export const dynamic = "force-dynamic";

/**
 * GET /api/crm/member-app/bootstrap
 * 로그인한 회원이 연동된 (센터 x 회원) 목록. 앱은 이 중 하나를 선택해 사용.
 * 연동된 게 없으면 members: [] → 앱에서 연동 온보딩으로 유도.
 */
export async function GET(request: Request) {
  const linked = await listLinkedMembers(request);
  if (linked instanceof NextResponse) return linked;
  return NextResponse.json({ members: linked });
}
