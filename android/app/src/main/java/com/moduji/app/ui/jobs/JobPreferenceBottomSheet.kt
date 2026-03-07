package com.moduji.app.ui.jobs

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.os.bundleOf
import androidx.fragment.app.setFragmentResult
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.moduji.app.data.model.JobPreference
import com.moduji.app.databinding.BottomSheetJobPreferenceBinding

/**
 * 우대 조건 선택 BottomSheet (다중 선택)
 *
 * - 7가지 항목 체크박스
 * - Fragment Result API로 결과 전달 (key: "preference_result")
 */
class JobPreferenceBottomSheet : BottomSheetDialogFragment() {

    companion object {
        const val TAG = "JobPreferenceBottomSheet"
        const val RESULT_KEY = "preference_result"

        fun newInstance(selected: List<JobPreference> = emptyList()) = JobPreferenceBottomSheet().apply {
            arguments = Bundle().apply {
                putStringArray("selected", selected.map { it.name }.toTypedArray())
            }
        }
    }

    private var _binding: BottomSheetJobPreferenceBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetJobPreferenceBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 기존 선택 복원
        val selected = arguments?.getStringArray("selected")?.toSet() ?: emptySet()
        binding.cbExperienced.isChecked = JobPreference.EXPERIENCED.name in selected
        binding.cbCertified.isChecked = JobPreference.CERTIFIED.name in selected
        binding.cbLongTerm.isChecked = JobPreference.LONG_TERM.name in selected
        binding.cbBeginner.isChecked = JobPreference.BEGINNER_OK.name in selected
        binding.cbNearby.isChecked = JobPreference.NEARBY.name in selected
        binding.cbStudent.isChecked = JobPreference.STUDENT_OK.name in selected
        binding.cbDriver.isChecked = JobPreference.DRIVER.name in selected

        binding.btnCancel.setOnClickListener { dismiss() }

        binding.btnConfirm.setOnClickListener {
            val result = mutableListOf<String>()
            if (binding.cbExperienced.isChecked) result.add(JobPreference.EXPERIENCED.name)
            if (binding.cbCertified.isChecked) result.add(JobPreference.CERTIFIED.name)
            if (binding.cbLongTerm.isChecked) result.add(JobPreference.LONG_TERM.name)
            if (binding.cbBeginner.isChecked) result.add(JobPreference.BEGINNER_OK.name)
            if (binding.cbNearby.isChecked) result.add(JobPreference.NEARBY.name)
            if (binding.cbStudent.isChecked) result.add(JobPreference.STUDENT_OK.name)
            if (binding.cbDriver.isChecked) result.add(JobPreference.DRIVER.name)

            setFragmentResult(RESULT_KEY, bundleOf("values" to result.toTypedArray()))
            dismiss()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
