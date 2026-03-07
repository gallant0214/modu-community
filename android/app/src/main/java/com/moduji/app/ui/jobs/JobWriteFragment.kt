package com.moduji.app.ui.jobs

import android.graphics.Rect
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.navigation.fragment.findNavController
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.moduji.app.R
import com.moduji.app.data.model.*
import com.moduji.app.databinding.FragmentJobWriteBinding
import com.moduji.app.util.NicknameManager
import com.moduji.app.util.showSubmitConfirmDialog

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        regionCode = arguments?.getString("regionCode") ?: ""
        regionName = arguments?.getString("regionName") ?: ""
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentJobWriteBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupRegionInfo()
        setupClickListeners()
        setupTextWatchers()
        setupBottomSheetResultListeners()
        observeViewModel()
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
            findNavController().getBackStackEntry(R.id.regionSelectFragment)
                .savedStateHandle["selectForWrite"] = true
            findNavController().popBackStack(R.id.regionSelectFragment, false)
        }
    }

    // ====================================================
    // 클릭 리스너 설정
    // ====================================================
    private fun setupClickListeners() {
        // 뒤로가기
        binding.btnBack.setOnClickListener {
            findNavController().navigateUp()
        }

        // (1) 종목 선택
        binding.rowSport.setOnClickListener {
            JobSportBottomSheet.newInstance(selectedSport)
                .show(childFragmentManager, JobSportBottomSheet.TAG)
        }

        // (7) 근무형태 선택
        binding.rowJobType.setOnClickListener {
            JobTypeBottomSheet.newInstance(selectedJobType)
                .show(childFragmentManager, JobTypeBottomSheet.TAG)
        }

        // (8) 급여 선택
        binding.rowSalary.setOnClickListener {
            JobSalaryBottomSheet.newInstance(
                type = selectedSalary?.type,
                amount = selectedSalary?.amount,
                hasIncentive = selectedSalary?.hasIncentive ?: false,
                canDailyWeekly = selectedSalary?.canDailyOrWeeklyPay ?: false
            ).show(childFragmentManager, JobSalaryBottomSheet.TAG)
        }

        // (9) 모집 인원
        binding.rowHeadcount.setOnClickListener {
            JobHeadcountBottomSheet.newInstance(selectedHeadcount)
                .show(childFragmentManager, JobHeadcountBottomSheet.TAG)
        }

        // (10) 우대 조건
        binding.rowPreferences.setOnClickListener {
            JobPreferenceBottomSheet.newInstance(selectedPreferences)
                .show(childFragmentManager, JobPreferenceBottomSheet.TAG)
        }

        // (11) 복리후생
        binding.rowBenefits.setOnClickListener {
            JobBenefitBottomSheet.newInstance(selectedBenefits)
                .show(childFragmentManager, JobBenefitBottomSheet.TAG)
        }

        // (6-1) 모집기간
        binding.rowDeadline.setOnClickListener {
            JobDeadlineBottomSheet.newInstance(selectedDeadline, lastSelectedDate)
                .show(childFragmentManager, JobDeadlineBottomSheet.TAG)
        }

        // (4) 연락처 유형 선택
        binding.rowContactType.setOnClickListener { showContactTypeBottomSheet() }

        // 등록 버튼
        binding.btnSubmit.isEnabled = true
        binding.btnSubmit.setOnClickListener {
            // 지역 미선택 검증
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
    // BottomSheet 결과 수신
    // ====================================================
    private fun setupBottomSheetResultListeners() {

        // (1) 종목 결과
        childFragmentManager.setFragmentResultListener(
            JobSportBottomSheet.RESULT_KEY, viewLifecycleOwner
        ) { _, bundle ->
            selectedSport = bundle.getString("value")
            binding.tvSport.text = selectedSport
            binding.tvSport.setTextColor(resources.getColor(R.color.app_text_secondary, null))
        }

        // (7) 근무형태 결과
        childFragmentManager.setFragmentResultListener(
            JobTypeBottomSheet.RESULT_KEY, viewLifecycleOwner
        ) { _, bundle ->
            selectedJobType = JobType.valueOf(bundle.getString("value")!!)
            binding.tvJobType.text = selectedJobType!!.label
            binding.tvJobType.setTextColor(resources.getColor(R.color.app_text_secondary, null))
        }

        // (8) 급여 결과
        childFragmentManager.setFragmentResultListener(
            JobSalaryBottomSheet.RESULT_KEY, viewLifecycleOwner
        ) { _, bundle ->
            val type = SalaryType.valueOf(bundle.getString("type")!!)
            val amount = bundle.getInt("amount").let { if (it == -1) null else it }
            selectedSalary = SalaryInfo(
                type = type,
                amount = amount,
                hasIncentive = bundle.getBoolean("incentive"),
                canDailyOrWeeklyPay = bundle.getBoolean("daily_weekly")
            )
            binding.tvSalary.text = selectedSalary!!.toSummary()
            binding.tvSalary.setTextColor(resources.getColor(R.color.app_text_secondary, null))
        }

        // (9) 모집 인원 결과
        childFragmentManager.setFragmentResultListener(
            JobHeadcountBottomSheet.RESULT_KEY, viewLifecycleOwner
        ) { _, bundle ->
            selectedHeadcount = bundle.getString("value")
            binding.tvHeadcount.text = selectedHeadcount
            binding.tvHeadcount.setTextColor(resources.getColor(R.color.app_text_secondary, null))
        }

        // (6-1) 모집기간 결과
        childFragmentManager.setFragmentResultListener(
            JobDeadlineBottomSheet.RESULT_KEY, viewLifecycleOwner
        ) { _, bundle ->
            selectedDeadline = bundle.getString("value")
            binding.tvDeadline.text = selectedDeadline
            binding.tvDeadline.setTextColor(resources.getColor(R.color.app_text_secondary, null))
            // 날짜 직접 입력인 경우 저장 (재편집용)
            if (selectedDeadline?.endsWith("까지") == true) {
                lastSelectedDate = selectedDeadline!!.removeSuffix("까지")
            }
        }

        // (10) 우대 조건 결과
        childFragmentManager.setFragmentResultListener(
            JobPreferenceBottomSheet.RESULT_KEY, viewLifecycleOwner
        ) { _, bundle ->
            selectedPreferences = bundle.getStringArray("values")
                ?.map { JobPreference.valueOf(it) } ?: emptyList()
            binding.tvPreferences.text = if (selectedPreferences.isEmpty()) "우대 조건을 선택하세요"
            else selectedPreferences.joinToString(", ") { it.label }
            binding.tvPreferences.setTextColor(
                resources.getColor(
                    if (selectedPreferences.isEmpty()) R.color.app_text_hint else R.color.app_text_secondary, null
                )
            )
        }

        // (11) 복리후생 결과
        childFragmentManager.setFragmentResultListener(
            JobBenefitBottomSheet.RESULT_KEY, viewLifecycleOwner
        ) { _, bundle ->
            selectedBenefits = bundle.getStringArray("values")
                ?.map { JobBenefit.valueOf(it) } ?: emptyList()
            binding.tvBenefits.text = if (selectedBenefits.isEmpty()) "복리후생을 선택하세요"
            else selectedBenefits.joinToString(", ") { it.label }
            binding.tvBenefits.setTextColor(
                resources.getColor(
                    if (selectedBenefits.isEmpty()) R.color.app_text_hint else R.color.app_text_secondary, null
                )
            )
        }
    }

    // ====================================================
    // 연락처 유형 선택 BottomSheet
    // ====================================================
    private fun showContactTypeBottomSheet() {
        val options = arrayOf("연락처", "카카오ID", "이메일")
        val dialog = BottomSheetDialog(requireContext())
        val listView = android.widget.ListView(requireContext()).apply {
            adapter = android.widget.ArrayAdapter(
                requireContext(),
                android.R.layout.simple_list_item_1,
                options
            )
            setOnItemClickListener { _, _, position, _ ->
                selectedContactType = options[position]
                binding.tvContactType.text = selectedContactType
                binding.etContact.text?.clear()
                when (selectedContactType) {
                    "연락처" -> {
                        binding.etContact.hint = ""
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
                dialog.dismiss()
            }
        }
        dialog.setContentView(listView)
        dialog.show()
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
        val title = binding.etTitle.text?.toString()?.trim() ?: ""
        val contact = binding.etContact.text?.toString()?.trim() ?: ""
        val description = binding.etDescription.text?.toString()?.trim() ?: ""
        val authorName = binding.etAuthorName.text?.toString()?.trim() ?: ""
        val authorRoleSelected = binding.toggleAuthorRole.checkedButtonId != -1

        // 에러 표시
        binding.tilContact.error = if (contact.isEmpty()) "필수 입력사항입니다" else null
        binding.tilDescription.error = if (description.length < 20) "필수 입력사항입니다" else null
        binding.tilAuthorName.error = if (authorName.isEmpty()) "필수 입력사항입니다" else null

        val errors = mutableListOf<String>()
        var firstErrorView: View? = null

        fun addError(msg: String, view: View) {
            errors.add(msg)
            if (firstErrorView == null) firstErrorView = view
        }

        // 순서대로 검증 (화면 배치 순서)
        if (selectedSport == null) addError("종목", binding.rowSport)
        if (centerName.isEmpty()) addError("센터/업체명", binding.tilCenterName)
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
            title = title,
            salary = selectedSalary!!,
            contact = contact,
            description = description,
            headcount = selectedHeadcount,
            benefits = selectedBenefits,
            preferences = selectedPreferences,
            deadline = selectedDeadline ?: ""
        )

        val nickname = NicknameManager.getNickname(requireContext()) ?: ""
        viewModel.submitJobPost(request, nickname)
    }

    // ====================================================
    // ViewModel 관찰
    // ====================================================
    private fun observeViewModel() {
        viewModel.submitResult.observe(viewLifecycleOwner) { success ->
            if (success) {
                com.moduji.app.util.MyActivityTracker.incrementJobPostCount(requireContext())
                Toast.makeText(requireContext(), "구인 글이 등록되었습니다.", Toast.LENGTH_SHORT).show()
                val bundle = Bundle().apply {
                    putString("regionCode", regionCode)
                    putString("regionName", regionName)
                }
                findNavController().navigate(R.id.action_jobWrite_to_jobsList, bundle)
            } else {
                Toast.makeText(requireContext(), "등록에 실패했습니다. 다시 시도해 주세요.", Toast.LENGTH_SHORT).show()
            }
        }

        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            binding.btnSubmit.isEnabled = !loading
            binding.btnSubmit.text = if (loading) "등록 중..." else "구인 등록하기"
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
