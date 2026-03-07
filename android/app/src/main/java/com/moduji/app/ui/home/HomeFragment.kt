package com.moduji.app.ui.home

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.widget.addTextChangedListener
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.moduji.app.MainActivity
import com.moduji.app.R
import com.moduji.app.databinding.FragmentHomeBinding
import com.moduji.app.ui.home.adapter.JobCardAdapter
import com.moduji.app.ui.home.adapter.PopularCategoryAdapter
import com.moduji.app.ui.home.adapter.PostCardAdapter

class HomeFragment : Fragment() {

    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!

    private val viewModel: HomeViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRecyclerViews()
        setupSwipeRefresh()
        setupSearch()
        observeData()
        observeSearch()
        setupClickListeners()
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setOnRefreshListener {
            viewModel.loadData()
        }
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            if (!loading) {
                binding.swipeRefresh.isRefreshing = false
            }
        }
    }

    private fun setupRecyclerViews() {
        binding.rvPopularCategories.layoutManager =
            LinearLayoutManager(requireContext(), LinearLayoutManager.HORIZONTAL, false)
        binding.rvPopularReviews.layoutManager = LinearLayoutManager(requireContext())
        binding.rvLatestJobs.layoutManager = LinearLayoutManager(requireContext())
        binding.rvLatestPosts.layoutManager = LinearLayoutManager(requireContext())
        binding.rvSearchResults.layoutManager = LinearLayoutManager(requireContext())
    }

    // ====================================================
    // 검색 설정
    // ====================================================
    private fun setupSearch() {
        // 키보드 검색 버튼
        binding.etSearch.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                performSearch()
                true
            } else false
        }

        // 텍스트 변경 시 X 버튼 표시/숨김
        binding.etSearch.addTextChangedListener { text ->
            binding.btnClearSearch.visibility =
                if (text?.isNotEmpty() == true) View.VISIBLE else View.GONE
        }

        // X 버튼 클릭 → 검색 해제
        binding.btnClearSearch.setOnClickListener {
            binding.etSearch.text?.clear()
            viewModel.clearSearch()
            hideKeyboard()
            binding.etSearch.clearFocus()
        }
    }

    private fun performSearch() {
        val query = binding.etSearch.text?.toString()?.trim() ?: ""
        if (query.isEmpty()) return
        viewModel.search(query)
        hideKeyboard()
    }

    private fun hideKeyboard() {
        val imm = ContextCompat.getSystemService(requireContext(), InputMethodManager::class.java)
        imm?.hideSoftInputFromWindow(binding.etSearch.windowToken, 0)
    }

    // ====================================================
    // 검색 결과 관찰
    // ====================================================
    private fun observeSearch() {
        viewModel.searchResults.observe(viewLifecycleOwner) { result ->
            if (result != null) {
                // 검색 모드: 홈 콘텐츠 숨기고 검색 결과 표시
                binding.swipeRefresh.visibility = View.GONE
                binding.layoutSearchResults.visibility = View.VISIBLE

                val totalCount = result.posts.size + result.jobs.size
                binding.tvSearchStatus.text = if (totalCount == 0) {
                    "검색 결과가 없습니다"
                } else {
                    "검색 결과 ${totalCount}건 (게시글 ${result.posts.size} · 구인 ${result.jobs.size})"
                }

                binding.rvSearchResults.adapter = PostCardAdapter(result.posts) { post ->
                    navigateToPostDetail(post.id, post.categoryId)
                }
            } else {
                // 일반 모드: 홈 콘텐츠 표시
                binding.swipeRefresh.visibility = View.VISIBLE
                binding.layoutSearchResults.visibility = View.GONE
            }
        }

        viewModel.isSearching.observe(viewLifecycleOwner) { searching ->
            if (searching) {
                binding.tvSearchStatus.text = "검색 중..."
            }
        }
    }

    private fun observeData() {
        viewModel.categories.observe(viewLifecycleOwner) { categories ->
            binding.rvPopularCategories.adapter = PopularCategoryAdapter(categories) { category ->
                val bottomNav = requireActivity().findViewById<BottomNavigationView>(R.id.bottom_navigation)
                bottomNav?.selectedItemId = R.id.navigation_community
            }
        }

        viewModel.popularPosts.observe(viewLifecycleOwner) { posts ->
            binding.rvPopularReviews.adapter = PostCardAdapter(posts) { post ->
                navigateToPostDetail(post.id, post.categoryId)
            }
        }

        viewModel.latestJobs.observe(viewLifecycleOwner) { jobs ->
            binding.rvLatestJobs.adapter = JobCardAdapter(jobs) { job ->
                val bottomNav = requireActivity().findViewById<BottomNavigationView>(R.id.bottom_navigation)
                bottomNav?.selectedItemId = R.id.navigation_jobs
            }
        }

        viewModel.latestPosts.observe(viewLifecycleOwner) { posts ->
            binding.rvLatestPosts.adapter = PostCardAdapter(posts) { post ->
                navigateToPostDetail(post.id, post.categoryId)
            }
        }

        viewModel.error.observe(viewLifecycleOwner) { errorMsg ->
            if (errorMsg != null) {
                Toast.makeText(requireContext(), errorMsg, Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun navigateToPostDetail(postId: Int, categoryId: Int) {
        val bundle = Bundle().apply {
            putInt("postId", postId)
            putInt("categoryId", categoryId)
        }
        findNavController().navigate(R.id.action_home_to_postDetail, bundle)
    }

    private fun setupClickListeners() {
        binding.btnMoreReviews.setOnClickListener {
            (activity as? MainActivity)?.resetCommunityNavigation()
            val bottomNav = requireActivity().findViewById<BottomNavigationView>(R.id.bottom_navigation)
            bottomNav?.selectedItemId = R.id.navigation_community
        }

        binding.btnMoreJobs.setOnClickListener {
            (activity as? MainActivity)?.resetJobsNavigation()
            val bottomNav = requireActivity().findViewById<BottomNavigationView>(R.id.bottom_navigation)
            bottomNav?.selectedItemId = R.id.navigation_jobs
        }

        binding.btnMorePosts.setOnClickListener {
            (activity as? MainActivity)?.resetCommunityNavigation()
            val bottomNav = requireActivity().findViewById<BottomNavigationView>(R.id.bottom_navigation)
            bottomNav?.selectedItemId = R.id.navigation_community
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
