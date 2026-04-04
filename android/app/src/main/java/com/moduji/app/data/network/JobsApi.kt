package com.moduji.app.data.network

import com.google.gson.annotations.SerializedName
import retrofit2.Response
import retrofit2.http.*

// ---- 응답 모델 ----

data class JobPostResponse(
    val id: Int = 0,
    val title: String = "",
    val description: String = "",
    @SerializedName("center_name") val centerName: String = "",
    val address: String = "",
    @SerializedName("author_role") val authorRole: String = "",
    @SerializedName("author_name") val authorName: String = "",
    @SerializedName("contact_type") val contactType: String = "",
    val contact: String = "",
    val sport: String = "",
    @SerializedName("region_name") val regionName: String = "",
    @SerializedName("region_code") val regionCode: String = "",
    @SerializedName("employment_type") val employmentType: String = "",
    val salary: String = "",
    val headcount: String = "",
    val benefits: String = "",
    val preferences: String = "",
    val deadline: String = "",
    val likes: Int = 0,
    val views: Int = 0,
    @SerializedName("is_closed") val isClosed: Boolean = false,
    @SerializedName("bookmark_count") val bookmarkCount: Int = 0,
    @SerializedName("created_at") val createdAt: String = "",
    @SerializedName("updated_at") val updatedAt: String = ""
)

data class JobPostsListResponse(
    val posts: List<JobPostResponse> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    @SerializedName("totalPages") val totalPages: Int = 1
)

data class JobCreateRequest(
    val title: String,
    val description: String,
    @SerializedName("center_name") val centerName: String,
    val address: String = "",
    @SerializedName("author_role") val authorRole: String = "",
    @SerializedName("author_name") val authorName: String = "",
    @SerializedName("contact_type") val contactType: String = "연락처",
    val contact: String,
    val sport: String,
    @SerializedName("region_name") val regionName: String,
    @SerializedName("region_code") val regionCode: String,
    @SerializedName("employment_type") val employmentType: String,
    val salary: String,
    val headcount: String = "",
    val benefits: String = "",
    val preferences: String = "",
    val deadline: String = ""
)

data class JobCreateResponse(
    val success: Boolean = false,
    val id: Int = 0
)

data class JobLikeResponse(
    val unliked: Boolean = false,
    val likes: Int = 0
)

// ---- API 인터페이스 ----

interface JobsApi {

    // 구인글 목록 (지역별, 정렬, 검색, 페이지네이션)
    @GET("api/jobs")
    suspend fun getJobPosts(
        @Query("region_code") regionCode: String? = null,
        @Query("sort") sort: String = "latest",
        @Query("page") page: Int = 1,
        @Query("q") query: String? = null,
        @Query("searchType") searchType: String? = null
    ): Response<JobPostsListResponse>

    // 최신 구인글 (홈 화면용)
    @GET("api/jobs/latest")
    suspend fun getLatestJobs(@Query("limit") limit: Int = 3): Response<List<JobPostResponse>>

    // 최신 구인글 (페이지네이션)
    @GET("api/jobs/latest")
    suspend fun getLatestJobsPaginated(
        @Query("page") page: Int,
        @Query("limit") limit: Int = 20
    ): Response<JobPostsListResponse>

    // 내가 등록한 구인글
    @GET("api/jobs/my")
    suspend fun getMyJobPosts(@Query("author") author: String): Response<JobPostsListResponse>

    // 구인글 상세
    @GET("api/jobs/{jobId}")
    suspend fun getJobPost(@Path("jobId") jobId: Int): Response<JobPostResponse>

    // 구인글 등록
    @POST("api/jobs")
    suspend fun createJobPost(@Body body: JobCreateRequest): Response<JobCreateResponse>

    // 구인글 수정
    @PUT("api/jobs/{jobId}")
    suspend fun updateJobPost(@Path("jobId") jobId: Int, @Body body: Map<String, String>): Response<Map<String, Boolean>>

    // 구인글 삭제
    @DELETE("api/jobs/{jobId}")
    suspend fun deleteJobPost(@Path("jobId") jobId: Int): Response<Map<String, Boolean>>

    // 조회수 증가
    @POST("api/jobs/{jobId}/view")
    suspend fun viewJobPost(@Path("jobId") jobId: Int): Response<Map<String, Boolean>>

    // 좋아요 토글
    @POST("api/jobs/{jobId}/like")
    suspend fun likeJobPost(@Path("jobId") jobId: Int): Response<JobLikeResponse>

    // 북마크 토글
    @POST("api/jobs/{jobId}/bookmark")
    suspend fun bookmarkJobPost(@Path("jobId") jobId: Int): Response<JobBookmarkResponse>

    // 지역별 게시글 수 (경량 API)
    @GET("api/jobs/region-counts")
    suspend fun getRegionCounts(): Response<RegionCountsResponse>
}

data class JobBookmarkResponse(
    val unbookmarked: Boolean = false,
    @SerializedName("bookmark_count") val bookmarkCount: Int = 0
)

data class RegionCountsResponse(
    val counts: Map<String, Int> = emptyMap(),
    val todayRegions: List<String> = emptyList()
)
