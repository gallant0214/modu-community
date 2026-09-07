export const dynamic = "force-dynamic";

import { supabase } from "@/app/lib/supabase";
import { NextResponse } from "next/server";
import { verifyAdminPassword } from "@/app/lib/admin-auth";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin } from "@/app/lib/firebase-admin";

// Supabase PostgREST max-rows 1000 우회용 페이지네이션 헬퍼
async function paginateAll<T = any>(
  buildQuery: () => any,
  pageSize = 1000,
  maxPages = 50,
): Promise<T[]> {
  const all: T[] = [];
  for (let p = 0; p < maxPages; p++) {
    const { data } = await buildQuery().range(p * pageSize, p * pageSize + pageSize - 1);
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
  }
  return all;
}

interface MemberRow {
  id: number;
  center_id: number;
  name: string;
  phone: string | null;
  birth: string | null;
  status: string | null;
  member_type: string | null;
  linked_firebase_uid: string;
  privacy_agreed_at: string | null;
  registered_at: string | null;
  created_at: string | null;
  last_attended_at: string | null;
  app_language: string | null;
}

// POST /api/admin/users/app-list
// body: { password, page=1, limit=30, q? }
// 회원용 앱(모두의지도사 회원용) 가입자 = crm_members.linked_firebase_uid 가 있는 회원.
// 한 사람이 여러 센터에 등록될 수 있어 firebase_uid 기준으로 묶어 1행으로 반환한다.
// 커뮤니티 가입자 목록(/api/admin/users/list, nicknames 기준)과는 분리된 집합.
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { password, page: pageRaw, limit: limitRaw, q: qRaw } = body as {
    password?: string;
    page?: number;
    limit?: number;
    q?: string;
  };
  if (!(await verifyAdminPassword(password || ""))) {
    return NextResponse.json({ error: "관리자 비밀번호가 일치하지 않습니다" }, { status: 403 });
  }

  const page = Math.max(1, Number(pageRaw) || 1);
  const limit = Math.min(100, Math.max(1, Number(limitRaw) || 30));
  const q = (qRaw ?? "").trim().toLowerCase();

  const sb = supabase as any;

  // 1) 앱 계정이 연동된 crm_members 전량 (1000행 제한 우회)
  const members = await paginateAll<MemberRow>(() =>
    sb
      .from("crm_members")
      .select(
        "id, center_id, name, phone, birth, status, member_type, linked_firebase_uid, privacy_agreed_at, registered_at, created_at, last_attended_at, app_language"
      )
      .not("linked_firebase_uid", "is", null)
      .order("created_at", { ascending: false })
  );

  // 2) firebase_uid 기준 그룹핑 — 여러 센터 등록은 한 사람으로 합침
  const byUid = new Map<string, MemberRow[]>();
  for (const m of members) {
    const list = byUid.get(m.linked_firebase_uid);
    if (list) list.push(m);
    else byUid.set(m.linked_firebase_uid, [m]);
  }

  const centerIds = Array.from(new Set(members.map((m) => m.center_id).filter(Boolean)));
  const { data: centerRows } = centerIds.length
    ? await sb.from("crm_centers").select("id, name, kind").in("id", centerIds)
    : { data: [] as { id: number; name: string; kind: string | null }[] };
  const centerMap = new Map(
    ((centerRows || []) as { id: number; name: string; kind: string | null }[]).map((c) => [c.id, c])
  );

  // 가입 시각 = 앱 자체가입(개인정보 동의) 시각이 있으면 그 값(정확),
  // 없으면(직원이 등록한 기존 회원을 앱에서 연동한 경우) 회원 등록 시각으로 대체.
  // 연동 시각 자체는 별도 컬럼이 없어 기록되지 않으므로 basis 로 근거를 함께 내려준다.
  const joinedInfo = (rows: MemberRow[]): { at: string | null; basis: "self" | "member_created" } => {
    const consents = rows.map((r) => r.privacy_agreed_at).filter(Boolean) as string[];
    if (consents.length > 0) return { at: consents.sort()[0], basis: "self" };
    const created = rows.map((r) => r.created_at).filter(Boolean) as string[];
    return { at: created.length ? created.sort()[0] : null, basis: "member_created" };
  };

  let grouped = Array.from(byUid.entries()).map(([uid, rows]) => {
    const primary = rows[0];
    const joined = joinedInfo(rows);
    return {
      firebase_uid: uid,
      name: primary.name,
      phone: primary.phone,
      birth: primary.birth,
      app_language: rows.find((r) => r.app_language)?.app_language ?? null,
      self_signup: rows.some((r) => !!r.privacy_agreed_at),
      joined_at: joined.at,
      joined_basis: joined.basis,
      last_attended_at:
        rows
          .map((r) => r.last_attended_at)
          .filter(Boolean)
          .sort()
          .slice(-1)[0] ?? null,
      member_ids: rows.map((r) => r.id),
      centers: rows.map((r) => ({
        id: r.center_id,
        name: centerMap.get(r.center_id)?.name ?? `센터 ${r.center_id}`,
        kind: centerMap.get(r.center_id)?.kind ?? null,
        member_id: r.id,
        status: r.status,
      })),
      active_count: rows.filter((r) => r.status === "active").length,
    };
  });

  if (q) {
    grouped = grouped.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.phone || "").replace(/-/g, "").includes(q.replace(/-/g, "")) ||
        g.centers.some((c) => c.name.toLowerCase().includes(q))
    );
  }

  grouped.sort((a, b) => (b.joined_at || "").localeCompare(a.joined_at || ""));

  const total = grouped.length;
  const totalPages = Math.ceil(total / limit);
  const from = (page - 1) * limit;
  const pageRows = grouped.slice(from, from + limit);
  const uids = pageRows.map((r) => r.firebase_uid);

  if (uids.length === 0) {
    return NextResponse.json({ users: [], total, page, limit, totalPages });
  }

  // 3) 앱 설치(푸시 토큰) 여부 — 현재 페이지 사용자만
  const { data: tokenRows } = await sb
    .from("crm_member_device_tokens")
    .select("firebase_uid, platform, updated_at")
    .in("firebase_uid", uids);
  const deviceMap = new Map<string, { platforms: string[]; updated_at: string | null }>();
  for (const t of (tokenRows || []) as {
    firebase_uid: string;
    platform: string | null;
    updated_at: string | null;
  }[]) {
    const cur = deviceMap.get(t.firebase_uid) || { platforms: [], updated_at: null };
    if (t.platform && !cur.platforms.includes(t.platform)) cur.platforms.push(t.platform);
    if (t.updated_at && (!cur.updated_at || t.updated_at > cur.updated_at)) cur.updated_at = t.updated_at;
    deviceMap.set(t.firebase_uid, cur);
  }

  // 4) 커뮤니티 계정(닉네임) 보유 여부 — 두 서비스 중복 가입 파악용
  const { data: nickRows } = await sb
    .from("nicknames")
    .select("name, firebase_uid")
    .in("firebase_uid", uids);
  const nickMap = new Map(
    ((nickRows || []) as { name: string; firebase_uid: string }[]).map((n) => [n.firebase_uid, n.name])
  );

  // 5) Firebase Auth 이메일·가입/최근 로그인 (최대 100명/요청 → limit ≤ 100 이므로 1회)
  const authMap: Record<
    string,
    { email: string | null; providers: string[]; createdAt: string | null; lastSignInAt: string | null }
  > = {};
  try {
    const r = await getAuth(getFirebaseAdmin()).getUsers(uids.map((uid) => ({ uid })));
    for (const u of r.users) {
      authMap[u.uid] = {
        email: u.email || null,
        providers: (u.providerData || []).map((p) => p.providerId),
        createdAt: u.metadata?.creationTime ? new Date(u.metadata.creationTime).toISOString() : null,
        lastSignInAt: u.metadata?.lastSignInTime
          ? new Date(u.metadata.lastSignInTime).toISOString()
          : null,
      };
    }
  } catch {
    /* ignore — 이메일 누락 허용 */
  }

  const users = pageRows.map((r) => ({
    ...r,
    email: authMap[r.firebase_uid]?.email ?? null,
    providers: authMap[r.firebase_uid]?.providers ?? [],
    auth_created_at: authMap[r.firebase_uid]?.createdAt ?? null,
    last_sign_in_at: authMap[r.firebase_uid]?.lastSignInAt ?? null,
    device_platforms: deviceMap.get(r.firebase_uid)?.platforms ?? [],
    device_updated_at: deviceMap.get(r.firebase_uid)?.updated_at ?? null,
    community_nickname: nickMap.get(r.firebase_uid) ?? null,
  }));

  return NextResponse.json({ users, total, page, limit, totalPages });
}
