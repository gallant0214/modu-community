package com.moduji.app.ui.jobs

import android.os.Bundle
import android.os.Parcelable
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import android.widget.ArrayAdapter
import com.moduji.app.R
import com.moduji.app.data.model.JobSearchType
import com.moduji.app.util.AuthManager
import com.moduji.app.util.ChosungSearch
import com.moduji.app.databinding.FragmentRegionSelectBinding
import com.moduji.app.ui.common.KeywordAlertBottomSheet
import com.moduji.app.ui.jobs.adapter.JobsAdapter
import com.moduji.app.ui.jobs.adapter.RegionAdapter

/**
 * 지역 선택 Fragment (구인 탭 1단계)
 *
 * - 게시글 검색 (종목/제목/작성자/내용/제목+내용)
 * - 지역명 검색 필터링
 * - 아코디언 형태 지역 그룹
 * - 글쓰기 FAB
 */
class RegionSelectFragment : Fragment() {

    private var _binding: FragmentRegionSelectBinding? = null
    private val binding get() = _binding!!

    private val viewModel: JobsViewModel by activityViewModels()
    private lateinit var regionAdapter: RegionAdapter
    private lateinit var searchAdapter: JobsAdapter
    private var isSelectForWriteMode = false
    private var isReturnRegionResult = false

    private var currentSearchType = JobSearchType.TITLE
    private var savedRecyclerState: Parcelable? = null
    private var pendingScrollToExpanded = false

    private val isLoggedIn: Boolean
        get() = AuthManager.isLoggedIn

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentRegionSelectBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        isReturnRegionResult = arguments?.getBoolean("returnRegionResult", false) ?: false

        checkSelectForWriteMode()
        setupRecyclerView()
        setupSearch()
        setupPostSearch()
        setupFab()
        observeData()

        binding.btnKeywordAlert.setOnClickListener {
            KeywordAlertBottomSheet.show(this)
        }

