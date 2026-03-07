package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.moduji.app.data.model.CreatePostRequest
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.FragmentPostWriteBinding
import com.moduji.app.util.AuthManager
import com.moduji.app.util.MyActivityTracker
import com.moduji.app.util.NicknameManager
import kotlinx.coroutines.launch

class PostWriteFragment : Fragment() {

    private var _binding: FragmentPostWriteBinding? = null
    private val binding get() = _binding!!

    private var categoryId = 0
    private var categoryName = ""

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPostWriteBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        categoryId = arguments?.getInt("categoryId") ?: 0
        categoryName = arguments?.getString("categoryName") ?: ""

        // 로그인 시 닉네임 자동 입력 + 비밀번호 숨김
        if (AuthManager.isLoggedIn) {
            val nickname = NicknameManager.getNickname(requireContext())
            if (!nickname.isNullOrBlank()) {
                binding.etAuthor.setText(nickname)
                binding.etAuthor.isEnabled = false
            }
            binding.layoutPassword.visibility = View.GONE
        }

        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        binding.btnSubmit.setOnClickListener {
            submitPost()
        }
    }

    private fun submitPost() {
        val author = binding.etAuthor.text?.toString()?.trim() ?: ""
        val password = if (AuthManager.isLoggedIn) {
            AuthManager.loginPassword
        } else {
            binding.etPassword.text?.toString()?.trim() ?: ""
        }
        val title = binding.etTitle.text?.toString()?.trim() ?: ""
        val content = binding.etContent.text?.toString()?.trim() ?: ""
        val region = binding.etRegion.text?.toString()?.trim() ?: ""
        val rawTags = binding.etTags.text?.toString()?.trim() ?: ""
        val tags = listOf(categoryName, rawTags).filter { it.isNotEmpty() }.joinToString(",")

        if (author.isEmpty()) {
            Toast.makeText(requireContext(), "작성자를 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }
        if (!AuthManager.isLoggedIn && password.isEmpty()) {
            Toast.makeText(requireContext(), "비밀번호를 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }
        if (region.isEmpty()) {
            Toast.makeText(requireContext(), "지역을 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }
        if (title.isEmpty()) {
            Toast.makeText(requireContext(), "제목을 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }
        if (content.isEmpty()) {
            Toast.makeText(requireContext(), "내용을 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.btnSubmit.isEnabled = false

        lifecycleScope.launch {
            val request = CreatePostRequest(
                categoryId = categoryId,
                title = title,
                content = content,
                author = author,
                password = password,
                region = region,
                tags = tags
            )

            CommunityRepository.createPost(request).fold(
                onSuccess = {
                    MyActivityTracker.incrementPostCount(requireContext())
                    Toast.makeText(requireContext(), "게시글이 등록되었습니다", Toast.LENGTH_SHORT).show()
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
