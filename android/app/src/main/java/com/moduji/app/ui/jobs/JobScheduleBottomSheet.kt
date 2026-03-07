package com.moduji.app.ui.jobs

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.os.bundleOf
import androidx.fragment.app.setFragmentResult
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.google.android.material.timepicker.MaterialTimePicker
import com.google.android.material.timepicker.TimeFormat
import com.moduji.app.R
import com.moduji.app.data.model.DayOption
import com.moduji.app.data.model.TimeOption
import com.moduji.app.databinding.BottomSheetJobScheduleBinding
import java.time.DayOfWeek

/**
 * 근무요일·시간 선택 BottomSheet
 *
 * - 근무요일: 6가지 옵션 + 요일 직접 선택 시 체크박스
 * - 근무시간: 시간 직접 선택 (MaterialTimePicker) 또는 협의
 * - 추가: 휴게시간, 교대근무 체크박스
 * - Fragment Result API로 결과 전달 (key: "schedule_result")
 */
class JobScheduleBottomSheet : BottomSheetDialogFragment() {

    companion object {
        const val TAG = "JobScheduleBottomSheet"
        const val RESULT_KEY = "schedule_result"

        fun newInstance() = JobScheduleBottomSheet()
    }

    private var _binding: BottomSheetJobScheduleBinding? = null
    private val binding get() = _binding!!

    private var startHour = -1
    private var startMinute = -1
    private var endHour = -1
    private var endMinute = -1

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetJobScheduleBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 요일 옵션 변경 시 직접 선택 체크박스 표시/숨김
        binding.rgDayOption.setOnCheckedChangeListener { _, checkedId ->
            binding.layoutCustomDays.visibility =
                if (checkedId == R.id.rb_custom_days) View.VISIBLE else View.GONE
        }

        // 시간 옵션 변경 시 시간 선택 영역 표시/숨김
        binding.rgTimeOption.setOnCheckedChangeListener { _, checkedId ->
            binding.layoutTimePicker.visibility =
                if (checkedId == R.id.rb_fixed_time) View.VISIBLE else View.GONE
        }

        // 시작 시간 클릭 → MaterialTimePicker
        binding.tvStartTime.setOnClickListener {
            showTimePicker("시작 시간", startHour.coerceAtLeast(9), startMinute.coerceAtLeast(0)) { h, m ->
                startHour = h; startMinute = m
                binding.tvStartTime.text = String.format("%02d:%02d", h, m)
                binding.tvStartTime.setTextColor(resources.getColor(R.color.app_text_secondary, null))
            }
        }

        // 종료 시간 클릭 → MaterialTimePicker
        binding.tvEndTime.setOnClickListener {
            showTimePicker("종료 시간", endHour.coerceAtLeast(18), endMinute.coerceAtLeast(0)) { h, m ->
                endHour = h; endMinute = m
                binding.tvEndTime.text = String.format("%02d:%02d", h, m)
                binding.tvEndTime.setTextColor(resources.getColor(R.color.app_text_secondary, null))
            }
        }

        binding.btnCancel.setOnClickListener { dismiss() }

        binding.btnConfirm.setOnClickListener {
            val dayOption = when (binding.rgDayOption.checkedRadioButtonId) {
                R.id.rb_weekdays -> DayOption.WEEKDAYS
                R.id.rb_weekends -> DayOption.WEEKENDS
                R.id.rb_five_days -> DayOption.FIVE_DAYS
                R.id.rb_six_days -> DayOption.SIX_DAYS
                R.id.rb_custom_days -> DayOption.CUSTOM_DAYS
                R.id.rb_day_negotiable -> DayOption.NEGOTIABLE
                else -> null
            } ?: return@setOnClickListener

            // 요일 직접 선택인 경우 커스텀 요일 수집
            val customDays = if (dayOption == DayOption.CUSTOM_DAYS) {
                mutableListOf<String>().apply {
                    if (binding.cbMon.isChecked) add(DayOfWeek.MONDAY.name)
                    if (binding.cbTue.isChecked) add(DayOfWeek.TUESDAY.name)
                    if (binding.cbWed.isChecked) add(DayOfWeek.WEDNESDAY.name)
                    if (binding.cbThu.isChecked) add(DayOfWeek.THURSDAY.name)
                    if (binding.cbFri.isChecked) add(DayOfWeek.FRIDAY.name)
                    if (binding.cbSat.isChecked) add(DayOfWeek.SATURDAY.name)
                    if (binding.cbSun.isChecked) add(DayOfWeek.SUNDAY.name)
                }.toTypedArray()
            } else emptyArray()

            val timeOption = when (binding.rgTimeOption.checkedRadioButtonId) {
                R.id.rb_fixed_time -> TimeOption.FIXED
                R.id.rb_time_negotiable -> TimeOption.NEGOTIABLE
                else -> null
            } ?: return@setOnClickListener

            setFragmentResult(RESULT_KEY, bundleOf(
                "day_option" to dayOption.name,
                "custom_days" to customDays,
                "time_option" to timeOption.name,
                "start_hour" to startHour,
                "start_minute" to startMinute,
                "end_hour" to endHour,
                "end_minute" to endMinute,
                "has_break" to binding.cbBreakTime.isChecked,
                "is_shift" to binding.cbShiftWork.isChecked
            ))
            dismiss()
        }
    }

    private fun showTimePicker(title: String, defaultHour: Int, defaultMinute: Int, onSelected: (Int, Int) -> Unit) {
        val picker = MaterialTimePicker.Builder()
            .setTimeFormat(TimeFormat.CLOCK_24H)
            .setHour(defaultHour)
            .setMinute(defaultMinute)
            .setTitleText(title)
            .build()

        picker.addOnPositiveButtonClickListener {
            onSelected(picker.hour, picker.minute)
        }
        picker.show(childFragmentManager, "time_picker_$title")
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
