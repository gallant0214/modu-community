import { cache } from "react";
import { supabase } from "@/app/lib/supabase";
import type { JobPost } from "@/app/lib/types";
import { pageMeta, toPlainExcerpt } from "@/app/lib/seo";
import { JobView } from "./job-view";

// ISR: 60초. 수정·삭제는 클라이언트가 /api/jobs/[id] 를 다시 읽어 바로 반영한다.
export const revalidate = 60;

interface PageProps {
  params: Promise<{ id: string }>;
}

// 🚨 공개 필드만. ip_address·firebase_uid 는 HTML 에 싣지 않는다(작성자 확인은 클라이언트 재조회로).
const PUBLIC_COLUMNS =
  "id, title, description, center_name, address, author_role, author_name, contact_type, contact, sport, region_name, region_code, employment_type, salary, headcount, benefits, preferences, deadline, likes, views, is_closed, hidden, created_at, updated_at";

const loadJob = cache(async (rawId: string) => {
  const id = Number(rawId);
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const { data, error } = await supabase.from("job_posts").select(PUBLIC_COLUMNS).eq("id", id).maybeSingle();
    if (error || !data) return null;
    return data as unknown as JobPost & { hidden: boolean | null };
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const job = await loadJob(id);
  if (!job) return { title: "구인 공고를 찾을 수 없습니다", robots: { index: false } };
  const where = [job.center_name, job.region_name].filter(Boolean).join(" · ");
  const lead = [job.sport, job.employment_type, job.salary].filter(Boolean).join(" · ");
  const body = toPlainExcerpt(job.description, 110);
  return pageMeta({
    title: where ? `${job.title} - ${where}` : job.title,
    description: [lead, body].filter(Boolean).join(" — ") || `스포츠 구인 공고 「${job.title}」`,
    path: `/jobs/${job.id}`,
    type: "article",
    noindex: !!job.hidden,
  });
}

export default async function JobDetailPage({ params }: PageProps) {
  const { id } = await params;
  const job = await loadJob(id);
  const initialJob = job ? ({ ...job, firebase_uid: "", bookmark_count: 0 } as JobPost) : null;
  return <JobView initialJob={initialJob} />;
}
