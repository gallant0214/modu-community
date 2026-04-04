package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.text.InputType
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
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
        val ctx = requireContext()
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_edit)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "게시글 관리"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "원하는 작업을 선택하세요"

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)
        container.visibility = android.view.View.VISIBLE
        container.orientation = android.widget.LinearLayout.VERTICAL

        val dp = resources.displayMetrics.density

        val btnEdit = android.widget.TextView(ctx).apply {
            text = "수정하기"
            textSize = 15f
            gravity = android.view.Gravity.CENTER
            setTextColor(resources.getColor(R.color.app_text_primary, null))
            setPadding(0, (14 * dp).toInt(), 0, (14 * dp).toInt())
            setBackgroundResource(R.drawable.bg_search_bar)
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (8 * dp).toInt() }
        }
        container.addView(btnEdit)

        val btnDelete = android.widget.TextView(ctx).apply {
            text = "삭제하기"
            textSize = 15f
            gravity = android.view.Gravity.CENTER
            setTextColor(resources.getColor(R.color.md_theme_error, null))
            setPadding(0, (14 * dp).toInt(), 0, (14 * dp).toInt())
            setBackgroundResource(R.drawable.bg_search_bar)
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        container.addView(btnDelete)

        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).visibility = android.view.View.GONE

        val dialog = android.app.AlertDialog.Builder(ctx, R.style.Theme_App_Dialog_Transparent)
            .setView(dialogView).create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.view.View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        btnEdit.setOnClickListener { dialog.dismiss(); showPasswordDialogForEdit() }
        btnDelete.setOnClickListener { dialog.dismiss(); showPasswordDialogForDelete() }

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

        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_password, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_lock)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "비밀번호 확인"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "게시글 작성 시 입력한 비밀번호를 입력하세요"

        val etPassword = dialogView.findViewById<EditText>(R.id.et_password)
        val tvError = dialogView.findViewById<android.widget.TextView>(R.id.tv_error)

        val dialog = android.app.AlertDialog.Builder(requireContext(), R.style.Theme_App_Dialog_Transparent)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.show()

        dialogView.findViewById<android.widget.TextView>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).setOnClickListener {
            val pw = etPassword.text.toString()
            if (pw.isEmpty()) {
                tvError.text = "비밀번호를 입력하세요"
                tvError.visibility = android.view.View.VISIBLE
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
                    tvError.text = "비밀번호가 틀렸습니다"
                    tvError.visibility = android.view.View.VISIBLE
                }
            }
        }
    }

    private fun showPasswordDialogForDelete() {
        if (AuthManager.isLoggedIn) {
            val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
            dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_delete)
            dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "게시글 삭제"
            dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "정말 삭제하시겠습니까?"
            val btnConfirm = dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm)
            btnConfirm.text = "삭제"
            btnConfirm.setTextColor(resources.getColor(R.color.md_theme_onPrimary, null))
            btnConfirm.visibility = android.view.View.VISIBLE

            val dialog = android.app.AlertDialog.Builder(requireContext(), R.style.Theme_App_Dialog_Transparent)
                .setView(dialogView).create()
            dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
            dialog.show()

            dialogView.findViewById<android.widget.TextView>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
            btnConfirm.setOnClickListener {
                dialog.dismiss()
                viewModel.deletePost(AuthManager.loginPassword ?: "")
            }
            return
        }

        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_password, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_delete)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "게시글 삭제"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "비밀번호를 입력하면 게시글이 삭제됩니다"
        val btnConfirm = dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm)
        btnConfirm.text = "삭제"

        val etPassword = dialogView.findViewById<EditText>(R.id.et_password)
        val tvError = dialogView.findViewById<android.widget.TextView>(R.id.tv_error)

        val dialog = android.app.AlertDialog.Builder(requireContext(), R.style.Theme_App_Dialog_Transparent)
            .setView(dialogView).create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.show()

        dialogView.findViewById<android.widget.TextView>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        btnConfirm.setOnClickListener {
            val pw = etPassword.text.toString()
            if (pw.isEmpty()) {
                tvError.text = "비밀번호를 입력하세요"
                tvError.visibility = android.view.View.VISIBLE
                return@setOnClickListener
            }
            dialog.dismiss()
            viewModel.deletePost(pw)
        }
    }

    private fun showReportDialog(targetType: String, targetId: Int) {
        val ctx = requireContext()
        val reasons = listOf(
            "스팸/광고" to R.drawable.ic_report,
            "욕설/비방" to R.drawable.ic_report,
            "음란물" to R.drawable.ic_report,
            "개인정보 노출" to R.drawable.ic_report,
            "기타" to R.drawable.ic_edit
        )

        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon)
            .setImageResource(R.drawable.ic_report)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "신고하기"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "신고 사유를 선택해주세요"

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)
        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).visibility = android.view.View.GONE

        val dialog = androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val dp = resources.displayMetrics.density
        for ((index, pair) in reasons.withIndex()) {
            val (label, iconRes) = pair
            val row = android.widget.LinearLayout(ctx).apply {
                orientation = android.widget.LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding((12 * dp).toInt(), 0, (12 * dp).toInt(), 0)
                layoutParams = android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT, (44 * dp).toInt()
                )
                background = ctx.getDrawable(androidx.appcompat.R.drawable.abc_item_background_holo_light)
            }
            val icon = android.widget.ImageView(ctx).apply {
                setImageResource(iconRes)
                layoutParams = android.widget.LinearLayout.LayoutParams((20 * dp).toInt(), (20 * dp).toInt())
                imageTintList = android.content.res.ColorStateList.valueOf(
                    resources.getColor(R.color.app_badge_new_text, null)
                )
            }
            val text = android.widget.TextView(ctx).apply {
                this.text = label
                textSize = 14f
                setTextColor(resources.getColor(R.color.app_text_primary, null))
                val lp = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                lp.marginStart = (12 * dp).toInt()
                layoutParams = lp
            }
            row.addView(icon)
            row.addView(text)
            row.setOnClickListener {
                dialog.dismiss()
                if (index == reasons.size - 1) {
                    showCustomReportInput(targetType, targetId)
                } else {
                    viewModel.report(targetType, targetId, label, null)
                }
            }
            container.addView(row)

            if (index < reasons.size - 1) {
                val divider = android.view.View(ctx).apply {
                    layoutParams = android.widget.LinearLayout.LayoutParams(
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT, (0.5f * dp).toInt()
                    )
                    setBackgroundColor(resources.getColor(R.color.app_divider, null))
                }
                container.addView(divider)
            }
        }

        dialogView.findViewById<android.view.View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    private fun showCustomReportInput(targetType: String, targetId: Int) {
        val ctx = requireContext()
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon)
            .setImageResource(R.drawable.ic_edit)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "기타 신고 사유"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "신고 사유를 직접 입력해주세요"

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)
        val dp = resources.displayMetrics.density

        val input = EditText(ctx).apply {
            hint = "신고 사유를 입력하세요"
            minLines = 2
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            setBackgroundResource(R.drawable.bg_search_bar)
            setPadding((16 * dp).toInt(), (12 * dp).toInt(), (16 * dp).toInt(), (12 * dp).toInt())
            textSize = 14f
            setTextColor(resources.getColor(R.color.app_text_secondary, null))
            setHintTextColor(resources.getColor(R.color.app_text_hint, null))
        }
        container.addView(input)

        val btnConfirm = dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm)
        btnConfirm.visibility = android.view.View.VISIBLE
        btnConfirm.text = "신고"

        val dialog = androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.view.View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        btnConfirm.setOnClickListener {
            val reason = input.text.toString().trim()
            if (reason.isEmpty()) {
                Toast.makeText(ctx, "신고 사유를 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            dialog.dismiss()
            viewModel.report(targetType, targetId, "기타", reason)
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
        val ctx = requireContext()

        // iOS 스타일 메뉴: 수정 / 삭제 선택
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon)
            .setImageResource(R.drawable.ic_comment)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "댓글 관리"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "원하는 작업을 선택하세요"

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)
        container.visibility = android.view.View.VISIBLE
        container.orientation = android.widget.LinearLayout.VERTICAL

        val dp = resources.displayMetrics.density

        // 수정 버튼
        val btnEdit = android.widget.TextView(ctx).apply {
            text = "수정하기"
            textSize = 15f
            gravity = android.view.Gravity.CENTER
            setTextColor(resources.getColor(R.color.app_text_primary, null))
            setPadding(0, (14 * dp).toInt(), 0, (14 * dp).toInt())
            setBackgroundResource(R.drawable.bg_search_bar)
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (8 * dp).toInt() }
        }
        container.addView(btnEdit)

        // 삭제 버튼
        val btnDelete = android.widget.TextView(ctx).apply {
            text = "삭제하기"
            textSize = 15f
            gravity = android.view.Gravity.CENTER
            setTextColor(resources.getColor(R.color.md_theme_error, null))
            setPadding(0, (14 * dp).toInt(), 0, (14 * dp).toInt())
            setBackgroundResource(R.drawable.bg_search_bar)
            layoutParams = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
        }
        container.addView(btnDelete)

        // 확인 버튼 숨기기 (메뉴 선택 방식)
        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).visibility = android.view.View.GONE

        val dialog = android.app.AlertDialog.Builder(ctx, R.style.Theme_App_Dialog_Transparent)
            .setView(dialogView).create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.view.View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }

        btnEdit.setOnClickListener {
            dialog.dismiss()
            showCommentEditDialog(comment)
        }

        btnDelete.setOnClickListener {
            dialog.dismiss()
            showCommentDeleteDialog(comment)
        }

        dialog.show()
    }

    private fun showCommentEditDialog(comment: CommunityComment) {
        val ctx = requireContext()

        if (AuthManager.isLoggedIn) {
            // 로그인 상태: 바로 수정 다이얼로그
            showCommentEditInput(comment, null)
            return
        }

        // 비로그인: 비밀번호 확인 후 수정
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_password, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_lock)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "댓글 수정"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "댓글 작성 시 입력한 비밀번호를 입력하세요"
        val etPassword = dialogView.findViewById<EditText>(R.id.et_password)
        val tvError = dialogView.findViewById<android.widget.TextView>(R.id.tv_error)

        val dialog = android.app.AlertDialog.Builder(ctx, R.style.Theme_App_Dialog_Transparent)
            .setView(dialogView).create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.show()

        dialogView.findViewById<android.widget.TextView>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).setOnClickListener {
            val pw = etPassword.text.toString()
            if (pw.isEmpty()) {
                tvError.text = "비밀번호를 입력하세요"
                tvError.visibility = android.view.View.VISIBLE
                return@setOnClickListener
            }
            dialog.dismiss()
            showCommentEditInput(comment, pw)
        }
    }

    private fun showCommentEditInput(comment: CommunityComment, password: String?) {
        val ctx = requireContext()
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_password, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_edit)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "댓글 수정"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "수정할 내용을 입력하세요"
        val etContent = dialogView.findViewById<EditText>(R.id.et_password)
        etContent.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        etContent.hint = "댓글 내용"
        etContent.setText(comment.content)
        etContent.setSelection(comment.content.length)
        etContent.minLines = 3
        val tvError = dialogView.findViewById<android.widget.TextView>(R.id.tv_error)
        val btnConfirm = dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm)
        btnConfirm.text = "수정"

        val dialog = android.app.AlertDialog.Builder(ctx, R.style.Theme_App_Dialog_Transparent)
            .setView(dialogView).create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.show()

        dialogView.findViewById<android.widget.TextView>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        btnConfirm.setOnClickListener {
            val newContent = etContent.text.toString().trim()
            if (newContent.isEmpty()) {
                tvError.text = "내용을 입력하세요"
                tvError.visibility = android.view.View.VISIBLE
                return@setOnClickListener
            }
            dialog.dismiss()
            viewModel.updateComment(comment.id, newContent, password ?: AuthManager.loginPassword ?: "")
        }
    }

    private fun showCommentDeleteDialog(comment: CommunityComment) {
        val ctx = requireContext()

        if (AuthManager.isLoggedIn) {
            val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
            dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_delete)
            dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "댓글 삭제"
            dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "정말 삭제하시겠습니까?"
            dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items).visibility = android.view.View.GONE
            val btnConfirm = dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm)
            btnConfirm.visibility = android.view.View.VISIBLE
            btnConfirm.text = "삭제"
            btnConfirm.setTextColor(resources.getColor(R.color.md_theme_onPrimary, null))

            val dialog = android.app.AlertDialog.Builder(ctx, R.style.Theme_App_Dialog_Transparent)
                .setView(dialogView).create()
            dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
            dialog.show()

            dialogView.findViewById<android.view.View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
            btnConfirm.setOnClickListener {
                dialog.dismiss()
                viewModel.deleteComment(comment.id, AuthManager.loginPassword ?: "")
            }
            return
        }

        // 비로그인: 비밀번호 입력
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_password, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_delete)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "댓글 삭제"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "비밀번호를 입력하면 댓글이 삭제됩니다"
        val btnConfirm = dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm)
        btnConfirm.text = "삭제"
        val etPassword = dialogView.findViewById<EditText>(R.id.et_password)
        val tvError = dialogView.findViewById<android.widget.TextView>(R.id.tv_error)

        val dialog = android.app.AlertDialog.Builder(ctx, R.style.Theme_App_Dialog_Transparent)
            .setView(dialogView).create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)
        dialog.show()

        dialogView.findViewById<android.widget.TextView>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        btnConfirm.setOnClickListener {
            val pw = etPassword.text.toString()
            if (pw.isEmpty()) {
                tvError.text = "비밀번호를 입력하세요"
                tvError.visibility = android.view.View.VISIBLE
                return@setOnClickListener
            }
            dialog.dismiss()
            viewModel.deleteComment(comment.id, pw)
        }
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
            submitComment()
        }

        // 키보드에서 전송 버튼 누를 때도 댓글 등록
        binding.etComment.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) {
                submitComment()
                true
            } else false
        }
    }

    private fun submitComment() {
        val content = binding.etComment.text?.toString()?.trim()
        if (content.isNullOrEmpty()) {
            Toast.makeText(requireContext(), "댓글을 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }

        // 키보드 숨기기
        val imm = requireContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE)
                as android.view.inputmethod.InputMethodManager
        imm.hideSoftInputFromWindow(binding.etComment.windowToken, 0)

        showCommentAuthorDialog(content, replyToCommentId)
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
