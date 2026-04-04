package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.ArrayAdapter
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.moduji.app.R
import com.moduji.app.data.model.CommunityPost
import com.moduji.app.databinding.FragmentPostListBinding
import com.moduji.app.ui.community.adapter.PostListAdapter
import com.moduji.app.ui.community.adapter.PostListItem

class PostListFragment : Fragment() {

    private var _binding: FragmentPostListBinding? = null
    private val binding get() = _binding!!

    private val viewModel: PostListViewModel by viewModels()
    private lateinit var postAdapter: PostListAdapter

    private var categoryId = 0
    private var categoryName = ""
    private var categoryEmoji = ""
    private var isSearchVisible = false

    private val searchTypes = arrayOf("전체", "제목", "내용", "작성자", "지역")
    private val searchTypeValues = arrayOf("all", "title", "content", "author", "region")

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPostListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        categoryId = arguments?.getInt("categoryId") ?: 0
        categoryName = arguments?.getString("categoryName") ?: ""
        categoryEmoji = arguments?.getString("categoryEmoji") ?: ""

        viewModel.categoryId = categoryId

        setupHeader()
        setupSearch()
        setupSortTabs()
        setupRecyclerView()
        setupPagination()
        observeData()

        viewModel.loadPosts()
    }

    private fun setupHeader() {
        binding.tvTitle.text = categoryName

        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        binding.btnSearch.setOnClickListener {
            isSearchVisible = !isSearchVisible
            binding.layoutSearch.visibility = if (isSearchVisible) View.VISIBLE else View.GONE
            if (!isSearchVisible) {
                viewModel.clearSearch()
                binding.etSearch.text?.clear()
            }
        }

        binding.fabWrite.setOnClickListener {
            val bundle = Bundle().apply {
                putInt("categoryId", categoryId)
                putString("categoryName", categoryName)
            }
            findNavController().navigate(R.id.action_postList_to_postWrite, bundle)
        }
    }

    private fun setupSearch() {
        binding.spinnerSearchType.adapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_spinner_dropdown_item,
            searchTypes
        )

        val execSearch = {
            val typeIndex = binding.spinnerSearchType.selectedItemPosition
            val query = binding.etSearch.text?.toString()?.trim()
            if (!query.isNullOrEmpty()) {
                viewModel.search(searchTypeValues[typeIndex], query)
            }
        }

        binding.btnSearchExec.setOnClickListener { execSearch() }
        binding.etSearch.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                execSearch()
                true
            } else false
        }
    }

    private fun setupSortTabs() {
        data class TabInfo(val tab: TextView, val indicator: View, val sort: String)

        val tabs = listOf(
            TabInfo(binding.tabLatest, binding.indicatorLatest, "latest"),
            TabInfo(binding.tabPopular, binding.indicatorPopular, "popular"),
            TabInfo(binding.tabHelpful, binding.indicatorHelpful, "helpful")
        )

        fun updateTabStyles(selectedSort: String) {
            tabs.forEach { (tab, indicator, sort) ->
                if (sort == selectedSort) {
                    tab.setTextColor(resources.getColor(R.color.md_theme_primary, null))
                    tab.setTypeface(null, android.graphics.Typeface.BOLD)
                    indicator.visibility = View.VISIBLE
                } else {
                    tab.setTextColor(resources.getColor(R.color.app_text_hint, null))
                    tab.setTypeface(null, android.graphics.Typeface.NORMAL)
                    indicator.visibility = View.INVISIBLE
                }
            }
        }

        tabs.forEach { (tab, _, sort) ->
            tab.setOnClickListener {
                viewModel.setSort(sort)
                updateTabStyles(sort)
            }
        }

        // 초기 상태
        updateTabStyles("latest")
    }

    private fun setupRecyclerView() {
        postAdapter = PostListAdapter(
            onClick = { post -> navigateToDetail(post) },
            defaultCategoryName = categoryName
        )

        binding.rvPosts.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = postAdapter
        }
    }

    private fun navigateToDetail(post: CommunityPost) {
        val bundle = Bundle().apply {
            putInt("postId", post.id)
            putInt("categoryId", categoryId)
        }
        findNavController().navigate(R.id.action_postList_to_postDetail, bundle)
    }

    private fun setupPagination() {
        binding.btnPrev.setOnClickListener { viewModel.prevPage() }
        binding.btnNext.setOnClickListener { viewModel.nextPage() }
    }

    private fun buildNoticeHeader(notices: List<CommunityPost>) {
        binding.layoutNotices.removeAllViews()

        if (notices.isEmpty()) {
            binding.layoutNotices.visibility = View.GONE
            binding.dividerNotices.visibility = View.GONE
            return
        }

        binding.layoutNotices.visibility = View.VISIBLE
        binding.dividerNotices.visibility = View.VISIBLE

        val inflater = LayoutInflater.from(requireContext())
        notices.forEach { notice ->
            val itemView = inflater.inflate(R.layout.item_post_notice, binding.layoutNotices, false)
            itemView.findViewById<TextView>(R.id.tv_notice_title).text = notice.title
            itemView.setOnClickListener { navigateToDetail(notice) }
            binding.layoutNotices.addView(itemView)
        }
    }

    private fun buildListItems() {
        val posts = viewModel.posts.value ?: emptyList()

        val items = mutableListOf<PostListItem>()
        posts.forEach { items.add(PostListItem.PostItem(it)) }

        postAdapter.submitList(items) {
            _binding?.rvPosts?.scrollToPosition(0)
        }

        val notices = viewModel.noticePosts.value ?: emptyList()
        val isEmpty = notices.isEmpty() && posts.isEmpty()
        binding.tvEmpty.visibility = if (isEmpty) View.VISIBLE else View.GONE
    }

    private fun observeData() {
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        }

        viewModel.error.observe(viewLifecycleOwner) { error ->
            if (error != null) {
                binding.tvEmpty.text = error
                binding.tvEmpty.visibility = View.VISIBLE
            }
        }

        viewModel.posts.observe(viewLifecycleOwner) { buildListItems() }
        viewModel.noticePosts.observe(viewLifecycleOwner) { notices ->
            buildNoticeHeader(notices)
            buildListItems()
        }

        viewModel.currentPage.observe(viewLifecycleOwner) { page ->
            val total = viewModel.totalPages.value ?: 1
            binding.tvPageInfo.text = "$page / $total"
            binding.layoutPagination.visibility = if (total > 1) View.VISIBLE else View.GONE
            binding.btnPrev.alpha = if (page > 1) 1f else 0.3f
            binding.btnNext.alpha = if (page < total) 1f else 0.3f
        }

        viewModel.totalPages.observe(viewLifecycleOwner) { total ->
            val page = viewModel.currentPage.value ?: 1
            binding.tvPageInfo.text = "$page / $total"
            binding.layoutPagination.visibility = if (total > 1) View.VISIBLE else View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
