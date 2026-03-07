package com.moduji.app.ui.community.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.data.model.CommunityCategory
import com.moduji.app.databinding.ItemCommunityCategoryBinding

class CategoryAdapter(
    private val onClick: (CommunityCategory) -> Unit
) : ListAdapter<CommunityCategory, CategoryAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<CommunityCategory>() {
            override fun areItemsTheSame(a: CommunityCategory, b: CommunityCategory) = a.id == b.id
            override fun areContentsTheSame(a: CommunityCategory, b: CommunityCategory) = a == b
        }
    }

    inner class ViewHolder(
        private val binding: ItemCommunityCategoryBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(item: CommunityCategory) {
            binding.tvEmoji.text = item.emoji
            binding.tvName.text = item.name
            binding.tvCount.text = "${item.postCountInt}개"
            binding.root.setOnClickListener { onClick(item) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemCommunityCategoryBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }
}
