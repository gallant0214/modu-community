package com.moduji.app.ui.jobs

import android.graphics.Color
import android.graphics.Rect
import android.graphics.Typeface
import android.text.SpannableString
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.app.DatePickerDialog
import android.widget.ArrayAdapter
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.moduji.app.R
import com.moduji.app.data.model.*
import com.moduji.app.data.repository.JobsRepository
import com.moduji.app.databinding.FragmentJobWriteBinding
import com.moduji.app.util.showCenterSplash
import com.moduji.app.util.ChosungSearch
import com.moduji.app.util.showSubmitConfirmDialog
import kotlinx.coroutines.launch
import java.util.Calendar

/**
 * 구인 글쓰기 Fragment
 *
 * 필수: 종목, 센터명, 작성자정보, 연락처, 제목, 내용, 근무형태, 급여, 모집인원, 동의
 * 선택: 우대조건, 복리후생
 */
class JobWriteFragment : Fragment() {

    private var _binding: FragmentJobWriteBinding? = null
    private val binding get() = _binding!!

    private val viewModel: JobWriteViewModel by viewModels()

    // 전달받은 지역 정보
    private var regionCode: String = ""
    private var regionName: String = ""

    // BottomSheet 에서 선택된 데이터
    private var selectedSport: String? = null
    private var selectedJobType: JobType? = null
    private var selectedSalary: SalaryInfo? = null
    private var selectedHeadcount: String? = null
    private var selectedBenefits: List<JobBenefit> = emptyList()
    private var selectedPreferences: List<JobPreference> = emptyList()
    private var selectedContactType: String = "연락처"
    private var selectedDeadline: String? = null
    private var lastSelectedDate: String? = null // 직접 입력으로 선택한 날짜 (재편집용)
    private var repostJobId: Int = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        regionCode = arguments?.getString("regionCode") ?: ""
        regionName = arguments?.getString("regionName") ?: ""
        repostJobId = arguments?.getInt("repostJobId", 0) ?: 0
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentJobWriteBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupLabels()
        setupRegionInfo()
        setupClickListeners()
        setupTextWatchers()
        observeViewModel()
        observeRegionResult()

