package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.moduji.app.R
import com.moduji.app.data.model.CommunityInquiry
import com.moduji.app.data.model.CommunityReport
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.FragmentAdminBinding
import com.moduji.app.ui.community.adapter.AdminReportAdapter
import com.moduji.app.ui.community.adapter.InquiryAdapter
import kotlinx.coroutines.launch

class AdminFragment : Fragment() {

    private var _binding: FragmentAdminBinding? = null
    private val binding get() = _binding!!

    private var adminPassword = ""
    // 0 = 미처리, 1 = 처리완료, 2 = 문의사항
    private var currentTab = 0

    private lateinit var unresolvedAdapter: AdminReportAdapter
    private lateinit var resolvedAdapter: AdminReportAdapter
    private lateinit var inquiryAdapter: InquiryAdapter

    private var reports: List<CommunityReport> = emptyList()
    private var inquiries: List<CommunityInquiry> = emptyList()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAdminBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        setupLogin()
        setupDashboard()
    }

    private fun setupLogin() {
        binding.btnLogin.setOnClickListener {
            val password = binding.etAdminPassword.text?.toString()?.trim() ?: ""
            if (password.isEmpty()) {
                binding.tvLoginError.visibility = View.VISIBLE
                binding.tvLoginError.text = "비밀번호를 입력하세요"
                return@setOnClickListener
            }

            binding.progressLogin.visibility = View.VISIBLE
            binding.tvLoginError.visibility = View.GONE

            lifecycleScope.launch {
                CommunityRepository.adminLogin(password).fold(
                    onSuccess = { resp ->
                        if (resp.error != null) {
                            binding.tvLoginError.visibility = View.VISIBLE
                            binding.tvLoginError.text = resp.error
                        } else {
                            adminPassword = password
                            reports = resp.reports ?: emptyList()
                            inquiries = resp.inquiries ?: emptyList()
                            showDashboard()
                        }
                    },
                    onFailure = { e ->
                        binding.tvLoginError.visibility = View.VISIBLE
                        binding.tvLoginError.text = "로그인 실패: ${e.message}"
                    }
                )
                binding.progressLogin.visibility = View.GONE
            }
        }
    }

    private fun showDashboard() {
        binding.layoutLogin.visibility = View.GONE
        binding.layoutDashboard.visibility = View.VISIBLE
        updateTabLabels()
        updateTabContent()
    }

    private fun setupDashboard() {
        // 미처리 어댑터
        unresolvedAdapter = AdminReportAdapter(
            onResolve = { report -> resolveReport(report) },
            onDeleteTarget = { report -> deleteReportTarget(report) },
            onNavigate = { report -> navigateToPost(report) },
            onHide = { report -> hideReportTarget(report) },
            onUnhide = { report -> unhideReportTarget(report) },
            showActions = true
        )

        // 처리완료 어댑터
        resolvedAdapter = AdminReportAdapter(
            onResolve = {},
            onDeleteTarget = {},
            onNavigate = { report -> navigateToPost(report) },
            showActions = false
        )

        inquiryAdapter = InquiryAdapter { inquiry ->
            showInquiryActions(inquiry)
        }

        binding.rvReports.layoutManager = LinearLayoutManager(requireContext())
        binding.rvInquiries.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = inquiryAdapter
        }

        binding.tabUnresolved.setOnClickListener {
            currentTab = 0
            updateTabStyles()
            updateTabContent()
        }

        binding.tabResolved.setOnClickListener {
            currentTab = 1
            updateTabStyles()
            updateTabContent()
        }

        binding.tabInquiries.setOnClickListener {
            currentTab = 2
            updateTabStyles()
            updateTabContent()
        }
    }

    private fun getUnresolvedReports() = reports.filter { it.resolved != true && it.deletedAt == null }
    private fun getResolvedReports() = reports.filter { it.resolved == true || it.deletedAt != null }

    private fun updateTabLabels() {
        val unresolved = getUnresolvedReports().size
        val resolved = getResolvedReports().size
        val inq = inquiries.size

        binding.tabUnresolved.text = "미처리 ($unresolved)"
        binding.tabResolved.text = "처리완료 ($resolved)"
        binding.tabInquiries.text = "문의사항 ($inq)"

        updateTabStyles()
    }

    private fun updateTabStyles() {
        val tabs = listOf(binding.tabUnresolved, binding.tabResolved, binding.tabInquiries)
        tabs.forEachIndexed { index, tab ->
            if (index == currentTab) {
                tab.setBackgroundResource(R.drawable.bg_login_button)
                tab.setTextColor(resources.getColor(R.color.md_theme_onPrimary, null))
            } else {
                tab.setBackgroundResource(R.drawable.bg_search_bar)
                tab.setTextColor(resources.getColor(R.color.app_text_hint, null))
            }
        }
    }

    private fun updateTabContent() {
        when (currentTab) {
            0 -> {
                binding.rvReports.visibility = View.VISIBLE
                binding.rvInquiries.visibility = View.GONE
                binding.rvReports.adapter = unresolvedAdapter
                val list = getUnresolvedReports()
                unresolvedAdapter.submitList(list)
                binding.tvEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                binding.tvEmpty.text = "미처리 신고가 없습니다"
            }
            1 -> {
                binding.rvReports.visibility = View.VISIBLE
                binding.rvInquiries.visibility = View.GONE
                binding.rvReports.adapter = resolvedAdapter
                val list = getResolvedReports()
                resolvedAdapter.submitList(list)
                binding.tvEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                binding.tvEmpty.text = "처리된 신고가 없습니다"
            }
            2 -> {
                binding.rvReports.visibility = View.GONE
                binding.rvInquiries.visibility = View.VISIBLE
                inquiryAdapter.submitList(inquiries)
                binding.tvEmpty.visibility = if (inquiries.isEmpty()) View.VISIBLE else View.GONE
                binding.tvEmpty.text = "문의 내역이 없습니다"
            }
        }
    }

    private fun navigateToPost(report: CommunityReport) {
        if (report.targetType == "job_post") {
            val bundle = Bundle().apply {
                putInt("postId", report.targetId)
            }
            findNavController().navigate(R.id.action_admin_to_jobDetail, bundle)
        } else {
            val bundle = Bundle().apply {
                putInt("postId", if (report.targetType == "post") report.targetId else report.postId)
                putInt("categoryId", report.categoryId)
            }
            findNavController().navigate(R.id.action_admin_to_postDetail, bundle)
        }
    }

    private fun resolveReport(report: CommunityReport) {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("신고 처리")
            .setMessage("이 신고를 처리 완료하시겠습니까?")
            .setPositiveButton("확인") { _, _ ->
                lifecycleScope.launch {
                    CommunityRepository.resolveReport(report.id, adminPassword).fold(
                        onSuccess = {
                            Toast.makeText(requireContext(), "처리 완료", Toast.LENGTH_SHORT).show()
                            refreshData()
                        },
                        onFailure = { e ->
                            Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun deleteReportTarget(report: CommunityReport) {
        val targetLabel = when (report.targetType) {
            "job_post" -> "구인게시글"
            "post" -> "후기게시글"
            else -> "댓글"
        }
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("대상 삭제")
            .setMessage("신고된 ${targetLabel}을(를) 삭제하시겠습니까?")
            .setPositiveButton("삭제") { _, _ ->
                lifecycleScope.launch {
                    CommunityRepository.deleteReportTarget(report.id, adminPassword).fold(
                        onSuccess = {
                            Toast.makeText(requireContext(), "삭제 완료", Toast.LENGTH_SHORT).show()
                            refreshData()
                        },
                        onFailure = { e ->
                            Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun hideReportTarget(report: CommunityReport) {
        val targetLabel = when (report.targetType) {
            "job_post" -> "구인게시글"
            "post" -> "후기게시글"
            else -> "댓글"
        }
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("숨기기")
            .setMessage("신고된 ${targetLabel}을(를) 숨기시겠습니까?")
            .setPositiveButton("숨기기") { _, _ ->
                lifecycleScope.launch {
                    CommunityRepository.hideReport(report.id, adminPassword).fold(
                        onSuccess = {
                            Toast.makeText(requireContext(), "숨기기 완료", Toast.LENGTH_SHORT).show()
                            refreshData()
                        },
                        onFailure = { e ->
                            Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun unhideReportTarget(report: CommunityReport) {
        val targetLabel = when (report.targetType) {
            "job_post" -> "구인게시글"
            "post" -> "후기게시글"
            else -> "댓글"
        }
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("숨기기 해지")
            .setMessage("${targetLabel}의 숨기기를 해지하시겠습니까?")
            .setPositiveButton("해지") { _, _ ->
                lifecycleScope.launch {
                    CommunityRepository.unhideReport(report.id, adminPassword).fold(
                        onSuccess = {
                            Toast.makeText(requireContext(), "숨기기 해지 완료", Toast.LENGTH_SHORT).show()
                            refreshData()
                        },
                        onFailure = { e ->
                            Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun showInquiryActions(inquiry: CommunityInquiry) {
        val items = mutableListOf("내용 보기", "답변 작성")
        if (inquiry.hidden == true) items.add("숨김 해제") else items.add("숨김 처리")

        MaterialAlertDialogBuilder(requireContext())
            .setTitle(inquiry.title)
            .setItems(items.toTypedArray()) { _, which ->
                when (which) {
                    0 -> viewInquiryAdmin(inquiry)
                    1 -> showReplyDialog(inquiry)
                    2 -> toggleHideInquiry(inquiry)
                }
            }
            .show()
    }

    private fun viewInquiryAdmin(inquiry: CommunityInquiry) {
        lifecycleScope.launch {
            CommunityRepository.viewInquiry(inquiry.id, adminPassword).fold(
                onSuccess = { resp ->
                    val message = buildString {
                        append("작성자: ${inquiry.author}\n")
                        append("이메일: ${inquiry.email ?: "없음"}\n\n")
                        append("내용:\n${resp.content ?: "(내용 없음)"}\n")
                        if (!resp.reply.isNullOrBlank()) {
                            append("\n────────────\n")
                            append("답변:\n${resp.reply}")
                        }
                    }
                    MaterialAlertDialogBuilder(requireContext())
                        .setTitle(inquiry.title)
                        .setMessage(message)
                        .setPositiveButton("확인", null)
                        .show()
                },
                onFailure = { e ->
                    Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            )
        }
    }

    private fun showReplyDialog(inquiry: CommunityInquiry) {
        val input = EditText(requireContext()).apply {
            hint = "답변 내용을 입력하세요"
            setPadding(48, 32, 48, 32)
            minLines = 3
        }
        MaterialAlertDialogBuilder(requireContext())
            .setTitle("답변 작성")
            .setView(input)
            .setPositiveButton("등록") { _, _ ->
                val reply = input.text.toString().trim()
                if (reply.isEmpty()) return@setPositiveButton
                lifecycleScope.launch {
                    CommunityRepository.replyToInquiry(inquiry.id, adminPassword, reply).fold(
                        onSuccess = {
                            Toast.makeText(requireContext(), "답변 완료", Toast.LENGTH_SHORT).show()
                            refreshData()
                        },
                        onFailure = { e ->
                            Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun toggleHideInquiry(inquiry: CommunityInquiry) {
        lifecycleScope.launch {
            val result = if (inquiry.hidden == true) {
                CommunityRepository.unhideInquiry(inquiry.id, adminPassword)
            } else {
                CommunityRepository.hideInquiry(inquiry.id, adminPassword)
            }
            result.fold(
                onSuccess = {
                    Toast.makeText(requireContext(), "완료", Toast.LENGTH_SHORT).show()
                    refreshData()
                },
                onFailure = { e ->
                    Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            )
        }
    }

    private fun refreshData() {
        lifecycleScope.launch {
            CommunityRepository.adminLogin(adminPassword).fold(
                onSuccess = { resp ->
                    reports = resp.reports ?: emptyList()
                    inquiries = resp.inquiries ?: emptyList()
                    updateTabLabels()
                    updateTabContent()
                },
                onFailure = { /* ignore */ }
            )
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
