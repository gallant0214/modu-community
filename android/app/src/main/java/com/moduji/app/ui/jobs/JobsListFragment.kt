package com.moduji.app.ui.jobs

import android.os.Bundle
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
import com.moduji.app.databinding.FragmentJobsListBinding
import com.moduji.app.ui.jobs.adapter.JobsAdapter

/**
 * 지역별 구인 게시글 리스트 Fragment (구인 탭 2단계)
 *
 * - 게시글 검색 (종목/제목/작성자/내용/제목+내용)
 * - RegionSelectFragment에서 선택된 지역의 구인글 표시
 * - 글쓰기 FAB
 */
class JobsListFragment : Fragment() {

    private var _binding: FragmentJobsListBinding? = null
    private val binding get() = _binding!!

    private val viewModel: JobsViewModel by activityViewModels()
    private lateinit var jobsAdapter: JobsAdapter

    private var regionCode: String = ""
    private var regionName: String = ""
    private var currentSearchType = JobSearchType.TITLE

    private val isLoggedIn: Boolean
        get() = AuthManager.isLoggedIn

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        regionCode = arguments?.getString("regionCode") ?: ""
        regionName = arguments?.getString("regionName") ?: ""
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentJobsListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.tvRegionTitle.text = regionName

        setupRecyclerView()
        setupSearch()
        setupClickListeners()
        setupFab()
        setupSwipeRefresh()
        observeData()

        viewModel.loadJobPosts(regionCode)
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadJobPosts(regionCode)
        }
    }

    private fun setupRecyclerView() {
        jobsAdapter = JobsAdapter { post ->
            val bundle = Bundle().apply { putInt("postId", post.id) }
            findNavController().navigate(R.id.action_jobsList_to_jobDetail, bundle)
        }

        binding.rvJobs.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = jobsAdapter
        }
    }

    private fun setupSearch() {
        binding.tvSearchType.text = currentSearchType.label

        // 검색 유형 선택
        binding.btnSearchType.setOnClickListener { showSearchTypeBottomSheet() }

        // 종목 추천 리스트 클릭
        binding.lvSportSuggestions.setOnItemClickListener { _, _, position, _ ->
            val adapter = binding.lvSportSuggestions.adapter as? ArrayAdapter<*> ?: return@setOnItemClickListener
            val sport = adapter.getItem(position) as? String ?: return@setOnItemClickListener
            binding.etSearch.setText(sport)
            binding.etSearch.setSelection(sport.length)
            binding.lvSportSuggestions.visibility = View.GONE
        }

        // 검색 입력
        binding.etSearch.addTextChangedListener(object : TextWatcher {
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
                    viewModel.searchInRegion(query, currentSearchType, regionCode)
                } else {
                    viewModel.clearRegionSearch()
                }
            }
        })
    }

    private fun showSearchTypeBottomSheet() {
        val options = JobSearchType.values().map { it.label }.toTypedArray()
        val currentIndex = JobSearchType.values().indexOf(currentSearchType)
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("검색 유형")
            .setSingleChoiceItems(options, currentIndex) { dialog, which ->
                currentSearchType = JobSearchType.values()[which]
                binding.tvSearchType.text = currentSearchType.label
                val query = binding.etSearch.text?.toString()?.trim() ?: ""
                if (query.isNotEmpty()) {
                    viewModel.searchInRegion(query, currentSearchType, regionCode)
                }
                dialog.dismiss()
            }
            .setNegativeButton("취소", null)
            .show()
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

    private fun setupClickListeners() {
        binding.btnBack.setOnClickListener {
            findNavController().navigateUp()
        }

        binding.btnChangeRegion.setOnClickListener {
            val sheet = RegionSelectBottomSheet.newInstance()
            sheet.onRegionSelected = { code, name ->
                regionCode = code
                regionName = name
                binding.tvRegionTitle.text = name
                viewModel.clearRegionSearch()
                binding.etSearch.setText("")
                viewModel.loadJobPosts(code)
            }
            sheet.show(parentFragmentManager, "region_select")
        }
    }

    private fun setupFab() {
        binding.fabWrite.setOnClickListener {
            if (!isLoggedIn) {
                showLoginRequiredDialog()
            } else {
                navigateToJobWrite()
            }
        }
    }

    private fun showLoginRequiredDialog() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("로그인이 필요합니다")
            .setMessage("구인 글 작성은 Google 로그인 후 이용 가능합니다.\nMY 페이지에서 로그인해 주세요.")
            .setPositiveButton("로그인하러 가기") { _, _ ->
                val bottomNav = requireActivity().findViewById<com.google.android.material.bottomnavigation.BottomNavigationView>(R.id.bottom_navigation)
                bottomNav?.selectedItemId = R.id.navigation_profile
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun navigateToJobWrite() {
        val bundle = Bundle().apply {
            putString("regionCode", regionCode)
            putString("regionName", regionName)
        }
        findNavController().navigate(R.id.action_jobsList_to_jobWrite, bundle)
    }

    private fun observeData() {
        // 기본 게시글 목록
        viewModel.jobPosts.observe(viewLifecycleOwner) { posts ->
            binding.swipeRefresh.isRefreshing = false
            // 검색 중이면 무시
            if (viewModel.regionSearchResults.value != null) return@observe
            showPosts(posts)
        }

        // 검색 결과
        viewModel.regionSearchResults.observe(viewLifecycleOwner) { results ->
            if (results != null) {
                showPosts(results, isSearchResult = true)
            } else {
                // 검색 해제 → 원래 목록 표시
                showPosts(viewModel.jobPosts.value)
            }
        }
    }

    private fun showPosts(posts: List<com.moduji.app.data.model.JobPost>?, isSearchResult: Boolean = false) {
        if (posts.isNullOrEmpty()) {
            binding.rvJobs.visibility = View.GONE
            binding.emptyState.visibility = View.VISIBLE
            binding.tvEmptyMessage.text = if (isSearchResult) "검색 결과가 없습니다." else "아직 구인 글이 없습니다."
            binding.tvEmptySub.text = if (isSearchResult) "" else "첫 번째 구인 글을 작성해보세요!"
        } else {
            binding.rvJobs.visibility = View.VISIBLE
            binding.emptyState.visibility = View.GONE
            jobsAdapter.submitList(posts)
        }
    }

    override fun onDestroyView() {
        viewModel.clearRegionSearch()
        super.onDestroyView()
        _binding = null
    }
}
