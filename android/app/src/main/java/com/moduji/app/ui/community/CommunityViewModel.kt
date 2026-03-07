package com.moduji.app.ui.community

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moduji.app.data.model.CommunityCategory
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.util.ChosungSearch
import kotlinx.coroutines.launch

class CommunityViewModel : ViewModel() {

    private val _categories = MutableLiveData<List<CommunityCategory>>()
    val categories: LiveData<List<CommunityCategory>> = _categories

    private val _popularCategories = MutableLiveData<List<CommunityCategory>>()
    val popularCategories: LiveData<List<CommunityCategory>> = _popularCategories

    private val _filteredCategories = MutableLiveData<List<CommunityCategory>>()
    val filteredCategories: LiveData<List<CommunityCategory>> = _filteredCategories

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    private var allCategories: List<CommunityCategory> = emptyList()
    private var currentQuery = ""

    init {
        loadCategories()
    }

    fun loadCategories() {
        // 캐시가 있으면 즉시 표시 (로딩 스피너 없음)
        val cached = CommunityRepository.getCachedCategories()
        if (cached != null) {
            applyCategoryData(cached)
        }

        viewModelScope.launch {
            if (cached == null) _isLoading.value = true
            _error.value = null

            CommunityRepository.getCategories(forceRefresh = cached != null).fold(
                onSuccess = { list -> applyCategoryData(list) },
                onFailure = { e ->
                    if (cached == null) {
                        val msg = when {
                            e.message?.contains("resolve host", ignoreCase = true) == true ||
                            e.message?.contains("Unable to resolve", ignoreCase = true) == true ||
                            e.message?.contains("No address associated", ignoreCase = true) == true ->
                                "서버에 연결할 수 없습니다\n인터넷 연결을 확인해주세요"
                            e.message?.contains("timeout", ignoreCase = true) == true ->
                                "서버 응답 시간이 초과되었습니다\n잠시 후 다시 시도해주세요"
                            else -> "오류: [${e.javaClass.simpleName}]\n${e.message ?: "알 수 없는 오류"}"
                        }
                        _error.value = msg
                    }
                }
            )

            _isLoading.value = false
        }
    }

    private fun applyCategoryData(list: List<CommunityCategory>) {
        allCategories = list
        _categories.value = list
        _popularCategories.value = list
            .filter { it.isPopular }
            .sortedByDescending { it.postCountInt }
            .take(5)
        applyFilter(currentQuery)
    }

    fun filterCategories(query: String) {
        currentQuery = query
        applyFilter(query)
    }

    private fun applyFilter(query: String) {
        if (query.isBlank()) {
            _filteredCategories.value = allCategories.sortedBy { it.sortOrder }
        } else {
            _filteredCategories.value = allCategories
                .filter { cat ->
                    ChosungSearch.matches(cat.name, query) ||
                    ChosungSearch.matches(cat.emoji, query)
                }
                .sortedBy { it.sortOrder }
        }
    }
}
