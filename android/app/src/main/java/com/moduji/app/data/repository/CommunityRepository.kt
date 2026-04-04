package com.moduji.app.data.repository

import com.moduji.app.data.model.*
import com.moduji.app.data.network.RetrofitClient
import retrofit2.Response

object CommunityRepository {
    private val api = RetrofitClient.communityApi

    // 카테고리 메모리 캐시 (앱 실행 동안 유지)
    @Volatile
    private var cachedCategories: List<CommunityCategory>? = null

    private suspend fun <T> safeCall(call: suspend () -> Response<T>): Result<T> {
        return try {
            val response = call()
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) Result.success(body)
                else Result.failure(Exception("응답이 비어 있습니다"))
            } else {
                Result.failure(Exception("서버 오류: ${response.code()}"))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    // ---- 카테고리 ----
    fun getCachedCategories(): List<CommunityCategory>? = cachedCategories

    suspend fun getCategories(forceRefresh: Boolean = false): Result<List<CommunityCategory>> {
        if (!forceRefresh) {
            cachedCategories?.let { return Result.success(it) }
        }
        return safeCall { api.getCategories() }.also { result ->
            result.getOrNull()?.let { cachedCategories = it }
        }
    }

    suspend fun preloadCategories() {
        if (cachedCategories == null) {
            getCategories()
        }
    }

    // ---- 검색 ----
    suspend fun search(query: String): Result<SearchResponse> = safeCall {
        api.search(query)
    }

    // ---- 홈 화면용 ----
    suspend fun getPopularPosts(limit: Int = 3): Result<List<CommunityPost>> = safeCall {
        api.getPopularPosts(limit)
    }

    suspend fun getPopularPostsPaginated(page: Int, limit: Int = 20): Result<PopularPostsResponse> = safeCall {
        api.getPopularPostsPaginated(page, limit)
    }

    suspend fun getLatestPosts(limit: Int = 5): Result<List<CommunityPost>> = safeCall {
        api.getLatestPosts(limit)
    }

    suspend fun getLatestPostsPaginated(page: Int, limit: Int = 20): Result<PopularPostsResponse> = safeCall {
        api.getLatestPostsPaginated(page, limit)
    }

    // ---- 게시글 ----
    suspend fun getPosts(
        categoryId: Int,
        sort: String = "latest",
        page: Int = 1,
        searchType: String? = null,
        query: String? = null
    ): Result<PostsListResponse> = safeCall {
        api.getPosts(categoryId, sort, page, searchType, query)
    }

    suspend fun getPost(postId: Int): Result<CommunityPost> = safeCall { api.getPost(postId) }

    suspend fun createPost(request: CreatePostRequest): Result<ApiResponse> = safeCall { api.createPost(request) }

    suspend fun updatePost(postId: Int, request: UpdatePostRequest): Result<ApiResponse> = safeCall { api.updatePost(postId, request) }

    suspend fun deletePost(postId: Int, password: String): Result<ApiResponse> = safeCall {
        api.deletePost(postId, PasswordRequest(password))
    }

    suspend fun likePost(postId: Int): Result<LikeResponse> = safeCall { api.likePost(postId) }

    suspend fun viewPost(postId: Int): Result<ApiResponse> = safeCall { api.viewPost(postId) }

    suspend fun verifyPostPassword(postId: Int, password: String): Result<ApiResponse> = safeCall {
        api.verifyPostPassword(postId, PasswordRequest(password))
    }

    // ---- 댓글 ----
    suspend fun getComments(postId: Int): Result<List<CommunityComment>> = safeCall { api.getComments(postId) }

    suspend fun createComment(postId: Int, request: CreateCommentRequest): Result<ApiResponse> = safeCall {
        api.createComment(postId, request)
    }

    suspend fun updateComment(commentId: Int, request: UpdateCommentRequest): Result<ApiResponse> = safeCall {
        api.updateComment(commentId, request)
    }

    suspend fun deleteComment(commentId: Int, request: DeleteCommentRequest): Result<ApiResponse> = safeCall {
        api.deleteComment(commentId, request)
    }

    suspend fun likeComment(commentId: Int): Result<LikeResponse> = safeCall { api.likeComment(commentId) }

    // ---- 문의 ----
    suspend fun getInquiries(): Result<List<CommunityInquiry>> = safeCall { api.getInquiries() }

    suspend fun getMyInquiries(author: String, password: String): Result<List<CommunityInquiry>> = safeCall {
        api.getMyInquiries(author, password)
    }

    suspend fun createInquiry(request: CreateInquiryRequest): Result<ApiResponse> = safeCall { api.createInquiry(request) }

    suspend fun viewInquiry(id: Int, password: String): Result<InquiryViewResponse> = safeCall {
        api.viewInquiry(id, PasswordRequest(password))
    }

    suspend fun updateInquiry(id: Int, request: UpdateInquiryRequest): Result<ApiResponse> = safeCall {
        api.updateInquiry(id, request)
    }

    suspend fun deleteInquiry(id: Int, password: String): Result<ApiResponse> = safeCall {
        api.deleteInquiry(id, PasswordRequest(password))
    }

    // ---- 내 활동 ----
    suspend fun getMyPosts(author: String): Result<List<CommunityPost>> =
        safeCall { api.getMyPosts(author) }.map { it.posts }

    suspend fun getMyCommentedPosts(author: String): Result<List<CommunityPost>> =
        safeCall { api.getMyCommentedPosts(author) }.map { it.posts }

    // ---- 닉네임 ----
    suspend fun checkNickname(name: String): Result<Boolean> =
        safeCall { api.checkNickname(name) }.map { it.available }

    suspend fun registerNickname(name: String, oldName: String? = null): Result<ApiResponse> =
        safeCall { api.registerNickname(NicknameRegisterRequest(name, oldName)) }

    // ---- 신고 ----
    suspend fun createReport(request: CreateReportRequest): Result<ApiResponse> = safeCall { api.createReport(request) }

    // ---- 관리자 ----
    suspend fun adminLogin(password: String): Result<AdminLoginResponse> = safeCall {
        api.adminLogin(PasswordRequest(password))
    }

    suspend fun resolveReport(id: Int, password: String): Result<ApiResponse> = safeCall {
        api.resolveReport(id, PasswordRequest(password))
    }

    suspend fun deleteReportTarget(id: Int, password: String): Result<ApiResponse> = safeCall {
        api.deleteReportTarget(id, PasswordRequest(password))
    }

    suspend fun hideReport(id: Int, password: String): Result<ApiResponse> = safeCall {
        api.hideReport(id, PasswordRequest(password))
    }

    suspend fun unhideReport(id: Int, password: String): Result<ApiResponse> = safeCall {
        api.unhideReport(id, PasswordRequest(password))
    }

    suspend fun replyToInquiry(id: Int, password: String, reply: String): Result<ApiResponse> = safeCall {
        api.replyToInquiry(id, AdminReplyRequest(password, reply))
    }

    suspend fun hideInquiry(id: Int, password: String): Result<ApiResponse> = safeCall {
        api.hideInquiry(id, PasswordRequest(password))
    }

    suspend fun unhideInquiry(id: Int, password: String): Result<ApiResponse> = safeCall {
        api.unhideInquiry(id, PasswordRequest(password))
    }

    suspend fun changeAdminPassword(currentPassword: String, newPassword: String): Result<ApiResponse> = safeCall {
        api.changeAdminPassword(ChangePasswordRequest(currentPassword, newPassword))
    }
}
