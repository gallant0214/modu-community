package com.moduji.app.ui.jobs

import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.RadioGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
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
            updateBookmarkIcon()

            binding.btnBookmark.setOnClickListener {
                val isNowBookmarked = BookmarkManager.toggle(requireContext(), postId)
                updateBookmarkIcon()
                val msg = if (isNowBookmarked) "북마크에 추가되었습니다" else "북마크가 해제되었습니다"
                Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
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

            // 급여
            binding.tvSalary.text = post.salary

            // 연락처
            if (post.contact.isNotBlank()) {
                binding.layoutContact.visibility = View.VISIBLE
                binding.tvContact.text = post.contact
            }

            // 모집 인원
            if (post.headcount.isNotBlank()) {
                binding.layoutHeadcount.visibility = View.VISIBLE
                binding.tvHeadcount.text = post.headcount
            }

            // 모집기간
            if (post.deadline.isNotBlank()) {
                binding.layoutDeadline.visibility = View.VISIBLE
                binding.tvDeadline.text = post.deadline

                // 날짜 형식(yyyy.MM.dd까지)인 경우 만료 여부 확인
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
            }

            // 상세 내용
            val desc = post.description.ifBlank { post.preview }
            binding.tvDescription.text = desc

            // 우대조건
            if (post.preferences.isNotBlank()) {
                binding.layoutPreferences.visibility = View.VISIBLE
                binding.tvPreferences.text = post.preferences
            }

            // 복리후생
            if (post.benefits.isNotBlank()) {
                binding.layoutBenefits.visibility = View.VISIBLE
                binding.tvBenefits.text = post.benefits
            }
        }
    }

    private fun updateBookmarkIcon() {
        val iconRes = if (BookmarkManager.isBookmarked(postId))
            R.drawable.ic_bookmark_filled else R.drawable.ic_bookmark
        binding.btnBookmark.setImageResource(iconRes)
    }

    private fun showJobMenu() {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_post_menu, null)
        dialog.setContentView(sheetView)

        sheetView.findViewById<View>(R.id.btn_edit).setOnClickListener {
            dialog.dismiss()
            val bundle = Bundle().apply {
                putInt("postId", postId)
            }
            findNavController().navigate(R.id.action_jobDetail_to_jobEdit, bundle)
        }
        sheetView.findViewById<View>(R.id.btn_delete).setOnClickListener {
            dialog.dismiss()
            showDeleteConfirmDialog()
        }

        dialog.show()
    }

    private fun showDeleteConfirmDialog() {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_delete_confirm, null)
        dialog.setContentView(sheetView)

        sheetView.findViewById<View>(R.id.btn_cancel).setOnClickListener {
            dialog.dismiss()
        }

        sheetView.findViewById<View>(R.id.btn_delete).setOnClickListener {
            dialog.dismiss()
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

        dialog.show()
    }

    private fun showReportDialog() {
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_job_report, null)
        dialog.setContentView(sheetView)

        val rgReason = sheetView.findViewById<RadioGroup>(R.id.rg_report_reason)
        val tilOther = sheetView.findViewById<TextInputLayout>(R.id.til_other_reason)
        val etOther = sheetView.findViewById<TextInputEditText>(R.id.et_other_reason)

        rgReason.setOnCheckedChangeListener { _, checkedId ->
            tilOther.visibility = if (checkedId == R.id.rb_other) View.VISIBLE else View.GONE
        }

        sheetView.findViewById<View>(R.id.btn_submit_report).setOnClickListener {
            val reason = when (rgReason.checkedRadioButtonId) {
                R.id.rb_fake_info -> "허위 또는 과장된 구인 정보"
                R.id.rb_no_intent -> "실제 채용 의사 없음"
                R.id.rb_contact_issue -> "연락처 문제"
                R.id.rb_illegal -> "불법/부적절한 내용"
                R.id.rb_duplicate -> "반복 게시"
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

            // 실제 API 호출
            viewLifecycleOwner.lifecycleScope.launch {
                val customReason = if (rgReason.checkedRadioButtonId == R.id.rb_other) reason else null
                val reasonLabel = when (rgReason.checkedRadioButtonId) {
                    R.id.rb_other -> "기타"
                    else -> reason
                }
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
            dialog.dismiss()
        }

        dialog.show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
