package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.moduji.app.data.model.CreateInquiryRequest
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.FragmentInquiryWriteBinding
import kotlinx.coroutines.launch

class InquiryWriteFragment : Fragment() {

    private var _binding: FragmentInquiryWriteBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentInquiryWriteBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        binding.btnSubmit.setOnClickListener {
            submitInquiry()
        }
    }

    private fun submitInquiry() {
        val author = binding.etAuthor.text?.toString()?.trim() ?: ""
        val password = binding.etPassword.text?.toString()?.trim() ?: ""
        val email = binding.etEmail.text?.toString()?.trim() ?: ""
        val title = binding.etTitle.text?.toString()?.trim() ?: ""
        val content = binding.etContent.text?.toString()?.trim() ?: ""

        if (author.isEmpty()) {
            Toast.makeText(requireContext(), "작성자를 입력하세요", Toast.LENGTH_SHORT).show()
            return
        }
        if (password.isEmpty()) {
            Toast.makeText(requireContext(), "비밀번호를 입력하세요", Toast.LENGTH_SHORT).show()
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
            val request = CreateInquiryRequest(
                author = author,
                password = password,
                email = email,
                title = title,
                content = content
            )

            CommunityRepository.createInquiry(request).fold(
                onSuccess = {
                    Toast.makeText(requireContext(), "문의가 등록되었습니다", Toast.LENGTH_SHORT).show()
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
