package com.moduji.app.ui.home.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.data.model.CommunityPost
import com.moduji.app.databinding.ItemPostCardBinding

class PostCardAdapter(
    private val items: List<CommunityPost>,
    private val onItemClick: (CommunityPost) -> Unit = {}
) : RecyclerView.Adapter<PostCardAdapter.ViewHolder>() {

    inner class ViewHolder(
        private val binding: ItemPostCardBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: CommunityPost) {
            binding.tvPostTag.text = item.categoryName ?: ""
            binding.tvPostRegion.text = item.region
            binding.tvPostTitle.text = item.title
            binding.tvPostPreview.text = item.content.take(100)
            binding.tvPostAuthor.text = item.author
            binding.tvPostDate.text = formatDate(item.createdAt)
            binding.tvPostLikes.text = "♥ ${item.likes}"
            binding.tvPostComments.text = "💬 ${item.commentsCount}"

            binding.root.setOnClickListener { onItemClick(item) }
        }

        private fun formatDate(dateStr: String): String {
            return try {
                val parts = dateStr.split("T")[0].split("-")
                if (parts.size >= 3) "${parts[1]}.${parts[2]}" else dateStr
            } catch (_: Exception) {
                dateStr
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemPostCardBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size
}
