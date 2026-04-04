package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.Toast
import androidx.core.content.ContextCompat
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

        // 바로가기 후 뒤로가기 시 로그인 상태 복원
        if (adminPassword.isNotEmpty() && reports.isNotEmpty()) {
            showDashboard()
        }
    }

    private fun hideKeyboard() {
        val imm = requireContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as InputMethodManager
        val v = activity?.currentFocus ?: binding.root
        imm.hideSoftInputFromWindow(v.windowToken, 0)
    }

    private fun performLogin() {
        val password = binding.etAdminPassword.text?.toString()?.trim() ?: ""
        if (password.isEmpty()) {
            binding.tvLoginError.visibility = View.VISIBLE
            binding.tvLoginError.text = "비밀번호를 입력하세요"
            return
        }

        binding.progressLogin.visibility = View.VISIBLE
        binding.tvLoginError.visibility = View.GONE
        binding.btnLogin.isEnabled = false

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
                        hideKeyboard()
                        showDashboard()
                    }
                },
                onFailure = { e ->
                    binding.tvLoginError.visibility = View.VISIBLE
                    binding.tvLoginError.text = "로그인 실패: ${e.message}"
                }
            )
            binding.progressLogin.visibility = View.GONE
            binding.btnLogin.isEnabled = true
        }
    }

    private fun setupLogin() {
        binding.btnLogin.setOnClickListener {
            performLogin()
        }

        // 키보드 완료 버튼
        binding.etAdminPassword.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE || actionId == EditorInfo.IME_ACTION_GO) {
                performLogin()
                true
            } else false
        }

        // EditText 바깥 터치 시 키보드가 닫히면서 클릭이 씹히는 것을 방지
        // ScrollView(layout_login) 터치 시 EditText 포커스를 유지
        binding.layoutLogin.setOnTouchListener { _, _ -> false }
    }

    private fun showDashboard() {
        binding.layoutLogin.visibility = View.GONE
        binding.layoutDashboard.visibility = View.VISIBLE
        binding.btnChangePassword.setOnClickListener { showChangePasswordDialog() }
        updateTabLabels()
        updateTabContent()
    }

    private fun showChangePasswordDialog() {
        val ctx = requireContext()
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon)
            .setImageResource(R.drawable.ic_dark_mode)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "비밀번호 변경"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text =
            "새 관리자 비밀번호를 입력하세요"

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)

        val dp = resources.displayMetrics.density
        val inputNew = EditText(ctx).apply {
            hint = "새 비밀번호"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setBackgroundResource(R.drawable.bg_search_bar)
            setPadding((16 * dp).toInt(), (12 * dp).toInt(), (16 * dp).toInt(), (12 * dp).toInt())
            textSize = 14f
            setTextColor(resources.getColor(R.color.app_text_secondary, null))
            setHintTextColor(resources.getColor(R.color.app_text_hint, null))
        }
        val inputConfirm = EditText(ctx).apply {
            hint = "새 비밀번호 확인"
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            setBackgroundResource(R.drawable.bg_search_bar)
            setPadding((16 * dp).toInt(), (12 * dp).toInt(), (16 * dp).toInt(), (12 * dp).toInt())
            textSize = 14f
            setTextColor(resources.getColor(R.color.app_text_secondary, null))
            setHintTextColor(resources.getColor(R.color.app_text_hint, null))
            val lp = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.topMargin = (8 * dp).toInt()
            layoutParams = lp
        }
        container.addView(inputNew)
        container.addView(inputConfirm)

        val btnConfirm = dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm)
        btnConfirm.visibility = View.VISIBLE
        btnConfirm.text = "변경"

        val dialog = androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }

        btnConfirm.setOnClickListener {
            val newPw = inputNew.text.toString().trim()
            val confirmPw = inputConfirm.text.toString().trim()

            if (newPw.length < 4) {
                Toast.makeText(ctx, "비밀번호는 4자 이상이어야 합니다", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (newPw != confirmPw) {
                Toast.makeText(ctx, "비밀번호가 일치하지 않습니다", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            dialog.dismiss()
            lifecycleScope.launch {
                CommunityRepository.changeAdminPassword(adminPassword, newPw).fold(
                    onSuccess = { resp ->
                        if (resp.error != null) {
                            Toast.makeText(ctx, resp.error, Toast.LENGTH_SHORT).show()
                        } else {
                            adminPassword = newPw
                            Toast.makeText(ctx, "비밀번호가 변경되었습니다", Toast.LENGTH_SHORT).show()
                        }
                    },
                    onFailure = { e ->
                        Toast.makeText(ctx, "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                )
            }
        }

        dialog.show()
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

        inquiryAdapter = InquiryAdapter(isAdminMode = true) { inquiry ->
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
        val unreadInq = inquiries.count { it.readAt == null }
        val totalInq = inquiries.size

        binding.tabUnresolved.text = "미처리 ($unresolved)"
        binding.tabResolved.text = "처리완료 ($resolved)"
        binding.tabInquiries.text = if (unreadInq > 0) "문의사항 ($unreadInq/$totalInq)" else "문의사항 ($totalInq)"

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
        MaterialAlertDialogBuilder(requireContext(), com.google.android.material.R.style.ThemeOverlay_Material3_MaterialAlertDialog_Centered)
            .setTitle("신고 처리")
            .setMessage("이 신고를 처리 완료하시겠습니까?")
            .setIcon(R.drawable.ic_check)
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
        MaterialAlertDialogBuilder(requireContext(), com.google.android.material.R.style.ThemeOverlay_Material3_MaterialAlertDialog_Centered)
            .setTitle("대상 삭제")
            .setMessage("신고된 ${targetLabel}을(를) 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")
            .setIcon(R.drawable.ic_report)
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
        MaterialAlertDialogBuilder(requireContext(), com.google.android.material.R.style.ThemeOverlay_Material3_MaterialAlertDialog_Centered)
            .setTitle("숨기기")
            .setMessage("신고된 ${targetLabel}을(를) 숨기시겠습니까?\n숨김 처리 후 처리 완료로 이동합니다.")
            .setIcon(R.drawable.ic_dark_mode)
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
        MaterialAlertDialogBuilder(requireContext(), com.google.android.material.R.style.ThemeOverlay_Material3_MaterialAlertDialog_Centered)
            .setTitle("숨기기 해제")
            .setMessage("${targetLabel}의 숨기기를 해제하시겠습니까?")
            .setIcon(R.drawable.ic_dark_mode)
            .setPositiveButton("해제") { _, _ ->
                lifecycleScope.launch {
                    CommunityRepository.unhideReport(report.id, adminPassword).fold(
                        onSuccess = {
                            Toast.makeText(requireContext(), "숨기기 해제 완료", Toast.LENGTH_SHORT).show()
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
        val ctx = requireContext()
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon)
            .setImageResource(R.drawable.ic_description)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = inquiry.title
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text =
            "${inquiry.author} · ${inquiry.createdAt.take(10)}"

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)

        // 확인/등록 버튼 숨기기 (액션 목록이므로)
        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).visibility = View.GONE

        val actions = mutableListOf(
            "내용 보기" to R.drawable.ic_article,
            "답변 작성" to R.drawable.ic_edit
        )
        if (inquiry.hidden == true) {
            actions.add("숨김 해제" to R.drawable.ic_check)
        } else {
            actions.add("숨김 처리" to R.drawable.ic_check)
        }

        val dialog = androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        for ((index, pair) in actions.withIndex()) {
            val (label, iconRes) = pair
            val row = android.widget.LinearLayout(ctx).apply {
                orientation = android.widget.LinearLayout.HORIZONTAL
                gravity = android.view.Gravity.CENTER_VERTICAL
                setPadding(12, 0, 12, 0)
                layoutParams = android.widget.LinearLayout.LayoutParams(
                    android.widget.LinearLayout.LayoutParams.MATCH_PARENT, (44 * resources.displayMetrics.density).toInt()
                )
                background = ctx.getDrawable(androidx.appcompat.R.drawable.abc_item_background_holo_light)
            }
            val icon = android.widget.ImageView(ctx).apply {
                setImageResource(iconRes)
                layoutParams = android.widget.LinearLayout.LayoutParams(
                    (20 * resources.displayMetrics.density).toInt(),
                    (20 * resources.displayMetrics.density).toInt()
                )
                imageTintList = android.content.res.ColorStateList.valueOf(
                    resources.getColor(R.color.md_theme_primary, null)
                )
            }
            val text = android.widget.TextView(ctx).apply {
                this.text = label
                textSize = 15f
                setTextColor(resources.getColor(R.color.app_text_primary, null))
                val lp = android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                lp.marginStart = (12 * resources.displayMetrics.density).toInt()
                layoutParams = lp
            }
            row.addView(icon)
            row.addView(text)
            row.setOnClickListener {
                dialog.dismiss()
                when (index) {
                    0 -> viewInquiryAdmin(inquiry)
                    1 -> showReplyDialog(inquiry)
                    2 -> toggleHideInquiry(inquiry)
                }
            }
            container.addView(row)

            // 구분선 (마지막 제외)
            if (index < actions.size - 1) {
                val divider = View(ctx).apply {
                    layoutParams = android.widget.LinearLayout.LayoutParams(
                        android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                        (0.5f * resources.displayMetrics.density).toInt()
                    )
                    setBackgroundColor(resources.getColor(R.color.app_divider, null))
                }
                container.addView(divider)
            }
        }

        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener {
            dialog.dismiss()
        }

        dialog.show()
    }

    private fun viewInquiryAdmin(inquiry: CommunityInquiry) {
        // 로컬에서 읽음 처리
        if (inquiry.readAt == null) {
            inquiries = inquiries.map {
                if (it.id == inquiry.id) it.copy(readAt = "read") else it
            }
            updateTabLabels()
            updateTabContent()
        }

        // 문의 상세 화면으로 이동
        val bundle = Bundle().apply {
            putInt("inquiryId", inquiry.id)
            putString("inquiryTitle", inquiry.title)
            putString("inquiryAuthor", inquiry.author)
            putString("inquiryDate", inquiry.createdAt)
            putString("adminPassword", adminPassword)
        }
        findNavController().navigate(R.id.action_admin_to_inquiryDetail, bundle)
    }

    private fun showReplyDialog(inquiry: CommunityInquiry) {
        val ctx = requireContext()
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon)
            .setImageResource(R.drawable.ic_edit)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "답변 작성"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = inquiry.title

        val container = dialogView.findViewById<android.widget.LinearLayout>(R.id.layout_items)

        val input = EditText(ctx).apply {
            hint = "답변 내용을 입력하세요"
            minLines = 4
            inputType = android.text.InputType.TYPE_CLASS_TEXT or
                    android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE
            setBackgroundResource(R.drawable.bg_search_bar)
            setPadding(32, 24, 32, 24)
            textSize = 14f
            setTextColor(resources.getColor(R.color.app_text_secondary, null))
            setHintTextColor(resources.getColor(R.color.app_text_hint, null))
        }
        container.addView(input)

        val btnConfirm = dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm)
        btnConfirm.visibility = android.view.View.VISIBLE
        btnConfirm.text = "등록"

        val dialog = androidx.appcompat.app.AlertDialog.Builder(ctx)
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.view.View>(R.id.btn_cancel).setOnClickListener {
            dialog.dismiss()
        }

        btnConfirm.setOnClickListener {
            val reply = input.text.toString().trim()
            if (reply.isEmpty()) {
                Toast.makeText(ctx, "답변 내용을 입력하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            dialog.dismiss()
            lifecycleScope.launch {
                CommunityRepository.replyToInquiry(inquiry.id, adminPassword, reply).fold(
                    onSuccess = {
                        Toast.makeText(ctx, "답변 완료", Toast.LENGTH_SHORT).show()
                        refreshData()
                    },
                    onFailure = { e ->
                        Toast.makeText(ctx, "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                )
            }
        }

        dialog.show()
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
