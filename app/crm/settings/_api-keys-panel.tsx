"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/components/auth-provider";
import { CrmModal, crmInputClass } from "../_components/crm-modal";
import { CrmDeniedNotice } from "../_components/crm-denied-notice";
import {
  API_KEY_NAME_MAX,
  API_KEY_SCOPES,
  OPEN_API_ENDPOINTS,
  apiKeyScopeLabel,
  type ApiKeyScope,
} from "@/app/lib/crm-api-keys";

type KeyItem = {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_by_name: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

const primaryBtn =
  "px-4 py-2 rounded-lg bg-[#6B7B3A] text-white text-[13px] font-semibold hover:bg-[#5a6932] disabled:opacity-50";
const ghostBtn =
  "px-3 py-1.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[12.5px] font-semibold text-[#6B5D47] dark:text-zinc-300 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 disabled:opacity-50";

function fmtDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 3600 * 1000).toISOString();
  return `${d.slice(0, 10).replace(/-/g, ".")} ${d.slice(11, 16)}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 클립보드 권한이 막힌 브라우저 — 임시 입력칸으로 복사
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyButton({ text, label = "복사" }: { text: string; label?: string }) {
  const [done, setDone] = useState<"" | "ok" | "fail">("");
  return (
    <button
      type="button"
      onClick={async () => {
        setDone((await copyText(text)) ? "ok" : "fail");
        setTimeout(() => setDone(""), 1600);
      }}
      className={`${ghostBtn} shrink-0`}
    >
      {done === "ok" ? "복사됨" : done === "fail" ? "직접 복사해 주세요" : label}
    </button>
  );
}

/** 구글 시트·엑셀에 붙여 넣을 주소 (키를 주소에 넣는 방식) */
function csvUrl(origin: string, path: string, key: string): string {
  return `${origin}${path}?format=csv&key=${key}`;
}

/**
 * 센터 설정 → API 연동.
 * 엑셀·구글 시트·자동화 도구가 회원·매출 데이터를 가져가는 조회 전용 키를 만들고 폐기한다.
 * 키 원문은 만든 직후 한 번만 보여 준다(서버엔 해시만 저장).
 */
export function ApiKeysPanel() {
  const { getIdToken } = useAuth();
  const [items, setItems] = useState<KeyItem[]>([]);
  const [grantable, setGrantable] = useState<ApiKeyScope[]>([]);
  const [maxActive, setMaxActive] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState<string | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [creating, setCreating] = useState(false);
  // 안내 주소에 쓸 현재 사이트 주소 (불러오는 동안엔 화면에 안 쓰여서 서버 렌더와 어긋나지 않는다)
  const [origin] = useState(() => (typeof window === "undefined" ? "https://moducm.com" : window.location.origin));

  // setState 는 모두 await 뒤에 — 화면 진입 effect 에서 바로 상태를 바꾸지 않게
  const load = useCallback(async () => {
    try {
      const token = await getIdToken();
      if (!token) throw new Error("로그인 정보를 확인할 수 없습니다");
      const res = await fetch("/api/crm/api-keys", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = await res.json();
      if (res.status === 403) {
        setDenied(data?.error ?? null);
        return;
      }
      if (!res.ok) throw new Error(data?.error || "조회 실패");
      setError("");
      setDenied(null);
      setItems(data.items ?? []);
      setGrantable(data.grantable_scopes ?? []);
      setMaxActive(data.max_active ?? 10);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const active = useMemo(() => items.filter((k) => !k.revoked_at), [items]);
  const revoked = useMemo(() => items.filter((k) => k.revoked_at), [items]);

  const revoke = async (k: KeyItem) => {
    if (
      !window.confirm(
        `'${k.name}' 키를 폐기할까요?\n\n폐기하면 이 키를 넣어 둔 구글 시트·엑셀·자동화 도구가 바로 데이터를 못 가져와요. 되살릴 수 없고, 다시 쓰려면 새 키를 만들어야 해요.`
      )
    )
      return;
    setError("");
    const token = await getIdToken();
    const res = await fetch(`/api/crm/api-keys/${k.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data?.error || "폐기 실패");
    load();
  };

  if (loading) return <div className="text-[13px] text-[#8C8270]">불러오는 중…</div>;
  if (denied !== null) return <CrmDeniedNotice message={denied} what="API 키" />;

  return (
    <div className="space-y-4">
      <section className="px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">외부 연동 API 키</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#6B5D47] dark:text-zinc-400 break-keep">
              엑셀·구글 시트·자동화 도구가 센터 데이터를 가져갈 때 쓰는 키예요. <b>조회만</b> 할 수 있고, 키로 데이터를
              바꾸거나 지울 수는 없어요.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            disabled={active.length >= maxActive || grantable.length === 0}
            className={primaryBtn}
          >
            새 키 만들기
          </button>
        </div>

        <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-[12px] leading-relaxed text-amber-800 dark:text-amber-300 break-keep">
          키를 가진 사람은 누구나 고른 데이터(회원 이름·연락처, 매출)를 볼 수 있어요. 키를 넣은 시트를 공유할 때 주의하고,
          쓰지 않게 된 키나 밖으로 새어 나간 것 같은 키는 바로 폐기해 주세요.
          {grantable.length === 0 && (
            <div className="mt-1 font-semibold">
              회원 목록·매출 엑셀 내보내기 권한이 모두 꺼져 있어 키를 만들 수 없어요. 센터설정 → 직급 권한에서 켜 주세요.
            </div>
          )}
          {active.length >= maxActive && (
            <div className="mt-1 font-semibold">사용 중인 키는 {maxActive}개까지예요. 안 쓰는 키를 폐기한 뒤 만들어 주세요.</div>
          )}
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">{error}</div>
        )}

        {active.length === 0 ? (
          <div className="px-4 py-6 rounded-xl border border-dashed border-[#E8E0D0] dark:border-zinc-700 text-center text-[13px] text-[#A89B80]">
            아직 만든 키가 없어요. [새 키 만들기]를 눌러 시작하세요.
          </div>
        ) : (
          <ul className="divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 bg-white/60 dark:bg-zinc-950/40">
            {active.map((k) => (
              <KeyRow key={k.id} k={k} onRevoke={() => revoke(k)} />
            ))}
          </ul>
        )}

        {revoked.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowRevoked((v) => !v)}
              className="text-[12px] font-semibold text-[#8C8270] hover:text-[#6B5D47] dark:text-zinc-500"
            >
              {showRevoked ? "▾" : "▸"} 폐기한 키 {revoked.length}개
            </button>
            {showRevoked && (
              <ul className="mt-2 divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800 rounded-xl border border-[#E8E0D0] dark:border-zinc-800 opacity-70">
                {revoked.map((k) => (
                  <KeyRow key={k.id} k={k} />
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <UsageGuide origin={origin} />

      {creating && (
        <CreateKeyModal
          grantable={grantable}
          origin={origin}
          onClose={() => setCreating(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}

function KeyRow({ k, onRevoke }: { k: KeyItem; onRevoke?: () => void }) {
  return (
    <li className="px-3.5 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1 basis-[220px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13.5px] font-semibold text-[#2A251D] dark:text-zinc-100 break-all">{k.name}</span>
          {k.scopes.map((s) => (
            <span
              key={s}
              className="px-1.5 py-0.5 rounded-md bg-[#6B7B3A]/10 text-[#56632F] dark:bg-[#A8B87A]/15 dark:text-[#C9D69C] text-[11px] font-semibold"
            >
              {apiKeyScopeLabel(s)}
            </span>
          ))}
          {k.revoked_at && (
            <span className="px-1.5 py-0.5 rounded-md bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 text-[11px] font-semibold">
              폐기됨
            </span>
          )}
        </div>
        <div className="mt-1 text-[11.5px] text-[#8C8270] dark:text-zinc-500 break-keep">
          <span className="font-mono">{k.key_prefix}…</span>
          {" · "}
          {k.created_by_name ? `${k.created_by_name} · ` : ""}
          {fmtDateTime(k.created_at)} 만듦
          {k.revoked_at && ` · ${fmtDateTime(k.revoked_at)} 폐기`}
        </div>
      </div>
      <div className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 shrink-0">
        {k.last_used_at ? `마지막 사용 ${fmtDateTime(k.last_used_at)}` : "아직 사용 안 함"}
      </div>
      {onRevoke && (
        <button
          type="button"
          onClick={onRevoke}
          className="shrink-0 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-[12.5px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          폐기
        </button>
      )}
    </li>
  );
}

function CreateKeyModal({
  grantable,
  origin,
  onClose,
  onCreated,
}: {
  grantable: ApiKeyScope[];
  origin: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { getIdToken } = useAuth();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(grantable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ key: string; scopes: ApiKeyScope[] } | null>(null);

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("키 이름을 적어 주세요 (예: 구글 시트 매출표)");
    if (!scopes.length) return setError("볼 수 있게 할 데이터를 하나 이상 골라 주세요");
    setBusy(true);
    try {
      const token = await getIdToken();
      const res = await fetch("/api/crm/api-keys", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), scopes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "발급 실패");
      setCreated({ key: data.key, scopes: (data.item?.scopes ?? scopes) as ApiKeyScope[] });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setBusy(false);
    }
  };

  // 키를 보여 주는 중엔 실수로 닫지 않게 한 번 묻는다 (다시 볼 수 없음)
  const close = () => {
    if (created && !window.confirm("키를 복사해 두셨나요? 이 창을 닫으면 키를 다시 볼 수 없어요.")) return;
    onClose();
  };

  const examples = created
    ? OPEN_API_ENDPOINTS.filter((e) => e.scope && created.scopes.includes(e.scope))
    : [];

  return (
    <CrmModal open onClose={close} title={created ? "API 키를 만들었어요" : "새 API 키 만들기"} size="lg">
      {!created ? (
        <div className="space-y-4">
          <div>
            <div className="text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 mb-1.5">키 이름</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={API_KEY_NAME_MAX}
              placeholder="예: 구글 시트 매출표"
              className={crmInputClass}
              autoFocus
            />
            <p className="mt-1.5 text-[11.5px] text-[#A89B80]">어디에 쓰는 키인지 알아볼 수 있게 적어 주세요.</p>
          </div>
          <div>
            <div className="text-[13px] font-medium text-[#3A342A] dark:text-zinc-300 mb-1.5">볼 수 있게 할 데이터</div>
            <div className="space-y-2">
              {API_KEY_SCOPES.map((s) => {
                const allowed = grantable.includes(s.key);
                const on = scopes.includes(s.key);
                return (
                  <label
                    key={s.key}
                    className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border ${
                      on ? "border-[#6B7B3A]/50 bg-[#F6F1E7] dark:bg-[#A8B87A]/10" : "border-[#E8E0D0] dark:border-zinc-700"
                    } ${allowed ? "cursor-pointer" : "opacity-50"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-[#6B7B3A]"
                      checked={on}
                      disabled={!allowed}
                      onChange={(e) =>
                        setScopes((cur) => (e.target.checked ? [...cur, s.key] : cur.filter((x) => x !== s.key)))
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100">{s.label}</span>
                      <span className="block text-[11.5px] text-[#8C8270] dark:text-zinc-500 break-keep">
                        {allowed ? s.desc : "엑셀 내보내기 권한이 없어 이 데이터는 담을 수 없어요"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          <p className="text-[11.5px] leading-relaxed text-[#A89B80] break-keep">
            만들어진 키는 <b>한 번만</b> 보여 드려요. 키를 만든 직원이 퇴사하거나 권한이 꺼지면 키도 함께 막혀요.
          </p>
          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/40 text-[13px] text-red-700 dark:text-red-300">{error}</div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className={ghostBtn}>
              취소
            </button>
            <button type="button" onClick={submit} disabled={busy} className={primaryBtn}>
              {busy ? "만드는 중…" : "만들기"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="px-3 py-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 text-[12.5px] font-semibold text-red-700 dark:text-red-300 break-keep">
            지금 복사해 두세요. 이 창을 닫으면 키를 다시 볼 수 없어요(잃어버리면 폐기하고 새로 만들면 돼요).
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 px-3 py-2.5 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 bg-white dark:bg-zinc-900 font-mono text-[13px] text-[#2A251D] dark:text-zinc-100 break-all select-all">
              {created.key}
            </code>
            <CopyButton text={created.key} label="키 복사" />
          </div>

          <div>
            <div className="text-[13px] font-semibold text-[#2A251D] dark:text-zinc-100 mb-1">구글 시트에 바로 붙여 넣기</div>
            <p className="text-[11.5px] text-[#8C8270] dark:text-zinc-500 mb-2 break-keep">
              시트의 빈 칸(A1)에 아래 수식을 붙여 넣으면 표가 채워져요. 엑셀은 데이터 → 웹에서 → 따옴표 안의 주소를 붙여 넣으세요.
            </p>
            <ul className="space-y-2">
              {examples.map((e) => {
                const formula = `=IMPORTDATA("${csvUrl(origin, e.path, created.key)}")`;
                return (
                  <li key={e.path} className="rounded-lg border border-[#E8E0D0] dark:border-zinc-700 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold text-[#3A342A] dark:text-zinc-200">{e.label}</span>
                      <CopyButton text={formula} label="수식 복사" />
                    </div>
                    <code className="mt-1 block font-mono text-[11px] text-[#6B5D47] dark:text-zinc-400 break-all">{formula}</code>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={primaryBtn}>
              복사했어요, 닫기
            </button>
          </div>
        </div>
      )}
    </CrmModal>
  );
}

function UsageGuide({ origin }: { origin: string }) {
  const sample = `${origin}/api/open/v1/members?format=csv&key=발급받은키`;
  return (
    <section className="px-4 py-4 rounded-2xl border border-[#E8E0D0] dark:border-zinc-800 bg-[#FEFCF7] dark:bg-zinc-900 space-y-4">
      <h2 className="text-[14px] font-semibold text-[#2A251D] dark:text-zinc-100">사용 방법</h2>

      <ol className="space-y-3 text-[12.5px] leading-relaxed text-[#3A342A] dark:text-zinc-300 break-keep">
        <li>
          <b>구글 시트</b> — 빈 칸에 <code className="font-mono text-[11.5px]">=IMPORTDATA(&quot;주소&quot;)</code>. 주소 끝에{" "}
          <code className="font-mono text-[11.5px]">?format=csv&amp;key=발급받은키</code>를 붙여요. 시트가 1시간쯤마다 알아서
          새로 가져와요.
          <code className="mt-1 block font-mono text-[11px] text-[#6B5D47] dark:text-zinc-400 break-all">
            =IMPORTDATA(&quot;{sample}&quot;)
          </code>
        </li>
        <li>
          <b>엑셀</b> — 데이터 → <b>웹에서</b> → 위와 같은 주소를 붙여 넣기. 이후 [모두 새로 고침]으로 최신 값을 받아요.
          브라우저 주소창에 넣으면 CSV 파일로 내려받아져요.
        </li>
        <li>
          <b>자동화 도구·스크립트</b> (Make·Zapier·Apps Script 등) — GET 요청에 헤더{" "}
          <code className="font-mono text-[11.5px]">Authorization: Bearer 발급받은키</code>. 주소에 키를 넣지 않아 더 안전하고,{" "}
          <code className="font-mono text-[11.5px]">format</code>을 빼면 JSON으로 받아요.
        </li>
      </ol>

      <div className="overflow-x-auto rounded-xl border border-[#E8E0D0] dark:border-zinc-800">
        <table className="w-full min-w-[560px] text-[12px]">
          <thead className="bg-[#F5F0E5] dark:bg-zinc-800/60 text-[#6B5D47] dark:text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">데이터</th>
              <th className="px-3 py-2 text-left font-semibold">주소</th>
              <th className="px-3 py-2 text-left font-semibold">내용</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E0D0]/70 dark:divide-zinc-800">
            {OPEN_API_ENDPOINTS.map((e) => (
              <tr key={e.path}>
                <td className="px-3 py-2 align-top whitespace-nowrap">
                  <div className="font-semibold text-[#2A251D] dark:text-zinc-100">{e.label}</div>
                  <div className="text-[11px] text-[#A89B80]">{e.scope ? apiKeyScopeLabel(e.scope) : "모든 키"}</div>
                </td>
                <td className="px-3 py-2 align-top font-mono text-[11.5px] text-[#3A342A] dark:text-zinc-300 break-all">
                  {e.path}
                  {e.example && <div className="text-[#A89B80]">{e.example}</div>}
                </td>
                <td className="px-3 py-2 align-top text-[#6B5D47] dark:text-zinc-400 break-keep">{e.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="list-disc pl-5 space-y-1 text-[11.5px] leading-relaxed text-[#8C8270] dark:text-zinc-500 break-keep">
        <li>값은 CRM 화면과 같은 계산이에요 — 회원 상태·만료일은 회원 목록, 결제 내역·월별 매출은 통계 매출 리스트와 같아요.</li>
        <li>결제 내역은 한 번에 366일, 월별 매출은 36개월까지 받을 수 있어요. 환불은 음수 금액으로 나와요.</li>
        <li>키 하나로 1분에 100번까지 부를 수 있어요.</li>
      </ul>
    </section>
  );
}
