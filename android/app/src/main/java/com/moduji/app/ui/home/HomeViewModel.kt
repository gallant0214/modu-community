package com.moduji.app.ui.home

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moduji.app.data.model.CommunityCategory
import com.moduji.app.data.model.CommunityPost
import com.moduji.app.data.model.JobPost
import com.moduji.app.data.model.SearchResponse
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.data.repository.JobsRepository
import kotlinx.coroutines.launch

class HomeViewModel : ViewModel() {

    private val _categories = MutableLiveData<List<CommunityCategory>>()
    val categories: LiveData<List<CommunityCategory>> = _categories

    private val _popularPosts = MutableLiveData<List<CommunityPost>>()
    val popularPosts: LiveData<List<CommunityPost>> = _popularPosts

    private val _latestPosts = MutableLiveData<List<CommunityPost>>()
    val latestPosts: LiveData<List<CommunityPost>> = _latestPosts

    private val _latestJobs = MutableLiveData<List<JobPost>>()
    val latestJobs: LiveData<List<JobPost>> = _latestJobs

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    // 검색
    private val _searchResults = MutableLiveData<SearchResponse?>()
    val searchResults: LiveData<SearchResponse?> = _searchResults

    private val _isSearching = MutableLiveData(false)
    val isSearching: LiveData<Boolean> = _isSearching

    init {
        loadData()
    }

    fun loadData() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            // 카테고리 로드
            CommunityRepository.getCategories().fold(
                onSuccess = { list ->
                    _categories.value = list
                        .sortedByDescending { it.postCountInt }
                        .take(8)
                },
                onFailure = { e -> handleError(e) }
            )

            // 인기 게시글 로드
            CommunityRepository.getPopularPosts(3).fold(
                onSuccess = { _popularPosts.value = it },
                onFailure = { e -> handleError(e) }
            )

            // 최신 게시글 로드
            CommunityRepository.getLatestPosts(5).fold(
                onSuccess = { _latestPosts.value = it },
                onFailure = { e -> handleError(e) }
            )

            // 최신 구인 (서버 API)
            JobsRepository.getLatestJobs(3).fold(
                onSuccess = { _latestJobs.value = it },
                onFailure = { /* 구인 로딩 실패 무시 */ }
            )

            _isLoading.value = false
        }
    }

    fun search(query: String) {
        if (query.isBlank()) {
            clearSearch()
            return
        }
        viewModelScope.launch {
            _isSearching.value = true
            CommunityRepository.search(query).fold(
                onSuccess = { _searchResults.value = it },
                onFailure = { _error.value = "검색 중 오류가 발생했습니다" }
            )
            _isSearching.value = false
        }
    }

    fun clearSearch() {
        _searchResults.value = null
    }

    private fun handleError(e: Throwable) {
        val msg = when {
            e.message?.contains("resolve host", ignoreCase = true) == true ->
                "서버에 연결할 수 없습니다\n인터넷 연결을 확인해주세요"
            e.message?.contains("timeout", ignoreCase = true) == true ->
                "서버 응답 시간이 초과되었습니다\n잠시 후 다시 시도해주세요"
            else -> "데이터를 불러올 수 없습니다"
        }
        _error.value = msg
    }
}
