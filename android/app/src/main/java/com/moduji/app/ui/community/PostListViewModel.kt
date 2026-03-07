package com.moduji.app.ui.community

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moduji.app.data.model.CommunityPost
import com.moduji.app.data.repository.CommunityRepository
import kotlinx.coroutines.launch

class PostListViewModel : ViewModel() {

    private val _posts = MutableLiveData<List<CommunityPost>>()
    val posts: LiveData<List<CommunityPost>> = _posts

    private val _noticePosts = MutableLiveData<List<CommunityPost>>()
    val noticePosts: LiveData<List<CommunityPost>> = _noticePosts

    private val _topPosts = MutableLiveData<List<CommunityPost>>()
    val topPosts: LiveData<List<CommunityPost>> = _topPosts

    private val _currentPage = MutableLiveData(1)
    val currentPage: LiveData<Int> = _currentPage

    private val _totalPages = MutableLiveData(1)
    val totalPages: LiveData<Int> = _totalPages

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    var categoryId: Int = 0
    var currentSort: String = "latest"
    var searchType: String? = null
    var searchQuery: String? = null

    fun loadPosts(page: Int = 1) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            CommunityRepository.getPosts(
                categoryId = categoryId,
                sort = currentSort,
                page = page,
                searchType = searchType,
                query = searchQuery
            ).fold(
                onSuccess = { response ->
                    _posts.value = response.posts
                    _noticePosts.value = response.noticePosts
                    _topPosts.value = response.topPosts
                    _currentPage.value = page
                    _totalPages.value = response.totalPages
                },
                onFailure = { e ->
                    _error.value = e.message ?: "게시글을 불러올 수 없습니다"
                }
            )

            _isLoading.value = false
        }
    }

    fun setSort(sort: String) {
        if (currentSort != sort) {
            currentSort = sort
            loadPosts(1)
        }
    }

    fun search(type: String?, query: String?) {
        searchType = type
        searchQuery = query
        loadPosts(1)
    }

    fun clearSearch() {
        searchType = null
        searchQuery = null
        loadPosts(1)
    }

    fun nextPage() {
        val current = _currentPage.value ?: 1
        val total = _totalPages.value ?: 1
        if (current < total) loadPosts(current + 1)
    }

    fun prevPage() {
        val current = _currentPage.value ?: 1
        if (current > 1) loadPosts(current - 1)
    }

    fun goToPage(page: Int) {
        val total = _totalPages.value ?: 1
        if (page in 1..total) loadPosts(page)
    }
}
