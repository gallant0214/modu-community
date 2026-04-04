"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { JobPost } from "@/app/lib/types";
import { useAuth } from "@/app/components/auth-provider";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 last:border-0">
      <span className="text-xs text-zinc-400 w-16 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-zinc-800 dark:text-zinc-200 flex-1">{value}</span>
    </div>
  );
}

export default function JobDetailPage() {
  const router = useRouter();
  const params = useParams();
  const jobId = params.id as string;
  const { user, getIdToken } = useAuth();

  const [job, setJob] = useState<JobPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`);
        if (!res.ok) { router.replace("/jobs"); return; }
        const data = await res.json();
        setJob(data);
        // 조회수 증가
        fetch(`/api/jobs/${jobId}/view`, { method: "POST" }).catch(() => {});
        // 북마크 상태
        const token = await getIdToken();
        if (token) {
          fetch(`/api/jobs/${jobId}/bookmark`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).then(d => { if (d.bookmarked) setBookmarked(true); }).catch(() => {});
        }
      } catch {
        router.replace("/jobs");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [jobId, router]);

  const handleLike = async () => {
    if (!job) return;
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/jobs/${jobId}/like`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setJob((prev) => prev ? { ...prev, likes: data.likes } : prev);
        setLiked(!liked);
      }
    } catch {}
  };

  const handleDelete = async () => {
    if (!job) return;
    setDeleting(true);
    try {
      const token = await getIdToken();
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        router.replace("/jobs");
      }
    } catch {
      setDeleting(false);
    }
  };

  const handleClose = async () => {
    if (!job) return;
    try {
      const token = await getIdToken();
      await fetch(`/api/jobs/${jobId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ is_closed: !job.is_closed }),
      });
      setJob((prev) => prev ? { ...prev, is_closed: !prev.is_closed } : prev);
    } catch {}
  };

  const isOwner = user && job && user.uid === job.firebase_uid;

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <div className="mx-auto max-w-2xl">

        {/* 상단 바 */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800">
          <button onClick={() => router.back()} className="p-1.5 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm font-medium text-zinc-500 flex-1">구인 게시판</span>
          {isOwner && (
            <div className="flex items-center gap-1">
              <Link
                href={`/jobs/${jobId}/edit`}
                className="px-3 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >수정</Link>
              <button
                onClick={handleClose}
                className={`px-3 py-1.5 text-xs border rounded-lg transition-colors ${job.is_closed ? "border-blue-300 text-blue-600 hover:bg-blue-50" : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800"}`}
              >{job.is_closed ? "모집재개" : "모집종료"}</button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1.5 text-xs border border-red-200 dark:border-red-900 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950"
              >삭제</button>
            </div>
          )}
        </div>

        <div className="px-4 pt-4">
          {/* 뱃지 */}
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 text-xs rounded-md font-medium">
              {job.sport}
            </span>
            {job.employment_type && (
              <span className="inline-block px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs rounded-md">
                {job.employment_type}
              </span>
            )}
            {job.is_closed && (
              <span className="inline-block px-2 py-0.5 bg-zinc-200 dark:bg-zinc-700 text-zinc-400 text-xs rounded-md">모집종료</span>
            )}
          </div>

          {/* 제목 */}
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-1 leading-snug">{job.title}</h1>

          {/* 메타 정보 */}
          <div className="flex items-center gap-2 text-xs text-zinc-400 mb-4">
            <span>{job.center_name}</span>
            {job.region_name && <><span>·</span><span>{job.region_name}</span></>}
            <span>·</span><span>{formatDate(job.created_at)}</span>
            <span>·</span><span>조회 {job.views}</span>
          </div>

          {/* 내용 */}
          <div className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap mb-6">
            {job.description}
          </div>

          {/* 상세 정보 카드 */}
          <div className="bg-zinc-50 dark:bg-zinc-900 rounded-xl p-4 mb-4">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-3">채용 상세</h2>
            <InfoRow label="종목" value={job.sport} />
            <InfoRow label="근무형태" value={job.employment_type} />
            <InfoRow label="급여" value={job.salary} />
            <InfoRow label="모집인원" value={job.headcount} />
            <InfoRow label="지역" value={job.region_name} />
            <InfoRow label="주소" value={job.address} />
            <InfoRow label="마감일" value={job.deadline} />
            {job.benefits && <InfoRow label="복리후생" value={job.benefits} />}
            {job.preferences && <InfoRow label="우대사항" value={job.preferences} />}
          </div>

          {/* 연락처 */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  {job.author_role && <span className="text-xs text-zinc-400 mr-1">{job.author_role}</span>}
                  {job.author_name || job.center_name}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">{job.contact_type}</p>
              </div>
              <button
                onClick={() => setShowContact(!showContact)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {showContact ? "숨기기" : "연락처 보기"}
              </button>
            </div>
            {showContact && (
              <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{job.contact}</p>
              </div>
            )}
          </div>

          {/* 좋아요 + 북마크 */}
          <div className="flex justify-center gap-3 mb-8">
            <button
              onClick={handleLike}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full border-2 transition-all ${
                liked
                  ? "border-red-400 text-red-500 bg-red-50 dark:bg-red-950"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-red-300 hover:text-red-400"
              }`}
            >
              <svg className="w-5 h-5" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span className="text-sm font-medium">{job.likes}</span>
            </button>
            <button
              onClick={async () => {
                const token = await getIdToken();
                const res = await fetch(`/api/jobs/${jobId}/bookmark`, {
                  method: "POST",
                  headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) setBookmarked(!bookmarked);
              }}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full border-2 transition-all ${
                bookmarked
                  ? "border-yellow-400 text-yellow-500 bg-yellow-50 dark:bg-yellow-950"
                  : "border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-yellow-300 hover:text-yellow-400"
              }`}
            >
              <svg className="w-5 h-5" fill={bookmarked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span className="text-sm font-medium">북마크</span>
            </button>
          </div>
        </div>

        {/* 삭제 확인 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowDeleteConfirm(false)} />
            <div className="relative bg-white dark:bg-zinc-900 rounded-2xl p-6 mx-4 w-full max-w-sm shadow-xl">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-2">게시글 삭제</h3>
              <p className="text-sm text-zinc-500 mb-5">정말 삭제하시겠습니까? 되돌릴 수 없습니다.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 py-2.5 text-sm border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-600 dark:text-zinc-400"
                >취소</button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium disabled:opacity-50"
                >{deleting ? "삭제 중..." : "삭제"}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
