package com.moduji.app.ui.community.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.data.model.CommunityComment
import com.moduji.app.databinding.ItemCommentBinding
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class CommentAdapter(
    private val onLike: (CommunityComment) -> Unit,
    private val onReply: (CommunityComment) -> Unit,
    private val onMore: (CommunityComment) -> Unit,
    private val onReport: (CommunityComment) -> Unit
) : ListAdapter<CommunityComment, CommentAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<CommunityComment>() {
            override fun areItemsTheSame(a: CommunityComment, b: CommunityComment) = a.id == b.id
            override fun areContentsTheSame(a: CommunityComment, b: CommunityComment) = a == b
        }
    }

    inner class ViewHolder(
        private val binding: ItemCommentBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(comment: CommunityComment) {
            val isReply = comment.parentId != null

            // 대댓글 들여쓰기
            binding.tvReplyIcon.visibility = if (isReply) View.VISIBLE else View.GONE
            val leftPad = if (isReply) 32 else 0
            binding.root.setPadding(
                leftPad + 16.dpToPx(),
                binding.root.paddingTop,
                binding.root.paddingRight,
                binding.root.paddingBottom
            )

            binding.tvAuthor.text = comment.author
            binding.tvIp.text = if (!comment.ipDisplay.isNullOrBlank()) "(${comment.ipDisplay})" else ""
            binding.tvContent.text = comment.content
            binding.tvDate.text = formatDate(comment.createdAt)
            val ctx = binding.root.context
            val red = ctx.getColor(com.moduji.app.R.color.app_like_red)
            if (comment.isLiked == true) {
                binding.btnLike.text = if (comment.likes > 0) "${comment.likes}" else ""
                binding.btnLike.setCompoundDrawablesRelativeWithIntrinsicBounds(
                    com.moduji.app.R.drawable.ic_heart_filled, 0, 0, 0
                )
                binding.btnLike.setTextColor(red)
            } else {
                binding.btnLike.text = if (comment.likes > 0) "${comment.likes}" else ""
                binding.btnLike.setCompoundDrawablesRelativeWithIntrinsicBounds(
                    com.moduji.app.R.drawable.ic_heart_outline, 0, 0, 0
                )
                binding.btnLike.setTextColor(red)
            }

            binding.btnLike.setOnClickListener { onLike(comment) }
            binding.btnReply.visibility = if (isReply) View.GONE else View.VISIBLE
            binding.btnReply.setOnClickListener { onReply(comment) }
            binding.btnReport.setOnClickListener { onReport(comment) }
            binding.btnMore.setOnClickListener { onMore(comment) }
        }

        private fun Int.dpToPx(): Int {
            return (this * binding.root.context.resources.displayMetrics.density).toInt()
        }

        private fun formatDate(dateStr: String): String {
            return try {
                val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                parser.timeZone = TimeZone.getTimeZone("UTC")
                val date = parser.parse(dateStr) ?: return dateStr
                val formatter = SimpleDateFormat("yyyy. MM. dd. HH:mm", Locale.getDefault())
                formatter.format(date)
            } catch (e: Exception) {
                dateStr.take(10)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemCommentBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }
}
