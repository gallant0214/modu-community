package com.moduji.app.ui.jobs

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.moduji.app.R
import com.moduji.app.data.repository.JobsRepository
import com.moduji.app.databinding.FragmentLatestJobsBinding
import com.moduji.app.ui.jobs.adapter.JobsAdapter
import kotlinx.coroutines.launch

class LatestJobsFragment : Fragment() {

    private var _binding: FragmentLatestJobsBinding? = null
    private val binding get() = _binding!!

    private lateinit var jobsAdapter: JobsAdapter
    private var currentPage = 1
    private var totalPages = 1

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentLatestJobsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        setupRecyclerView()
        setupPagination()
        loadJobs(1)
    }

    private fun setupRecyclerView() {
        jobsAdapter = JobsAdapter { jobPost ->
            val bundle = Bundle().apply { putInt("postId", jobPost.id) }
            findNavController().navigate(R.id.action_latestJobs_to_jobDetail, bundle)
        }
        binding.rvJobs.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = jobsAdapter
        }
    }

    private fun setupPagination() {
        binding.btnPrev.setOnClickListener {
            if (currentPage > 1) loadJobs(currentPage - 1)
        }
        binding.btnNext.setOnClickListener {
            if (currentPage < totalPages) loadJobs(currentPage + 1)
        }
    }

    private fun loadJobs(page: Int) {
        binding.progressBar.visibility = View.VISIBLE
        binding.tvEmpty.visibility = View.GONE

        lifecycleScope.launch {
            JobsRepository.getLatestJobsPaginated(page).fold(
                onSuccess = { (jobs, pages, _) ->
                    currentPage = page
                    totalPages = pages

                    jobsAdapter.submitList(jobs)

                    binding.tvEmpty.visibility = if (jobs.isEmpty()) View.VISIBLE else View.GONE

                    binding.tvPageInfo.text = "$currentPage / $totalPages"
                    binding.layoutPagination.visibility = if (totalPages > 1) View.VISIBLE else View.GONE
                    binding.btnPrev.alpha = if (currentPage > 1) 1f else 0.3f
                    binding.btnNext.alpha = if (currentPage < totalPages) 1f else 0.3f

                    binding.rvJobs.scrollToPosition(0)
                },
                onFailure = { e ->
                    binding.tvEmpty.text = "불러오기 실패: ${e.message}"
                    binding.tvEmpty.visibility = View.VISIBLE
                }
            )
            binding.progressBar.visibility = View.GONE
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
