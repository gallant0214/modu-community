package com.moduji.app.ui.jobs.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.R
import com.moduji.app.data.model.JobPost
import com.moduji.app.databinding.ItemJobBinding

/**
 * 구인 게시글 리스트 Adapter (JobsListFragment용)
 *
 * - item_job.xml 레이아웃 사용
 * - 고용형태 Chip + 종목 + 제목 + 센터명 + 급여 + 등록일/조회수
 */
class JobsAdapter(
    private val onItemClick: (JobPost) -> Unit = {}
) : RecyclerView.Adapter<JobsAdapter.ViewHolder>() {

    private var items: List<JobPost> = emptyList()

    fun submitList(newItems: List<JobPost>) {
        items = newItems
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemJobBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size

    inner class ViewHolder(
        private val binding: ItemJobBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: JobPost) {
            binding.tvEmploymentType.text = item.employmentType
            binding.tvCategory.text = item.categoryName
            binding.tvTitle.text = item.title
            binding.tvCenterName.text = item.author
            binding.tvSalary.text = item.salary
            if (item.deadline.isNotBlank()) {
                binding.tvDeadline.text = "모집기간: ${item.deadline}"
                binding.tvDeadline.visibility = View.VISIBLE
            } else {
                binding.tvDeadline.visibility = View.GONE
            }
            binding.tvDate.text = item.date
            binding.tvViews.text = "조회 ${item.views}"

            // 모집 상태 뱃지 + 마감 여부 UI
            if (item.isClosed) {
                binding.tvStatus.text = "[모집종료]"
                binding.tvStatus.setTextColor(
                    binding.root.context.getColor(R.color.app_badge_closed_text)
                )
                binding.tvTitle.alpha = 0.5f
                binding.tvSalary.alpha = 0.5f
            } else {
                binding.tvStatus.text = "[모집중]"
                binding.tvStatus.setTextColor(
                    binding.root.context.getColor(R.color.app_salary_text)
                )
                binding.tvTitle.alpha = 1.0f
                binding.tvSalary.alpha = 1.0f
            }

            binding.root.setOnClickListener { onItemClick(item) }
        }
    }
}
