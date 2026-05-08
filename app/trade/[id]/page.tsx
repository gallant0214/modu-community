"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/components/auth-provider";
import { shareOrCopy } from "@/app/lib/share";
import type { TradePost } from "@/app/lib/trade-query";

interface TradePostDetail extends TradePost {
  is_bookmarked?: boolean;
  is_owner?: boolean;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
// 센터매매 — 만원/억원 단위 (보증금·월세·관리비·권리금)
function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (n === 0) return "0만원";
  if (n >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}억원`;
  return `${n.toLocaleString()}만원`;
}
// 중고거래 — 원 단위 표시. amount_manwon × 10000.
function formatPriceWon(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (n === 0) return "0원";
  if (n >= 10000) {
    const eok = Math.floor(n / 10000);
    const rest = n % 10000;
    if (rest === 0) return `${eok}억원`;
    return `${eok}억 ${rest.toLocaleString()}만원`;
  }
  return `${(n * 10000).toLocaleString()}원`;
}

/* 라벨-값 행 */
function InfoRow({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 border-b border-[#E8E0D0]/60 dark:border-zinc-800 last:border-0">
      <span className="text-[12px] text-[#8C8270] dark:text-zinc-500 shrink-0">{label}</span>
      <span className={`text-[14px] text-right break-words ${accent ? "font-bold text-[#6B7B3A] dark:text-[#A8B87A] text-[16px]" : "text-[#3A342A] dark:text-zinc-100 font-medium"}`}>
        {value}
      </span>
    </div>
  );
}

/* 모달 */
function Modal({ open, onClose, children, footer, title }: {
  open: boolean; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; title?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[#2A251D]/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-[#FEFCF7] dark:bg-zinc-900 rounded-3xl shadow-2xl border border-[#E8E0D0] dark:border-zinc-700 max-h-[80vh] flex flex-col overflow-hidden">
        {title && <div className="px-5 pt-6 pb-3 text-center"><h3 className="text-base font-bold text-[#2A251D] dark:text-zinc-100">{title}</h3></div>}
        <div className="flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-[#E8E0D0]/70 dark:border-zinc-800 bg-[#FBF7EB]/50 dark:bg-transparent">{footer}</div>}
      </div>
    </div>
  );
}

export default function TradeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tradeId = params.id as string;
  const { user, getIdToken } = useAuth();

  const [post, setPost] = useState<TradePostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImg, setActiveImg] = useState(0);
  const [bookmarked, setBookmarked] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getIdToken().catch(() => null);
        const res = await fetch(`/api/trade/${tradeId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) { router.replace("/trade"); return; }
        const data: TradePostDetail = await res.json();
        if (cancelled) return;
        setPost(data);
        setBookmarked(!!data.is_bookmarked);
        // 조회수 증가
        fetch(`/api/trade/${tradeId}/view`, { method: "POST" }).catch(() => {});
      } catch {
        router.replace("/trade");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tradeId, router, getIdToken]);

  /* 북마크 토글 */
  const handleBookmark = async () => {
    if (!user) { alert("북마크는 로그인 후 이용할 수 있습니다."); return; }
    const prev = bookmarked;
    setBookmarked(!prev); // 낙관적
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/trade/${tradeId}/bookmark`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error);
      setBookmarked(!data.unbookmarked);
      if (post) setPost({ ...post, bookmark_count: data.bookmark_count ?? post.bookmark_count });
    } catch {
      setBookmarked(prev);
    }
  };

  /* 공유 */
  const handleShare = async () => {
    if (!post) return;
    const result = await shareOrCopy({
      title: post.title,
      text: `"${post.title}"\n${post.region_sido} ${post.region_sigungu}\n\n모두의 지도사 거래 게시판에서 보기`,
      url: `https://moducm.com/trade/${post.id}`,
    });
    if (result === "copied") {
      setShareToast("링크가 복사되었습니다");
      setTimeout(() => setShareToast(null), 2000);
    }
    // 공유 카운트 +1 (best-effort)
    fetch(`/api/trade/${tradeId}/share`, { method: "POST" }).catch(() => {});
    if (post) setPost({ ...post, share_count: (post.share_count ?? 0) + 1 });
  };

  /* 본인 글 삭제 */
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/trade/${tradeId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) router.replace("/trade");
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-[#F8F4EC] dark:bg-zinc-950">
        <div className="w-7 h-7 border-2 border-[#6B7B3A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!post) return null;

  /* center_info 정규화 */
  const ci = (post.center_info && typeof post.center_info === "object" ? post.center_info : null) as Record<string, unknown> | null;
  const ei = (post.equipment_info && typeof post.equipment_info === "object" ? post.equipment_info : null) as Record<string, unknown> | null;

  const renderMoney = (key: string, label: string) => {
    if (!ci || !ci[key]) return null;
    const m = ci[key] as { amount_manwon?: number; negotiable?: string };
    const isNone = m.negotiable === "권리금없음";
    const isAgree = m.negotiable === "협의가능" || m.negotiable === "협의 가능";
    return (
      <InfoRow
        label={label}
        value={
          isNone ? (
            <span className="text-[#8C8270] dark:text-zinc-400 font-semibold">권리금 없음</span>
          ) : (
            <>
              {formatPrice(m.amount_manwon ?? 0)}
              {m.negotiable && (
                <span className={`ml-1 text-[11px] font-semibold ${isAgree ? "text-[#6B7B3A]" : "text-[#C0392B]"}`}>
                  ({m.negotiable})
                </span>
              )}
            </>
          )
        }
      />
    );
  };

  const renderMember = () => {
    if (!ci?.member_count) return null;
    const mc = ci.member_count as Record<string, unknown>;
    if (mc.type === "number") return <InfoRow label="보유회원수" value={`${(mc.value as number)?.toLocaleString?.() || mc.value}명`} />;
    if (mc.type === "meet_to_tell") return <InfoRow label="보유회원수" value="만나면 알려드림" />;
    if (mc.type === "etc") return <InfoRow label="보유회원수" value={String(mc.text || "")} />;
    return null;
  };

  const tradeMethods = (ei?.trade_methods && Array.isArray(ei.trade_methods) ? ei.trade_methods : []) as Array<{ type: string; loading?: boolean; text?: string }>;
  const methodLabels = tradeMethods.map(m => {
    if (m.type === "direct") return "직거래";
    if (m.type === "parcel") return "택배거래";
    if (m.type === "delivery") return `용달거래${m.loading ? " (상차 가능)" : ""}`;
    if (m.type === "etc") return m.text || "기타";
    return m.type;
  });

  type EquipItem = { name: string; condition: string; price_manwon: number };
  const rawItems = (ei?.items && Array.isArray(ei.items) ? ei.items : []) as Array<Partial<EquipItem>>;
  const equipItems: EquipItem[] = rawItems.length > 0
    ? rawItems.map(it => ({
        name: String(it.name || ""),
        condition: String(it.condition || ""),
        price_manwon: Number(it.price_manwon || 0),
      }))
    : [{
        name: post.product_name || "",
        condition: post.condition_text || "",
        price_manwon: post.price_manwon || 0,
      }];

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 pb-24">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-4 pb-5 space-y-4">
        {/* 상단 바 (구인 상세 패턴) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Link href="/trade" className="inline-flex items-center gap-1.5 -ml-1 px-1 py-0.5 rounded-lg text-[#6B7B3A] hover:bg-[#F5F0E5]/60 dark:hover:bg-zinc-800 transition-colors flex-1 min-w-0">
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[11px] font-bold tracking-[0.15em] uppercase truncate">거래 게시판</span>
          </Link>
          <button onClick={handleBookmark} aria-label="북마크" title={bookmarked ? "북마크 저장됨" : "북마크"}
            className={`shrink-0 p-2 rounded-lg border transition-colors ${
              bookmarked
                ? "border-[#6B7B3A] text-[#6B7B3A] bg-[#F5F0E5]"
                : "border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800"
            }`}>
            <svg width="16" height="16" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
            </svg>
          </button>
          <button onClick={handleShare} aria-label="공유" title="공유하기"
            className="shrink-0 p-2 rounded-lg border border-[#E8E0D0] dark:border-zinc-700 text-[#6B5D47] dark:text-zinc-400 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors">
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
            </svg>
          </button>
          {post.is_owner && (
            <>
              <Link href={`/trade/${post.id}/edit`} className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs border border-[#E8E0D0] dark:border-zinc-700 rounded-lg text-[#6B5D47] dark:text-zinc-400 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-[#F5F0E5] dark:hover:bg-zinc-800 transition-colors">수정</Link>
              <button onClick={() => setShowDeleteConfirm(true)} className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs border border-red-200 dark:border-red-900 rounded-lg text-red-500 bg-[#FEFCF7] dark:bg-zinc-900 hover:bg-red-50 dark:hover:bg-red-950 transition-colors">삭제</button>
            </>
          )}
        </div>
        {/* 사진 슬라이더 */}
        {post.image_urls?.length > 0 && (
          <div className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl overflow-hidden">
            <div className="bg-[#F5F0E5] dark:bg-zinc-800 relative flex items-center justify-center" style={{ maxHeight: "75vh", minHeight: 200 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={post.image_urls[activeImg]}
                alt={post.title}
                // 비율 보존 + 화면 75vh 캡. 가로/세로 긴 사진 모두 잘림 없이 전체 노출
                className="max-w-full w-auto h-auto bg-black/[0.03]"
                style={{ maxHeight: "75vh" }}
              />
              <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                post.category === "center" ? "bg-[#C0392B] text-white" : "bg-[#6B7B3A] text-white"
              }`}>
                {post.category === "center" ? "센터매매" : "중고거래"}
              </span>
              {post.image_urls.length > 1 && (
                <span className="absolute bottom-3 right-3 px-2.5 py-1 bg-black/60 text-white text-[11px] rounded-full">
                  {activeImg + 1}/{post.image_urls.length}
                </span>
              )}
            </div>
            {post.image_urls.length > 1 && (
              <div className="flex gap-1.5 p-2.5 overflow-x-auto">
                {post.image_urls.map((url, i) => (
                  <button key={i} onClick={() => setActiveImg(i)}
                    className={`shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${
                      activeImg === i ? "border-[#6B7B3A]" : "border-transparent opacity-70 hover:opacity-100"
                    }`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 제목 + 메타 */}
        <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
          <h1 className="text-[20px] sm:text-[22px] font-bold text-[#2A251D] dark:text-zinc-100 leading-snug tracking-tight">{post.title}</h1>
          <div className="mt-2 flex items-center gap-3 text-[12px] text-[#8C8270] dark:text-zinc-500">
            <span>{post.region_sido} {post.region_sigungu}</span>
            <span>·</span>
            <span>{formatDate(post.created_at)}</span>
            <span>·</span>
            <span>조회 {post.view_count}</span>
          </div>
        </section>

        {/* 카테고리별 상세 정보 */}
        {post.category === "equipment" ? (
          <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
            <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2">제품 정보</h2>
            {equipItems.length > 1 ? (
              <div className="space-y-3">
                {equipItems.map((it, i) => (
                  <div key={i} className="border border-[#E8E0D0]/70 dark:border-zinc-700 rounded-2xl p-3 sm:p-4 bg-[#FBF7EB]/40 dark:bg-zinc-900/40">
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="w-5 h-5 rounded-full bg-[#6B7B3A] text-white text-[11px] font-bold flex items-center justify-center">{i + 1}</span>
                      <span className="text-[12px] font-bold text-[#6B7B3A]">물품 {i + 1}</span>
                    </div>
                    <InfoRow label="가격" accent value={formatPriceWon(it.price_manwon)} />
                    <InfoRow label="제품명" value={it.name || "-"} />
                    <InfoRow label="상태" value={it.condition || "-"} />
                  </div>
                ))}
                <div className="pt-1">
                  <InfoRow label="거래 방식" value={methodLabels.length ? methodLabels.join(", ") : "-"} />
                  {post.region_detail && <InfoRow label="상세 주소" value={post.region_detail} />}
                  <InfoRow label="센터명" value={post.center_name || "-"} />
                </div>
              </div>
            ) : (
              <div>
                <InfoRow label="가격" accent value={formatPriceWon(equipItems[0].price_manwon)} />
                <InfoRow label="제품명" value={equipItems[0].name || "-"} />
                <InfoRow label="상태" value={equipItems[0].condition || "-"} />
                <InfoRow label="거래 방식" value={methodLabels.length ? methodLabels.join(", ") : "-"} />
                {post.region_detail && <InfoRow label="상세 주소" value={post.region_detail} />}
                <InfoRow label="센터명" value={post.center_name || "-"} />
              </div>
            )}
          </section>
        ) : (
          <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
            <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 mb-2">매매 정보</h2>
            <div>
              <InfoRow label="매장 종류" value={String(ci?.store_type || "-")} />
              <InfoRow label="지역" value={`${post.region_sido} ${post.region_sigungu}`} />
              <InfoRow label="센터명" value={ci?.name_visible ? String(ci?.name || "-") : "비공개"} />
              <InfoRow label="평수" value={ci?.area_pyeong ? `${(ci.area_pyeong as number).toLocaleString()}평` : "-"} />
              {renderMoney("deposit", "보증금")}
              {renderMoney("monthly", "월세")}
              {renderMoney("mgmt_fee", "관리비")}
              {renderMoney("premium", "권리금")}
              {renderMember()}
            </div>
          </section>
        )}

        {/* 본문 */}
        {post.body && (
          <section className="bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-3xl p-5 sm:p-6">
            <h2 className="text-[14px] font-bold text-[#2A251D] dark:text-zinc-100 mb-3">{post.category === "center" ? "인수 조건 및 상세 내용" : "상세 설명"}</h2>
            <p className="text-[14px] text-[#3A342A] dark:text-zinc-200 leading-relaxed whitespace-pre-wrap break-words">{post.body}</p>
          </section>
        )}

        {/* 안내 */}
        <div className="px-1 text-[11px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">
          본 거래는 작성자와 구매자 간 직접 거래이며, 모두의 지도사는 거래에 일체 관여하지 않습니다.
          허위·사기성 글로 인한 피해는 작성자에게 민·형사상 책임이 있습니다.
        </div>
      </div>

      {/* 하단 연락처 노출 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#F8F4EC] via-[#F8F4EC]/95 to-[#F8F4EC]/0 dark:from-zinc-950 dark:via-zinc-950/95 dark:to-zinc-950/0 pt-6 pb-4 z-20 pointer-events-none" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
        <div className="mx-auto max-w-2xl px-4 sm:px-6 pointer-events-auto">
          <button onClick={() => setShowContact(true)}
            className="w-full py-4 bg-[#6B7B3A] hover:bg-[#5A6930] text-white font-bold text-[15px] rounded-2xl shadow-[0_12px_32px_-12px_rgba(107,123,58,0.6)] transition-all hover:-translate-y-0.5">
            연락처 보기
          </button>
        </div>
      </div>

      {/* 공유 토스트 */}
      {shareToast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 z-50 px-4 py-2 bg-[#2A251D]/90 text-white text-[13px] rounded-full shadow-xl">
          {shareToast}
        </div>
      )}

      {/* 연락처 모달 */}
      <Modal open={showContact} onClose={() => setShowContact(false)} title="연락처">
        <div className="px-5 py-6 text-center space-y-3">
          <div className="text-[24px] font-bold text-[#2A251D] dark:text-zinc-100 tracking-tight select-text">
            {post.contact_phone}
          </div>
          <p className="text-[12px] text-[#8C8270] dark:text-zinc-500 leading-relaxed">
            번호 클릭 시 전화 연결되거나 복사 가능합니다.<br />
            거래 시 사기 피해에 유의하세요.
          </p>
          <a href={`tel:${post.contact_phone}`} className="block w-full py-3 bg-[#6B7B3A] hover:bg-[#5A6930] text-white text-[14px] font-semibold rounded-xl">
            전화 걸기
          </a>
          <button onClick={() => { navigator.clipboard?.writeText(post.contact_phone); setShareToast("연락처가 복사되었습니다"); setTimeout(() => setShareToast(null), 2000); setShowContact(false); }}
            className="block w-full py-3 border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 text-[14px] font-semibold text-[#3A342A] dark:text-zinc-200 rounded-xl hover:bg-[#F5F0E5]">
            번호 복사
          </button>
        </div>
      </Modal>

      {/* 삭제 확인 */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="글을 삭제할까요?"
        footer={
          <div className="flex gap-2">
            <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 border border-[#E8E0D0] dark:border-zinc-700 bg-[#FEFCF7] dark:bg-zinc-800 rounded-xl text-[13px] font-semibold text-[#6B5D47] dark:text-zinc-400 hover:bg-[#F5F0E5]">취소</button>
            <button onClick={handleDelete} disabled={deleting}
              className="flex-1 py-3 bg-[#C0392B] hover:bg-[#A93226] text-white rounded-xl text-[13px] font-semibold disabled:opacity-50 shadow-[0_4px_14px_-4px_rgba(192,57,43,0.4)]">
              {deleting ? "삭제 중..." : "삭제"}
            </button>
          </div>
        }>
        <div className="px-5 py-4">
          <p className="text-[13px] text-[#3A342A] dark:text-zinc-300 leading-relaxed">
            삭제된 글은 복구할 수 없습니다. 정말 삭제하시겠습니까?
          </p>
        </div>
      </Modal>
    </div>
  );
}
