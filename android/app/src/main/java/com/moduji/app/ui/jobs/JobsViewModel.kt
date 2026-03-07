package com.moduji.app.ui.jobs

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.moduji.app.data.model.JobPost
import com.moduji.app.data.model.JobSearchType
import com.moduji.app.data.model.RegionGroup
import com.moduji.app.data.repository.JobsRepository
import kotlinx.coroutines.launch

/**
 * 구인 탭 ViewModel
 *
 * - RegionSelectFragment: 통합 지역 그룹(아코디언) + 게시글 검색
 * - JobsListFragment: 선택된 지역의 구인글 리스트 + 검색
 */
class JobsViewModel : ViewModel() {

    // 원본 데이터
    private var allRegionGroups: List<RegionGroup> = emptyList()

    // 화면에 표시할 지역 그룹 목록
    private val _regionGroups = MutableLiveData<List<RegionGroup>>()
    val regionGroups: LiveData<List<RegionGroup>> = _regionGroups

    // 선택된 지역의 구인 게시글 목록
    private val _jobPosts = MutableLiveData<List<JobPost>>()
    val jobPosts: LiveData<List<JobPost>> = _jobPosts

    // 전체 지역 검색 결과 (RegionSelectFragment)
    private val _globalSearchResults = MutableLiveData<List<JobPost>?>()
    val globalSearchResults: LiveData<List<JobPost>?> = _globalSearchResults

    // 지역 내 검색 결과 (JobsListFragment)
    private val _regionSearchResults = MutableLiveData<List<JobPost>?>()
    val regionSearchResults: LiveData<List<JobPost>?> = _regionSearchResults

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    init {
        loadRegionGroups()
    }

    /**
     * 서버에서 지역 그룹 데이터 로드
     */
    fun loadRegionGroups() {
        viewModelScope.launch {
            _isLoading.value = true
            allRegionGroups = JobsRepository.getRegionGroups()
            _regionGroups.value = allRegionGroups
            _isLoading.value = false
        }
    }

    /**
     * 그룹 펼침/접힘 토글
     */
    fun toggleGroup(groupCode: String) {
        val current = _regionGroups.value ?: return
        _regionGroups.value = current.map { group ->
            if (group.code == groupCode) {
                group.copy(isExpanded = !group.isExpanded)
            } else {
                group.copy(isExpanded = false)
            }
        }
    }

    /**
     * 지역 검색 필터링
     */
    fun filterRegions(keyword: String) {
        if (keyword.isBlank()) {
            // 현재 펼침 상태 유지
            val expandedCodes = _regionGroups.value
                ?.filter { it.isExpanded }
                ?.map { it.code }
                ?.toSet() ?: emptySet()
            _regionGroups.value = allRegionGroups.map {
                it.copy(isExpanded = it.code in expandedCodes)
            }
            return
        }

        _regionGroups.value = allRegionGroups.mapNotNull { group ->
            val groupNameMatch = group.name.contains(keyword)
            val matchedSubs = group.subRegions.filter { it.name.contains(keyword) }

            when {
                groupNameMatch -> group.copy(isExpanded = true)
                matchedSubs.isNotEmpty() -> group.copy(subRegions = matchedSubs, isExpanded = true)
                else -> null
            }
        }
    }

    /**
     * 특정 지역의 구인 게시글 로드 (서버 API)
     */
    fun loadJobPosts(regionCode: String) {
        viewModelScope.launch {
            _isLoading.value = true
            JobsRepository.getJobPostsByRegion(regionCode).fold(
                onSuccess = { (posts, _) -> _jobPosts.value = posts },
                onFailure = { _jobPosts.value = emptyList() }
            )
            _isLoading.value = false
        }
    }

    /**
     * 전체 지역 게시글 검색 (RegionSelectFragment용)
     */
    fun searchGlobal(query: String, searchType: JobSearchType) {
        if (query.isBlank()) {
            _globalSearchResults.value = null
            return
        }
        viewModelScope.launch {
            JobsRepository.searchJobPosts(query, searchType).fold(
                onSuccess = { _globalSearchResults.value = it },
                onFailure = { _globalSearchResults.value = emptyList() }
            )
        }
    }

    fun clearGlobalSearch() {
        _globalSearchResults.value = null
    }

    /**
     * 지역 내 게시글 검색 (JobsListFragment용)
     */
    fun searchInRegion(query: String, searchType: JobSearchType, regionCode: String) {
        if (query.isBlank()) {
            _regionSearchResults.value = null
            return
        }
        viewModelScope.launch {
            JobsRepository.searchJobPosts(query, searchType, regionCode).fold(
                onSuccess = { _regionSearchResults.value = it },
                onFailure = { _regionSearchResults.value = emptyList() }
            )
        }
    }

    fun clearRegionSearch() {
        _regionSearchResults.value = null
    }
}
