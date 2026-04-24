import { sql } from "@/app/lib/db";
import { cached } from "@/app/lib/cache";
import { REGION_GROUPS } from "@/app/lib/region-data";

export type SortCol = "created_at" | "views" | "likes";

// 하위 지역 코드 → { parent, subName } 역매핑.
// region-counts 라우트는 region_name 에서 하위 이름을 뽑아 하위 코드 앞으로
// 집계하는데, 저장된 레코드의 region_code 는 상위 코드만 들어있는 경우가 있어
// 카운트는 잡히지만 목록 필터는 0건이 되는 불일치가 발생한다.
// 목록 필터 시 같은 기준(region_name 이름 매칭)을 OR 로 추가해 해결한다.
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

  // 하위 지역 코드인 경우(예: daegu_suseong) 상위 코드 + 이름 추출.
  // DB에 region_code 가 상위(daegu)로만 저장되고 region_name 에 "수성구" 가 있는
  // 레거시 레코드도 걸러내기 위해 region_name ILIKE 매칭을 OR 조건으로 추가한다.
  const subInfo = rCode ? SUB_CODE_INFO[rCode.toLowerCase()] : undefined;
  const parentCode = subInfo?.parent || "";
  const subNamePattern = subInfo ? `% - ${subInfo.subName}%` : "";

  const isAll = searchType === "all";
  const isTitleContent = searchType === "title_content";
  const isSport = searchType === "sport";
  const isAuthor = searchType === "author";
  const isContent = searchType === "content";
  const isTitle = !isAll && !isTitleContent && !isSport && !isAuthor && !isContent;

  const countResult = await sql`
    SELECT COUNT(*) as total FROM job_posts
    WHERE
      (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}) OR LOWER(region_code) LIKE LOWER(${rCode + '_%'}) OR (${parentCode} <> '' AND LOWER(region_code) = ${parentCode} AND region_name ILIKE ${subNamePattern}))
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
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}) OR LOWER(region_code) LIKE LOWER(${rCode + '_%'}) OR (${parentCode} <> '' AND LOWER(region_code) = ${parentCode} AND region_name ILIKE ${subNamePattern}))
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
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}) OR LOWER(region_code) LIKE LOWER(${rCode + '_%'}) OR (${parentCode} <> '' AND LOWER(region_code) = ${parentCode} AND region_name ILIKE ${subNamePattern}))
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
        (${rCode} = '' OR LOWER(region_code) = LOWER(${rCode}) OR LOWER(region_code) LIKE LOWER(${rCode + '_%'}) OR (${parentCode} <> '' AND LOWER(region_code) = ${parentCode} AND region_name ILIKE ${subNamePattern}))
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
