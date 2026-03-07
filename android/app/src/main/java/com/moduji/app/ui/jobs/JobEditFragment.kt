package com.moduji.app.ui.jobs

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.moduji.app.data.network.JobPostResponse
import com.moduji.app.data.repository.JobsRepository
import com.moduji.app.databinding.FragmentJobEditBinding
import kotlinx.coroutines.launch

class JobEditFragment : Fragment() {

    private var _binding: FragmentJobEditBinding? = null
    private val binding get() = _binding!!

    private var postId = 0
    private var originalPost: JobPostResponse? = null

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentJobEditBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        postId = arguments?.getInt("postId") ?: 0

        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        binding.btnSubmit.setOnClickListener {
            submitEdit()
        }

        loadExistingPost()
    }

    private fun loadExistingPost() {
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            JobsRepository.getJobPostRaw(postId).fold(
                onSuccess = { post ->
                    originalPost = post
                    binding.etTitle.setText(post.title)
                    binding.etDescription.setText(post.description)
                    binding.etSalary.setText(post.salary)
                    binding.etContact.setText(post.contact)
                    binding.etHeadcount.setText(post.headcount)
                    binding.etDeadline.setText(post.deadline)
                    binding.etPreferences.setText(post.preferences)
                    binding.etBenefits.setText(post.benefits)
                },
                onFailure = { e ->
                    Toast.makeText(requireContext(), "불러오기 실패: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            )
            binding.progressBar.visibility = View.GONE
        }
    }

    private fun submitEdit() {
        val title = binding.etTitle.text?.toString()?.trim() ?: ""
        val description = binding.etDescription.text?.toString()?.trim() ?: ""
        val salary = binding.etSalary.text?.toString()?.trim() ?: ""
        val contact = binding.etContact.text?.toString()?.trim() ?: ""
        val headcount = binding.etHeadcount.text?.toString()?.trim() ?: ""
        val deadline = binding.etDeadline.text?.toString()?.trim() ?: ""
        val preferences = binding.etPreferences.text?.toString()?.trim() ?: ""
        val benefits = binding.etBenefits.text?.toString()?.trim() ?: ""

        if (title.isEmpty() || description.isEmpty()) {
            Toast.makeText(requireContext(), "제목과 내용을 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.btnSubmit.isEnabled = false

        val orig = originalPost
        lifecycleScope.launch {
            val body = mapOf(
                "title" to title,
                "description" to description,
                "salary" to salary,
                "contact" to contact,
                "headcount" to headcount,
                "deadline" to deadline,
                "preferences" to preferences,
                "benefits" to benefits,
                "center_name" to (orig?.centerName ?: ""),
                "address" to (orig?.address ?: ""),
                "sport" to (orig?.sport ?: ""),
                "employment_type" to (orig?.employmentType ?: "")
            )

            JobsRepository.updateJobPost(postId, body).fold(
                onSuccess = {
                    Toast.makeText(requireContext(), "수정되었습니다", Toast.LENGTH_SHORT).show()
                    findNavController().popBackStack()
                },
                onFailure = { e ->
                    Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                    binding.btnSubmit.isEnabled = true
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
