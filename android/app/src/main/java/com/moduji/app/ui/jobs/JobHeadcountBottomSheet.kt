package com.moduji.app.ui.jobs

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.os.bundleOf
import androidx.fragment.app.setFragmentResult
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.moduji.app.R
import com.moduji.app.databinding.BottomSheetJobHeadcountBinding

/**
 * 모집 인원 선택 BottomSheet
 *
 * - 1명 / 2~3명 / 4명 이상 / 직접 입력
 * - Fragment Result API로 결과 전달 (key: "headcount_result")
 */
class JobHeadcountBottomSheet : BottomSheetDialogFragment() {

    companion object {
        const val TAG = "JobHeadcountBottomSheet"
        const val RESULT_KEY = "headcount_result"

        fun newInstance(current: String? = null) = JobHeadcountBottomSheet().apply {
            arguments = Bundle().apply {
                current?.let { putString("current", it) }
            }
        }
    }

    private var _binding: BottomSheetJobHeadcountBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetJobHeadcountBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // 기존 값 복원 (즉시 닫지 않도록 플래그)
        val restoring = booleanArrayOf(false)
        arguments?.getString("current")?.let { current ->
            restoring[0] = true
            when (current) {
                "1명" -> binding.rgHeadcount.check(R.id.rb_one)
                "2~3명" -> binding.rgHeadcount.check(R.id.rb_two_three)
                "4명 이상" -> binding.rgHeadcount.check(R.id.rb_four_plus)
                else -> {
                    binding.rgHeadcount.check(R.id.rb_custom)
                    binding.etCustomCount.setText(current.replace("명", ""))
                }
            }
            restoring[0] = false
        }

        // 라디오 선택 시: 고정 옵션은 즉시 닫기, 직접 입력은 입력필드+확인 표시
        binding.rgHeadcount.setOnCheckedChangeListener { _, checkedId ->
            if (checkedId == R.id.rb_custom) {
                binding.tilCustomCount.visibility = View.VISIBLE
                binding.btnConfirm.visibility = View.VISIBLE
            } else {
                binding.tilCustomCount.visibility = View.GONE
                binding.btnConfirm.visibility = View.GONE
                if (!restoring[0]) {
                    val result = when (checkedId) {
                        R.id.rb_one -> "1명"
                        R.id.rb_two_three -> "2~3명"
                        R.id.rb_four_plus -> "4명 이상"
                        else -> return@setOnCheckedChangeListener
                    }
                    setFragmentResult(RESULT_KEY, bundleOf("value" to result))
                    dismiss()
                }
            }
        }

        // 직접 입력 확인 버튼
        binding.btnConfirm.setOnClickListener {
            val num = binding.etCustomCount.text?.toString()?.trim()
            if (num.isNullOrEmpty()) {
                binding.tilCustomCount.error = "인원 수를 입력하세요"
                return@setOnClickListener
            }
            setFragmentResult(RESULT_KEY, bundleOf("value" to "${num}명"))
            dismiss()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
