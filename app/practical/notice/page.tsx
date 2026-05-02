import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import DisclaimerBanner from "@/app/components/disclaimer-banner";

export const dynamic = "force-dynamic";

interface NoticeCard {
  id: number;
  audience: string;
  slug: string;
  icon: string | null;
  badge: string | null;
  title: string;
  summary: string | null;
  display_order: number | null;
  updated_at: string | null;
}

async function getNotices(audience: "main" | "disabled"): Promise<NoticeCard[]> {
  const { data } = await supabase
    .from("practical_oral_notices")
    .select("id, audience, slug, icon, badge, title, summary, display_order, updated_at")
    .eq("audience", audience)
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  return (data || []) as NoticeCard[];
}

export default async function PracticalOralNoticePage(props: {
  searchParams: Promise<{ audience?: string }>;
}) {
  const { audience: audParam } = await props.searchParams;
  const audience: "main" | "disabled" = audParam === "disabled" ? "disabled" : "main";
  const notices = await getNotices(audience);

  const latestUpdate = notices.reduce((acc, n) => {
    if (!n.updated_at) return acc;
    if (!acc) return n.updated_at;
    return new Date(n.updated_at) > new Date(acc) ? n.updated_at : acc;
  }, "" as string);

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href="/practical" className="text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:underline">
          ← 실기·구술
        </Link>
        <h1 className="text-2xl font-bold mt-1 mb-1 text-[#2A251D] dark:text-zinc-100">
          📢 26년 실기·구술 필독사항
        </h1>
        <p className="text-[13px] text-[#A89B80] mb-4">
          {audience === "main" ? "대한체육회 / 71개 종목" : "대한장애인체육회 / 30개 종목"}
        </p>

        {/* audience 토글 */}
        <div className="flex gap-2 mb-4">
          <Link href="/practical/notice" className={tabCls(audience === "main")}>🏢 일반</Link>
          <Link href="/practical/notice?audience=disabled" className={tabCls(audience === "disabled")}>♿ 장애인</Link>
        </div>

        <DisclaimerBanner updatedAt={latestUpdate || null} />

        {/* 카드 목록 */}
        <div className="space-y-2">
          {notices.length === 0 ? (
            <p className="text-center py-12 text-[#A89B80]">등록된 공지가 없습니다</p>
          ) : (
            notices.map((n) => (
              <Link
                key={n.id}
                href={`/practical/notice/${n.slug}${audience === "disabled" ? "?audience=disabled" : ""}`}
                className="block bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-4 hover:border-[#6B7B3A] hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl shrink-0">{n.icon || "📄"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      {n.badge && (
                        <span className="text-[10px] bg-[#C0392B] text-white px-2 py-0.5 rounded font-bold">{n.badge}</span>
                      )}
                      <h3 className="font-bold text-[#2A251D] dark:text-zinc-100 text-[15px]">{n.title}</h3>
                    </div>
                    <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400 line-clamp-2">{n.summary}</p>
                  </div>
                  <div className="text-[#A89B80] text-xl shrink-0 self-center">›</div>
                </div>
              </Link>
            ))
          )}

          {/* 71종목 단체 별도 카드 */}
          <Link
            href={`/practical/notice/orgs${audience === "disabled" ? "?audience=disabled" : ""}`}
            className="block bg-[#F5F0E5] dark:bg-zinc-800 border border-[#6B7B3A] dark:border-[#A8B87A] rounded-2xl p-4 hover:shadow-sm transition-all"
          >
            <div className="flex items-start gap-3">
              <div className="text-3xl shrink-0">🏢</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-[#2A251D] dark:text-zinc-100 text-[15px] mb-0.5">
                  {audience === "main" ? "71개 종목 주관단체 연락처" : "30개 종목 주관단체 연락처"}
                </h3>
                <p className="text-[13px] text-[#6B5D47] dark:text-zinc-400">검색 가능 · 전화/주소/홈페이지</p>
              </div>
              <div className="text-[#6B7B3A] text-xl shrink-0 self-center">›</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

const tabCls = (active: boolean) =>
  `px-4 py-2 rounded-lg text-[14px] font-bold transition-colors ${
    active
      ? "bg-[#6B7B3A] text-white"
      : "bg-white dark:bg-zinc-800 text-[#3A342A] dark:text-zinc-200 border border-[#E8E0D0] dark:border-zinc-700"
  }`;
