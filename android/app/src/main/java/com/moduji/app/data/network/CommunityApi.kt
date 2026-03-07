package com.moduji.app.data.network

import com.moduji.app.data.model.*
import retrofit2.Response
import retrofit2.http.*

interface CommunityApi {

    // ---- 검색 ----
    @GET("api/search")
    suspend fun search(@Query("q") query: String): Response<SearchResponse>

    // ---- 카테고리 ----
    @GET("api/categories")
    suspend fun getCategories(): Response<List<CommunityCategory>>

    // ---- 홈 화면용 게시글 ----
    @GET("api/posts/popular")
    suspend fun getPopularPosts(@Query("limit") limit: Int = 3): Response<List<CommunityPost>>

    @GET("api/posts/latest")
    suspend fun getLatestPosts(@Query("limit") limit: Int = 5): Response<List<CommunityPost>>

    // ---- 게시글 목록 ----
    @GET("api/categories/{categoryId}/posts")
    suspend fun getPosts(
        @Path("categoryId") categoryId: Int,
        @Query("sort") sort: String = "latest",
        @Query("page") page: Int = 1,
        @Query("searchType") searchType: String? = null,
        @Query("q") query: String? = null
    ): Response<PostsListResponse>

    // ---- 게시글 상세 ----
    @GET("api/post/{postId}")
    suspend fun getPost(@Path("postId") postId: Int): Response<CommunityPost>

    // ---- 게시글 CRUD ----
    @POST("api/posts")
    suspend fun createPost(@Body body: CreatePostRequest): Response<ApiResponse>

    @PUT("api/post/{postId}")
    suspend fun updatePost(@Path("postId") postId: Int, @Body body: UpdatePostRequest): Response<ApiResponse>

    @HTTP(method = "DELETE", path = "api/post/{postId}", hasBody = true)
    suspend fun deletePost(@Path("postId") postId: Int, @Body body: PasswordRequest): Response<ApiResponse>

    // ---- 게시글 액션 ----
    @POST("api/posts/{postId}/like")
    suspend fun likePost(@Path("postId") postId: Int): Response<LikeResponse>

    @POST("api/posts/{postId}/view")
    suspend fun viewPost(@Path("postId") postId: Int): Response<ApiResponse>

    @POST("api/posts/{postId}/verify-password")
    suspend fun verifyPostPassword(@Path("postId") postId: Int, @Body body: PasswordRequest): Response<ApiResponse>

    // ---- 댓글 ----
    @GET("api/post/{postId}/comments")
    suspend fun getComments(@Path("postId") postId: Int): Response<List<CommunityComment>>

    @POST("api/post/{postId}/comments")
    suspend fun createComment(@Path("postId") postId: Int, @Body body: CreateCommentRequest): Response<ApiResponse>

    @PUT("api/comments/{commentId}")
    suspend fun updateComment(@Path("commentId") commentId: Int, @Body body: UpdateCommentRequest): Response<ApiResponse>

    @HTTP(method = "DELETE", path = "api/comments/{commentId}", hasBody = true)
    suspend fun deleteComment(@Path("commentId") commentId: Int, @Body body: DeleteCommentRequest): Response<ApiResponse>

    @POST("api/comments/{commentId}/like")
    suspend fun likeComment(@Path("commentId") commentId: Int): Response<LikeResponse>

    // ---- 내 활동 ----
    @GET("api/posts/my")
    suspend fun getMyPosts(@Query("author") author: String): Response<MyPostsResponse>

    @GET("api/comments/my")
    suspend fun getMyCommentedPosts(@Query("author") author: String): Response<MyPostsResponse>

    // ---- 닉네임 ----
    @GET("api/nicknames")
    suspend fun checkNickname(@Query("name") name: String): Response<NicknameCheckResponse>

    @POST("api/nicknames")
    suspend fun registerNickname(@Body body: NicknameRegisterRequest): Response<ApiResponse>

    // ---- 문의 ----
    @GET("api/inquiries")
    suspend fun getInquiries(): Response<List<CommunityInquiry>>

    @POST("api/inquiries")
    suspend fun createInquiry(@Body body: CreateInquiryRequest): Response<ApiResponse>

    @POST("api/inquiries/{id}/view")
    suspend fun viewInquiry(@Path("id") id: Int, @Body body: PasswordRequest): Response<InquiryViewResponse>

    @PUT("api/inquiries/{id}")
    suspend fun updateInquiry(@Path("id") id: Int, @Body body: UpdateInquiryRequest): Response<ApiResponse>

    @HTTP(method = "DELETE", path = "api/inquiries/{id}", hasBody = true)
    suspend fun deleteInquiry(@Path("id") id: Int, @Body body: PasswordRequest): Response<ApiResponse>

    // ---- 신고 ----
    @POST("api/reports")
    suspend fun createReport(@Body body: CreateReportRequest): Response<ApiResponse>

    // ---- 관리자 ----
    @POST("api/admin/login")
    suspend fun adminLogin(@Body body: PasswordRequest): Response<AdminLoginResponse>

    @POST("api/admin/reports/{id}/resolve")
    suspend fun resolveReport(@Path("id") id: Int, @Body body: PasswordRequest): Response<ApiResponse>

    @POST("api/admin/reports/{id}/delete-target")
    suspend fun deleteReportTarget(@Path("id") id: Int, @Body body: PasswordRequest): Response<ApiResponse>

    @POST("api/admin/reports/{id}/hide")
    suspend fun hideReport(@Path("id") id: Int, @Body body: PasswordRequest): Response<ApiResponse>

    @POST("api/admin/reports/{id}/unhide")
    suspend fun unhideReport(@Path("id") id: Int, @Body body: PasswordRequest): Response<ApiResponse>

    @POST("api/admin/inquiries/{id}/reply")
    suspend fun replyToInquiry(@Path("id") id: Int, @Body body: AdminReplyRequest): Response<ApiResponse>

    @POST("api/admin/inquiries/{id}/hide")
    suspend fun hideInquiry(@Path("id") id: Int, @Body body: PasswordRequest): Response<ApiResponse>

    @POST("api/admin/inquiries/{id}/unhide")
    suspend fun unhideInquiry(@Path("id") id: Int, @Body body: PasswordRequest): Response<ApiResponse>
}
