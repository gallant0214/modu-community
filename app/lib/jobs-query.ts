import { sql } from "@/app/lib/db";
import { cached } from "@/app/lib/cache";

export type SortCol = "created_at" | "views" | "likes";

export function getSortCol(sort: string): SortCol {
  if (sort === "popular") return "views";
  if (sort === "likes") return "likes";
  return "created_at";
}

/**
 * 통합 검색(all): title OR sport OR center_name OR description
 * 기존 타입별 검색도 하위 호환 유지
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
  const { regionCode, searchPattern, searchType, employmentType, sportFilter, hideClosed, limit, offset, orderCol } = opts;

  // neon()은 tagged template literal만 지원하므로
  // 모든 조건 조합을 WHERE 절 하나로 처리.
  // 조건이 비어있으면 TRUE로 처리하여 무시
  const rCode = regionCode || "";
  const sPat = searchPattern || "";
  const eType = employmentType || "";
  const sFilter = sportFilter || "";

  const isAll = searchType === "all";
  const isTitleContent = searchType === "title_content";
  const isSport = searchType === "sport";
  const isAuthor = searchType === "author";
  const isContent = searchType === "content";
  const isTitle = !isAll && !isTitleContent && !isSport && !isAuthor && !isContent;

  const countResult = await sql`
    SELECT COUNT(*) as total FROM job_posts
    WHERE
      (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}) OR LOWER(region_code) LIKE LOWER(${rCode + '_%'}))
      AND (${eType} = '' OR employment_type = ${eType})
      AND (${sFilter} = '' OR sport = ${sFilter})
      AND (${!hideClosed} OR is_closed = false OR is_closed IS NULL)
      AND (
        ${sPat} = ''
        OR (${isAll} AND (title ILIKE ${sPat} OR sport ILIKE ${sPat} OR center_name ILIKE ${sPat} OR description ILIKE ${sPat}))
        OR (${isTitleContent} AND (title ILIKE ${sPat} OR description ILIKE ${sPat}))
        OR (${isSport} AND sport ILIKE ${sPat})
        OR (${isAuthor} AND center_name ILIKE ${sPat})
        OR (${isContent} AND description ILIKE ${sPat})
        OR (${isTitle} AND title ILIKE ${sPat})
      )
  `;

  let rows;
  if (orderCol === "views") {
    rows = await sql`
      SELECT * FROM job_posts
      WHERE
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}) OR LOWER(region_code) LIKE LOWER(${rCode + '_%'}))
        AND (${eType} = '' OR employment_type = ${eType})
        AND (${sFilter} = '' OR sport = ${sFilter})
        AND (${!hideClosed} OR is_closed = false OR is_closed IS NULL)
        AND (
          ${sPat} = ''
          OR (${isAll} AND (title ILIKE ${sPat} OR sport ILIKE ${sPat} OR center_name ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isTitleContent} AND (title ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isSport} AND sport ILIKE ${sPat})
          OR (${isAuthor} AND center_name ILIKE ${sPat})
          OR (${isContent} AND description ILIKE ${sPat})
          OR (${isTitle} AND title ILIKE ${sPat})
        )
      ORDER BY views DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (orderCol === "likes") {
    rows = await sql`
      SELECT * FROM job_posts
      WHERE
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}) OR LOWER(region_code) LIKE LOWER(${rCode + '_%'}))
        AND (${eType} = '' OR employment_type = ${eType})
        AND (${sFilter} = '' OR sport = ${sFilter})
        AND (${!hideClosed} OR is_closed = false OR is_closed IS NULL)
        AND (
          ${sPat} = ''
          OR (${isAll} AND (title ILIKE ${sPat} OR sport ILIKE ${sPat} OR center_name ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isTitleContent} AND (title ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isSport} AND sport ILIKE ${sPat})
          OR (${isAuthor} AND center_name ILIKE ${sPat})
          OR (${isContent} AND description ILIKE ${sPat})
          OR (${isTitle} AND title ILIKE ${sPat})
        )
      ORDER BY likes DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    rows = await sql`
      SELECT * FROM job_posts
      WHERE
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}) OR LOWER(region_code) LIKE LOWER(${rCode + '_%'}))
        AND (${eType} = '' OR employment_type = ${eType})
        AND (${sFilter} = '' OR sport = ${sFilter})
        AND (${!hideClosed} OR is_closed = false OR is_closed IS NULL)
        AND (
          ${sPat} = ''
          OR (${isAll} AND (title ILIKE ${sPat} OR sport ILIKE ${sPat} OR center_name ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isTitleContent} AND (title ILIKE ${sPat} OR description ILIKE ${sPat}))
          OR (${isSport} AND sport ILIKE ${sPat})
          OR (${isAuthor} AND center_name ILIKE ${sPat})
          OR (${isContent} AND description ILIKE ${sPat})
          OR (${isTitle} AND title ILIKE ${sPat})
        )
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  return { countResult, rows };
}

export interface JobsPageResult {
  posts: any[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * 상위 레벨 fetcher — URL 파라미터 스타일을 받아 완성된 페이지 결과를 반환.
 * 검색 아닌 일반 목록은 Upstash Redis에 60초 캐시.
 *
 * Server Component와 /api/jobs GET 핸들러가 공유 사용.
 */
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
    ? await cached(cacheKey, 60, () => queryJobs({ regionCode, searchPattern, searchType, employmentType, sportFilter, hideClosed, limit, offset, orderCol }))
    : await queryJobs({ regionCode, searchPattern, searchType, employmentType, sportFilter, hideClosed, limit, offset, orderCol });

  const total = Number(result.countResult[0].total);

  return {
    posts: result.rows,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}
