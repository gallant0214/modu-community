package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.moduji.app.data.model.UpdatePostRequest
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.FragmentPostEditBinding
import kotlinx.coroutines.launch

class PostEditFragment : Fragment() {

    private var _binding: FragmentPostEditBinding? = null
    private val binding get() = _binding!!

    private var postId = 0
    private var categoryId = 0

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPostEditBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        postId = arguments?.getInt("postId") ?: 0
        categoryId = arguments?.getInt("categoryId") ?: 0

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
            CommunityRepository.getPost(postId).fold(
                onSuccess = { post ->
                    binding.etTitle.setText(post.title)
                    binding.etContent.setText(post.content)
                    binding.etRegion.setText(post.region)
                    binding.etTags.setText(post.tags)
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
        val content = binding.etContent.text?.toString()?.trim() ?: ""
        val region = binding.etRegion.text?.toString()?.trim() ?: ""
        val tags = binding.etTags.text?.toString()?.trim() ?: ""

        if (title.isEmpty() || content.isEmpty()) {
            Toast.makeText(requireContext(), "제목과 내용을 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.btnSubmit.isEnabled = false

        lifecycleScope.launch {
            val request = UpdatePostRequest(
                title = title,
                content = content,
                region = region,
                tags = tags
            )

            CommunityRepository.updatePost(postId, request).fold(
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
