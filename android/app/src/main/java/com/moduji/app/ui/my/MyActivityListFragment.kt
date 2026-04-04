package com.moduji.app.ui.my

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.moduji.app.R
import com.moduji.app.data.model.CommunityPost
import com.moduji.app.data.model.JobPost
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.data.repository.JobsRepository
import com.moduji.app.databinding.FragmentMyActivityListBinding
import com.moduji.app.ui.community.adapter.PostListAdapter
import com.moduji.app.ui.community.adapter.PostListItem
import com.moduji.app.ui.jobs.adapter.JobPostAdapter
import com.moduji.app.util.BookmarkManager
import com.moduji.app.util.NicknameManager
import kotlinx.coroutines.launch

/**
 * 내 활동 목록 페이지
 *
 * arguments:
 *   type  – "my_posts" | "my_comments" | "bookmarks" | "my_jobs" | "job_bookmarks"
 *   title – 헤더 제목
 */
class MyActivityListFragment : Fragment() {

    private var _binding: FragmentMyActivityListBinding? = null
    private val binding get() = _binding!!

    private var listType = ""
    private var headerTitle = ""

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMyActivityListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        listType = arguments?.getString("type") ?: ""
        headerTitle = arguments?.getString("title") ?: ""

        binding.tvTitle.text = headerTitle
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        loadData()
    }

    private fun loadData() {
        binding.progressBar.visibility = View.VISIBLE
        binding.tvEmpty.visibility = View.GONE

        viewLifecycleOwner.lifecycleScope.launch {
            when (listType) {
                "my_posts" -> loadMyPosts()
                "my_comments" -> loadMyComments()
                "bookmarks" -> loadBookmarks()
                "my_jobs" -> loadMyJobs()
                "job_bookmarks" -> loadJobBookmarks()
                else -> showEmpty("알 수 없는 유형입니다")
            }
            binding.progressBar.visibility = View.GONE
        }
    }

    // ── 내가 쓴 글 (firebase_uid 기반) ──
    private suspend fun loadMyPosts() {
        val nickname = NicknameManager.getNickname(requireContext()) ?: ""
        val posts = CommunityRepository.getMyPosts(nickname).getOrNull() ?: emptyList()
        if (posts.isEmpty()) {
            showEmpty("작성한 게시글이 없습니다")
        } else {
            setupCommunityList(posts)
        }
    }

    // ── 내가 댓글 단 글 (firebase_uid 기반) ──
    private suspend fun loadMyComments() {
        val nickname = NicknameManager.getNickname(requireContext()) ?: ""
        val posts = CommunityRepository.getMyCommentedPosts(nickname).getOrNull() ?: emptyList()
        if (posts.isEmpty()) {
            showEmpty("댓글을 작성한 게시글이 없습니다")
        } else {
            setupCommunityList(posts)
        }
    }

    // ── 북마크 (커뮤니티) ──
    private suspend fun loadBookmarks() {
        BookmarkManager.init(requireContext())
        val ids = BookmarkManager.getCommunityBookmarkedIds()
        if (ids.isEmpty()) {
            showEmpty("북마크한 게시글이 없습니다")
            return
        }
        val posts = ids.mapNotNull { id ->
            CommunityRepository.getPost(id).getOrNull()
        }
        if (posts.isEmpty()) {
            showEmpty("북마크한 게시글이 없습니다")
        } else {
            setupCommunityList(posts)
        }
    }

    // ── 내가 등록한 구인글 (firebase_uid 기반) ──
    private suspend fun loadMyJobs() {
        val posts = JobsRepository.getMyJobPosts("").getOrNull() ?: emptyList()
        if (posts.isEmpty()) {
            showEmpty("등록한 구인글이 없습니다")
        } else {
            setupMyJobList(posts)
        }
    }

    // ── 구인 북마크 ──
    private suspend fun loadJobBookmarks() {
        BookmarkManager.init(requireContext())
        val ids = BookmarkManager.getBookmarkedIds()
        if (ids.isEmpty()) {
            showEmpty("북마크한 구인글이 없습니다")
            return
        }
        val posts = ids.mapNotNull { id ->
            JobsRepository.getJobPostById(id).getOrNull()
        }
        if (posts.isEmpty()) {
            showEmpty("북마크한 구인글이 없습니다")
        } else {
            setupJobList(posts)
        }
    }

    // ── 커뮤니티 게시글 리스트 설정 ──
    private fun setupCommunityList(posts: List<CommunityPost>) {
        val adapter = PostListAdapter({ post ->
            val bundle = Bundle().apply {
                putInt("postId", post.id)
                putInt("categoryId", post.categoryId)
            }
            findNavController().navigate(R.id.action_activityList_to_postDetail, bundle)
        })
        binding.rvList.layoutManager = LinearLayoutManager(requireContext())
        binding.rvList.adapter = adapter
        adapter.submitList(posts.map { PostListItem.PostItem(it) })
    }

    // ── 구인 게시글 리스트 설정 (일반) ──
    private fun setupJobList(posts: List<JobPost>) {
        val adapter = JobPostAdapter(
            items = posts,
            onItemClick = { post ->
                val bundle = Bundle().apply {
                    putInt("postId", post.id)
                }
                findNavController().navigate(R.id.action_activityList_to_jobDetail, bundle)
            }
        )
        binding.rvList.layoutManager = LinearLayoutManager(requireContext())
        binding.rvList.adapter = adapter
    }

    // ── 내가 등록한 구인글 리스트 (구인완료/재게시 버튼 포함) ──
    private fun setupMyJobList(posts: List<JobPost>) {
        val mutablePosts = posts.toMutableList()
        val adapter = JobPostAdapter(
            items = mutablePosts,
            showActions = true,
            onItemClick = { post ->
                val bundle = Bundle().apply {
                    putInt("postId", post.id)
                }
                findNavController().navigate(R.id.action_activityList_to_jobDetail, bundle)
            },
            onCloseClick = { post, position ->
                closeJobPost(post, mutablePosts, position)
            },
            onRepostClick = { post ->
                repostJob(post)
            }
        )
        binding.rvList.layoutManager = LinearLayoutManager(requireContext())
        binding.rvList.adapter = adapter
    }

    // ── 구인완료 처리 ──
    private fun closeJobPost(post: JobPost, posts: MutableList<JobPost>, position: Int) {
        viewLifecycleOwner.lifecycleScope.launch {
            val result = JobsRepository.closeJobPost(post.id)
            if (result.isSuccess) {
                Toast.makeText(requireContext(), "구인완료 처리되었습니다", Toast.LENGTH_SHORT).show()
                posts[position] = post.copy(isClosed = true)
                (binding.rvList.adapter as? JobPostAdapter)?.updateItems(posts.toList())
            } else {
                Toast.makeText(requireContext(), "처리에 실패했습니다", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // ── 재게시 (구인 글쓰기로 이동) ──
    private fun repostJob(post: JobPost) {
        val bundle = Bundle().apply {
            putString("regionCode", post.regionCode)
            putString("regionName", post.region)
            putInt("repostJobId", post.id)
        }
        findNavController().navigate(R.id.action_activityList_to_jobWrite, bundle)
    }

    private fun showEmpty(message: String) {
        binding.tvEmpty.text = message
        binding.tvEmpty.visibility = View.VISIBLE
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
