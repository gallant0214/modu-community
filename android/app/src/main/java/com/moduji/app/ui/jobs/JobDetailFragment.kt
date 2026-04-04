package com.moduji.app.ui.jobs

import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.moduji.app.R
import com.moduji.app.data.model.CreateReportRequest
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.data.repository.JobsRepository
import com.moduji.app.databinding.FragmentJobDetailBinding
import com.moduji.app.util.BookmarkManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class JobDetailFragment : Fragment() {

    private var _binding: FragmentJobDetailBinding? = null
    private val binding get() = _binding!!

    private var postId: Int = -1
    private var currentBookmarkCount: Int = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        postId = arguments?.getInt("postId", -1) ?: -1
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentJobDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener {
            findNavController().navigateUp()
        }

        loadPost()
    }

    private fun loadPost() {
        viewLifecycleOwner.lifecycleScope.launch {
            // 조회수 증가
            JobsRepository.viewJobPost(postId)

            val result = JobsRepository.getJobPostById(postId)
            val post = result.getOrNull()
            if (post == null) {
                Toast.makeText(requireContext(), "게시글을 불러올 수 없습니다", Toast.LENGTH_SHORT).show()
                findNavController().navigateUp()
                return@launch
            }

            // 북마크 상태 초기화
            currentBookmarkCount = post.bookmarkCount
            updateBookmarkIcon()
            updateBookmarkCount()

            binding.btnBookmark.setOnClickListener {
                val isNowBookmarked = BookmarkManager.toggle(requireContext(), postId)
                // 즉시 UI 업데이트 (optimistic)
                currentBookmarkCount += if (isNowBookmarked) 1 else -1
                currentBookmarkCount = currentBookmarkCount.coerceAtLeast(0)
                updateBookmarkIcon()
                updateBookmarkCount()
                val msg = if (isNowBookmarked) "북마크에 추가되었습니다" else "북마크가 해제되었습니다"
                Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()

                // 서버에 반영 (백그라운드)
                viewLifecycleOwner.lifecycleScope.launch {
                    JobsRepository.bookmarkJobPost(postId).fold(
                        onSuccess = { resp ->
                            currentBookmarkCount = resp.bookmarkCount
                            updateBookmarkCount()
                        },
                        onFailure = { /* 실패 시 무시 — 로컬 상태 유지 */ }
                    )
                }
            }

            // 신고 버튼
            binding.btnReport.setOnClickListener {
                showReportDialog()
            }

            // 더보기 (수정/삭제)
            binding.btnMore.setOnClickListener {
                showJobMenu()
            }

            // 태그
            binding.tvEmploymentType.text = post.employmentType
            binding.tvCategory.text = post.categoryName
            binding.tvRegion.text = post.region

            // 기본 정보
            binding.tvTitle.text = post.title
            binding.tvCenterName.text = post.author
            binding.tvMeta.text = "${post.date} · 조회 ${post.views}"

            // 업체 주소
            binding.layoutAddress.visibility = View.VISIBLE
            binding.tvAddress.text = post.address.ifBlank { "(항목 없음)" }

            // 작성자 정보 + 연락처 (한 행)
            binding.layoutAuthor.visibility = View.VISIBLE
            val authorInfo = buildString {
                if (post.authorRole.isNotBlank()) append(post.authorRole)
                if (post.authorName.isNotBlank()) {
                    if (isNotEmpty()) append(" ")
                    append(post.authorName)
                }
            }
            binding.tvAuthorInfo.text = authorInfo.ifBlank { "(항목 없음)" }
            if (post.contactType.isNotBlank()) {
                binding.tvContactLabel.text = post.contactType
            }
            binding.tvContact.text = post.contact.ifBlank { "(항목 없음)" }

            // 급여
            binding.tvSalary.text = post.salary.ifBlank { "(항목 없음)" }

            // 모집 인원
            binding.tvHeadcount.text = post.headcount.ifBlank { "(항목 없음)" }

            // 모집기간
            val deadlineText = post.deadline.ifBlank { "(항목 없음)" }
            binding.tvDeadline.text = deadlineText
            if (post.deadline.endsWith("까지")) {
                try {
                    val dateStr = post.deadline.removeSuffix("까지")
                    val sdf = SimpleDateFormat("yyyy.MM.dd", Locale.KOREA)
                    val deadlineDate = sdf.parse(dateStr)
                    val today = sdf.parse(sdf.format(Date()))
                    if (deadlineDate != null && today != null && deadlineDate.before(today)) {
                        binding.tvDeadline.setTextColor(Color.parseColor("#E53E3E"))
                        binding.tvDeadline.setTypeface(null, Typeface.BOLD)
                    }
                } catch (_: Exception) {}
            }

            // 상세 내용
            val desc = post.description.ifBlank { post.preview }
            binding.tvDescription.text = desc.ifBlank { "(항목 없음)" }

            // 우대조건
            binding.tvPreferences.text = post.preferences.ifBlank { "(항목 없음)" }

            // 복리후생
            binding.tvBenefits.text = post.benefits.ifBlank { "(항목 없음)" }
        }
    }

    private fun updateBookmarkIcon() {
        val iconRes = if (BookmarkManager.isBookmarked(postId))
            R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark
        binding.btnBookmark.setImageResource(iconRes)
    }

    private fun updateBookmarkCount() {
        binding.tvBookmarkCount.text = if (currentBookmarkCount > 0) "$currentBookmarkCount" else ""
    }

    private fun showJobMenu() {
        val ctx = requireContext()
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon)
            .setImageResource(R.drawable.ic_edit)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "구인글 관리"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "수정 또는 삭제할 수 있습니다"

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)
        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).visibility = View.GONE

        val actions = listOf(
            "수정" to R.drawable.ic_edit,
            "삭제" to R.drawable.ic_report
        )

        val dialog = androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val dp = resources.displayMetrics.density
        for ((index, pair) in actions.withIndex()) {
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
                    if (index == 1) resources.getColor(R.color.app_badge_new_text, null)
                    else resources.getColor(R.color.md_theme_primary, null)
                )
            }
            val text = android.widget.TextView(ctx).apply {
                this.text = label
                textSize = 15f
                setTextColor(
                    if (index == 1) resources.getColor(R.color.app_badge_new_text, null)
                    else resources.getColor(R.color.app_text_primary, null)
                )
                val lp = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                lp.marginStart = (12 * dp).toInt()
                layoutParams = lp
            }
            row.addView(icon)
            row.addView(text)
            row.setOnClickListener {
                dialog.dismiss()
                when (index) {
                    0 -> {
                        val bundle = Bundle().apply { putInt("postId", postId) }
                        findNavController().navigate(R.id.action_jobDetail_to_jobEdit, bundle)
                    }
                    1 -> showDeleteConfirmDialog()
                }
            }
            container.addView(row)

            if (index < actions.size - 1) {
                val divider = View(ctx).apply {
                    layoutParams = android.widget.LinearLayout.LayoutParams(
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                        (0.5f * dp).toInt()
                    )
                    setBackgroundColor(resources.getColor(R.color.app_divider, null))
                }
                container.addView(divider)
            }
        }

        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    private fun showDeleteConfirmDialog() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("구인글 삭제")
            .setMessage("정말 삭제하시겠습니까?")
            .setPositiveButton("삭제") { _, _ ->
                viewLifecycleOwner.lifecycleScope.launch {
                    JobsRepository.deleteJobPost(postId).fold(
                        onSuccess = {
                            Toast.makeText(requireContext(), "삭제되었습니다", Toast.LENGTH_SHORT).show()
                            findNavController().popBackStack()
                        },
                        onFailure = { e ->
                            Toast.makeText(requireContext(), "삭제 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun showReportDialog() {
        val ctx = requireContext()
        val reasons = listOf(
            "허위 또는 과장된 구인 정보" to R.drawable.ic_report,
            "실제 채용 의사 없음" to R.drawable.ic_report,
            "연락처 문제" to R.drawable.ic_report,
            "불법/부적절한 내용" to R.drawable.ic_report,
            "반복 게시" to R.drawable.ic_report,
            "기타" to R.drawable.ic_edit
        )

        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon)
            .setImageResource(R.drawable.ic_report)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "신고하기"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "신고 사유를 선택해주세요"

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)
        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).visibility = View.GONE

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
                    showCustomReportInput()
                } else {
                    submitReport(label, null)
                }
            }
            container.addView(row)

            if (index < reasons.size - 1) {
                val divider = View(ctx).apply {
                    layoutParams = android.widget.LinearLayout.LayoutParams(
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT, (0.5f * dp).toInt()
                    )
                    setBackgroundColor(resources.getColor(R.color.app_divider, null))
                }
                container.addView(divider)
            }
        }

        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    private fun showCustomReportInput() {
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
        btnConfirm.visibility = View.VISIBLE
        btnConfirm.text = "신고"

        val dialog = androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        btnConfirm.setOnClickListener {
            val reason = input.text.toString().trim()
            if (reason.isEmpty()) {
                Toast.makeText(ctx, "신고 사유를 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            dialog.dismiss()
            submitReport("기타", reason)
        }

        dialog.show()
    }

    private fun submitReport(reasonLabel: String, customReason: String?) {
        viewLifecycleOwner.lifecycleScope.launch {
            val request = CreateReportRequest(
                targetType = "job_post",
                targetId = postId,
                postId = 0,
                categoryId = 0,
                reason = reasonLabel,
                customReason = customReason
            )
            CommunityRepository.createReport(request).fold(
                onSuccess = {
                    Toast.makeText(requireContext(), "신고가 접수되었습니다", Toast.LENGTH_SHORT).show()
                },
                onFailure = { e ->
                    Toast.makeText(requireContext(), "신고 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            )
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
