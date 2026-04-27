import { supabase } from "@/app/lib/supabase";
import { cached } from "@/app/lib/cache";
import { REGION_GROUPS } from "@/app/lib/region-data";
import type { JobPost } from "@/app/lib/types";

export type SortCol = "created_at" | "views" | "likes";

const SUB_CODE_INFO: Record<string, { parent: string; subName: string }> = {};
for (const g of REGION_GROUPS) {
  const parent = g.code.toLowerCase();
  for (const s of g.subRegions) {
    SUB_CODE_INFO[s.code.toLowerCase()] = { parent, subName: s.name };
  }
}

export function getSortCol(sort: string): SortCol {
  if (sort === "popular") return "views";
  if (sort === "likes") return "likes";
  return "created_at";
}

/**
 * jobs 검색/필터 RPC 호출 (search_job_posts + count_job_posts).
 * 동적 WHERE 조합이 워낙 많아 PostgreSQL 측에서 EXECUTE format 으로 처리.
 */
export async function queryJobs(opts: {
  regionCode: string;
  searchPattern: string;
  searchType: string;
  employmentType: string;
  sportFilter: string;
  hideClosed: boolean;
  limit: number;
  offset: number;
  orderCol: SortCol;
}) {
  const subInfo = opts.regionCode
    ? SUB_CODE_INFO[opts.regionCode.toLowerCase()]
    : undefined;
  const parentCode = subInfo?.parent || "";
  const subNamePattern = subInfo ? `% - ${subInfo.subName}%` : "";

  const baseParams = {
    p_region_code: opts.regionCode,
    p_parent_code: parentCode,
    p_sub_name_pattern: subNamePattern,
    p_search_pattern: opts.searchPattern,
    p_search_type: opts.searchType,
    p_employment_type: opts.employmentType,
    p_sport_filter: opts.sportFilter,
    p_hide_closed: opts.hideClosed,
  };

  const [rowsRes, countRes] = await Promise.all([
    supabase.rpc("search_job_posts", {
      ...baseParams,
      p_order_col: opts.orderCol,
      p_limit: opts.limit,
      p_offset: opts.offset,
    }),
    supabase.rpc("count_job_posts", baseParams),
  ]);

  if (rowsRes.error) throw rowsRes.error;
  if (countRes.error) throw countRes.error;

  return {
    rows: (rowsRes.data || []) as unknown as JobPost[],
    countResult: [{ total: countRes.data ?? 0 }],
  };
}

export interface JobsPageResult {
  posts: JobPost[];
  total: number;
  page: number;
  totalPages: number;
}

export async function fetchJobsPage(params: {
  regionCode?: string;
  sort?: string;
  page?: number;
  limit?: number;
  q?: string;
  searchType?: string;
  employmentType?: string;
  hideClosed?: boolean;
  sportFilter?: string;
}): Promise<JobsPageResult> {
  const regionCode = params.regionCode || "";
  const sort = params.sort || "latest";
  const page = Math.max(1, params.page || 1);
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const q = (params.q || "").trim();
  const searchType = params.searchType || "all";
  const employmentType = params.employmentType || "";
  const hideClosed = params.hideClosed || false;
  const sportFilter = params.sportFilter || "";

  const searchPattern = q ? `%${q}%` : "";
  const orderCol = getSortCol(sort);
  const isSearching = !!q;

  const cacheKey = !isSearching
    ? `jobs:r:${regionCode}:s:${sort}:p:${page}:e:${employmentType}:sp:${sportFilter}:hc:${hideClosed}`
    : null;

  const result = cacheKey
    ? await cached(cacheKey, 60, () =>
        queryJobs({
          regionCode,
          searchPattern,
          searchType,
          employmentType,
          sportFilter,
          hideClosed,
          limit,
          offset,
          orderCol,
        }),
      )
    : await queryJobs({
        regionCode,
        searchPattern,
        searchType,
        employmentType,
        sportFilter,
        hideClosed,
        limit,
        offset,
        orderCol,
      });

  const total = Number(result.countResult[0].total);

  return {
    posts: result.rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
