package com.moduji.app.ui.jobs.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.R
import com.moduji.app.data.model.JobPost
import com.moduji.app.databinding.ItemJobPostBinding

/**
 * 구인 게시판 Adapter
 *
 * - 기존 PostCardAdapter와 동일한 패턴
 * - 추가: 급여 표시, 마감 뱃지, 조회수
 * - isClosed=true인 항목은 마감 뱃지 표시 + 제목 흐리게 처리
 *
 * @param items 구인 게시글 목록
 * @param onItemClick 아이템 클릭 콜백 (상세 페이지 이동용)
 */
class JobPostAdapter(
    private var items: List<JobPost>,
    private val onItemClick: (JobPost) -> Unit = {}
) : RecyclerView.Adapter<JobPostAdapter.ViewHolder>() {

    inner class ViewHolder(
        private val binding: ItemJobPostBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: JobPost) {
            // 종목 태그
            binding.tvJobTag.text = item.categoryName

            // 지역
            binding.tvJobRegion.text = item.region

            // 제목
            binding.tvJobTitle.text = item.title

            // 내용 미리보기
            binding.tvJobPreview.text = item.preview

            // 급여 정보
            binding.tvJobSalary.text = item.salary

            // 작성자
            binding.tvJobAuthor.text = item.author

            // 날짜
            binding.tvJobDate.text = item.date

            // 조회수
            binding.tvJobViews.text = "👁 ${item.views}"

            // 댓글수
            binding.tvJobComments.text = "💬 ${item.commentsCount}"

            // 모집 상태 뱃지 + 마감 여부 UI
            binding.tvJobClosed.visibility = View.VISIBLE
            binding.tvJobClosed.background = null
            if (item.isClosed) {
                binding.tvJobClosed.text = "[기간 만료]"
                binding.tvJobClosed.setTextColor(
                    itemView.context.getColor(R.color.app_badge_closed_text)
                )
                binding.tvJobTitle.alpha = 0.5f
                binding.tvJobSalary.alpha = 0.5f
            } else {
                binding.tvJobClosed.text = "[모집중]"
                binding.tvJobClosed.setTextColor(
                    itemView.context.getColor(R.color.app_salary_text)
                )
                binding.tvJobTitle.alpha = 1.0f
                binding.tvJobSalary.alpha = 1.0f
            }

            // 클릭 리스너
            binding.root.setOnClickListener { onItemClick(item) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemJobPostBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size

    /**
     * 데이터 갱신 메서드
     * - 추후 API 연동 시 사용
     */
    fun updateItems(newItems: List<JobPost>) {
        items = newItems
        notifyDataSetChanged()
    }
}
