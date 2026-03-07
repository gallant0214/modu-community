package com.moduji.app.ui.jobs

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.os.bundleOf
import androidx.fragment.app.setFragmentResult
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.moduji.app.R
import com.moduji.app.data.model.JobType
import com.moduji.app.databinding.BottomSheetJobTypeBinding

/**
 * 근무형태 선택 BottomSheet
 *
 * - 7가지 근무형태 중 하나를 선택
 * - Fragment Result API로 결과 전달 (key: "job_type_result")
 */
class JobTypeBottomSheet : BottomSheetDialogFragment() {

    companion object {
        const val TAG = "JobTypeBottomSheet"
        const val RESULT_KEY = "job_type_result"
        const val ARG_SELECTED = "selected_type"

        fun newInstance(selected: JobType? = null) = JobTypeBottomSheet().apply {
            arguments = Bundle().apply {
                selected?.let { putString(ARG_SELECTED, it.name) }
            }
        }
    }

    private var _binding: BottomSheetJobTypeBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetJobTypeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 기존 선택값 복원 (체크만, 즉시 닫지 않음)
        val restoringSelection = booleanArrayOf(false)
        arguments?.getString(ARG_SELECTED)?.let { name ->
            val radioId = when (JobType.valueOf(name)) {
                JobType.FULL_TIME -> R.id.rb_full_time
                JobType.CONTRACT -> R.id.rb_contract
                JobType.PART_TIME_JOB -> R.id.rb_part_time_job
                JobType.FREELANCER -> R.id.rb_freelancer
                JobType.PART_TIME -> R.id.rb_part_time
                JobType.TRAINEE -> R.id.rb_trainee
                JobType.INTERN -> R.id.rb_intern
            }
            restoringSelection[0] = true
            binding.rgJobType.check(radioId)
            restoringSelection[0] = false
        }

        // 선택 즉시 결과 전달 후 닫기
        binding.rgJobType.setOnCheckedChangeListener { _, checkedId ->
            if (restoringSelection[0]) return@setOnCheckedChangeListener
            val selected = when (checkedId) {
                R.id.rb_full_time -> JobType.FULL_TIME
                R.id.rb_contract -> JobType.CONTRACT
                R.id.rb_part_time_job -> JobType.PART_TIME_JOB
                R.id.rb_freelancer -> JobType.FREELANCER
                R.id.rb_part_time -> JobType.PART_TIME
                R.id.rb_trainee -> JobType.TRAINEE
                R.id.rb_intern -> JobType.INTERN
                else -> null
            }
            if (selected != null) {
                setFragmentResult(RESULT_KEY, bundleOf("value" to selected.name))
                dismiss()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
