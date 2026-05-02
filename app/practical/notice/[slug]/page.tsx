import Link from "next/link";
import { supabase } from "@/app/lib/supabase";
import DisclaimerBanner from "@/app/components/disclaimer-banner";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NoticeDetailPage(props: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ audience?: string }>;
}) {
  const { slug } = await props.params;
  const { audience: audParam } = await props.searchParams;
  const audience: "main" | "disabled" = audParam === "disabled" ? "disabled" : "main";

  const { data: notice } = await supabase
    .from("practical_oral_notices")
    .select("*")
    .eq("audience", audience)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!notice) notFound();

  const backHref = `/practical/notice${audience === "disabled" ? "?audience=disabled" : ""}`;

  return (
    <div className="min-h-screen bg-[#F8F4EC] dark:bg-zinc-950 px-4 py-6">
      <div className="max-w-2xl mx-auto">
        <Link href={backHref} className="text-[13px] text-[#6B5D47] dark:text-zinc-400 hover:underline">
          ← 공지 목록
        </Link>

        <div className="flex items-start gap-3 mt-2 mb-3">
          <div className="text-4xl shrink-0">{notice.icon || "📄"}</div>
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {notice.badge && (
                <span className="text-[11px] bg-[#C0392B] text-white px-2 py-0.5 rounded font-bold">{notice.badge}</span>
              )}
              <h1 className="text-2xl font-bold text-[#2A251D] dark:text-zinc-100">{notice.title}</h1>
            </div>
            {notice.summary && (
              <p className="text-[14px] text-[#6B5D47] dark:text-zinc-400 mt-1">{notice.summary}</p>
            )}
          </div>
        </div>

        <DisclaimerBanner updatedAt={notice.updated_at} />

        <div
          className="prose prose-sm max-w-none bg-[#FEFCF7] dark:bg-zinc-900 border border-[#E8E0D0] dark:border-zinc-700 rounded-2xl p-5 text-[#2A251D] dark:text-zinc-100"
          dangerouslySetInnerHTML={{ __html: notice.content || "" }}
        />

        <style>{`
          .prose h2 { font-size: 1.25rem; font-weight: 700; margin: 1em 0 0.5em; color: #2A251D; }
          .prose h3 { font-size: 1.05rem; font-weight: 700; margin: 0.8em 0 0.4em; color: #2A251D; }
          .prose h4 { font-size: 0.95rem; font-weight: 700; margin: 0.6em 0 0.3em; }
          .prose p { line-height: 1.85; margin: 0.4em 0; }
          .prose ul { list-style: disc; padding-left: 1.5em; margin: 0.4em 0; }
          .prose ol { list-style: decimal; padding-left: 1.5em; margin: 0.4em 0; }
          .prose li { margin: 0.2em 0; line-height: 1.7; }
          .prose blockquote {
            border-left: 3px solid #6B7B3A;
            padding: 0.5em 0.8em;
            background: #F5F0E5;
            color: #6B5D47;
            border-radius: 0 6px 6px 0;
            margin: 0.6em 0;
          }
          .prose strong { font-weight: 700; }
          .prose table { border-collapse: collapse; width: 100%; margin: 0.6em 0; }
          .prose mark { border-radius: 2px; padding: 0 2px; }
          .prose a { color: #6B7B3A; text-decoration: underline; }
          .dark .prose h2, .dark .prose h3, .dark .prose h4 { color: #fafafa; }
          .dark .prose blockquote { background: #27272a; color: #d4d4d8; }
        `}</style>
      </div>
    </div>
  );
}
