package com.moduji.app.ui.community

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moduji.app.data.model.*
import com.moduji.app.data.repository.CommunityRepository
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

enum class CommentSort { LATEST, POPULAR, LIKES }

class PostDetailViewModel : ViewModel() {

    private val _post = MutableLiveData<CommunityPost?>()
    val post: LiveData<CommunityPost?> = _post

    private val _rawComments = MutableLiveData<List<CommunityComment>>()

    private val _commentSort = MutableLiveData(CommentSort.LATEST)
    val commentSort: LiveData<CommentSort> = _commentSort

    private val _comments = MutableLiveData<List<CommunityComment>>()
    val comments: LiveData<List<CommunityComment>> = _comments

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    private val _actionResult = MutableLiveData<String?>()
    val actionResult: LiveData<String?> = _actionResult

    private val _deleteSuccess = MutableLiveData(false)
    val deleteSuccess: LiveData<Boolean> = _deleteSuccess

    private val _isLiked = MutableLiveData(false)
    val isLiked: LiveData<Boolean> = _isLiked

    var postId: Int = 0
    var categoryId: Int = 0

    fun loadPost() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            // 조회수 증가
            CommunityRepository.viewPost(postId)

            CommunityRepository.getPost(postId).fold(
                onSuccess = {
                    _post.value = it
                    _isLiked.value = it.isLiked == true
                },
                onFailure = { _error.value = it.message }
            )

