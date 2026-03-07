package com.moduji.app.ui.home.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.data.model.CommunityCategory
import com.moduji.app.databinding.ItemPopularCategoryBinding

class PopularCategoryAdapter(
    private val items: List<CommunityCategory>,
    private val onItemClick: (CommunityCategory) -> Unit = {}
) : RecyclerView.Adapter<PopularCategoryAdapter.ViewHolder>() {

    inner class ViewHolder(
        private val binding: ItemPopularCategoryBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: CommunityCategory) {
            binding.tvCategoryEmoji.text = item.emoji
            binding.tvCategoryName.text = item.name
            binding.tvCategoryCount.text = "${item.postCountInt}"

            binding.root.setOnClickListener { onItemClick(item) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemPopularCategoryBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size
}
