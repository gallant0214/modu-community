package com.moduji.app.ui.jobs

import android.app.DatePickerDialog
import android.content.res.Configuration
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.os.bundleOf
import androidx.fragment.app.setFragmentResult
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.moduji.app.R
import com.moduji.app.databinding.BottomSheetJobDeadlineBinding
import java.util.Calendar
import java.util.Locale

/**
 * 모집기간 선택 BottomSheet
 *
 * - 직접 입력: DatePicker로 날짜 선택
 * - 상시모집 / 정원마감시: 즉시 결과 전달
 */
class JobDeadlineBottomSheet : BottomSheetDialogFragment() {

    companion object {
        const val TAG = "JobDeadlineBottomSheet"
        const val RESULT_KEY = "deadline_result"

        fun newInstance(current: String? = null, lastDate: String? = null) =
            JobDeadlineBottomSheet().apply {
                arguments = Bundle().apply {
                    current?.let { putString("current", it) }
                    lastDate?.let { putString("last_date", it) }
                }
            }
    }

    private var _binding: BottomSheetJobDeadlineBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = BottomSheetJobDeadlineBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val restoring = booleanArrayOf(false)
        val current = arguments?.getString("current")
        val lastDate = arguments?.getString("last_date")

        // 기존 선택값 복원
        current?.let {
            restoring[0] = true
            when (it) {
                "상시모집" -> binding.rgDeadline.check(R.id.rb_always)
                "정원마감시" -> binding.rgDeadline.check(R.id.rb_until_full)
                else -> binding.rgDeadline.check(R.id.rb_custom_date)
            }
            restoring[0] = false
        }

        binding.rgDeadline.setOnCheckedChangeListener { _, checkedId ->
            if (restoring[0]) return@setOnCheckedChangeListener

            when (checkedId) {
                R.id.rb_always -> {
                    setFragmentResult(RESULT_KEY, bundleOf("value" to "상시모집"))
                    dismiss()
                }
                R.id.rb_until_full -> {
                    setFragmentResult(RESULT_KEY, bundleOf("value" to "정원마감시"))
                    dismiss()
                }
                R.id.rb_custom_date -> {
                    showDatePicker(lastDate)
                }
            }
        }
    }

    private fun showDatePicker(lastDate: String?) {
        val cal = Calendar.getInstance()

        // 마지막 선택 날짜가 있으면 복원
        lastDate?.let {
            try {
                val parts = it.split(".")
                if (parts.size == 3) {
                    cal.set(parts[0].toInt(), parts[1].toInt() - 1, parts[2].toInt())
                }
            } catch (_: Exception) {}
        }

        // 한국어 로케일 강제 적용
        val koLocale = Locale("ko", "KR")
        val savedLocale = Locale.getDefault()
        Locale.setDefault(koLocale)

        val resources = requireActivity().resources
        val savedConfig = Configuration(resources.configuration)
        val koConfig = Configuration(savedConfig).apply { setLocale(koLocale) }
        @Suppress("DEPRECATION")
        resources.updateConfiguration(koConfig, resources.displayMetrics)

        val picker = DatePickerDialog(
            requireActivity(),
            { _, year, month, dayOfMonth ->
                val dateStr = String.format("%d.%02d.%02d", year, month + 1, dayOfMonth)
                setFragmentResult(RESULT_KEY, bundleOf("value" to "${dateStr}까지"))
                dismiss()
            },
            cal.get(Calendar.YEAR),
            cal.get(Calendar.MONTH),
            cal.get(Calendar.DAY_OF_MONTH)
        )

        // 로케일 복원
        Locale.setDefault(savedLocale)
        @Suppress("DEPRECATION")
        resources.updateConfiguration(savedConfig, resources.displayMetrics)

        // 오늘 이후만 선택 가능
        picker.datePicker.minDate = System.currentTimeMillis() - 1000

        // 버튼 텍스트 한글로
        picker.setOnShowListener {
            picker.getButton(DatePickerDialog.BUTTON_POSITIVE).text = "확인"
            picker.getButton(DatePickerDialog.BUTTON_NEGATIVE).text = "취소"
        }

        picker.setOnCancelListener {
            // 날짜 선택 취소 시 라디오 버튼 초기화
            binding.rgDeadline.clearCheck()
        }

        picker.show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
