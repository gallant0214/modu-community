"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import type { TradePost } from "@/app/lib/trade-query";
import { promptLogin } from "@/app/lib/auth-prompt";

// 빠른 인하 옵션 — 중고거래·운동용품: -5/-10/-20, 센터매매(권리금): -5/-10/-15
const QUICK_DISCOUNTS_EQ: { pct: number; label: string }[] = [
  { pct: 5, label: "-5%" },
  { pct: 10, label: "-10%" },
  { pct: 20, label: "-20%" },
];
const QUICK_DISCOUNTS_CENTER: { pct: number; label: string }[] = [
  { pct: 5, label: "-5%" },
  { pct: 10, label: "-10%" },
  { pct: 15, label: "-15%" },
];

const formatThousand = (n: number): string => n.toLocaleString();
const parseNum = (s: string) => Number((s || "").replace(/\D/g, "")) || 0;

export default function TradeBumpPage() {
  const params = useParams();
  const router = useRouter();
  const tradeId = Number(params.id);
  const { user, getIdToken } = useAuth();

  const [post, setPost] = useState<TradePost | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [priceWonInput, setPriceWonInput] = useState("");
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [cooldownMsg, setCooldownMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = user ? await getIdToken().catch(() => null) : null;
        const res = await fetch(`/api/trade/${tradeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) { router.replace("/trade"); return; }
        const data = (await res.json()) as TradePost;
        if (cancelled) return;
        setPost(data);
        const ci = data.category === "center" && data.center_info && typeof data.center_info === "object" && !Array.isArray(data.center_info)
          ? (data.center_info as Record<string, unknown>)
          : null;
        const premium = ci && ci.premium && typeof ci.premium === "object" && !Array.isArray(ci.premium)
          ? (ci.premium as Record<string, unknown>)
          : null;
        const premiumManwon = premium && typeof premium.amount_manwon === "number" ? (premium.amount_manwon as number) : 0;
        const startWon =
          data.category === "equipment"
            ? (data.price_manwon || 0) * 10000
            : data.category === "gear"
              ? (data.price_won || 0)
              : premiumManwon * 10000;
        setPriceWonInput(formatThousand(startWon));
      } catch {
        router.replace("/trade");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tradeId, user, getIdToken, router]);

  const isEquipment = post?.category === "equipment";
  const isGear = post?.category === "gear";
  const isCenter = post?.category === "center";
  // center 권리금 정보 추출 (negotiable 이 "권리금없음/무권리" 면 변경 불가)
  const centerInfo = isCenter && post?.center_info && typeof post.center_info === "object" && !Array.isArray(post.center_info)
    ? (post.center_info as Record<string, unknown>)
    : null;
  const centerPremium = centerInfo && centerInfo.premium && typeof centerInfo.premium === "object" && !Array.isArray(centerInfo.premium)
    ? (centerInfo.premium as Record<string, unknown>)
    : null;
  const centerPremiumNegotiable = centerPremium && typeof centerPremium.negotiable === "string"
    ? (centerPremium.negotiable as string)
    : null;
  const centerHasPremium =
    !!centerPremium &&
    centerPremiumNegotiable !== "권리금없음" &&
    centerPremiumNegotiable !== "무권리" &&
    typeof centerPremium.amount_manwon === "number" &&
    (centerPremium.amount_manwon as number) > 0;
  const canChangePrice = isEquipment || isGear || (isCenter && centerHasPremium);
  const originalWon = useMemo(() => {
    if (!post) return 0;
    if (post.category === "equipment") return (post.price_manwon || 0) * 10000;
    if (post.category === "gear") return post.price_won || 0;
    if (post.category === "center" && centerPremium && typeof centerPremium.amount_manwon === "number") {
      return (centerPremium.amount_manwon as number) * 10000;
    }
    return 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);
  const currentWon = parseNum(priceWonInput);
  const discountWon = Math.max(0, originalWon - currentWon);
  const discountPct = originalWon > 0 ? Math.round((discountWon / originalWon) * 100) : 0;
  const willDrop = canChangePrice && currentWon > 0 && currentWon < originalWon;
  const bookmarkCount = post?.bookmark_count ?? 0;

  // 100원 단위 floor — 작은 가격에서도 -5%/-10% 구분.
  const applyDiscountPct = (pct: number) => {
    if (originalWon <= 0) return;
    const after = Math.floor((originalWon * (100 - pct)) / 100);
    const rounded = Math.max(0, Math.floor(after / 100) * 100);
    setPriceWonInput(formatThousand(rounded));
  };
  const resetPrice = () => setPriceWonInput(formatThousand(originalWon));
  const onPriceChange = (s: string) => {
    const digits = s.replace(/\D/g, "");
    setPriceWonInput(digits ? formatThousand(Number(digits)) : "");
  };

  const submit = async () => {
    if (!post) return;
    if (!user) { promptLogin("끌어올리기"); return; }
    setSubmitting(true);
    setResultMsg(null);
    setCooldownMsg(null);
    try {
      const token = await getIdToken();
      if (!token) { alert("로그인이 필요합니다."); return; }
      const body: Record<string, unknown> = {};
      if (isEquipment && currentWon !== originalWon) {
        body.new_price_manwon = Math.max(0, Math.floor(currentWon / 10000));
      }
      if (isGear && currentWon !== originalWon) {
        body.new_price_won = Math.max(0, currentWon);
      }
      if (isCenter && centerHasPremium && currentWon !== originalWon) {
        body.new_premium_manwon = Math.max(0, Math.floor(currentWon / 10000));
      }
      const res = await fetch(`/api/trade/${tradeId}/bump`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 429 && json?.error === "cooldown") {
        const ms = Number(json.remainingMs || 0);
        const days = Math.floor(ms / (24 * 3600 * 1000));
        const hours = Math.floor((ms / (3600 * 1000)) % 24);
        const minutes = Math.floor((ms / (60 * 1000)) % 60);
        const parts: string[] = [];
        if (days > 0) parts.push(`${days}일`);
        if (hours > 0) parts.push(`${hours}시간`);
        if (parts.length === 0) parts.push(`${Math.max(1, minutes)}분`);
        const cooldownLabel = post.category === "center" ? "2일에 한 번" : "3일에 한 번";
        setCooldownMsg(`${cooldownLabel} 끌어올릴 수 있어요.\n남은 시간: ${parts.join(" ")}`);
        return;
      }
      if (!res.ok) {
        alert(json?.error || "끌어올리기에 실패했습니다.");
        return;
      }
      const msg = json.price_dropped
        ? `끌어올리고 가격을 낮췄어요. 관심 ${bookmarkCount}명에게 알림이 전송됩니다.`
        : json.price_changed
          ? "끌어올리고 가격을 변경했어요."
          : "거래글이 다시 상단에 노출됩니다.";
      setResultMsg(msg);
      setTimeout(() => router.back(), 1200);
    } catch (e: any) {
      alert(e?.message || "끌어올리기에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !post) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const headerLine = canChangePrice
    ? bookmarkCount > 0
      ? isCenter
        ? `지금 권리금을 낮추면 관심을 누른 ${bookmarkCount}명에게 알림이 가요.`
        : `지금 가격을 낮추면 관심을 누른 ${bookmarkCount}명에게 알림이 가요.`
      : "지금 끌어올리면 관심 사용자에게 다시 노출됩니다."
    : "지금 끌어올리면 매물 목록 상단에 다시 노출돼요.";

  const previewWonByPct = (pct: number) =>
    originalWon > 0 ? Math.max(0, Math.floor((originalWon * (100 - pct)) / 100 / 100) * 100) : 0;

  const categoryLabel =
    post.category === "equipment" ? "[중고거래]" :
    post.category === "gear" ? "[운동용품]" :
    "[센터매매]";
  const categoryColor =
    post.category === "center" ? "text-[#C0392B]" : "text-[#1A6FCB]";

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 pb-32">
      {/* 헤더 */}
      <div className="sticky top-14 z-30 bg-[#F8F4EC]/85 dark:bg-zinc-950/85 backdrop-blur-md border-b border-[#E8E0D0]/70 dark:border-zinc-800">
        <div className="mx-auto max-w-2xl flex items-center gap-2 px-4 sm:px-6 py-3">
          <Link href={`/trade/${tradeId}`} className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase">끌어올리기</span>
          </Link>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-6 space-y-4">
        <h1 className="text-[20px] sm:text-[22px] font-bold text-[#2A251D] dark:text-zinc-100 leading-snug whitespace-pre-line">
          {headerLine}
        </h1>

        {/* 상품 미리보기 */}
        <div className="flex items-center gap-3 bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-3">
          <div className="w-14 h-14 rounded-xl overflow-hidden bg-[#F5F0E5] dark:bg-zinc-800 flex items-center justify-center shrink-0">
            {post.image_urls?.[0] ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={post.image_urls[0]} alt="" className="w-full h-full object-cover" />
            ) : (
              <svg className="w-6 h-6 text-[#A89B80]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[11px] font-bold ${categoryColor}`}>{categoryLabel}</p>
            <p className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 line-clamp-1">{post.title}</p>
            <p className="text-[13px] text-[#2A251D] dark:text-zinc-100 mt-0.5">
              {isCenter ? "권리금 " : ""}{originalWon > 0 ? `${formatThousand(originalWon)}원` : "-"}
            </p>
          </div>
        </div>

        {/* 가격 입력 — 중고거래·운동용품 */}
        {canChangePrice ? (
          <>
            <div className="flex items-center bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl px-4 py-2">
              <input
                value={priceWonInput}
                onChange={(e) => onPriceChange(e.target.value)}
                inputMode="numeric"
                maxLength={13}
                placeholder="0"
                className="flex-1 text-[22px] font-bold text-[#2A251D] dark:text-zinc-100 bg-transparent focus:outline-none py-2"
              />
              <span className="text-[15px] font-semibold text-[#6B5D47] dark:text-zinc-400">원</span>
            </div>

            {/* 빠른 할인 — 리셋 + -5/-10/-20% */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={resetPrice}
                className="flex-1 h-11 rounded-xl bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 flex items-center justify-center text-[#6B5D47] dark:text-zinc-400 hover:border-[#6B7B3A]/40"
                aria-label="초기화"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-3M20 14a8 8 0 01-14 3" />
                </svg>
              </button>
              {(isCenter ? QUICK_DISCOUNTS_CENTER : QUICK_DISCOUNTS_EQ).map((d) => {
                const previewWon = previewWonByPct(d.pct);
                const active = currentWon === previewWon && previewWon > 0 && previewWon < originalWon;
                return (
                  <button
                    key={d.pct}
                    type="button"
                    onClick={() => applyDiscountPct(d.pct)}
                    className={`flex-1 h-11 rounded-xl text-[14px] font-bold border transition-colors ${
                      active
                        ? "bg-[#6B7B3A] text-white border-[#6B7B3A]"
                        : "bg-[#FEFCF7] dark:bg-zinc-900 text-[#2A251D] dark:text-zinc-100 border-[#E8E0D0] dark:border-zinc-700 hover:border-[#6B7B3A]/40"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            {/* 변경 요약 카드 */}
            {willDrop && (
              <div className="flex items-start gap-3 p-3 bg-[#F5F0E5]/60 dark:bg-zinc-900/60 border border-[#6B7B3A]/40 rounded-2xl">
                <svg className="w-5 h-5 text-[#6B7B3A] mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" /></svg>
                <div className="flex-1">
                  <p className="text-[12px] text-[#8C8270]">변경 요약</p>
                  <p className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 mt-0.5">
                    {formatThousand(originalWon)}원 → {formatThousand(currentWon)}원
                  </p>
                  <p className="text-[12px] text-[#6B7B3A] mt-0.5">
                    {isCenter ? "권리금 " : ""}{formatThousand(discountWon)}원 인하 · {discountPct}% 할인
                    {bookmarkCount > 0 ? ` · 관심 ${bookmarkCount}명에게 알림` : ""}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2 p-3 bg-[#F5F0E5]/60 dark:bg-zinc-900/60 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl">
            <svg className="w-5 h-5 text-[#8C8270] mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 22a10 10 0 100-20 10 10 0 000 20z" /></svg>
            <p className="text-[12px] text-[#6B5D47] dark:text-zinc-400 leading-relaxed">
              {isCenter ? (
                <>권리금이 없거나 무권리로 설정된 글은 권리금을 끌어올리기 화면에서 변경할 수 없습니다.<br />수정은 거래글 상세에서 [수정] 버튼으로 진행해 주세요.</>
              ) : (
                <>가격 수정은 거래글 상세에서 [수정] 버튼으로 진행해 주세요.</>
              )}
            </p>
          </div>
        )}

        {cooldownMsg && (
          <div className="p-3 bg-[#FFF4E5] dark:bg-zinc-900 border border-[#F5D9B0] rounded-2xl text-[13px] text-[#C0392B] whitespace-pre-line">
            {cooldownMsg}
          </div>
        )}
        {resultMsg && (
          <div className="p-3 bg-[#F5F0E5]/60 dark:bg-zinc-900 border border-[#6B7B3A]/40 rounded-2xl text-[13px] text-[#6B7B3A] font-medium">
            {resultMsg}
          </div>
        )}
      </div>

      {/* 하단 CTA */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#F8F4EC] via-[#F8F4EC]/95 to-[#F8F4EC]/0 dark:from-zinc-950 dark:via-zinc-950/95 dark:to-zinc-950/0 pt-6 pb-4 z-20 pointer-events-none" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pointer-events-auto">
          <button
            onClick={submit}
            disabled={submitting}
            className="w-full py-4 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-bold text-[15px] rounded-2xl disabled:opacity-50 shadow-[0_12px_32px_-12px_rgba(107,123,58,0.6)] transition-all hover:-translate-y-0.5"
          >
            {submitting ? "처리 중..." : "끌어올리기"}
          </button>
        </div>
      </div>
    </div>
  );
}
