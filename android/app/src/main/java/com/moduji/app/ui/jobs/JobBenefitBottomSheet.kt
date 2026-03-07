package com.moduji.app.ui.jobs

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.os.bundleOf
import androidx.fragment.app.setFragmentResult
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.moduji.app.data.model.JobBenefit
import com.moduji.app.databinding.BottomSheetJobBenefitBinding

/**
 * 복리후생 선택 BottomSheet (다중 선택)
 *
 * - 6가지 항목 체크박스
 * - Fragment Result API로 결과 전달 (key: "benefit_result")
 */
class JobBenefitBottomSheet : BottomSheetDialogFragment() {

    companion object {
        const val TAG = "JobBenefitBottomSheet"
        const val RESULT_KEY = "benefit_result"

        fun newInstance(selected: List<JobBenefit> = emptyList()) = JobBenefitBottomSheet().apply {
            arguments = Bundle().apply {
                putStringArray("selected", selected.map { it.name }.toTypedArray())
            }
        }
    }

    private var _binding: BottomSheetJobBenefitBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetJobBenefitBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 기존 선택 복원
        val selected = arguments?.getStringArray("selected")?.toSet() ?: emptySet()
        binding.cbInsurance.isChecked = JobBenefit.INSURANCE.name in selected
        binding.cbIncentive.isChecked = JobBenefit.INCENTIVE.name in selected
        binding.cbMeal.isChecked = JobBenefit.MEAL.name in selected
        binding.cbMembership.isChecked = JobBenefit.MEMBERSHIP.name in selected
        binding.cbEducation.isChecked = JobBenefit.EDUCATION.name in selected
        binding.cbRetirement.isChecked = JobBenefit.RETIREMENT.name in selected

        binding.btnCancel.setOnClickListener { dismiss() }

        binding.btnConfirm.setOnClickListener {
            val result = mutableListOf<String>()
            if (binding.cbInsurance.isChecked) result.add(JobBenefit.INSURANCE.name)
            if (binding.cbIncentive.isChecked) result.add(JobBenefit.INCENTIVE.name)
            if (binding.cbMeal.isChecked) result.add(JobBenefit.MEAL.name)
            if (binding.cbMembership.isChecked) result.add(JobBenefit.MEMBERSHIP.name)
            if (binding.cbEducation.isChecked) result.add(JobBenefit.EDUCATION.name)
            if (binding.cbRetirement.isChecked) result.add(JobBenefit.RETIREMENT.name)

            setFragmentResult(RESULT_KEY, bundleOf("values" to result.toTypedArray()))
            dismiss()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
