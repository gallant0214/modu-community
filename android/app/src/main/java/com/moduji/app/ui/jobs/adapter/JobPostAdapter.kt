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
 * - showActions=true 시 [구인완료] [재게시] 버튼 표시 (내가 등록한 구인글)
 *
 * @param items 구인 게시글 목록
 * @param showActions 액션 버튼 표시 여부
 * @param onItemClick 아이템 클릭 콜백 (상세 페이지 이동용)
 * @param onCloseClick 구인완료 버튼 클릭 콜백
 * @param onRepostClick 재게시 버튼 클릭 콜백
 */
class JobPostAdapter(
    private var items: List<JobPost>,
    private val showActions: Boolean = false,
    private val onItemClick: (JobPost) -> Unit = {},
    private val onCloseClick: ((JobPost, Int) -> Unit)? = null,
    private val onRepostClick: ((JobPost) -> Unit)? = null
) : RecyclerView.Adapter<JobPostAdapter.ViewHolder>() {

    inner class ViewHolder(
        private val binding: ItemJobPostBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: JobPost, position: Int) {
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
                binding.tvJobClosed.text = "[구인완료]"
                binding.tvJobClosed.setTextColor(
                    itemView.context.getColor(R.color.app_status_closed)
                )
                binding.tvJobTitle.alpha = 0.5f
                binding.tvJobSalary.alpha = 0.5f
            } else if (item.deadline == "상시 모집" || item.deadline == "상시모집") {
                binding.tvJobClosed.text = "[상시 모집]"
                binding.tvJobClosed.setTextColor(
                    itemView.context.getColor(R.color.app_status_active)
                )
                binding.tvJobTitle.alpha = 1.0f
                binding.tvJobSalary.alpha = 1.0f
            } else {
                binding.tvJobClosed.text = "[모집중]"
                binding.tvJobClosed.setTextColor(
                    itemView.context.getColor(R.color.app_status_active)
                )
                binding.tvJobTitle.alpha = 1.0f
                binding.tvJobSalary.alpha = 1.0f
            }

            // 액션 버튼 (내가 등록한 구인글에서만 표시)
            if (showActions) {
                binding.layoutActions.visibility = View.VISIBLE

                // 이미 구인완료된 항목은 구인완료 버튼 숨기기
                binding.btnCloseJob.visibility = if (item.isClosed) View.GONE else View.VISIBLE

                binding.btnCloseJob.setOnClickListener {
                    onCloseClick?.invoke(item, position)
                }
                binding.btnRepost.setOnClickListener {
                    onRepostClick?.invoke(item)
                }
            } else {
                binding.layoutActions.visibility = View.GONE
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
        holder.bind(items[position], position)
    }

    override fun getItemCount() = items.size

    /**
     * 데이터 갱신 메서드
     */
    fun updateItems(newItems: List<JobPost>) {
        items = newItems
        notifyDataSetChanged()
    }
}
