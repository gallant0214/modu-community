package com.moduji.app.ui.jobs.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.R
import com.moduji.app.data.model.RegionGroup
import com.moduji.app.data.model.SubRegion
import com.moduji.app.databinding.ItemRegionGroupBinding
import com.moduji.app.databinding.ItemSubRegionBinding

/**
 * 지역 선택 RecyclerView Adapter (2 viewType)
 *
 * - GROUP_ITEM: 상위 그룹 (광역시/특별시, 도) — 클릭 시 펼침/접힘
 * - SUB_REGION_ITEM: 하위 지역 (구/시/군) — 클릭 시 구인 리스트로 이동
 */
class RegionAdapter(
    private val onSubRegionClick: (code: String, name: String) -> Unit,
    private val onGroupToggle: (groupCode: String) -> Unit
) : RecyclerView.Adapter<RecyclerView.ViewHolder>() {

    companion object {
        private const val TYPE_GROUP = 0
        private const val TYPE_SUB_REGION = 1
    }

    sealed class RegionItem {
        data class GroupItem(val group: RegionGroup) : RegionItem()
        data class SubRegionItem(val subRegion: SubRegion) : RegionItem()
    }

    private var displayItems: List<RegionItem> = emptyList()

    /**
     * RegionGroup 목록을 받아 displayItems를 구성
     * - 그룹 행 + (isExpanded이면 하위 지역 행들)
     */
    /** 펼쳐진 그룹 헤더의 위치 (-1이면 없음) */
    var expandedGroupPosition: Int = -1
        private set

    fun submitData(groups: List<RegionGroup>) {
        val items = mutableListOf<RegionItem>()
        expandedGroupPosition = -1

        groups.forEach { group ->
            if (group.isExpanded) expandedGroupPosition = items.size
            items.add(RegionItem.GroupItem(group))
            if (group.isExpanded) {
                group.subRegions.forEach { sub ->
                    items.add(RegionItem.SubRegionItem(sub))
                }
            }
        }

        displayItems = items
        notifyDataSetChanged()
    }

    override fun getItemViewType(position: Int): Int {
        return when (displayItems[position]) {
            is RegionItem.GroupItem -> TYPE_GROUP
            is RegionItem.SubRegionItem -> TYPE_SUB_REGION
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            TYPE_GROUP -> GroupViewHolder(
                ItemRegionGroupBinding.inflate(inflater, parent, false)
            )
            else -> SubRegionViewHolder(
                ItemSubRegionBinding.inflate(inflater, parent, false)
            )
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = displayItems[position]) {
            is RegionItem.GroupItem -> (holder as GroupViewHolder).bind(item.group)
            is RegionItem.SubRegionItem -> (holder as SubRegionViewHolder).bind(item.subRegion)
        }
    }

    override fun getItemCount() = displayItems.size

    // ====================================================
    // 상위 그룹 ViewHolder — 펼침/접힘
    // ====================================================
    inner class GroupViewHolder(
        private val binding: ItemRegionGroupBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(group: RegionGroup) {
            binding.tvGroupName.text = group.name

            binding.ivArrow.setImageResource(
                if (group.isExpanded) R.drawable.ic_expand_less
                else R.drawable.ic_expand_more
            )

            binding.root.setOnClickListener {
                onGroupToggle(group.code)
            }
        }
    }

    // ====================================================
    // 하위 지역 ViewHolder — 구인 리스트로 이동
    // ====================================================
    inner class SubRegionViewHolder(
        private val binding: ItemSubRegionBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(subRegion: SubRegion) {
            binding.tvSubRegionName.text = subRegion.name
            binding.tvSubRegionCount.text = " · ${subRegion.totalCount}개"
            binding.tvBadgeNew.visibility = if (subRegion.hasTodayPost) View.VISIBLE else View.GONE

            binding.root.setOnClickListener {
                onSubRegionClick(subRegion.code, subRegion.name)
            }
        }
    }
}
