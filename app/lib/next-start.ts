/**
 * 같은 종류의 유효한 이용권이 남아 있으면 그 만료 다음날을 새 이용권 시작일로 계산한다.
 * (추가 결제 시 기존 이용권 뒤로 이어붙이기 — 회원권/운동복/락커)
 *
 * 원래 `/api/crm/members/[id]/next-start` 라우트 안에 있던 로직을 서버 공용으로 뺀 것.
 * 회원앱 구매(직원 컨텍스트 없음)에서도 같은 규칙을 써야 해서 여기로 모았다.
 */
import { supabase } from "@/app/lib/supabase";

export interface NextStart {
  start_date: string;
  chained: boolean;
  after?: string;
}

const isUnlimited = (ymd: string) =>
  !ymd || ymd.startsWith("9999") || ymd.startsWith("2999");

export async function computeNextStart(
  centerId: number,
  memberId: number,
  type: string
): Promise<NextStart> {
  const todayYmd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

  let maxExpiry: string | null = null;
  if (memberId) {
    if (type === "membership") {
      const { data } = await supabase
        .from("crm_memberships")
        .select("expires_at")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .eq("status", "valid")
        .gte("expires_at", todayYmd)
        .order("expires_at", { ascending: false })
        .limit(1);
      maxExpiry = data?.[0]?.expires_at ?? null;
    } else if (type === "apparel" || type === "rental") {
      // 🚨 crm_rentals 에는 운동복 + 락커(대여권)가 함께 있어, 운동복은 '락커가 아닌 것'만 이어붙인다.
      const { data } = await supabase
        .from("crm_rentals")
        .select("item_name, memo, expires_at")
        .eq("center_id", centerId)
        .eq("member_id", memberId)
        .in("status", ["valid", "active"])
        .gte("expires_at", todayYmd)
        .order("expires_at", { ascending: false });
      const isLocker = (r: { item_name: string | null; memo: string | null }) =>
        (r.memo ?? "").includes("미배정") ||
        (r.memo ?? "").includes("락커") ||
        /\d+번/.test(r.memo ?? "") ||
        /^(락커|상가)/.test((r.item_name ?? "").trim());
      maxExpiry = (data ?? []).filter((r) => !isLocker(r))[0]?.expires_at ?? null;
    } else if (type === "locker") {
      const { data } = await supabase
        .from("crm_lockers")
        .select("expires_at")
        .eq("center_id", centerId)
        .eq("assigned_member_id", memberId)
        .eq("state", "assigned")
        .gte("expires_at", todayYmd)
        .order("expires_at", { ascending: false })
        .limit(1);
      maxExpiry = data?.[0]?.expires_at ?? null;
    }
  }

  if (!maxExpiry || isUnlimited(maxExpiry)) {
    return { start_date: todayYmd, chained: false };
  }
  const d = new Date(`${maxExpiry.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  return {
    start_date: next < todayYmd ? todayYmd : next,
    chained: true,
    after: maxExpiry,
  };
}

/**
 * 재등록(이용권 구매)에서 보여줄 '시작일 기본값'.
 *   - 지금 유효하게 이용 중인 이용권(회원권 + 기간제 수강권) 중 가장 늦은 종료일의 **다음날**.
 *   - 유효한 이용권이 없으면 **오늘**.
 * 락커·운동복(대여권)은 '이용권' 이 아니므로 기본값 계산에 넣지 않는다.
 * 과거로 내려가지 않도록 오늘보다 이르면 오늘로 올린다.
 */
export async function computeMemberNextStart(
  centerId: number,
  memberId: number
): Promise<NextStart> {
  const todayYmd = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (!memberId) return { start_date: todayYmd, chained: false };

  const [{ data: ms }, { data: ps }] = await Promise.all([
    supabase
      .from("crm_memberships")
      .select("expires_at")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .gte("expires_at", todayYmd)
      .order("expires_at", { ascending: false })
      .limit(1),
    supabase
      .from("crm_passes")
      .select("expires_at")
      .eq("center_id", centerId)
      .eq("member_id", memberId)
      .eq("status", "valid")
      .gte("expires_at", todayYmd)
      .order("expires_at", { ascending: false })
      .limit(1),
  ]);

  const candidates = [ms?.[0]?.expires_at, ps?.[0]?.expires_at]
    .filter((v): v is string => !!v && !isUnlimited(v))
    .map((v) => v.slice(0, 10));
  if (candidates.length === 0) return { start_date: todayYmd, chained: false };

  const maxExpiry = candidates.reduce((a, b) => (b > a ? b : a));
  const d = new Date(`${maxExpiry}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const next = d.toISOString().slice(0, 10);
  return { start_date: next < todayYmd ? todayYmd : next, chained: true, after: maxExpiry };
}