        // 지역 선택 결과 반환 모드일 때 불필요한 UI 숨김
        if (isReturnRegionResult) {
            binding.fabWrite.visibility = View.GONE
            binding.btnKeywordAlert.visibility = View.GONE
            binding.btnSearchType.visibility = View.GONE
            binding.etPostSearch.visibility = View.GONE
        }
    }

    private fun checkSelectForWriteMode() {
        val savedStateHandle = findNavController().currentBackStackEntry?.savedStateHandle
        savedStateHandle?.getLiveData<Boolean>("selectForWrite")?.observe(viewLifecycleOwner) { value ->
            if (value == true) {
                isSelectForWriteMode = true
                savedStateHandle.remove<Boolean>("selectForWrite")
            }
        }
    }

    private fun setupRecyclerView() {
        regionAdapter = RegionAdapter(
            onSubRegionClick = { code, name ->
                if (isReturnRegionResult) {
                    // 결과 반환 모드: 이전 화면에 결과 전달 후 복귀
                    findNavController().previousBackStackEntry?.savedStateHandle?.apply {
                        set("selectedRegionCode", code)
                        set("selectedRegionName", name)
                    }
                    findNavController().popBackStack()
                } else {
                    val bundle = Bundle().apply {
                        putString("regionCode", code)
                        putString("regionName", name)
                    }
                    if (isSelectForWriteMode) {
                        isSelectForWriteMode = false
                        findNavController().navigate(R.id.action_regionSelect_to_jobWrite, bundle)
                    } else {
                        findNavController().navigate(R.id.action_regionSelect_to_jobsList, bundle)
                    }
                }
            },
            onGroupToggle = { groupCode ->
                pendingScrollToExpanded = true
                viewModel.toggleGroup(groupCode)
            }
        )

        binding.rvRegions.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = regionAdapter
        }

        // 검색 결과용 어댑터
        searchAdapter = JobsAdapter { post ->
            val bundle = Bundle().apply { putInt("postId", post.id) }
            findNavController().navigate(R.id.action_regionSelect_to_jobDetail, bundle)
        }
        binding.rvSearchResults.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = searchAdapter
        }
    }

    // 지역명 검색
    private fun setupSearch() {
        binding.etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                viewModel.filterRegions(s?.toString()?.trim() ?: "")
            }
        })
    }

    // 게시글 검색
    private fun setupPostSearch() {
        binding.tvSearchType.text = currentSearchType.label

        // 검색 유형 선택
        binding.btnSearchType.setOnClickListener { showSearchTypeBottomSheet() }

        // 종목 추천 리스트 클릭
        binding.lvSportSuggestions.setOnItemClickListener { _, _, position, _ ->
            val adapter = binding.lvSportSuggestions.adapter as? ArrayAdapter<*> ?: return@setOnItemClickListener
            val sport = adapter.getItem(position) as? String ?: return@setOnItemClickListener
            binding.etPostSearch.setText(sport)
            binding.etPostSearch.setSelection(sport.length)
            binding.lvSportSuggestions.visibility = View.GONE
        }

        // 검색 입력
        binding.etPostSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val query = s?.toString()?.trim() ?: ""
                if (currentSearchType == JobSearchType.SPORT && query.isNotEmpty()) {
                    showSportSuggestions(query)
                } else {
                    binding.lvSportSuggestions.visibility = View.GONE
                }
                if (query.isNotEmpty()) {
                    viewModel.searchGlobal(query, currentSearchType)
                } else {
                    viewModel.clearGlobalSearch()
                }
            }
        })
    }

    private fun showSportSuggestions(query: String) {
        val allSports = JobSportBottomSheet.ALL_SPORTS.filter { it != "기타" }
        val matched = allSports.filter { ChosungSearch.matches(it, query) }
        if (matched.isEmpty()) {
            binding.lvSportSuggestions.visibility = View.GONE
            return
        }
        binding.lvSportSuggestions.adapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_list_item_1,
            matched
        )
        binding.lvSportSuggestions.visibility = View.VISIBLE
    }

    private fun showSearchTypeBottomSheet() {
        val options = JobSearchType.values().map { it.label }.toTypedArray()
        val currentIndex = JobSearchType.values().indexOf(currentSearchType)
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("검색 유형")
            .setSingleChoiceItems(options, currentIndex) { dialog, which ->
                currentSearchType = JobSearchType.values()[which]
                binding.tvSearchType.text = currentSearchType.label
                val query = binding.etPostSearch.text?.toString()?.trim() ?: ""
                if (query.isNotEmpty()) {
                    viewModel.searchGlobal(query, currentSearchType)
                }
                dialog.dismiss()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun setupFab() {
        binding.fabWrite.setOnClickListener {
            if (!isLoggedIn) {
                MaterialAlertDialogBuilder(requireContext())
                    .setTitle("로그인이 필요합니다")
                    .setMessage("구인 글 작성은 Google 로그인 후 이용 가능합니다.\nMY 페이지에서 로그인해 주세요.")
                    .setPositiveButton("로그인하러 가기") { _, _ ->
                        val bottomNav = requireActivity().findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottom_navigation)
                        bottomNav?.selectedItemId = R.id.navigation_profile
                    }
                    .setNegativeButton("취소", null)
                    .show()
            } else {
                val bundle = Bundle().apply {
                    putString("regionCode", "")
                    putString("regionName", "")
                }
                findNavController().navigate(R.id.action_regionSelect_to_jobWrite, bundle)
            }
        }
    }

    private fun observeData() {
        viewModel.regionGroups.observe(viewLifecycleOwner) { groups ->
            regionAdapter.submitData(groups)

            if (pendingScrollToExpanded) {
                pendingScrollToExpanded = false
                val expandedPos = regionAdapter.expandedGroupPosition
                if (expandedPos >= 0) {
                    (binding.rvRegions.layoutManager as? LinearLayoutManager)
                        ?.scrollToPositionWithOffset(expandedPos, 0)
                }
            } else {
                // 스크롤 위치 복원 (뒤로가기 등)
                savedRecyclerState?.let { state ->
                    binding.rvRegions.layoutManager?.onRestoreInstanceState(state)
                    savedRecyclerState = null
                }
            }
        }

        viewModel.globalSearchResults.observe(viewLifecycleOwner) { results ->
            if (results != null) {
                // 검색 모드: 지역 리스트 숨기고 검색 결과 표시
                binding.rvRegions.visibility = View.GONE
                binding.etSearch.visibility = View.GONE
                if (results.isEmpty()) {
                    binding.rvSearchResults.visibility = View.GONE
                    binding.emptySearch.visibility = View.VISIBLE
                } else {
                    binding.rvSearchResults.visibility = View.VISIBLE
                    binding.emptySearch.visibility = View.GONE
                    searchAdapter.submitList(results)
                }
            } else {
                // 일반 모드: 지역 리스트 표시
                binding.rvRegions.visibility = View.VISIBLE
                binding.etSearch.visibility = View.VISIBLE
                binding.rvSearchResults.visibility = View.GONE
                binding.emptySearch.visibility = View.GONE
            }
        }
    }

    override fun onDestroyView() {
        savedRecyclerState = binding.rvRegions.layoutManager?.onSaveInstanceState()
        super.onDestroyView()
        _binding = null
    }
}
