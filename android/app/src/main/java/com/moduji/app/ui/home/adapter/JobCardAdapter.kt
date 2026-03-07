package com.moduji.app.ui.home.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.moduji.app.data.model.JobPost
import com.moduji.app.databinding.ItemJobCardBinding

class JobCardAdapter(
    private val items: List<JobPost>,
    private val onItemClick: (JobPost) -> Unit = {}
) : RecyclerView.Adapter<JobCardAdapter.ViewHolder>() {

    inner class ViewHolder(
        private val binding: ItemJobCardBinding
    ) : RecyclerView.ViewHolder(binding.root) {

        fun bind(item: JobPost) {
            binding.tvJobCategory.text = item.categoryName
            binding.tvJobRegion.text = item.region
            binding.tvJobTitle.text = item.title
            binding.tvJobSalary.text = item.salary
            binding.tvJobDate.text = item.date

            binding.root.setOnClickListener { onItemClick(item) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemJobCardBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        holder.bind(items[position])
    }

    override fun getItemCount() = items.size
}
