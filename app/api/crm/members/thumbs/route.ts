import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/crm/members/thumbs  { ids: number[] }
 * 회원 목록에서 현재 페이지(≤50명)의 얼굴 썸네일만 지연 로드용.
 * 벌크 목록(/api/crm/members)에서 무거운 base64 썸네일을 뺐기 때문.
 * 응답: { thumbs: { [id]: string } }  (썸네일 있는 회원만 포함)
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request);
  if (isCrmError(ctx)) return ctx;

  let body: { ids?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ thumbs: {} });
  }
  const ids = Array.from(
    new Set((body.ids ?? []).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))
  ).slice(0, 200);
  if (ids.length === 0) return NextResponse.json({ thumbs: {} });

  const { data } = await supabase
    .from("crm_members")
    .select("id, face_image_thumb")
    .eq("center_id", ctx.centerId)
    .in("id", ids)
    .not("face_image_thumb", "is", null);

  const thumbs: Record<number, string> = {};
  for (const r of (data ?? []) as { id: number; face_image_thumb: string | null }[]) {
    if (r.face_image_thumb) thumbs[r.id] = r.face_image_thumb;
  }
  return NextResponse.json({ thumbs });
}
