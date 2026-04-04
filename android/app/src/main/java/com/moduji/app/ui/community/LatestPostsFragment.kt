package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.moduji.app.R
import com.moduji.app.data.model.CommunityPost
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.FragmentPopularPostsBinding
import com.moduji.app.ui.community.adapter.PostListAdapter
import com.moduji.app.ui.community.adapter.PostListItem
import kotlinx.coroutines.launch

class LatestPostsFragment : Fragment() {

    private var _binding: FragmentPopularPostsBinding? = null
    private val binding get() = _binding!!

    private lateinit var postAdapter: PostListAdapter
    private var currentPage = 1
    private var totalPages = 1

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPopularPostsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.tvTitle.text = "최신 게시글"
        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        setupRecyclerView()
        setupPagination()
        loadPosts(1)
    }

    private fun setupRecyclerView() {
        postAdapter = PostListAdapter(
            onClick = { post -> navigateToDetail(post) },
            defaultCategoryName = ""
        )
        binding.rvPosts.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = postAdapter
        }
    }

    private fun navigateToDetail(post: CommunityPost) {
        val bundle = Bundle().apply {
            putInt("postId", post.id)
            putInt("categoryId", post.categoryId)
        }
        findNavController().navigate(R.id.action_latestPosts_to_postDetail, bundle)
    }

    private fun setupPagination() {
        binding.btnPrev.setOnClickListener {
            if (currentPage > 1) loadPosts(currentPage - 1)
        }
        binding.btnNext.setOnClickListener {
            if (currentPage < totalPages) loadPosts(currentPage + 1)
        }
    }

    private fun loadPosts(page: Int) {
        binding.progressBar.visibility = View.VISIBLE
        binding.tvEmpty.visibility = View.GONE

        lifecycleScope.launch {
            CommunityRepository.getLatestPostsPaginated(page).fold(
                onSuccess = { response ->
                    currentPage = response.page
                    totalPages = response.totalPages

                    val items = response.posts.map { PostListItem.PostItem(it) }
                    postAdapter.submitList(items)

                    binding.tvEmpty.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
                    binding.tvEmpty.text = "게시글이 없습니다"

                    binding.tvPageInfo.text = "$currentPage / $totalPages"
                    binding.layoutPagination.visibility = if (totalPages > 1) View.VISIBLE else View.GONE
                    binding.btnPrev.alpha = if (currentPage > 1) 1f else 0.3f
                    binding.btnNext.alpha = if (currentPage < totalPages) 1f else 0.3f

                    binding.rvPosts.scrollToPosition(0)
                },
                onFailure = { e ->
                    binding.tvEmpty.text = "불러오기 실패: ${e.message}"
                    binding.tvEmpty.visibility = View.VISIBLE
                }
            )
            binding.progressBar.visibility = View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