            _isLoading.value = false
        }
    }

    fun loadComments() {
        viewModelScope.launch {
            CommunityRepository.getComments(postId).fold(
                onSuccess = {
                    _rawComments.value = it
                    applySortAndUpdate()
                },
                onFailure = { /* 댓글 로딩 실패는 무시 */ }
            )
        }
    }

    fun setCommentSort(sort: CommentSort) {
        if (_commentSort.value == sort) return
        _commentSort.value = sort
        applySortAndUpdate()
    }

    private fun applySortAndUpdate() {
        val raw = _rawComments.value ?: return
        val sort = _commentSort.value ?: CommentSort.LATEST

        // 부모 댓글과 대댓글 분리
        val parents = raw.filter { it.parentId == null }
        val repliesByParent = raw.filter { it.parentId != null }.groupBy { it.parentId }

        // 부모 댓글 정렬
        val sortedParents = when (sort) {
            CommentSort.LATEST -> parents.sortedByDescending { it.createdAt }
            CommentSort.POPULAR -> parents.sortedByDescending { it.replyCount }
            CommentSort.LIKES -> parents.sortedByDescending { it.likes }
        }

        // 부모 아래에 대댓글 최신순 배치
        val result = mutableListOf<CommunityComment>()
        for (parent in sortedParents) {
            result.add(parent)
            repliesByParent[parent.id]
                ?.sortedBy { it.createdAt }
                ?.let { result.addAll(it) }
        }

        _comments.value = result
    }

    fun likePost() {
        if (!com.moduji.app.util.AuthManager.isLoggedIn) {
            _actionResult.value = "로그인을 해주세요"
            return
        }

        val currentPost = _post.value ?: return
        val wasLiked = _isLiked.value == true

        // 즉시 색상 + 숫자 변경 (optimistic)
        _isLiked.value = !wasLiked
        val optimisticLikes = if (wasLiked) (currentPost.likes - 1).coerceAtLeast(0) else currentPost.likes + 1
        _post.value = currentPost.copy(likes = optimisticLikes)

        // 서버 반영 후 실제 수치로 보정
        viewModelScope.launch {
            CommunityRepository.likePost(postId).fold(
                onSuccess = { resp ->
                    _isLiked.value = !resp.unliked
                    _post.value = _post.value?.copy(likes = resp.likes) ?: currentPost.copy(likes = resp.likes)
                },
                onFailure = {
                    // 실패 시 원복
                    _isLiked.value = wasLiked
                    _post.value = currentPost
                    val msg = it.message ?: ""
                    _actionResult.value = if (msg.contains("401") || msg.contains("로그인")) "로그인을 해주세요" else "오류: $msg"
                }
            )
        }
    }

    fun likeComment(commentId: Int) {
        if (!com.moduji.app.util.AuthManager.isLoggedIn) {
            _actionResult.value = "로그인을 해주세요"
            return
        }

        // 즉시 색상 + 숫자 변경 (optimistic)
        val rawList = _rawComments.value?.toMutableList() ?: return
        val idx = rawList.indexOfFirst { it.id == commentId }
        if (idx < 0) return
        val comment = rawList[idx]
        val wasLiked = comment.isLiked == true
        val optimisticLikes = if (wasLiked) (comment.likes - 1).coerceAtLeast(0) else comment.likes + 1
        rawList[idx] = comment.copy(likes = optimisticLikes, isLiked = !wasLiked)
        _rawComments.value = rawList
        applySortAndUpdate()

        // 서버 반영 후 실제 수치로 보정
        viewModelScope.launch {
            CommunityRepository.likeComment(commentId).fold(
                onSuccess = { resp ->
                    val list = _rawComments.value?.toMutableList() ?: return@fold
                    val i = list.indexOfFirst { it.id == commentId }
                    if (i >= 0) {
                        list[i] = list[i].copy(likes = resp.likes, isLiked = !resp.unliked)
                        _rawComments.value = list
                        applySortAndUpdate()
                    }
                },
                onFailure = {
                    // 실패 시 원복
                    val list = _rawComments.value?.toMutableList() ?: return@fold
                    val i = list.indexOfFirst { it.id == commentId }
                    if (i >= 0) {
                        list[i] = comment
                        _rawComments.value = list
                        applySortAndUpdate()
                    }
                    val msg = it.message ?: ""
                    _actionResult.value = if (msg.contains("401") || msg.contains("로그인")) "로그인을 해주세요" else "오류: $msg"
                }
            )
        }
    }

    fun createComment(author: String, password: String, content: String, parentId: Int?) {
        viewModelScope.launch {
            val request = CreateCommentRequest(
                author = author,
                password = password,
                content = content,
                parentId = parentId,
                categoryId = categoryId
            )
            CommunityRepository.createComment(postId, request).fold(
                onSuccess = {
                    _actionResult.value = "댓글이 등록되었습니다"
                    delay(800)
                    loadComments()
                    loadPost() // 댓글 수 갱신
                },
                onFailure = { _actionResult.value = "오류: ${it.message}" }
            )
        }
    }

    fun updateComment(commentId: Int, content: String, password: String) {
        viewModelScope.launch {
            val request = UpdateCommentRequest(
                password = password,
                content = content,
                postId = postId,
                categoryId = categoryId
            )
            CommunityRepository.updateComment(commentId, request).fold(
                onSuccess = {
                    _actionResult.value = "댓글이 수정되었습니다"
                    loadComments()
                },
                onFailure = { _actionResult.value = "오류: ${it.message}" }
            )
        }
    }

    fun deleteComment(commentId: Int, password: String) {
        viewModelScope.launch {
            val request = DeleteCommentRequest(
                password = password,
                postId = postId,
                categoryId = categoryId
            )
            CommunityRepository.deleteComment(commentId, request).fold(
                onSuccess = {
                    _actionResult.value = "댓글이 삭제되었습니다"
                    loadComments()
                    loadPost()
                },
                onFailure = { _actionResult.value = "오류: ${it.message}" }
            )
        }
    }

    fun deletePost(password: String) {
        viewModelScope.launch {
            CommunityRepository.deletePost(postId, password).fold(
                onSuccess = { _deleteSuccess.value = true },
                onFailure = { _actionResult.value = "삭제 실패: ${it.message}" }
            )
        }
    }

    fun verifyPassword(password: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch {
            CommunityRepository.verifyPostPassword(postId, password).fold(
                onSuccess = { onResult(true) },
                onFailure = { onResult(false) }
            )
        }
    }

    fun report(targetType: String, targetId: Int, reason: String, customReason: String?) {
        viewModelScope.launch {
            val request = CreateReportRequest(
                targetType = targetType,
                targetId = targetId,
                postId = postId,
                categoryId = categoryId,
                reason = reason,
                customReason = customReason
            )
            CommunityRepository.createReport(request).fold(
                onSuccess = { _actionResult.value = "신고가 접수되었습니다" },
                onFailure = { _actionResult.value = "오류: ${it.message}" }
            )
        }
    }

    fun clearActionResult() {
        _actionResult.value = null
    }
}
