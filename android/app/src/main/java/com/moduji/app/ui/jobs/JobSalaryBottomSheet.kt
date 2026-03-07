package com.moduji.app.ui.jobs

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import java.text.DecimalFormat
import androidx.core.os.bundleOf
import androidx.fragment.app.setFragmentResult
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.moduji.app.R
import com.moduji.app.data.model.SalaryType
import com.moduji.app.databinding.BottomSheetJobSalaryBinding

/**
 * 급여 선택 BottomSheet
 *
 * - 1단계: 급여 유형 (시급/월급/건당/협의)
 * - 2단계: 금액 입력 (협의 제외)
 * - 추가: 인센티브, 주급/당일지급 체크박스
 * - Fragment Result API로 결과 전달 (key: "salary_result")
 */
class JobSalaryBottomSheet : BottomSheetDialogFragment() {

    companion object {
        const val TAG = "JobSalaryBottomSheet"
        const val RESULT_KEY = "salary_result"

        fun newInstance(
            type: SalaryType? = null,
            amount: Int? = null,
            hasIncentive: Boolean = false,
            canDailyWeekly: Boolean = false
        ) = JobSalaryBottomSheet().apply {
            arguments = Bundle().apply {
                type?.let { putString("type", it.name) }
                amount?.let { putInt("amount", it) }
                putBoolean("incentive", hasIncentive)
                putBoolean("daily_weekly", canDailyWeekly)
            }
        }
    }

    private var _binding: BottomSheetJobSalaryBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetJobSalaryBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 콤마 자동 포맷 TextWatcher
        val decimalFormat = DecimalFormat("#,###")
        var isFormatting = false
        binding.etAmount.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (isFormatting || s.isNullOrEmpty()) return
                isFormatting = true
                val raw = s.toString().replace(",", "")
                val number = raw.toLongOrNull()
                if (number != null) {
                    val formatted = decimalFormat.format(number)
                    binding.etAmount.setText(formatted)
                    binding.etAmount.setSelection(formatted.length)
                }
                isFormatting = false
            }
        })

        // 기존 값 복원
        arguments?.let { args ->
            args.getString("type")?.let { typeName ->
                val radioId = when (SalaryType.valueOf(typeName)) {
                    SalaryType.HOURLY -> R.id.rb_hourly
                    SalaryType.MONTHLY -> R.id.rb_monthly
                    SalaryType.PER_CASE -> R.id.rb_per_case
                    SalaryType.NEGOTIABLE -> R.id.rb_negotiable
                }
                binding.rgSalaryType.check(radioId)
                updateAmountVisibility(SalaryType.valueOf(typeName))
                if (args.containsKey("amount")) {
                    val amt = args.getInt("amount")
                    if (amt > 0) binding.etAmount.setText(decimalFormat.format(amt))
                }
            }
            binding.cbIncentive.isChecked = args.getBoolean("incentive")
            binding.cbDailyWeekly.isChecked = args.getBoolean("daily_weekly")
        }

        // 급여 유형 변경 시 금액 입력 필드 표시/숨김
        binding.rgSalaryType.setOnCheckedChangeListener { _, checkedId ->
            val type = radioIdToSalaryType(checkedId)
            updateAmountVisibility(type)
        }

        binding.btnCancel.setOnClickListener { dismiss() }

        binding.btnConfirm.setOnClickListener {
            val checkedId = binding.rgSalaryType.checkedRadioButtonId
            if (checkedId == -1) return@setOnClickListener

            val type = radioIdToSalaryType(checkedId) ?: return@setOnClickListener
            val amount = if (type == SalaryType.NEGOTIABLE) null
                         else binding.etAmount.text?.toString()?.replace(",", "")?.toIntOrNull()

            // 협의가 아닌 경우 금액 필수
            if (type != SalaryType.NEGOTIABLE && (amount == null || amount <= 0)) {
                binding.tilAmount.error = "금액을 입력하세요"
                return@setOnClickListener
            }

            setFragmentResult(RESULT_KEY, bundleOf(
                "type" to type.name,
                "amount" to (amount ?: -1),
                "incentive" to binding.cbIncentive.isChecked,
                "daily_weekly" to binding.cbDailyWeekly.isChecked
            ))
            dismiss()
        }
    }

    private fun radioIdToSalaryType(id: Int): SalaryType? = when (id) {
        R.id.rb_hourly -> SalaryType.HOURLY
        R.id.rb_monthly -> SalaryType.MONTHLY
        R.id.rb_per_case -> SalaryType.PER_CASE
        R.id.rb_negotiable -> SalaryType.NEGOTIABLE
        else -> null
    }

    private fun updateAmountVisibility(type: SalaryType?) {
        binding.tilAmount.visibility = if (type == SalaryType.NEGOTIABLE || type == null) View.GONE else View.VISIBLE
        if (type == SalaryType.NEGOTIABLE) {
            binding.tilAmount.error = null
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
