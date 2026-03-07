package com.moduji.app.ui.community.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.data.model.CommunityInquiry
import com.moduji.app.databinding.ItemInquiryBinding
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class InquiryAdapter(
    private val onClick: (CommunityInquiry) -> Unit
) : ListAdapter<CommunityInquiry, InquiryAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<CommunityInquiry>() {
            override fun areItemsTheSame(a: CommunityInquiry, b: CommunityInquiry) = a.id == b.id
            override fun areContentsTheSame(a: CommunityInquiry, b: CommunityInquiry) = a == b
        }
    }

    inner class ViewHolder(
        private val binding: ItemInquiryBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: CommunityInquiry) {
            binding.tvTitle.text = item.title
            binding.tvAuthor.text = item.author
            binding.tvDate.text = formatDate(item.createdAt)

            val hasReply = !item.reply.isNullOrBlank()
            binding.tvStatus.text = if (hasReply) "답변완료" else "대기중"

            binding.root.setOnClickListener { onClick(item) }
        }

        private fun formatDate(dateStr: String): String {
            return try {
                val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                parser.timeZone = TimeZone.getTimeZone("UTC")
                val date = parser.parse(dateStr) ?: return dateStr
                val formatter = SimpleDateFormat("yyyy.MM.dd", Locale.getDefault())
                formatter.format(date)
            } catch (e: Exception) {
                dateStr.take(10)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemInquiryBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }
}
