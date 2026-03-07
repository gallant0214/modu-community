package com.moduji.app.ui.community.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import com.moduji.app.R
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.data.model.CommunityPost
import com.moduji.app.databinding.ItemPostBinding
import com.moduji.app.databinding.ItemPostNoticeBinding
import com.moduji.app.databinding.ItemSectionDividerBinding
import com.moduji.app.databinding.ItemSectionHeaderBinding
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

sealed class PostListItem {
    data class NoticeItem(val post: CommunityPost) : PostListItem()
    data class SectionHeader(val title: String) : PostListItem()
    object SectionDivider : PostListItem()
    data class PostItem(val post: CommunityPost) : PostListItem()
}

class PostListAdapter(
    private val onClick: (CommunityPost) -> Unit,
    private var defaultCategoryName: String = ""
) : ListAdapter<PostListItem, RecyclerView.ViewHolder>(DIFF) {

    companion object {
        private const val TYPE_NOTICE = 0
        private const val TYPE_HEADER = 1
        private const val TYPE_DIVIDER = 2
        private const val TYPE_POST = 3

        private val DIFF = object : DiffUtil.ItemCallback<PostListItem>() {
            override fun areItemsTheSame(a: PostListItem, b: PostListItem): Boolean {
                return when {
                    a is PostListItem.NoticeItem && b is PostListItem.NoticeItem -> a.post.id == b.post.id
                    a is PostListItem.PostItem && b is PostListItem.PostItem -> a.post.id == b.post.id
                    a is PostListItem.SectionHeader && b is PostListItem.SectionHeader -> a.title == b.title
                    a is PostListItem.SectionDivider && b is PostListItem.SectionDivider -> true
                    else -> false
                }
            }

            override fun areContentsTheSame(a: PostListItem, b: PostListItem) = a == b
        }
    }

    override fun getItemViewType(position: Int) = when (getItem(position)) {
        is PostListItem.NoticeItem -> TYPE_NOTICE
        is PostListItem.SectionHeader -> TYPE_HEADER
        is PostListItem.SectionDivider -> TYPE_DIVIDER
        is PostListItem.PostItem -> TYPE_POST
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): RecyclerView.ViewHolder {
        val inflater = LayoutInflater.from(parent.context)
        return when (viewType) {
            TYPE_NOTICE -> NoticeViewHolder(ItemPostNoticeBinding.inflate(inflater, parent, false))
            TYPE_HEADER -> HeaderViewHolder(ItemSectionHeaderBinding.inflate(inflater, parent, false))
            TYPE_DIVIDER -> DividerViewHolder(ItemSectionDividerBinding.inflate(inflater, parent, false))
            else -> PostViewHolder(ItemPostBinding.inflate(inflater, parent, false))
        }
    }

    override fun onBindViewHolder(holder: RecyclerView.ViewHolder, position: Int) {
        when (val item = getItem(position)) {
            is PostListItem.NoticeItem -> (holder as NoticeViewHolder).bind(item.post)
            is PostListItem.SectionHeader -> (holder as HeaderViewHolder).bind(item.title)
            is PostListItem.SectionDivider -> { /* no bind */ }
            is PostListItem.PostItem -> (holder as PostViewHolder).bind(item.post)
        }
    }

    // ── Notice ──
    inner class NoticeViewHolder(
        private val binding: ItemPostNoticeBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(post: CommunityPost) {
            binding.tvNoticeTitle.text = post.title
            binding.root.setOnClickListener { onClick(post) }
        }
    }

    // ── Section Header ──
    inner class HeaderViewHolder(
        private val binding: ItemSectionHeaderBinding
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(title: String) {
            binding.tvSectionTitle.text = title
        }
    }

    // ── Divider ──
    class DividerViewHolder(binding: ItemSectionDividerBinding) : RecyclerView.ViewHolder(binding.root)

    // ── Post ──
    inner class PostViewHolder(
        private val binding: ItemPostBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(post: CommunityPost) {
            // 종목 뱃지 (카테고리명, fallback: defaultCategoryName)
            val catName = if (!post.categoryName.isNullOrBlank()) post.categoryName else defaultCategoryName
            if (catName.isNotBlank()) {
                binding.tvTagBadge.visibility = View.VISIBLE
                binding.tvTagBadge.text = catName
            } else {
                binding.tvTagBadge.visibility = View.GONE
            }

            // 지역 뱃지
            if (post.region.isNotBlank()) {
                binding.tvRegionBadge.visibility = View.VISIBLE
                binding.tvRegionBadge.text = post.region
            } else {
                binding.tvRegionBadge.visibility = View.GONE
            }

            // 제목
            binding.tvTitle.text = post.title

            // 댓글 수
            if (post.commentsCount > 0) {
                binding.tvComments.visibility = View.VISIBLE
                binding.tvComments.text = "[${post.commentsCount}]"
            } else {
                binding.tvComments.visibility = View.GONE
            }

            // 메타 (작성자 · 날짜)
            val meta = buildString {
                append(post.author)
                append(" · ${formatDate(post.createdAt)}")
            }
            binding.tvMeta.text = meta

            // 좋아요
            if (post.likes > 0) {
                binding.tvLikes.visibility = View.VISIBLE
                binding.tvLikes.text = "♥ ${post.likes}"
                binding.tvLikes.setTextColor(ContextCompat.getColor(itemView.context, R.color.app_badge_new_text))
            } else {
                binding.tvLikes.visibility = View.VISIBLE
                binding.tvLikes.text = "♡ 0"
                binding.tvLikes.setTextColor(ContextCompat.getColor(itemView.context, R.color.app_text_hint))
            }

            // 조회수
            binding.tvViews.text = "조회 ${post.views}"

            binding.root.setOnClickListener { onClick(post) }
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
}
