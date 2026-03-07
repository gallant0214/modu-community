package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.moduji.app.R
import com.moduji.app.data.model.CommunityComment
import com.moduji.app.databinding.FragmentPostDetailBinding
import com.moduji.app.ui.community.adapter.CommentAdapter
import com.moduji.app.util.AuthManager
import com.moduji.app.util.BookmarkManager
import com.moduji.app.util.NicknameManager
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class PostDetailFragment : Fragment() {

    private var _binding: FragmentPostDetailBinding? = null
    private val binding get() = _binding!!

    private val viewModel: PostDetailViewModel by viewModels()
    private lateinit var commentAdapter: CommentAdapter

    private var replyToCommentId: Int? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPostDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        viewModel.postId = arguments?.getInt("postId") ?: 0
        viewModel.categoryId = arguments?.getInt("categoryId") ?: 0

        setupHeader()
        setupComments()
        setupCommentSort()
        setupCommentInput()
        observeData()

        viewModel.loadPost()
        viewModel.loadComments()
    }

    private fun setupHeader() {
        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }
    }

    private fun showPostMenu() {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_post_menu, null)
        dialog.setContentView(sheetView)

        sheetView.findViewById<View>(R.id.btn_edit).setOnClickListener {
            dialog.dismiss()
            showPasswordDialogForEdit()
        }
        sheetView.findViewById<View>(R.id.btn_delete).setOnClickListener {
            dialog.dismiss()
            showPasswordDialogForDelete()
        }

        dialog.show()
    }

    private fun showPasswordDialogForEdit() {
        if (AuthManager.isLoggedIn) {
            val pw = AuthManager.loginPassword ?: ""
            viewModel.verifyPassword(pw) { ok ->
                if (ok) {
                    val bundle = Bundle().apply {
                        putInt("postId", viewModel.postId)
                        putInt("categoryId", viewModel.categoryId)
                    }
                    findNavController().navigate(R.id.action_postDetail_to_postEdit, bundle)
                } else {
                    Toast.makeText(requireContext(), "본인이 작성한 글만 수정할 수 있습니다", Toast.LENGTH_SHORT).show()
                }
            }
            return
        }

        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_password, null)
        dialog.setContentView(sheetView)

        val tilPassword = sheetView.findViewById<TextInputLayout>(R.id.til_password)
        val etPassword = sheetView.findViewById<TextInputEditText>(R.id.et_password)

        sheetView.findViewById<View>(R.id.btn_confirm).setOnClickListener {
            val pw = etPassword.text?.toString() ?: ""
            if (pw.isEmpty()) {
                tilPassword.error = "비밀번호를 입력하세요"
                return@setOnClickListener
            }
            viewModel.verifyPassword(pw) { ok ->
                if (ok) {
                    dialog.dismiss()
                    val bundle = Bundle().apply {
                        putInt("postId", viewModel.postId)
                        putInt("categoryId", viewModel.categoryId)
                    }
                    findNavController().navigate(R.id.action_postDetail_to_postEdit, bundle)
                } else {
                    tilPassword.error = "비밀번호가 틀렸습니다"
                }
            }
        }

        dialog.show()
    }

    private fun showPasswordDialogForDelete() {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_delete_confirm, null)
        dialog.setContentView(sheetView)

        val tilPassword = sheetView.findViewById<TextInputLayout>(R.id.til_password)
        val etPassword = sheetView.findViewById<TextInputEditText>(R.id.et_password)

        if (!AuthManager.isLoggedIn) {
            tilPassword.visibility = View.VISIBLE
        }

        sheetView.findViewById<View>(R.id.btn_cancel).setOnClickListener {
            dialog.dismiss()
        }

        sheetView.findViewById<View>(R.id.btn_delete).setOnClickListener {
            val pw = if (AuthManager.isLoggedIn) {
                AuthManager.loginPassword ?: ""
            } else {
                val input = etPassword.text?.toString() ?: ""
                if (input.isEmpty()) {
                    tilPassword.error = "비밀번호를 입력하세요"
                    return@setOnClickListener
                }
                input
            }
            dialog.dismiss()
            viewModel.deletePost(pw)
        }

        dialog.show()
    }

    private fun showReportDialog(targetType: String, targetId: Int) {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_post_report, null)
        dialog.setContentView(sheetView)

        val rgReason = sheetView.findViewById<RadioGroup>(R.id.rg_report_reason)
        val tilOther = sheetView.findViewById<TextInputLayout>(R.id.til_other_reason)
        val etOther = sheetView.findViewById<TextInputEditText>(R.id.et_other_reason)

        rgReason.setOnCheckedChangeListener { _, checkedId ->
            tilOther.visibility = if (checkedId == R.id.rb_other) View.VISIBLE else View.GONE
        }

        sheetView.findViewById<View>(R.id.btn_submit_report).setOnClickListener {
            val reason = when (rgReason.checkedRadioButtonId) {
                R.id.rb_spam -> "스팸/광고"
                R.id.rb_abuse -> "욕설/비방"
                R.id.rb_obscene -> "음란물"
                R.id.rb_privacy -> "개인정보 노출"
                R.id.rb_other -> {
                    val text = etOther.text?.toString()?.trim() ?: ""
                    if (text.isEmpty()) {
                        tilOther.error = "신고 사유를 입력하세요"
                        return@setOnClickListener
                    }
                    text
                }
                else -> {
                    Toast.makeText(requireContext(), "신고 사유를 선택하세요", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
            }

            val customReason = if (rgReason.checkedRadioButtonId == R.id.rb_other) reason else null
            val reasonLabel = if (rgReason.checkedRadioButtonId == R.id.rb_other) "기타" else reason
            viewModel.report(targetType, targetId, reasonLabel, customReason)
            dialog.dismiss()
        }

        dialog.show()
    }

    private fun setupComments() {
        commentAdapter = CommentAdapter(
            onLike = { viewModel.likeComment(it.id) },
            onReply = { comment ->
                replyToCommentId = comment.id
                binding.etComment.hint = "${comment.author}님에게 답글"
                binding.etComment.requestFocus()
            },
            onMore = { comment ->
                showCommentMenu(comment)
            },
            onReport = { comment ->
                showReportDialog("comment", comment.id)
            }
        )

        binding.rvComments.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = commentAdapter
        }
    }

    private fun showCommentMenu(comment: CommunityComment) {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_delete_confirm, null)
        dialog.setContentView(sheetView)

        sheetView.findViewById<android.widget.TextView>(R.id.tv_title).text = "댓글 삭제"
        sheetView.findViewById<android.widget.TextView>(R.id.tv_message).text = "정말 삭제하시겠습니까?"

        val tilPassword = sheetView.findViewById<TextInputLayout>(R.id.til_password)
        val etPassword = sheetView.findViewById<TextInputEditText>(R.id.et_password)

        if (!AuthManager.isLoggedIn) {
            tilPassword.visibility = View.VISIBLE
        }

        sheetView.findViewById<View>(R.id.btn_cancel).setOnClickListener {
            dialog.dismiss()
        }

        sheetView.findViewById<View>(R.id.btn_delete).setOnClickListener {
            val pw = if (AuthManager.isLoggedIn) {
                AuthManager.loginPassword ?: ""
            } else {
                val input = etPassword.text?.toString() ?: ""
                if (input.isEmpty()) {
                    tilPassword.error = "비밀번호를 입력하세요"
                    return@setOnClickListener
                }
                input
            }
            dialog.dismiss()
            viewModel.deleteComment(comment.id, pw)
        }

        dialog.show()
    }

    private fun setupCommentSort() {
        binding.btnSortLatest.setOnClickListener { viewModel.setCommentSort(CommentSort.LATEST) }
        binding.btnSortPopular.setOnClickListener { viewModel.setCommentSort(CommentSort.POPULAR) }
        binding.btnSortLikes.setOnClickListener { viewModel.setCommentSort(CommentSort.LIKES) }

        viewModel.commentSort.observe(viewLifecycleOwner) { sort ->
            val active = requireContext().getColor(R.color.app_text_primary)
            val inactive = requireContext().getColor(R.color.app_text_hint)

            binding.btnSortLatest.setTextColor(if (sort == CommentSort.LATEST) active else inactive)
            binding.btnSortLatest.text = if (sort == CommentSort.LATEST) "✓최신순" else "최신순"
            binding.btnSortLatest.setTypeface(null, if (sort == CommentSort.LATEST) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)

            binding.btnSortPopular.setTextColor(if (sort == CommentSort.POPULAR) active else inactive)
            binding.btnSortPopular.text = if (sort == CommentSort.POPULAR) "✓인기순" else "인기순"
            binding.btnSortPopular.setTypeface(null, if (sort == CommentSort.POPULAR) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)

            binding.btnSortLikes.setTextColor(if (sort == CommentSort.LIKES) active else inactive)
            binding.btnSortLikes.text = if (sort == CommentSort.LIKES) "✓공감순" else "공감순"
            binding.btnSortLikes.setTypeface(null, if (sort == CommentSort.LIKES) android.graphics.Typeface.BOLD else android.graphics.Typeface.NORMAL)
        }
    }

    private fun setupCommentInput() {
        binding.btnSubmitComment.setOnClickListener {
            val content = binding.etComment.text?.toString()?.trim()
            if (content.isNullOrEmpty()) {
                Toast.makeText(requireContext(), "댓글을 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            showCommentAuthorDialog(content, replyToCommentId)
        }
    }

    private fun showCommentAuthorDialog(content: String, parentId: Int?) {
        // 로그인 시 비밀번호 없이 바로 등록
        if (AuthManager.isLoggedIn) {
            val nickname = NicknameManager.getNickname(requireContext())
            if (!nickname.isNullOrBlank()) {
                viewModel.createComment(nickname, AuthManager.loginPassword ?: "", content, parentId)
                binding.etComment.text?.clear()
                binding.etComment.hint = "댓글을 입력하세요"
                replyToCommentId = null
                return
            }
        }

        // 비로그인: 닉네임 + 비밀번호 입력
        val layout = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 16)
        }
        val nameInput = EditText(requireContext()).apply {
            hint = "닉네임"
            inputType = android.text.InputType.TYPE_CLASS_TEXT
        }
        val pwInput = EditText(requireContext()).apply {
            hint = "비밀번호"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        layout.addView(nameInput)
        layout.addView(pwInput)

        MaterialAlertDialogBuilder(requireContext())
            .setTitle("댓글 작성")
            .setView(layout)
            .setPositiveButton("등록") { _, _ ->
                val author = nameInput.text.toString().trim()
                val password = pwInput.text.toString().trim()
                if (author.isEmpty() || password.isEmpty()) {
                    Toast.makeText(requireContext(), "닉네임과 비밀번호를 입력하세요", Toast.LENGTH_SHORT).show()
                    return@setPositiveButton
                }
                viewModel.createComment(author, password, content, parentId)
                binding.etComment.text?.clear()
                binding.etComment.hint = "댓글을 입력하세요"
                replyToCommentId = null
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun observeData() {
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        }

        viewModel.post.observe(viewLifecycleOwner) { post ->
            if (post == null) return@observe
            binding.layoutPost.visibility = View.VISIBLE

            // 헤더: "{카테고리명}의 게시글"
            val categoryName = post.categoryName ?: ""
            binding.tvHeaderTitle.text = if (categoryName.isNotBlank()) {
                "${categoryName}의 게시글"
            } else {
                "게시글"
            }

            // 태그 칩
            val tags = post.tags.trim()
            val region = post.region.trim()
            if (tags.isNotBlank()) {
                binding.tvTagChip.visibility = View.VISIBLE
                binding.tvTagChip.text = tags.split(",").first().trim()
            }
            if (region.isNotBlank() && region != "전국") {
                binding.tvRegionChip.visibility = View.VISIBLE
                binding.tvRegionChip.text = region
            }

            // 제목
            binding.tvTitle.text = post.title

            // 메타: 작성자 · 지역 · 날짜
            val metaParts = mutableListOf(post.author)
            if (region.isNotBlank() && region != "전국") {
                metaParts.add(region)
            }
            metaParts.add(formatDate(post.createdAt))
            binding.tvMeta.text = metaParts.joinToString("  ·  ")

            // 조회수
            binding.tvViews.text = "조회 ${post.views}"

            // 본문
            binding.tvContent.text = post.content

            // 좋아요
            updateLikeButton(post.likes, viewModel.isLiked.value == true)
            binding.btnLike.setOnClickListener { viewModel.likePost() }

            // 신고
            binding.btnReport.setOnClickListener {
                showReportDialog("post", viewModel.postId)
            }

            // 댓글달기 → 입력창 포커스
            binding.btnWriteComment.setOnClickListener {
                binding.etComment.requestFocus()
                val imm = requireContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                        as android.view.inputmethod.InputMethodManager
                imm.showSoftInput(binding.etComment, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
            }

            // 더보기 (수정/삭제)
            binding.btnMore.setOnClickListener { showPostMenu() }

            // 북마크
            updateBookmarkIcon()
            binding.btnBookmark.setOnClickListener {
                val isNow = BookmarkManager.toggleCommunity(requireContext(), viewModel.postId)
                updateBookmarkIcon()
                val msg = if (isNow) "북마크에 추가되었습니다" else "북마크가 해제되었습니다"
                Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
            }
        }

        viewModel.comments.observe(viewLifecycleOwner) { comments ->
            binding.layoutComments.visibility = View.VISIBLE
            binding.tvCommentsTitle.text = "전체 댓글 ${comments.size}개"
            commentAdapter.submitList(comments)
        }

        viewModel.actionResult.observe(viewLifecycleOwner) { msg ->
            if (msg != null) {
                if (msg == "댓글이 등록되었습니다") {
                    com.moduji.app.util.MyActivityTracker.incrementCommentCount(requireContext())
                }
                Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                viewModel.clearActionResult()
            }
        }

        viewModel.deleteSuccess.observe(viewLifecycleOwner) { success ->
            if (success) {
                Toast.makeText(requireContext(), "삭제되었습니다", Toast.LENGTH_SHORT).show()
                findNavController().popBackStack()
            }
        }

        viewModel.isLiked.observe(viewLifecycleOwner) { liked ->
            val post = viewModel.post.value ?: return@observe
            updateLikeButton(post.likes, liked)
        }
    }

    private fun updateLikeButton(likes: Int, isLiked: Boolean) {
        binding.btnLike.text = "좋아요 $likes"
        if (isLiked) {
            binding.btnLike.setCompoundDrawablesRelativeWithIntrinsicBounds(
                R.drawable.ic_heart_filled, 0, 0, 0
            )
            binding.btnLike.setTextColor(requireContext().getColor(R.color.app_like_red))
            binding.btnLike.setTypeface(null, android.graphics.Typeface.BOLD)
        } else {
            binding.btnLike.setCompoundDrawablesRelativeWithIntrinsicBounds(
                R.drawable.ic_heart_outline, 0, 0, 0
            )
            binding.btnLike.setTextColor(requireContext().getColor(R.color.app_text_secondary))
            binding.btnLike.setTypeface(null, android.graphics.Typeface.NORMAL)
        }
    }

    private fun updateBookmarkIcon() {
        val iconRes = if (BookmarkManager.isCommunityBookmarked(viewModel.postId))
            R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark
        binding.btnBookmark.setImageResource(iconRes)
    }

    private fun formatDate(dateStr: String): String {
        return try {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            parser.timeZone = TimeZone.getTimeZone("UTC")
            val date = parser.parse(dateStr) ?: return dateStr
            val formatter = SimpleDateFormat("yyyy. MM. dd. HH:mm", Locale.getDefault())
            formatter.format(date)
        } catch (e: Exception) {
            dateStr.take(10)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
