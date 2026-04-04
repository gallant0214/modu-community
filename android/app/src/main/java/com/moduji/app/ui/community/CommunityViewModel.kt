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

    companion object {
        /** 서버 오류 시 사용할 기본 카테고리 목록 */
        private val DEFAULT_CATEGORIES = listOf(
            CommunityCategory(1, "보디빌딩", "🏋️", 1, true),
            CommunityCategory(2, "축구", "⚽", 2, true),
            CommunityCategory(3, "야구", "⚾", 3, true),
            CommunityCategory(4, "테니스", "🎾", 4, true),
            CommunityCategory(5, "수영", "🏊", 5, true),
            CommunityCategory(6, "골프", "🏌️", 0, false),
            CommunityCategory(7, "농구", "🏀", 0, false),
            CommunityCategory(8, "배구", "🏐", 0, false),
            CommunityCategory(9, "탁구", "🏓", 0, false),
            CommunityCategory(10, "배드민턴", "🏸", 0, false),
            CommunityCategory(11, "복싱", "🥊", 0, false),
            CommunityCategory(12, "유도", "🥋", 0, false),
            CommunityCategory(13, "태권도", "🥋", 0, false),
            CommunityCategory(14, "합기도", "🥋", 0, false),
            CommunityCategory(15, "주짓수", "🤼", 0, false),
            CommunityCategory(16, "MMA", "🤼", 0, false),
            CommunityCategory(17, "검도", "⚔️", 0, false),
            CommunityCategory(18, "양궁", "🏹", 0, false),
            CommunityCategory(19, "사격", "🎯", 0, false),
            CommunityCategory(20, "요가", "🧘", 0, false),
            CommunityCategory(21, "필라테스", "🤸", 0, false),
            CommunityCategory(22, "게이트볼", "🏑", 0, false),
            CommunityCategory(23, "크로스핏", "💪", 0, false),
            CommunityCategory(24, "스쿼시", "🎾", 0, false),
            CommunityCategory(25, "스키/보드", "⛷️", 0, false),
            CommunityCategory(26, "클라이밍", "🧗", 0, false),
            CommunityCategory(27, "승마", "🏇", 0, false),
            CommunityCategory(28, "펜싱", "🤺", 0, false),
            CommunityCategory(29, "조정", "🚣", 0, false),
            CommunityCategory(30, "육상", "🏃", 0, false),
            CommunityCategory(31, "체조", "🤸", 0, false),
            CommunityCategory(32, "핸드볼", "🤾", 0, false),
            CommunityCategory(33, "역도", "🏋️", 0, false),
            CommunityCategory(34, "사이클", "🚴", 0, false),
            CommunityCategory(35, "철인3종", "🏊", 0, false),
            CommunityCategory(36, "기타종목", "🏅", 99, false),
        )
    }

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
        // 1단계: 캐시 또는 로컬 기본 데이터로 즉시 표시 (로딩 없음)
        val cached = CommunityRepository.getCachedCategories()
        applyCategoryData(cached ?: DEFAULT_CATEGORIES)

        // 2단계: 서버에서 최신 데이터 백그라운드 갱신
        viewModelScope.launch {
            _error.value = null

            CommunityRepository.getCategories(forceRefresh = true).fold(
                onSuccess = { list -> applyCategoryData(list) },
                onFailure = { /* 로컬 데이터가 이미 표시되어 있으므로 무시 */ }
            )
        }
    }

    private fun applyCategoryData(list: List<CommunityCategory>) {
        allCategories = list
        _categories.value = list
        _popularCategories.value = list
            .filter { it.postCountInt > 0 }
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
            _filteredCategories.value = allCategories.sortedBy { it.name }
        } else {
            _filteredCategories.value = allCategories
                .filter { cat ->
                    ChosungSearch.matches(cat.name, query) ||
                    ChosungSearch.matches(cat.emoji, query)
                }
                .sortedBy { it.name }
        }
    }
}
