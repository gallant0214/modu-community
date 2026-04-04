package com.moduji.app.ui.community.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.R
import com.moduji.app.data.model.CommunityInquiry
import com.moduji.app.databinding.ItemInquiryBinding
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class InquiryAdapter(
    private val isAdminMode: Boolean = false,
    private val onViewReplyClick: ((CommunityInquiry) -> Unit)? = null,
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

            if (hasReply) {
                binding.tvStatus.text = "답변완료"
                binding.tvStatus.setTextColor(ContextCompat.getColor(binding.root.context, R.color.md_theme_onPrimary))
                binding.tvStatus.setBackgroundResource(R.drawable.bg_badge_replied)
                binding.btnViewReply.visibility = View.VISIBLE
                binding.btnViewReply.setOnClickListener {
                    (onViewReplyClick ?: onClick).invoke(item)
                }
            } else {
                binding.tvStatus.text = "대기중"
                binding.tvStatus.setTextColor(ContextCompat.getColor(binding.root.context, R.color.md_theme_onPrimary))
                binding.tvStatus.setBackgroundResource(R.drawable.bg_login_button)
                binding.btnViewReply.visibility = View.GONE
            }

            // 관리자 모드: 미확인 문의에 NEW 뱃지
            binding.tvNewBadge.visibility = if (isAdminMode && item.readAt == null) View.VISIBLE else View.GONE

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
