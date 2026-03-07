package com.moduji.app.data.model

import com.google.gson.annotations.SerializedName

// ============================================================
// 카테고리
// ============================================================
data class CommunityCategory(
    val id: Int,
    val name: String,
    val emoji: String,
    @SerializedName("sort_order") val sortOrder: Int,
    @SerializedName("is_popular") val isPopular: Boolean,
    @SerializedName("post_count") val postCount: String = "0"
) {
    val postCountInt: Int get() = postCount.toIntOrNull() ?: 0
}

// ============================================================
// 게시글
// ============================================================
data class CommunityPost(
    val id: Int,
    @SerializedName("category_id") val categoryId: Int,
    val title: String,
    val content: String,
    val author: String,
    val region: String,
    val tags: String,
    val likes: Int,
    @SerializedName("comments_count") val commentsCount: Int,
    @SerializedName("is_notice") val isNotice: Boolean,
    val views: Int,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String?,
    @SerializedName("category_name") val categoryName: String?,
    @SerializedName("ip_display") val ipDisplay: String?
)

data class PostsListResponse(
    val posts: List<CommunityPost>,
    val totalCount: Int,
    val totalPages: Int,
    val noticePosts: List<CommunityPost>,
    val topPosts: List<CommunityPost>
)

// ============================================================
// 댓글
// ============================================================
data class CommunityComment(
    val id: Int,
    @SerializedName("post_id") val postId: Int,
    @SerializedName("parent_id") val parentId: Int?,
    val author: String,
    val content: String,
    val likes: Int,
    @SerializedName("reply_count") val replyCount: Int,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("ip_display") val ipDisplay: String?
)

// ============================================================
// 문의
// ============================================================
data class CommunityInquiry(
    val id: Int,
    val author: String,
    val email: String?,
    val title: String,
    val content: String?,
    val reply: String?,
    @SerializedName("replied_at") val repliedAt: String?,
    val hidden: Boolean?,
    @SerializedName("created_at") val createdAt: String
)

// ============================================================
// 신고
// ============================================================
data class CommunityReport(
    val id: Int,
    @SerializedName("target_type") val targetType: String,
    @SerializedName("target_id") val targetId: Int,
    @SerializedName("post_id") val postId: Int,
    @SerializedName("category_id") val categoryId: Int,
    val reason: String,
    @SerializedName("custom_reason") val customReason: String?,
    val resolved: Boolean?,
    @SerializedName("resolved_at") val resolvedAt: String?,
    @SerializedName("deleted_at") val deletedAt: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("post_title") val postTitle: String?,
    @SerializedName("post_author") val postAuthor: String?,
    @SerializedName("comment_content") val commentContent: String?,
    @SerializedName("comment_author") val commentAuthor: String?,
    @SerializedName("category_name") val categoryName: String?,
    @SerializedName("job_post_title") val jobPostTitle: String?,
    @SerializedName("job_post_author") val jobPostAuthor: String?
)

// ============================================================
// Request Bodies
// ============================================================
data class CreatePostRequest(
    @SerializedName("category_id") val categoryId: Int,
    val title: String,
    val content: String,
    val author: String,
    val password: String,
    val region: String,
    val tags: String
)

data class UpdatePostRequest(
    val title: String,
    val content: String,
    val region: String,
    val tags: String
)

data class PasswordRequest(val password: String)

data class DeletePostRequest(
    val password: String,
    @SerializedName("category_id") val categoryId: Int
)

data class CreateCommentRequest(
    val author: String,
    val password: String,
    val content: String,
    @SerializedName("parent_id") val parentId: Int?,
    @SerializedName("category_id") val categoryId: Int
)

data class UpdateCommentRequest(
    val password: String,
    val content: String,
    @SerializedName("post_id") val postId: Int,
    @SerializedName("category_id") val categoryId: Int
)

data class DeleteCommentRequest(
    val password: String,
    @SerializedName("post_id") val postId: Int,
    @SerializedName("category_id") val categoryId: Int
)

data class CreateInquiryRequest(
    val author: String,
    val password: String,
    val email: String,
    val title: String,
    val content: String
)

data class UpdateInquiryRequest(
    val password: String,
    val title: String,
    val content: String
)

data class CreateReportRequest(
    @SerializedName("target_type") val targetType: String,
    @SerializedName("target_id") val targetId: Int,
    @SerializedName("post_id") val postId: Int,
    @SerializedName("category_id") val categoryId: Int,
    val reason: String,
    @SerializedName("custom_reason") val customReason: String?
)

data class AdminReplyRequest(
    val password: String,
    val reply: String
)

// ============================================================
// Response Bodies
// ============================================================
data class ApiResponse(
    val success: Boolean? = null,
    val error: String? = null
)

data class LikeResponse(val unliked: Boolean)

data class InquiryViewResponse(
    val content: String?,
    val reply: String?,
    @SerializedName("replied_at") val repliedAt: String?,
    val isAdmin: Boolean?,
    val error: String?
)

data class AdminLoginResponse(
    val reports: List<CommunityReport>?,
    val inquiries: List<CommunityInquiry>?,
    val error: String?
)

// ============================================================
// 검색 결과
// ============================================================
data class MyPostsResponse(
    val posts: List<CommunityPost>
)

data class NicknameCheckResponse(
    val available: Boolean
)

data class NicknameRegisterRequest(
    val name: String,
    val oldName: String? = null
)

data class SearchResponse(
    val posts: List<CommunityPost>,
    val jobs: List<SearchJobItem>
)

data class SearchJobItem(
    val id: Int,
    val title: String,
    val description: String = "",
    @SerializedName("center_name") val centerName: String = "",
    val sport: String = "",
    @SerializedName("region_name") val regionName: String = "",
    val salary: String = "",
    @SerializedName("created_at") val createdAt: String = ""
)
