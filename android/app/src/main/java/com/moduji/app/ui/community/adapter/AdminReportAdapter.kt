package com.moduji.app.ui.community.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.data.model.CommunityReport
import com.moduji.app.databinding.ItemAdminReportBinding
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class AdminReportAdapter(
    private val onResolve: (CommunityReport) -> Unit,
    private val onDeleteTarget: (CommunityReport) -> Unit,
    private val onNavigate: (CommunityReport) -> Unit,
    private val onHide: (CommunityReport) -> Unit = {},
    private val onUnhide: (CommunityReport) -> Unit = {},
    private val showActions: Boolean = true
) : ListAdapter<CommunityReport, AdminReportAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<CommunityReport>() {
            override fun areItemsTheSame(a: CommunityReport, b: CommunityReport) = a.id == b.id
            override fun areContentsTheSame(a: CommunityReport, b: CommunityReport) = a == b
        }
    }

    inner class ViewHolder(
        private val binding: ItemAdminReportBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(report: CommunityReport) {
            // 대상 유형 뱃지
            binding.tvTargetType.text = when (report.targetType) {
                "job_post" -> "구인게시글"
                "post" -> "후기게시글"
                else -> "댓글"
            }

            // 카테고리명 뱃지
            if (report.targetType == "job_post") {
                binding.tvCategoryBadge.visibility = View.GONE
            } else if (!report.categoryName.isNullOrBlank()) {
                binding.tvCategoryBadge.visibility = View.VISIBLE
                binding.tvCategoryBadge.text = report.categoryName
            } else {
                binding.tvCategoryBadge.visibility = View.GONE
            }

            // 날짜
            binding.tvDate.text = formatDate(report.createdAt)

            // 신고된 콘텐츠
            val content = when (report.targetType) {
                "job_post" -> report.jobPostTitle ?: "구인게시글 #${report.targetId}"
                "post" -> report.postTitle ?: "게시글 #${report.targetId}"
                else -> report.commentContent ?: "댓글 #${report.targetId}"
            }
            binding.tvTargetContent.text = content

            // 작성자
            val author = when (report.targetType) {
                "job_post" -> report.jobPostAuthor
                "post" -> report.postAuthor
                else -> report.commentAuthor
            }
            binding.tvAuthor.text = "작성자: ${author ?: "알 수 없음"}"

            // 관련 게시글 (댓글 신고 시)
            if (report.targetType == "comment" && !report.postTitle.isNullOrBlank()) {
                binding.tvRelatedPost.visibility = View.VISIBLE
                binding.tvRelatedPost.text = "게시글: ${report.postTitle}"
            } else {
                binding.tvRelatedPost.visibility = View.GONE
            }

            // 신고 사유
            val reason = if (!report.customReason.isNullOrBlank()) {
                "신고 사유: ${report.reason} - ${report.customReason}"
            } else {
                "신고 사유: ${report.reason}"
            }
            binding.tvReason.text = reason

            // 처리 상태 vs 액션 버튼
            if (!showActions) {
                binding.layoutActions.visibility = View.GONE
                binding.tvStatus.visibility = View.VISIBLE
                val isDeleted = report.deletedAt != null
                val isHidden = report.targetHidden == true
                binding.tvStatus.text = when {
                    isDeleted -> "삭제됨"
                    isHidden -> "숨김처리"
                    else -> "처리 완료"
                }

                // 처리완료 탭에서 클릭 시 상세보기
                binding.root.setOnClickListener { onNavigate(report) }
            } else {
                binding.layoutActions.visibility = View.VISIBLE
                binding.tvStatus.visibility = View.GONE

                binding.btnDeleteTarget.setOnClickListener { onDeleteTarget(report) }
                binding.btnNavigate.setOnClickListener { onNavigate(report) }
                binding.btnResolve.setOnClickListener { onResolve(report) }
                binding.btnHide.setOnClickListener { onHide(report) }
                binding.btnUnhide.setOnClickListener { onUnhide(report) }

                binding.root.setOnClickListener(null)
            }
        }

        private fun formatDate(dateStr: String): String {
            return try {
                val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
                parser.timeZone = TimeZone.getTimeZone("UTC")
                val date = parser.parse(dateStr) ?: return dateStr
                val formatter = SimpleDateFormat("yyyy. MM. dd.", Locale.getDefault())
                formatter.format(date)
            } catch (e: Exception) {
                dateStr.take(10)
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemAdminReportBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(getItem(position))
    }
}
