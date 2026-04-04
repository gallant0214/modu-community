package com.moduji.app.ui.jobs

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.moduji.app.R
import com.moduji.app.data.model.RegionGroup
import com.moduji.app.data.model.SubRegion
import com.moduji.app.data.repository.JobsRepository
import com.moduji.app.databinding.BottomSheetRegionSelectBinding

/**
 * 지역 변경 바텀시트
 *
 * 1단계: 광역시/도 목록 표시
 * 2단계: 선택한 광역시/도의 구/시/군 목록 표시
 * → 구/시/군 선택 시 onRegionSelected 콜백 호출 후 닫힘
 */
class RegionSelectBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetRegionSelectBinding? = null
    private val binding get() = _binding!!

    var onRegionSelected: ((code: String, name: String) -> Unit)? = null

    private val regionGroups: List<RegionGroup> by lazy {
        JobsRepository.getRegionGroupsLocal()
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = BottomSheetRegionSelectBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnClose.setOnClickListener { dismiss() }
        binding.btnBackStep.setOnClickListener { showStep1() }

        showStep1()
    }

    /** 1단계: 광역시/도 목록 */
    private fun showStep1() {
        binding.tvStepTitle.text = "광역시/도 선택"
        binding.btnBackStep.visibility = View.GONE
        binding.spaceLeft.visibility = View.VISIBLE

        binding.rvRegionSheet.layoutManager = LinearLayoutManager(requireContext())
        binding.rvRegionSheet.adapter = RegionSheetAdapter(
            items = regionGroups.map { SheetItem(it.code, it.name, showArrow = true) },
            onClick = { item ->
                val group = regionGroups.find { it.code == item.code } ?: return@RegionSheetAdapter
                showStep2(group)
            }
        )
    }

    /** 2단계: 선택한 광역시/도의 구/시/군 목록 */
    private fun showStep2(group: RegionGroup) {
        binding.tvStepTitle.text = group.name
        binding.btnBackStep.visibility = View.VISIBLE
        binding.spaceLeft.visibility = View.GONE

        binding.rvRegionSheet.layoutManager = LinearLayoutManager(requireContext())
        binding.rvRegionSheet.adapter = RegionSheetAdapter(
            items = group.subRegions.map { SheetItem(it.code, it.name, showArrow = false) },
            onClick = { item ->
                onRegionSelected?.invoke(item.code, item.name)
                dismiss()
            }
        )
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    // ---- 내부 데이터 클래스 ----

    private data class SheetItem(val code: String, val name: String, val showArrow: Boolean)

    // ---- RecyclerView 어댑터 ----

    private inner class RegionSheetAdapter(
        private val items: List<SheetItem>,
        private val onClick: (SheetItem) -> Unit
    ) : RecyclerView.Adapter<RegionSheetAdapter.VH>() {

        inner class VH(view: View) : RecyclerView.ViewHolder(view) {
            val tvName: TextView = view.findViewById(R.id.tv_region_name)
            val ivArrow: ImageView = view.findViewById(R.id.iv_arrow)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_region_sheet, parent, false)
            return VH(view)
        }

        override fun onBindViewHolder(holder: VH, position: Int) {
            val item = items[position]
            holder.tvName.text = item.name
            holder.ivArrow.visibility = if (item.showArrow) View.VISIBLE else View.GONE
            holder.itemView.setOnClickListener { onClick(item) }
        }

        override fun getItemCount() = items.size
    }

    companion object {
        fun newInstance(): RegionSelectBottomSheet = RegionSelectBottomSheet()
    }
}
