package com.moduji.app.data.repository

import com.moduji.app.data.model.JobPost
import com.moduji.app.data.model.JobPostRequest
import com.moduji.app.data.model.JobSearchType
import com.moduji.app.data.model.RegionGroup
import com.moduji.app.data.model.RegionGroupType
import com.moduji.app.data.model.SubRegion
import com.moduji.app.data.network.JobCreateRequest
import com.moduji.app.data.network.JobLikeResponse
import com.moduji.app.data.network.JobPostResponse
import com.moduji.app.data.network.RetrofitClient
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * 구인 탭 데이터 저장소
 *
 * - 전국 지역 데이터 (광역시/특별시 + 도 → 구/시/군 통합 구조)
 * - 구인 게시글: Neon PostgreSQL 서버 API 호출
 * - 지역별 필터링, 오늘 글 여부 판단 로직
 */
object JobsRepository {

    private val api = RetrofitClient.jobsApi

    // ====================================================
    // API 호출 헬퍼
    // ====================================================
    private suspend fun <T> safeCall(call: suspend () -> retrofit2.Response<T>): Result<T> {
        return try {
            val response = call()
            if (response.isSuccessful) {
                Result.success(response.body()!!)
            } else {
                Result.failure(Exception("서버 오류: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(Exception("네트워크 오류: ${e.message}"))
        }
    }

    // ====================================================
    // JobPostResponse → JobPost 변환
    // ====================================================
    private fun JobPostResponse.toJobPost(): JobPost {
        val parsedDateTime = try {
            ZonedDateTime.parse(createdAt).toLocalDateTime()
        } catch (_: Exception) {
            try {
                LocalDateTime.parse(createdAt, DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            } catch (_: Exception) {
                LocalDateTime.now()
            }
        }

        val daysDiff = ChronoUnit.DAYS.between(parsedDateTime.toLocalDate(), LocalDate.now())
        val dateLabel = when {
            daysDiff == 0L -> "오늘"
            daysDiff == 1L -> "어제"
            daysDiff <= 7L -> "${daysDiff}일 전"
            else -> parsedDateTime.format(DateTimeFormatter.ofPattern("MM.dd"))
        }

        return JobPost(
            id = id,
            title = title,
            preview = description.take(50),
            description = description,
            author = centerName,
            contact = contact,
            categoryName = sport,
            region = regionName,
            regionCode = regionCode,
            employmentType = employmentType,
            salary = salary,
            headcount = headcount,
            benefits = benefits,
            preferences = preferences,
            deadline = deadline,
            likes = likes,
            commentsCount = 0,
            views = views,
            date = dateLabel,
            createdAt = parsedDateTime,
            isClosed = isClosed,
            bookmarkCount = bookmarkCount,
            address = address,
            authorRole = authorRole,
            authorName = authorName,
            contactType = contactType
        )
    }

    // ====================================================
    // 구인글 CRUD (서버 API)
    // ====================================================

    /**
     * 구인 글 등록 → 서버 저장
     */
    suspend fun addJobPost(request: JobPostRequest): Result<Int> {
        val apiRequest = JobCreateRequest(
            title = request.title,
            description = request.description,
            centerName = request.centerName,
            address = request.address,
            authorRole = request.authorRole,
            authorName = request.authorName,
            contactType = request.contactType,
            contact = request.contact,
            sport = request.sport,
            regionName = request.regionName,
            regionCode = request.regionCode,
            employmentType = request.jobType.label,
            salary = request.salary.toSummary(),
            headcount = request.headcount ?: "",
            benefits = request.benefits.joinToString(", ") { it.label },
            preferences = request.preferences.joinToString(", ") { it.label },
            deadline = request.deadline
        )
        return safeCall { api.createJobPost(apiRequest) }.map { it.id }
    }

    /**
     * 내가 등록한 구인글 목록
     */
    suspend fun getMyJobPosts(author: String): Result<List<JobPost>> {
        return safeCall { api.getMyJobPosts(author) }.map { resp ->
            resp.posts.map { it.toJobPost() }
        }
    }

    /**
     * 구인글 상세 조회
     */
    suspend fun getJobPostById(id: Int): Result<JobPost> {
        return safeCall { api.getJobPost(id) }.map { it.toJobPost() }
    }

    /**
     * 구인글 상세 조회 (raw response — 수정용)
     */
    suspend fun getJobPostRaw(id: Int): Result<JobPostResponse> {
        return safeCall { api.getJobPost(id) }
    }

    /**
     * 구인글 수정
     */
    suspend fun updateJobPost(id: Int, body: Map<String, String>): Result<Boolean> {
        return safeCall { api.updateJobPost(id, body) }.map { true }
    }

    /**
     * 최신 구인 게시글 (홈 화면용)
     */
    suspend fun getLatestJobs(limit: Int = 3): Result<List<JobPost>> {
        return safeCall { api.getLatestJobs(limit) }.map { list ->
            list.map { it.toJobPost() }
        }
    }

    /**
     * 최신 구인 게시글 (페이지네이션)
     */
    suspend fun getLatestJobsPaginated(page: Int, limit: Int = 20): Result<Triple<List<JobPost>, Int, Int>> {
        return safeCall { api.getLatestJobsPaginated(page, limit) }.map { resp ->
            Triple(resp.posts.map { it.toJobPost() }, resp.totalPages, resp.total)
        }
    }

    /**
     * 지역별 구인 게시글 목록
     */
    suspend fun getJobPostsByRegion(
        regionCode: String,
        sort: String = "latest",
        page: Int = 1
    ): Result<Pair<List<JobPost>, Int>> {
        return safeCall {
            api.getJobPosts(regionCode = regionCode, sort = sort, page = page)
        }.map { resp ->
            Pair(resp.posts.map { it.toJobPost() }, resp.total)
        }
    }

    /**
     * 구인 게시글 검색
     */
    suspend fun searchJobPosts(
        query: String,
        searchType: JobSearchType,
        regionCode: String? = null
    ): Result<List<JobPost>> {
        return safeCall {
            api.getJobPosts(
                regionCode = regionCode,
                query = query,
                searchType = searchType.name.lowercase()
            )
        }.map { resp -> resp.posts.map { it.toJobPost() } }
    }

    /**
     * 조회수 증가
     */
    suspend fun viewJobPost(jobId: Int) {
        try { api.viewJobPost(jobId) } catch (_: Exception) { }
    }

    /**
     * 좋아요 토글
     */
    suspend fun likeJobPost(jobId: Int): Result<JobLikeResponse> {
        return safeCall { api.likeJobPost(jobId) }
    }

    /**
     * 북마크 토글 (서버)
     */
    suspend fun bookmarkJobPost(jobId: Int): Result<com.moduji.app.data.network.JobBookmarkResponse> {
        return safeCall { api.bookmarkJobPost(jobId) }
    }

    /**
     * 구인완료 처리 (is_closed = true)
     */
    suspend fun closeJobPost(jobId: Int): Result<Boolean> {
        return safeCall {
            api.updateJobPost(jobId, mapOf("is_closed" to "true"))
        }.map { true }
    }

    /**
     * 구인글 삭제
     */
    suspend fun deleteJobPost(jobId: Int): Result<Boolean> {
        return safeCall { api.deleteJobPost(jobId) }.map { true }
    }

    // ====================================================
    // 지역 그룹 (로컬 데이터 즉시 반환 + 서버 카운트 비동기)
    // ====================================================

    /**
     * 로컬 지역 그룹 즉시 반환 (카운트 0, 서버 호출 없음)
     */
    fun getRegionGroupsLocal(): List<RegionGroup> {
        val metroGroups = metroData.map { (groupInfo, subList) ->
            val (groupCode, groupName) = groupInfo
            val subRegions = subList.map { (code, name) ->
                SubRegion(code, name, 0, false)
            }
            RegionGroup(groupCode, groupName, RegionGroupType.METROPOLITAN, subRegions)
        }

        val provinceGroups = provinceData.map { (groupInfo, subList) ->
            val (groupCode, groupName) = groupInfo
            val subRegions = subList.map { (code, name) ->
                SubRegion(code, name, 0, false)
            }
            RegionGroup(groupCode, groupName, RegionGroupType.PROVINCE, subRegions)
        }

        return metroGroups + provinceGroups
    }

    /**
     * 서버에서 지역별 게시글 수 조회 (경량 API)
     */
    suspend fun getRegionCounts(): Result<Pair<Map<String, Int>, Set<String>>> {
        return safeCall { api.getRegionCounts() }.map { resp ->
            Pair(resp.counts, resp.todayRegions.toSet())
        }
    }

    /**
     * 로컬 지역 그룹에 서버 카운트 적용
     */
    fun applyCountsToGroups(
        groups: List<RegionGroup>,
        counts: Map<String, Int>,
        todayRegions: Set<String>
    ): List<RegionGroup> {
        return groups.map { group ->
            val updatedSubs = group.subRegions.map { sub ->
                SubRegion(sub.code, sub.name, counts[sub.code] ?: 0, todayRegions.contains(sub.code))
            }
            group.copy(subRegions = updatedSubs)
        }
    }

    // ====================================================
    // 광역시/특별시 목록 (하위 구 포함)
    // ====================================================
    private val metroData: LinkedHashMap<Pair<String, String>, List<Pair<String, String>>> = linkedMapOf(
        ("SEOUL" to "서울특별시") to listOf(
            "SEOUL_GANGNAM" to "강남구", "SEOUL_SEOCHO" to "서초구",
            "SEOUL_SONGPA" to "송파구", "SEOUL_GANGDONG" to "강동구",
            "SEOUL_MAPO" to "마포구", "SEOUL_YEONGDEUNGPO" to "영등포구",
            "SEOUL_DONGJAK" to "동작구", "SEOUL_GWANAK" to "관악구",
            "SEOUL_GANGBUK" to "강북구", "SEOUL_NOWON" to "노원구",
            "SEOUL_DOBONG" to "도봉구", "SEOUL_DONGDAEMUN" to "동대문구",
            "SEOUL_EUNPYEONG" to "은평구", "SEOUL_GEUMCHEON" to "금천구",
            "SEOUL_GURO" to "구로구", "SEOUL_GWANGJIN" to "광진구",
            "SEOUL_JONGNO" to "종로구", "SEOUL_JUNG" to "중구",
            "SEOUL_JUNGNANG" to "중랑구", "SEOUL_SEODDAEMUN" to "서대문구",
            "SEOUL_SEONGBUK" to "성북구", "SEOUL_SEONGDONG" to "성동구",
            "SEOUL_YANGCHEON" to "양천구", "SEOUL_YONGSAN" to "용산구",
            "SEOUL_GANGSEO" to "강서구"
        ),
        ("BUSAN" to "부산광역시") to listOf(
            "BUSAN_HAEUNDAE" to "해운대구", "BUSAN_BUSANJIN" to "부산진구",
            "BUSAN_DONGNAE" to "동래구", "BUSAN_NAM" to "남구",
            "BUSAN_BUK" to "북구", "BUSAN_SASANG" to "사상구",
            "BUSAN_SAHA" to "사하구", "BUSAN_GEUMJEONG" to "금정구",
            "BUSAN_YEONJE" to "연제구", "BUSAN_SUYEONG" to "수영구",
            "BUSAN_JUNG" to "중구", "BUSAN_DONG" to "동구",
            "BUSAN_YEONGDO" to "영도구", "BUSAN_SEO" to "서구",
            "BUSAN_GANGSEO" to "강서구", "BUSAN_GIJANG" to "기장군"
        ),
        ("DAEGU" to "대구광역시") to listOf(
            "DAEGU_DALSEO" to "달서구", "DAEGU_SUSEONG" to "수성구",
            "DAEGU_BUK" to "북구", "DAEGU_DONG" to "동구",
            "DAEGU_SEO" to "서구", "DAEGU_JUNG" to "중구",
            "DAEGU_NAM" to "남구", "DAEGU_DALSEONG" to "달성군"
        ),
        ("INCHEON" to "인천광역시") to listOf(
            "INCHEON_NAMDONG" to "남동구", "INCHEON_BUPYEONG" to "부평구",
            "INCHEON_SEO" to "서구", "INCHEON_YEONSU" to "연수구",
            "INCHEON_GYEYANG" to "계양구", "INCHEON_MICHUHOL" to "미추홀구",
            "INCHEON_DONG" to "동구", "INCHEON_JUNG" to "중구",
            "INCHEON_GANGHWA" to "강화군", "INCHEON_ONGJIN" to "옹진군"
        ),
        ("GWANGJU" to "광주광역시") to listOf(
            "GWANGJU_SEO" to "서구", "GWANGJU_BUK" to "북구",
            "GWANGJU_NAM" to "남구", "GWANGJU_DONG" to "동구",
            "GWANGJU_GWANGSAN" to "광산구"
        ),
        ("DAEJEON" to "대전광역시") to listOf(
            "DAEJEON_SEO" to "서구", "DAEJEON_YUSEONG" to "유성구",
            "DAEJEON_DONG" to "동구", "DAEJEON_JUNG" to "중구",
            "DAEJEON_DAEDEOK" to "대덕구"
        ),
        ("ULSAN" to "울산광역시") to listOf(
            "ULSAN_NAM" to "남구", "ULSAN_BUK" to "북구",
            "ULSAN_DONG" to "동구", "ULSAN_JUNG" to "중구",
            "ULSAN_ULJU" to "울주군"
        ),
        ("SEJONG" to "세종특별자치시") to listOf(
            "SEJONG_HANSOL" to "한솔동", "SEJONG_DODAM" to "도담동",
            "SEJONG_AREUM" to "아름동", "SEJONG_JOCHIWON" to "조치원읍",
            "SEJONG_SOJUNG" to "소정면"
        )
    )

    // ====================================================
    // 도 목록 (하위 시/군 포함)
    // ====================================================
    private val provinceData: LinkedHashMap<Pair<String, String>, List<Pair<String, String>>> = linkedMapOf(
        ("GG" to "경기도") to listOf(
            "SUWON" to "수원시", "YONGIN" to "용인시", "SEONGNAM" to "성남시",
            "GOYANG" to "고양시", "BUCHEON" to "부천시", "HWASEONG" to "화성시",
            "ANSAN" to "안산시", "ANYANG" to "안양시", "PYEONGTAEK" to "평택시",
            "SIHEUNG" to "시흥시", "GIMPO" to "김포시", "GWANGJU_GG" to "광주시",
            "GUNPO" to "군포시", "HANAM" to "하남시", "ICHEON" to "이천시",
            "OSAN" to "오산시", "PAJU" to "파주시", "UIJEONGBU" to "의정부시"
        ),
        ("GW" to "강원도") to listOf(
            "CHUNCHEON" to "춘천시", "WONJU" to "원주시", "GANGNEUNG" to "강릉시",
            "DONGHAE" to "동해시", "SOKCHO" to "속초시", "SAMCHEOK" to "삼척시",
            "TAEBAEK" to "태백시"
        ),
        ("CB" to "충청북도") to listOf(
            "CHEONGJU" to "청주시", "CHUNGJU" to "충주시", "JECHEON" to "제천시",
            "EUMSEONG" to "음성군", "JINCHEON" to "진천군"
        ),
        ("CN" to "충청남도") to listOf(
            "CHEONAN" to "천안시", "ASAN" to "아산시", "SEOSAN" to "서산시",
            "DANGJIN" to "당진시", "NONSAN" to "논산시", "GONGJU" to "공주시"
        ),
        ("JB" to "전라북도") to listOf(
            "JEONJU" to "전주시", "GUNSAN" to "군산시", "IKSAN" to "익산시",
            "JEONGEUP" to "정읍시", "NAMWON" to "남원시", "GIMJE" to "김제시"
        ),
        ("JN" to "전라남도") to listOf(
            "MOKPO" to "목포시", "YEOSU" to "여수시", "SUNCHEON" to "순천시",
            "NAJU" to "나주시", "GWANGYANG" to "광양시"
        ),
        ("GB" to "경상북도") to listOf(
            "POHANG" to "포항시", "GUMI" to "구미시", "GYEONGJU" to "경주시",
            "GIMCHEON" to "김천시", "ANDONG" to "안동시", "YEONGJU" to "영주시",
            "SANGJU" to "상주시", "MUNGYEONG" to "문경시", "YEONGCHEON" to "영천시"
        ),
        ("GN" to "경상남도") to listOf(
            "CHANGWON" to "창원시", "JINJU" to "진주시", "GIMHAE" to "김해시",
            "YANGSAN" to "양산시", "GEOJE" to "거제시", "TONGYEONG" to "통영시",
            "SACHEON" to "사천시", "MIRYANG" to "밀양시"
        ),
        ("JJ" to "제주특별자치도") to listOf(
            "JEJU" to "제주시", "SEOGWIPO" to "서귀포시"
        )
    )
}
