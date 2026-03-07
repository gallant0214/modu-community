package com.moduji.app.ui.jobs

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.ListView
import android.widget.Toast
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.google.android.material.button.MaterialButton
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.moduji.app.R


class JobSportBottomSheet : BottomSheetDialogFragment() {

    companion object {
        const val TAG = "JobSportBottomSheet"
        const val RESULT_KEY = "job_sport_result"

        val ALL_SPORTS = listOf(
            // 인기 종목 (한국 인기순)
            "헬스", "PT", "필라테스", "요가", "요가·필라테스", "GX",
            "수영", "골프", "테니스", "배구", "축구", "농구", "야구",
            "태권도", "복싱", "무에타이", "유도", "합기도", "검도",
            "보디빌딩", "스피닝", "점핑", "하이록스",
            "발레", "무용", "리듬체조", "체조", "기계체조",
            "탁구", "배드민턴", "스쿼시",
            // 일반 종목
            "게이트볼", "궁도", "근대5종", "글라이딩", "권투",
            "당구", "럭비", "레슬링", "롤러",
            "바둑", "바이애슬론", "빙상",
            "사격", "사이클", "산악", "세팍타크로", "소프트볼", "소프트테니스",
            "수상스키", "수중", "승마", "스키", "씨름",
            "아이스하키", "양궁", "오리엔티어링",
            "요트", "우슈", "윈드서핑", "육상",
            "정구", "조정", "줄다리기",
            "철인3종",
            "카누", "카누슬라럼", "카바디", "키즈스포츠",
            "택견",
            "패러글라이딩", "펜싱",
            "하키", "핸드볼", "행글라이딩",
            "기타"
        )

        fun newInstance(selected: String? = null) = JobSportBottomSheet().apply {
            arguments = Bundle().apply {
                putString("selected", selected)
            }
        }
    }

    private var selectedSport: String? = null
    private var isCustom = false

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View? {
        return inflater.inflate(R.layout.bottom_sheet_job_sport, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        selectedSport = arguments?.getString("selected")

        val listView = view.findViewById<ListView>(R.id.lv_sports)
        val tilCustom = view.findViewById<TextInputLayout>(R.id.til_custom_sport)
        val etCustom = view.findViewById<TextInputEditText>(R.id.et_custom_sport)
        val etSearch = view.findViewById<EditText>(R.id.et_search)
        val btnCancel = view.findViewById<MaterialButton>(R.id.btn_cancel)
        val btnConfirm = view.findViewById<MaterialButton>(R.id.btn_confirm)

        // 종목 목록 (기타는 항상 마지막)
        val sortedSports = ALL_SPORTS.filter { it != "기타" } + listOf("기타")

        val adapter = ArrayAdapter(
            requireContext(),
            android.R.layout.simple_list_item_single_choice,
            sortedSports.toMutableList()
        )
        listView.adapter = adapter
        listView.choiceMode = ListView.CHOICE_MODE_SINGLE

        // Restore previous selection
        selectedSport?.let { sport ->
            val index = sortedSports.indexOf(sport)
            if (index >= 0) {
                listView.setItemChecked(index, true)
                listView.setSelection(index)
                if (sport == "기타") {
                    isCustom = true
                    tilCustom.visibility = View.VISIBLE
                }
            } else if (sport.isNotEmpty()) {
                // Custom sport was entered - select "기타"
                val etcIndex = sortedSports.indexOf("기타")
                listView.setItemChecked(etcIndex, true)
                listView.setSelection(etcIndex)
                isCustom = true
                tilCustom.visibility = View.VISIBLE
                etCustom.setText(sport)
            }
        }

        // List item click → 기타 외에는 즉시 선택 후 닫기
        listView.setOnItemClickListener { _, _, position, _ ->
            val item = adapter.getItem(position) ?: return@setOnItemClickListener
            if (item == "기타") {
                selectedSport = item
                isCustom = true
                tilCustom.visibility = View.VISIBLE
            } else {
                parentFragmentManager.setFragmentResult(RESULT_KEY, Bundle().apply {
                    putString("value", item)
                })
                dismiss()
            }
        }

        // Search filter
        etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                adapter.filter.filter(s?.toString()?.trim() ?: "")
            }
        })

        btnCancel.setOnClickListener { dismiss() }

        btnConfirm.setOnClickListener {
            if (selectedSport == null) {
                Toast.makeText(requireContext(), "종목을 선택하세요", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val result = if (isCustom) {
                val custom = etCustom.text?.toString()?.trim() ?: ""
                if (custom.isEmpty()) {
                    tilCustom.error = "종목명을 입력하세요"
                    return@setOnClickListener
                }
                custom
            } else {
                selectedSport!!
            }

            parentFragmentManager.setFragmentResult(RESULT_KEY, Bundle().apply {
                putString("value", result)
            })
            dismiss()
        }
    }
}
