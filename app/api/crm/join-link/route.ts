import { NextResponse } from "next/server";
import { supabase } from "@/app/lib/supabase";
import { requireCrmContext, isCrmError } from "@/app/lib/crm-auth";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || "https://moducm.com";

function genToken(): string {
  return randomBytes(16).toString("base64url"); // ~22자
}
function genCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 헷갈리는 O/0/I/1/L 제외
  const b = randomBytes(6);
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[b[i] % alphabet.length];
  return s;
}

async function createLink(centerId: number): Promise<{ token: string; code: string } | null> {
  for (let i = 0; i < 6; i++) {
    const token = genToken();
    const code = genCode();
    const { data, error } = await supabase
      .from("crm_center_join_links")
      .insert({ center_id: centerId, token, code } as never)
      .select("token, code")
      .single();
    if (!error && data) return data as { token: string; code: string };
  }
  return null;
}

/**
 * GET /api/crm/join-link — 센터 회원가입 QR 링크(없으면 생성). owner/admin.
 * → { token, code, url }
 */
export async function GET(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  let { data: link } = await supabase
    .from("crm_center_join_links")
    .select("token, code")
    .eq("center_id", ctx.centerId)
    .maybeSingle();

  if (!link) {
    link = await createLink(ctx.centerId);
    if (!link) return NextResponse.json({ error: "링크 생성 실패" }, { status: 500 });
  }

  return NextResponse.json({
    token: link.token,
    code: link.code,
    url: `${APP_ORIGIN}/join/${link.token}`,
  });
}

/**
 * POST /api/crm/join-link — 링크 재발급(기존 QR 무효화). owner/admin.
 */
export async function POST(request: Request) {
  const ctx = await requireCrmContext(request, { needRole: "admin" });
  if (isCrmError(ctx)) return ctx;

  await supabase.from("crm_center_join_links").delete().eq("center_id", ctx.centerId);
  const link = await createLink(ctx.centerId);
  if (!link) return NextResponse.json({ error: "링크 재발급 실패" }, { status: 500 });

  await supabase.from("crm_audit_logs").insert({
    center_id: ctx.centerId,
    actor_uid: ctx.uid,
    action: "join_link.regenerate",
    entity_type: "crm_center_join_links",
    entity_id: null,
    payload: { code: link.code } as never,
  });

  return NextResponse.json({
    token: link.token,
    code: link.code,
    url: `${APP_ORIGIN}/join/${link.token}`,
  });
}
