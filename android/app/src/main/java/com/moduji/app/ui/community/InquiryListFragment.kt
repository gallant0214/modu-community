package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.moduji.app.R
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.FragmentInquiryListBinding
import com.moduji.app.ui.community.adapter.InquiryAdapter
import com.moduji.app.util.AuthManager
import com.moduji.app.util.NicknameManager
import kotlinx.coroutines.launch

class InquiryListFragment : Fragment() {

    private var _binding: FragmentInquiryListBinding? = null
    private val binding get() = _binding!!

    private lateinit var inquiryAdapter: InquiryAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentInquiryListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        inquiryAdapter = InquiryAdapter { inquiry ->
            navigateToDetail(inquiry)
        }

        binding.rvInquiries.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = inquiryAdapter
        }

        binding.fabWrite.setOnClickListener {
            if (!AuthManager.isLoggedIn) {
                Toast.makeText(requireContext(), "로그인 후 이용 가능합니다", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            findNavController().navigate(R.id.action_inquiry_to_write)
        }

        loadMyInquiries()
    }

    override fun onResume() {
        super.onResume()
        if (_binding != null) loadMyInquiries()
    }

    private fun loadMyInquiries() {
        if (!AuthManager.isLoggedIn) {
            binding.tvEmpty.visibility = View.VISIBLE
            binding.tvEmpty.text = "로그인 후 이용 가능합니다"
            return
        }

        val nickname = NicknameManager.getNickname(requireContext())
        if (nickname.isNullOrEmpty()) {
            binding.tvEmpty.visibility = View.VISIBLE
            binding.tvEmpty.text = "닉네임 설정 후 이용 가능합니다"
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.tvEmpty.visibility = View.GONE

        lifecycleScope.launch {
            CommunityRepository.getMyInquiries(nickname, AuthManager.loginPassword).fold(
                onSuccess = { list ->
                    inquiryAdapter.submitList(list)
                    binding.tvEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                    binding.tvEmpty.text = "작성한 문의가 없습니다"
                },
                onFailure = { e ->
                    binding.tvEmpty.visibility = View.VISIBLE
                    binding.tvEmpty.text = "오류: ${e.message}"
                }
            )
            binding.progressBar.visibility = View.GONE
        }
    }

    private fun navigateToDetail(inquiry: com.moduji.app.data.model.CommunityInquiry) {
        val bundle = Bundle().apply {
            putInt("inquiryId", inquiry.id)
            putString("inquiryTitle", inquiry.title)
            putString("inquiryAuthor", inquiry.author)
            putString("inquiryDate", inquiry.createdAt)
        }
        findNavController().navigate(R.id.action_inquiry_to_detail, bundle)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
