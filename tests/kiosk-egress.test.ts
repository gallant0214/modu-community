/**
 * Supabase 전송량(Egress) 절감 — 출석 경로 얼굴 사진 미조회 + 키오스크 센터 캐시.
 * supabase 모듈을 통째로 가짜로 바꿔 '어떤 쿼리를 몇 번 보내는지' 만 확인한다(DB 접속 없음).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Op = [method: string, args: unknown[]];
interface Call {
  table: string;
  ops: Op[];
}

const state = vi.hoisted(() => ({
  calls: [] as { table: string; ops: [string, unknown[]][] }[],
  // 테스트마다 바꿔 끼우는 응답 — 테이블·연산 목록을 보고 데이터를 돌려준다
  resolve: (() => ({ data: null })) as (table: string, ops: [string, unknown[]][]) => { data: unknown },
}));

vi.mock("@/app/lib/supabase", () => ({
  supabase: {
    from(table: string) {
      const rec = { table, ops: [] as [string, unknown[]][] };
      state.calls.push(rec);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const b: any = {};
      for (const m of ["select", "eq", "in", "not", "order", "limit"]) {
        b[m] = (...args: unknown[]) => {
          rec.ops.push([m, args]);
          return b;
        };
      }
      b.maybeSingle = async () => state.resolve(rec.table, rec.ops);
      // await 로 바로 끝나는 체인(thenable)
      b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(state.resolve(rec.table, rec.ops)).then(res, rej);
      return b;
    },
  },
}));

import { memberIdsWithFace } from "@/app/lib/crm-checkin";
import { resolveKioskCenterCached } from "@/app/lib/kiosk-auth";

const centersCalls = () => state.calls.filter((c) => c.table === "crm_centers");
const hasOp = (c: Call, method: string, ...args: unknown[]) =>
  c.ops.some(([m, a]) => m === method && JSON.stringify(a) === JSON.stringify(args));

beforeEach(() => {
  state.calls = [];
  state.resolve = () => ({ data: null });
});

describe("memberIdsWithFace — 사진 값은 받지 않고 id 만 조회", () => {
  it("ids 가 비면 쿼리 없이 빈 Set", async () => {
    const set = await memberIdsWithFace(1, []);
    expect(set.size).toBe(0);
    expect(state.calls).toHaveLength(0);
  });

  it("id 만 select 하고 face_image_data IS NOT NULL 로 걸러 Set 으로 돌려준다", async () => {
    state.resolve = () => ({ data: [{ id: 7 }, { id: 9 }] });
    const set = await memberIdsWithFace(1, [7, 8, 9]);
    expect([...set].sort()).toEqual([7, 9]);
    expect(state.calls).toHaveLength(1);
    const c = state.calls[0];
    expect(c.table).toBe("crm_members");
    expect(hasOp(c, "select", "id")).toBe(true);
    expect(hasOp(c, "eq", "center_id", 1)).toBe(true);
    expect(hasOp(c, "in", "id", [7, 8, 9])).toBe(true);
    expect(hasOp(c, "not", "face_image_data", "is", null)).toBe(true);
    // 사진 컬럼 자체는 어디에도 select 되지 않는다
    expect(c.ops.some(([m, a]) => m === "select" && String(a[0]).includes("face_image_data"))).toBe(false);
  });
});

describe("resolveKioskCenterCached — 정적 토큰 60초 캐시", () => {
  // 32자 hex 이상의 정적 토큰 모양(24자 미만은 즉시 거절됨)
  const tok = (n: number) => `t${String(n).padStart(2, "0")}`.padEnd(40, "a");
  const activeCenter = () => ({ data: { id: 1, name: "테스트센터", status: "active" } });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-21T10:00:00+09:00"));
    // 다른 테스트의 캐시가 남지 않도록 TTL 이 지난 시각으로 시작해 각 테스트가 새 토큰을 쓴다
  });
  afterEach(() => vi.useRealTimers());

  it("같은 토큰 두 번째 호출은 crm_centers 를 다시 조회하지 않는다", async () => {
    state.resolve = activeCenter;
    const t = tok(1);
    const a = await resolveKioskCenterCached(t);
    const b = await resolveKioskCenterCached(t);
    expect(a).toEqual({ centerId: 1, centerName: "테스트센터" });
    expect(b).toEqual(a);
    expect(centersCalls()).toHaveLength(1);
  });

  it("60초가 지나면 다시 조회한다", async () => {
    state.resolve = activeCenter;
    const t = tok(2);
    await resolveKioskCenterCached(t);
    vi.advanceTimersByTime(59_000);
    await resolveKioskCenterCached(t);
    expect(centersCalls()).toHaveLength(1);
    vi.advanceTimersByTime(2_000);
    await resolveKioskCenterCached(t);
    expect(centersCalls()).toHaveLength(2);
  });

  it("null(없는 토큰·비활성 센터)은 캐시하지 않는다", async () => {
    state.resolve = () => ({ data: { id: 1, name: "x", status: "inactive" } });
    const t = tok(3);
    expect(await resolveKioskCenterCached(t)).toBeNull();
    expect(await resolveKioskCenterCached(t)).toBeNull();
    expect(centersCalls()).toHaveLength(2);
  });

  it("'q1.' 주간 QR 토큰은 캐시 없이 기존 로직으로 넘긴다(폴링 API 에선 거절)", async () => {
    state.resolve = activeCenter;
    const t = "q1.1.2970.0123456789abcdef0123456789abcdef";
    expect(await resolveKioskCenterCached(t)).toBeNull();
    expect(await resolveKioskCenterCached(t)).toBeNull();
    // allowWeeklyQr 가 아니므로 DB 조회 전에 거절 — 캐시에도 들어가지 않는다
    expect(centersCalls()).toHaveLength(0);
  });

  it("100개를 넘으면 오래된 토큰부터 지운다", async () => {
    state.resolve = activeCenter;
    const first = tok(10);
    await resolveKioskCenterCached(first);
    for (let i = 11; i <= 110; i++) await resolveKioskCenterCached(tok(i)); // 총 101개 → 1개 밀려남
    state.calls = [];
    await resolveKioskCenterCached(tok(110)); // 최신 → 캐시 적중
    expect(centersCalls()).toHaveLength(0);
    await resolveKioskCenterCached(first); // 가장 오래된 것 → 밀려나서 재조회
    expect(centersCalls()).toHaveLength(1);
  });
});
