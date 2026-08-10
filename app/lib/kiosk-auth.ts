import { supabase } from "./supabase";

/**
 * 공개 터치출석 링크 토큰 → 센터 해석.
 * 유효한 활성 센터의 kiosk_token 이면 { centerId, centerName } 반환, 아니면 null.
 * (로그인 없이 접근하는 공개 키오스크 엔드포인트 인증용)
 */
export async function resolveKioskCenter(
  token: string | undefined | null
): Promise<{ centerId: number; centerName: string } | null> {
  const t = (token || "").trim();
  // 토큰은 32자 hex(16바이트) 이상. 너무 짧으면 즉시 거절(무차별 대입 방지).
  if (t.length < 24) return null;
  const { data } = await supabase
    .from("crm_centers")
    .select("id, name, status")
    .eq("kiosk_token", t)
    .maybeSingle();
  if (!data || (data as { status: string }).status !== "active") return null;
  return { centerId: (data as { id: number }).id, centerName: (data as { name: string }).name };
}