        if (repostJobId > 0) {
            loadRepostData()
        }
    }

    // ====================================================
    // 라벨 설정 (필수 빨간색)
    // ====================================================
    private fun setupLabels() {
        val redColor = resources.getColor(R.color.app_badge_new_text, null)

        fun requiredLabel(base: String, required: String = "(필수)"): SpannableString {
            val full = "$base $required"
            return SpannableString(full).apply {
                setSpan(ForegroundColorSpan(redColor), base.length + 1, full.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }

        binding.labelSport.text = requiredLabel("종목")
        binding.labelCenterName.text = requiredLabel("업체명")
        binding.labelAddress.text = requiredLabel("업체 주소")
        binding.labelAuthor.text = requiredLabel("작성자 정보")
        binding.labelContact.text = requiredLabel("연락처")
        binding.labelTitle.text = requiredLabel("제목")
        binding.labelDescription.text = requiredLabel("내용")
        binding.labelDeadline.text = requiredLabel("모집기간")
        binding.labelJobType.text = requiredLabel("근무형태")
        binding.labelSalary.text = requiredLabel("급여")
        binding.labelHeadcount.text = requiredLabel("모집 인원")
    }

    // ====================================================
    // 지역 정보 표시
    // ====================================================
    private fun setupRegionInfo() {
        if (regionCode.isBlank()) {
            binding.tvRegionDisplay.text = "지역을 선택해 주세요"
            binding.tvRegionDisplay.setTextColor(resources.getColor(R.color.app_badge_new_text, null))
        } else {
            binding.tvRegionDisplay.text = "📍 $regionName"
            binding.tvRegionDisplay.setTextColor(resources.getColor(R.color.app_text_secondary, null))
        }

        binding.tvChangeRegion.setOnClickListener {
            val sheet = RegionSelectBottomSheet.newInstance()
            sheet.onRegionSelected = { code, name ->
                regionCode = code
                regionName = name
                setupRegionInfo()
            }
            sheet.show(parentFragmentManager, "region_select_write")
        }
    }

    // ====================================================
    // 지역 선택 결과 관찰 (재게시 경로에서 지역 변경 시)
    // ====================================================
    private fun observeRegionResult() {
        findNavController().currentBackStackEntry?.savedStateHandle
            ?.getLiveData<String>("selectedRegionCode")?.observe(viewLifecycleOwner) { code ->
                if (!code.isNullOrEmpty()) {
                    regionCode = code
                    regionName = findNavController().currentBackStackEntry
                        ?.savedStateHandle?.get<String>("selectedRegionName") ?: ""
                    findNavController().currentBackStackEntry?.savedStateHandle?.remove<String>("selectedRegionCode")
                    findNavController().currentBackStackEntry?.savedStateHandle?.remove<String>("selectedRegionName")
                    setupRegionInfo()
                }
            }
    }

    // ====================================================
    // 클릭 리스너 설정
    // ====================================================
    private fun setupClickListeners() {
        binding.btnBack.setOnClickListener {
            findNavController().navigateUp()
        }

        binding.rowSport.setOnClickListener { showSportDialog() }
        binding.rowJobType.setOnClickListener { showJobTypeDialog() }
        binding.rowSalary.setOnClickListener { showSalaryDialog() }
        binding.rowHeadcount.setOnClickListener { showHeadcountDialog() }
        binding.rowPreferences.setOnClickListener { showPreferencesDialog() }
        binding.rowBenefits.setOnClickListener { showBenefitsDialog() }
        binding.rowDeadline.setOnClickListener { showDeadlineDialog() }
        binding.rowContactType.setOnClickListener { showContactTypeDialog() }

        binding.btnSubmit.isEnabled = true
        binding.btnSubmit.setOnClickListener {
            if (regionCode.isBlank()) {
                showRegionError()
                return@setOnClickListener
            }

            val (errors, firstErrorView) = validateForm()
            if (errors.isNotEmpty()) {
                val message = "다음 항목을 확인해 주세요:\n\n• " + errors.joinToString("\n• ")
                Toast.makeText(requireContext(), message, Toast.LENGTH_LONG).show()
                firstErrorView?.let { scrollToView(it) }
                return@setOnClickListener
            }
            showSubmitConfirmDialog(requireContext()) { submitForm() }
        }
    }

    // ====================================================
    // 텍스트 입력 감지
    // ====================================================
    private var isPhoneFormatting = false

    private fun setupTextWatchers() {
        binding.etDescription.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val len = s?.toString()?.trim()?.length ?: 0
                if (len in 1..19) {
                    binding.tilDescription.helperText = "20자 이상 입력해 주세요 (현재 ${len}자)"
                } else {
                    binding.tilDescription.helperText = null
                }
            }
        })

        // 연락처 자동 하이픈
        binding.etContact.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (isPhoneFormatting || selectedContactType != "연락처") return
                val input = s?.toString() ?: return
                val digits = input.replace(Regex("[^0-9]"), "")
                val formatted = formatPhoneNumber(digits)
                if (input != formatted) {
                    isPhoneFormatting = true
                    s.replace(0, s.length, formatted)
                    isPhoneFormatting = false
                }
            }
        })
    }

    private fun formatPhoneNumber(digits: String): String {
        if (digits.isEmpty()) return ""
        return when {
            // 02 서울
            digits.startsWith("02") -> when {
                digits.length <= 2 -> digits
                digits.length <= 5 -> "${digits.substring(0, 2)}-${digits.substring(2)}"
                digits.length <= 9 -> "${digits.substring(0, 2)}-${digits.substring(2, 5)}-${digits.substring(5)}"
                else -> "${digits.substring(0, 2)}-${digits.substring(2, 6)}-${digits.substring(6, minOf(10, digits.length))}"
            }
            // 01X 휴대폰
            digits.startsWith("01") -> when {
                digits.length <= 3 -> digits
                digits.length <= 7 -> "${digits.substring(0, 3)}-${digits.substring(3)}"
                else -> "${digits.substring(0, 3)}-${digits.substring(3, 7)}-${digits.substring(7, minOf(11, digits.length))}"
            }
            // 0XX 지역번호
            digits.startsWith("0") -> when {
                digits.length <= 3 -> digits
                digits.length <= 6 -> "${digits.substring(0, 3)}-${digits.substring(3)}"
                digits.length <= 10 -> "${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}"
                else -> "${digits.substring(0, 3)}-${digits.substring(3, 7)}-${digits.substring(7, minOf(11, digits.length))}"
            }
            // 1XXX 대표번호 (1588, 1577 등)
            digits.startsWith("1") -> when {
                digits.length <= 4 -> digits
                else -> "${digits.substring(0, 4)}-${digits.substring(4, minOf(8, digits.length))}"
            }
            else -> digits
        }
    }

    // ====================================================
    // 선택값 설정 헬퍼 (볼드 + 색상)
    // ====================================================
    private fun setSelectedValue(tv: android.widget.TextView, text: String) {
        tv.text = text
        tv.setTextColor(resources.getColor(R.color.app_text_secondary, null))
        tv.setTypeface(null, Typeface.BOLD)
    }

    // ====================================================
    // iOS 스타일 다이얼로그 헬퍼
    // ====================================================
    private fun showIosDialog(
        iconRes: Int,
        title: String,
        subtitle: String?,
        items: List<String>,
        selectedIndex: Int = -1,
        onSelect: (Int) -> Unit
    ) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(iconRes)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = title
        val tvSubtitle = dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle)
        if (subtitle != null) tvSubtitle.text = subtitle else tvSubtitle.visibility = View.GONE

        val container = dialogView.findViewById<LinearLayout>(R.id.layout_items)
        items.forEachIndexed { index, label ->
            val itemView = layoutInflater.inflate(R.layout.item_ios_dialog_option, container, false)
            val rb = itemView.findViewById<android.widget.RadioButton>(R.id.rb_item)
            rb.isChecked = (index == selectedIndex)
            itemView.findViewById<android.widget.TextView>(R.id.tv_label).apply {
                text = label
                if (index == selectedIndex) {
                    setTypeface(null, Typeface.BOLD)
                    setTextColor(resources.getColor(R.color.md_theme_primary, null))
                }
            }
            if (index == items.lastIndex) {
                itemView.findViewById<View>(R.id.divider).visibility = View.GONE
            }
            itemView.setOnClickListener { onSelect(index); dialog.dismiss() }
            container.addView(itemView)
        }

        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    private fun showIosMultiChoiceDialog(
        iconRes: Int,
        title: String,
        subtitle: String?,
        items: List<String>,
        checked: BooleanArray,
        onConfirm: (BooleanArray) -> Unit
    ) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(iconRes)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = title
        val tvSubtitle = dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle)
        if (subtitle != null) tvSubtitle.text = subtitle else tvSubtitle.visibility = View.GONE

        val container = dialogView.findViewById<LinearLayout>(R.id.layout_items)
        items.forEachIndexed { index, label ->
            val itemView = layoutInflater.inflate(R.layout.item_ios_dialog_check, container, false)
            val cb = itemView.findViewById<CheckBox>(R.id.cb_item)
            itemView.findViewById<android.widget.TextView>(R.id.tv_label).text = label
            cb.isChecked = checked[index]
            if (index == items.lastIndex) {
                itemView.findViewById<View>(R.id.divider).visibility = View.GONE
            }
            itemView.setOnClickListener { cb.isChecked = !cb.isChecked }
            cb.setOnCheckedChangeListener { _, isChecked -> checked[index] = isChecked }
            container.addView(itemView)
        }

        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).apply {
            visibility = View.VISIBLE
            setOnClickListener { onConfirm(checked); dialog.dismiss() }
        }
        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    // ====================================================
    // 드롭다운 다이얼로그
    // ====================================================

    // (1) 종목 선택
    private fun showSportDialog() {
        val allSports = JobSportBottomSheet.ALL_SPORTS

        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_search)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "종목 선택"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "종목을 검색하거나 선택하세요"

        val container = dialogView.findViewById<LinearLayout>(R.id.layout_items)
        val dp = resources.displayMetrics.density

        // 검색 바
        val etSearch = EditText(requireContext()).apply {
            hint = "종목 검색 (예: 축구, ㅊㄱ)"
            inputType = InputType.TYPE_CLASS_TEXT
            textSize = 14f
            background = resources.getDrawable(R.drawable.bg_search_bar, null)
            setPadding((12 * dp).toInt(), (10 * dp).toInt(), (12 * dp).toInt(), (10 * dp).toInt())
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = (8 * dp).toInt() }
        }
        container.addView(etSearch)

        // 스크롤 가능한 종목 리스트
        val scrollView = android.widget.ScrollView(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                (280 * dp).toInt()
            )
        }
        val itemsLayout = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
        }
        scrollView.addView(itemsLayout)
        container.addView(scrollView)

        fun buildItems(sports: List<String>) {
            itemsLayout.removeAllViews()
            sports.forEachIndexed { index, label ->
                val itemView = layoutInflater.inflate(R.layout.item_ios_dialog_option, itemsLayout, false)
                val rb = itemView.findViewById<android.widget.RadioButton>(R.id.rb_item)
                rb.isChecked = (label == selectedSport)
                itemView.findViewById<android.widget.TextView>(R.id.tv_label).apply {
                    text = label
                    if (label == selectedSport) {
                        setTypeface(null, Typeface.BOLD)
                        setTextColor(resources.getColor(R.color.md_theme_primary, null))
                    }
                }
                if (index == sports.lastIndex) {
                    itemView.findViewById<View>(R.id.divider).visibility = View.GONE
                }
                itemView.setOnClickListener {
                    if (label == "기타") {
                        dialog.dismiss()
                        showCustomSportInput()
                    } else {
                        selectedSport = label
                        setSelectedValue(binding.tvSport, label)
                        dialog.dismiss()
                    }
                }
                itemsLayout.addView(itemView)
            }
        }

        buildItems(allSports)

        etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val query = s?.toString()?.trim() ?: ""
                if (query.isEmpty()) {
                    buildItems(allSports)
                } else {
                    buildItems(allSports.filter {
                        it.contains(query, ignoreCase = true) || ChosungSearch.matches(it, query)
                    })
                }
            }
        })

        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    private fun showCustomSportInput() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_edit)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "종목 직접 입력"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "종목명을 입력하세요"

        val container = dialogView.findViewById<LinearLayout>(R.id.layout_items)
        val et = EditText(requireContext()).apply {
            hint = "종목명"
            inputType = InputType.TYPE_CLASS_TEXT
            textSize = 15f
        }
        container.addView(et)

        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).apply {
            visibility = View.VISIBLE
            text = "확인"
            setOnClickListener {
                val text = et.text.toString().trim()
                if (text.isNotEmpty()) {
                    selectedSport = text
                    setSelectedValue(binding.tvSport, text)
                    dialog.dismiss()
                }
            }
        }
        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    // (7) 근무형태
    private fun showJobTypeDialog() {
        val items = JobType.entries.map { it.label }
        val currentIndex = selectedJobType?.let { JobType.entries.indexOf(it) } ?: -1
        showIosDialog(R.drawable.ic_work, "근무형태", "근무형태를 선택하세요", items, currentIndex) { which ->
            selectedJobType = JobType.entries[which]
            setSelectedValue(binding.tvJobType, selectedJobType!!.label)
        }
    }

    // (8) 급여
    private fun showSalaryDialog() {
        val items = listOf("시급", "월급", "건당", "협의")
        val currentIndex = selectedSalary?.let { SalaryType.entries.indexOf(it.type) } ?: -1
        showIosDialog(R.drawable.ic_work, "급여", "급여 유형을 선택하세요", items, currentIndex) { which ->
            val type = SalaryType.entries[which]
            if (type == SalaryType.NEGOTIABLE) {
                selectedSalary = SalaryInfo(type, null,
                    selectedSalary?.hasIncentive ?: false,
                    selectedSalary?.canDailyOrWeeklyPay ?: false)
                setSelectedValue(binding.tvSalary, selectedSalary!!.toSummary())
            } else {
                showSalaryAmountInput(type)
            }
        }
    }

    private fun showSalaryAmountInput(type: SalaryType) {
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_work)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "${type.label} 금액 입력"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "금액을 입력하고 옵션을 선택하세요"

        val container = dialogView.findViewById<LinearLayout>(R.id.layout_items)
        val dp8 = (8 * resources.displayMetrics.density).toInt()

        val etAmount = EditText(requireContext()).apply {
            hint = "금액을 입력하세요"
            inputType = InputType.TYPE_CLASS_NUMBER
            textSize = 15f
            selectedSalary?.let { if (it.type == type && it.amount != null) setText(it.amount.toString()) }
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { bottomMargin = dp8 }
        }
        val cbIncentive = CheckBox(requireContext()).apply {
            text = "인센티브 있음"
            textSize = 14f
            isChecked = selectedSalary?.hasIncentive ?: false
        }
        val cbDailyWeekly = CheckBox(requireContext()).apply {
            text = "주급/당일지급 가능"
            textSize = 14f
            isChecked = selectedSalary?.canDailyOrWeeklyPay ?: false
        }
        container.addView(etAmount)
        container.addView(cbIncentive)
        container.addView(cbDailyWeekly)

        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).apply {
            visibility = View.VISIBLE
            text = "확인"
            setOnClickListener {
                val amount = etAmount.text.toString().replace(",", "").trim().toIntOrNull()
                if (amount == null || amount <= 0) {
                    Toast.makeText(requireContext(), "올바른 금액을 입력하세요", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                selectedSalary = SalaryInfo(type, amount, cbIncentive.isChecked, cbDailyWeekly.isChecked)
                setSelectedValue(binding.tvSalary, selectedSalary!!.toSummary())
                dialog.dismiss()
            }
        }
        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    // (9) 모집 인원
    private fun showHeadcountDialog() {
        val items = listOf("1명", "2~3명", "4명 이상", "직접 입력")
        val currentIndex = when (selectedHeadcount) {
            "1명" -> 0; "2~3명" -> 1; "4명 이상" -> 2; else -> -1
        }
        showIosDialog(R.drawable.ic_profile, "모집 인원", "모집 인원을 선택하세요", items, currentIndex) { which ->
            if (which == 3) {
                showCustomHeadcountInput()
            } else {
                selectedHeadcount = items[which]
                setSelectedValue(binding.tvHeadcount, selectedHeadcount!!)
            }
        }
    }

    private fun showCustomHeadcountInput() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_ios_list, null)
        val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        dialogView.findViewById<android.widget.ImageView>(R.id.iv_icon).setImageResource(R.drawable.ic_profile)
        dialogView.findViewById<android.widget.TextView>(R.id.tv_title).text = "모집 인원 직접 입력"
        dialogView.findViewById<android.widget.TextView>(R.id.tv_subtitle).text = "인원 수를 입력하세요"

        val container = dialogView.findViewById<LinearLayout>(R.id.layout_items)
        val et = EditText(requireContext()).apply {
            hint = "인원 수"
            inputType = InputType.TYPE_CLASS_NUMBER
            textSize = 15f
        }
        container.addView(et)

        dialogView.findViewById<android.widget.TextView>(R.id.btn_confirm).apply {
            visibility = View.VISIBLE
            text = "확인"
            setOnClickListener {
                val text = et.text.toString().trim()
                if (text.isNotEmpty()) {
                    selectedHeadcount = "${text}명"
                    setSelectedValue(binding.tvHeadcount, selectedHeadcount!!)
                    dialog.dismiss()
                }
            }
        }
        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener { dialog.dismiss() }
        dialog.show()
    }

    // (10) 우대 조건
    private fun showPreferencesDialog() {
        val items = JobPreference.entries.map { it.label }
        val checked = BooleanArray(items.size) { selectedPreferences.contains(JobPreference.entries[it]) }
        showIosMultiChoiceDialog(R.drawable.ic_check, "우대 조건", "해당 항목을 선택하세요", items, checked) { result ->
            selectedPreferences = JobPreference.entries.filterIndexed { i, _ -> result[i] }
            if (selectedPreferences.isEmpty()) {
                binding.tvPreferences.text = "우대 조건을 선택하세요"
                binding.tvPreferences.setTextColor(resources.getColor(R.color.app_text_hint, null))
                binding.tvPreferences.setTypeface(null, Typeface.NORMAL)
            } else {
                setSelectedValue(binding.tvPreferences, selectedPreferences.joinToString(", ") { it.label })
            }
        }
    }

    // (11) 복리후생
    private fun showBenefitsDialog() {
        val items = JobBenefit.entries.map { it.label }
        val checked = BooleanArray(items.size) { selectedBenefits.contains(JobBenefit.entries[it]) }
        showIosMultiChoiceDialog(R.drawable.ic_favorite, "복리후생", "해당 항목을 선택하세요", items, checked) { result ->
            selectedBenefits = JobBenefit.entries.filterIndexed { i, _ -> result[i] }
            if (selectedBenefits.isEmpty()) {
                binding.tvBenefits.text = "복리후생을 선택하세요"
                binding.tvBenefits.setTextColor(resources.getColor(R.color.app_text_hint, null))
                binding.tvBenefits.setTypeface(null, Typeface.NORMAL)
            } else {
                setSelectedValue(binding.tvBenefits, selectedBenefits.joinToString(", ") { it.label })
            }
        }
    }

    // (6-1) 모집기간
    private fun showDeadlineDialog() {
        val items = listOf("상시모집", "정원마감시", "직접 입력")
        val currentIndex = when (selectedDeadline) {
            "상시모집" -> 0; "정원마감시" -> 1; else -> -1
        }
        showIosDialog(R.drawable.ic_description, "모집기간", "모집기간을 선택하세요", items, currentIndex) { which ->
            when (which) {
                0 -> {
                    selectedDeadline = "상시모집"
                    setSelectedValue(binding.tvDeadline, selectedDeadline!!)
                }
                1 -> {
                    selectedDeadline = "정원마감시"
                    setSelectedValue(binding.tvDeadline, selectedDeadline!!)
                }
                2 -> showDatePickerDialog()
            }
        }
    }

    private fun showDatePickerDialog() {
        val cal = Calendar.getInstance()
        lastSelectedDate?.let {
            try {
                val parts = it.split(".")
                if (parts.size == 3) cal.set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt())
            } catch (_: Exception) {}
        }
        DatePickerDialog(
            requireContext(),
            { _, year, month, dayOfMonth ->
                val dateStr = String.format("%d.%02d.%02d", year, month + 1, dayOfMonth)
                selectedDeadline = "${dateStr}까지"
                lastSelectedDate = dateStr
                setSelectedValue(binding.tvDeadline, selectedDeadline!!)
            },
            cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)
        ).apply {
            datePicker.minDate = System.currentTimeMillis() - 1000
            setOnShowListener {
                getButton(DatePickerDialog.BUTTON_POSITIVE).text = "확인"
                getButton(DatePickerDialog.BUTTON_NEGATIVE).text = "취소"
            }
        }.show()
    }

    // (4) 연락처 유형
    private fun showContactTypeDialog() {
        val options = listOf("연락처", "카카오ID", "이메일")
        val currentIndex = options.indexOf(selectedContactType)
        showIosDialog(R.drawable.ic_description, "연락처 유형", "연락처 유형을 선택하세요", options, currentIndex) { which ->
            selectedContactType = options[which]
            setSelectedValue(binding.tvContactType, selectedContactType)
            binding.etContact.text?.clear()
            when (selectedContactType) {
                "연락처" -> {
                    binding.etContact.hint = "010-1234-1234 또는 02-123-1234"
                    binding.etContact.inputType = InputType.TYPE_CLASS_PHONE
                }
                "카카오ID" -> {
                    binding.etContact.hint = "아이디를 입력하세요"
                    binding.etContact.inputType = InputType.TYPE_CLASS_TEXT
                }
                "이메일" -> {
                    binding.etContact.hint = "이메일을 입력하세요"
                    binding.etContact.inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                }
            }
        }
    }

    // ====================================================
    // 지역 미선택 에러 표시
    // ====================================================
    private fun showRegionError() {
        // 최상단으로 스크롤
        binding.scrollView.smoothScrollTo(0, 0)

        // 지역 텍스트 빨간색으로 변경
        binding.tvRegionDisplay.setTextColor(resources.getColor(R.color.app_badge_new_text, null))

        // 2초 후 색상 복원
        Handler(Looper.getMainLooper()).postDelayed({
            if (_binding == null) return@postDelayed
            binding.tvRegionDisplay.setTextColor(resources.getColor(R.color.app_text_secondary, null))
        }, 2000)
    }

    // ====================================================
    // 폼 검증 → (에러 목록, 첫 번째 에러 뷰)
    // ====================================================
    private fun validateForm(): Pair<List<String>, View?> {
        val centerName = binding.etCenterName.text?.toString()?.trim() ?: ""
        val address = binding.etAddress.text?.toString()?.trim() ?: ""
        val title = binding.etTitle.text?.toString()?.trim() ?: ""
        val contact = binding.etContact.text?.toString()?.trim() ?: ""
        val description = binding.etDescription.text?.toString()?.trim() ?: ""
        val authorName = binding.etAuthorName.text?.toString()?.trim() ?: ""
        val authorRoleSelected = binding.toggleAuthorRole.checkedButtonId != -1

        // TextInputLayout 에러 표시
        binding.tilCenterName.error = if (centerName.isEmpty()) "필수 입력사항입니다" else null
        binding.tilAddress.error = if (address.isEmpty()) "필수 입력사항입니다" else null
        binding.tilAuthorName.error = if (authorName.isEmpty()) "필수 입력사항입니다" else null
        binding.tilContact.error = if (contact.isEmpty()) "필수 입력사항입니다" else null
        binding.tilTitle.error = if (title.isEmpty()) "필수 입력사항입니다" else null
        binding.tilDescription.error = if (description.length < 20) "20자 이상 입력해 주세요" else null

        val errors = mutableListOf<String>()
        var firstErrorView: View? = null

        fun addError(msg: String, view: View) {
            errors.add(msg)
            if (firstErrorView == null) firstErrorView = view
        }

        // 순서대로 검증 (화면 배치 순서)
        if (selectedSport == null) addError("종목", binding.rowSport)
        if (centerName.isEmpty()) addError("업체명", binding.tilCenterName)
        if (address.isEmpty()) addError("업체 주소", binding.tilAddress)
        if (!authorRoleSelected) addError("작성자 직책", binding.layoutAuthor)
        if (authorName.isEmpty()) addError("작성자 이름", binding.tilAuthorName)
        if (contact.isEmpty()) addError("담당자 연락처", binding.layoutContact)
        if (title.isEmpty()) addError("구인 제목", binding.tilTitle)
        if (description.length < 20) addError("내용 (20자 이상)", binding.tilDescription)
        if (selectedDeadline == null) addError("모집기간", binding.rowDeadline)
        if (selectedJobType == null) addError("근무형태", binding.rowJobType)
        if (selectedSalary == null) addError("급여", binding.rowSalary)
        if (selectedHeadcount == null) addError("모집 인원", binding.rowHeadcount)
        if (!binding.cbAgreement.isChecked) addError("책임 동의 체크", binding.layoutAgreement)

        return Pair(errors, firstErrorView)
    }

    // ====================================================
    // 첫 번째 에러 뷰로 스크롤
    // ====================================================
    private fun scrollToView(targetView: View) {
        binding.scrollView.post {
            val rect = Rect()
            targetView.getDrawingRect(rect)
            binding.scrollView.offsetDescendantRectToMyCoords(targetView, rect)
            binding.scrollView.smoothScrollTo(0, (rect.top - 50).coerceAtLeast(0))
        }
    }

    // ====================================================
    // 등록 제출
    // ====================================================
    private fun submitForm() {
        val centerName = binding.etCenterName.text?.toString()?.trim() ?: ""
        val address = binding.etAddress.text?.toString()?.trim() ?: ""
        val title = binding.etTitle.text?.toString()?.trim() ?: ""
        val contact = binding.etContact.text?.toString()?.trim() ?: ""
        val description = binding.etDescription.text?.toString()?.trim() ?: ""
        val authorName = binding.etAuthorName.text?.toString()?.trim() ?: ""

        val authorRole = when (binding.toggleAuthorRole.checkedButtonId) {
            R.id.btn_role_manager -> "관리자"
            R.id.btn_role_ceo -> "대표"
            R.id.btn_role_other -> "기타"
            else -> ""
        }

        if (description.length < 20) {
            binding.tilDescription.error = "내용은 20자 이상 입력해 주세요."
            return
        }
        binding.tilDescription.error = null

        val request = JobPostRequest(
            regionCode = regionCode,
            regionName = regionName,
            sport = selectedSport!!,
            jobType = selectedJobType!!,
            centerName = centerName,
            address = address,
            authorRole = authorRole,
            authorName = authorName,
            contactType = selectedContactType,
            title = title,
            salary = selectedSalary!!,
            contact = contact,
            description = description,
            headcount = selectedHeadcount,
            benefits = selectedBenefits,
            preferences = selectedPreferences,
            deadline = selectedDeadline ?: ""
        )

        viewModel.submitJobPost(request)
    }

    // ====================================================
    // ViewModel 관찰
    // ====================================================
    private fun observeViewModel() {
        viewModel.submitResult.observe(viewLifecycleOwner) { success ->
            if (success) {
                com.moduji.app.util.MyActivityTracker.incrementJobPostCount(requireContext())
                showCenterSplash("게시되었습니다")
                if (repostJobId > 0) {
                    // 재게시 완료 → 이전 화면으로 돌아감
                    findNavController().popBackStack()
                } else {
                    val bundle = Bundle().apply {
                        putString("regionCode", regionCode)
                        putString("regionName", regionName)
                    }
                    findNavController().navigate(R.id.action_jobWrite_to_jobsList, bundle)
                }
            } else {
                Toast.makeText(requireContext(), "등록에 실패했습니다. 다시 시도해 주세요.", Toast.LENGTH_SHORT).show()
            }
        }

        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            binding.btnSubmit.isEnabled = !loading
            binding.btnSubmit.text = if (loading) "등록 중..." else "구인 등록하기"
        }
    }

    // ====================================================
    // 재게시 데이터 로드 (기존 구인글 내용 프리필)
    // ====================================================
    private fun loadRepostData() {
        viewLifecycleOwner.lifecycleScope.launch {
            val raw = JobsRepository.getJobPostRaw(repostJobId).getOrNull() ?: return@launch

            // 텍스트 필드
            binding.etCenterName.setText(raw.centerName)
            binding.etAddress.setText(raw.address)
            binding.etTitle.setText(raw.title)
            binding.etDescription.setText(raw.description)
            binding.etContact.setText(raw.contact)

            // 작성자 역할
            when (raw.authorRole) {
                "관리자" -> binding.toggleAuthorRole.check(R.id.btn_role_manager)
                "대표" -> binding.toggleAuthorRole.check(R.id.btn_role_ceo)
                "기타" -> binding.toggleAuthorRole.check(R.id.btn_role_other)
            }
            binding.etAuthorName.setText(raw.authorName)

            // 연락처 유형
            if (raw.contactType.isNotEmpty()) {
                selectedContactType = raw.contactType
                setSelectedValue(binding.tvContactType, selectedContactType)
                when (selectedContactType) {
                    "카카오ID" -> binding.etContact.inputType = InputType.TYPE_CLASS_TEXT
                    "이메일" -> binding.etContact.inputType = InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
                }
            }

            // 종목
            if (raw.sport.isNotEmpty()) {
                selectedSport = raw.sport
                setSelectedValue(binding.tvSport, selectedSport!!)
            }

            // 근무형태
            val jobType = JobType.entries.find { it.label == raw.employmentType }
            if (jobType != null) {
                selectedJobType = jobType
                setSelectedValue(binding.tvJobType, jobType.label)
            }

            // 급여 파싱
            parseSalary(raw.salary)

            // 모집 인원
            if (raw.headcount.isNotEmpty()) {
                selectedHeadcount = raw.headcount
                setSelectedValue(binding.tvHeadcount, selectedHeadcount!!)
            }

            // 모집기간
            if (raw.deadline.isNotEmpty()) {
                selectedDeadline = raw.deadline
                setSelectedValue(binding.tvDeadline, selectedDeadline!!)
            }

            // 우대조건
            if (raw.preferences.isNotEmpty()) {
                selectedPreferences = raw.preferences.split(", ").mapNotNull { label ->
                    JobPreference.entries.find { it.label == label }
                }
                if (selectedPreferences.isNotEmpty()) {
                    setSelectedValue(binding.tvPreferences, selectedPreferences.joinToString(", ") { it.label })
                }
            }

            // 복리후생
            if (raw.benefits.isNotEmpty()) {
                selectedBenefits = raw.benefits.split(", ").mapNotNull { label ->
                    JobBenefit.entries.find { it.label == label }
                }
                if (selectedBenefits.isNotEmpty()) {
                    setSelectedValue(binding.tvBenefits, selectedBenefits.joinToString(", ") { it.label })
                }
            }
        }
    }

    private fun parseSalary(salaryStr: String) {
        if (salaryStr.isEmpty()) return

        val hasIncentive = salaryStr.contains("인센티브")
        val canDailyWeekly = salaryStr.contains("주급/당일지급")
        val base = salaryStr.split(" + ").firstOrNull()?.trim() ?: salaryStr

        val type: SalaryType
        val amount: Int?

        when {
            base.startsWith("급여 협의") || base == "협의" -> {
                type = SalaryType.NEGOTIABLE
                amount = null
            }
            base.startsWith("시급") -> {
                type = SalaryType.HOURLY
                amount = base.replace(Regex("[^0-9]"), "").toIntOrNull()
            }
            base.startsWith("월급") -> {
                type = SalaryType.MONTHLY
                amount = base.replace(Regex("[^0-9]"), "").toIntOrNull()
            }
            base.startsWith("건당") -> {
                type = SalaryType.PER_CASE
                amount = base.replace(Regex("[^0-9]"), "").toIntOrNull()
            }
            else -> {
                // 파싱 실패 - 텍스트만 표시
                setSelectedValue(binding.tvSalary, salaryStr)
                return
            }
        }

        selectedSalary = SalaryInfo(type, amount, hasIncentive, canDailyWeekly)
        setSelectedValue(binding.tvSalary, selectedSalary!!.toSummary())
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
