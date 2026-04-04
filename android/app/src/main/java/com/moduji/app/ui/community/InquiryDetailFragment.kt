package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.FragmentInquiryDetailBinding
import com.moduji.app.util.AuthManager
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

class InquiryDetailFragment : Fragment() {

    private var _binding: FragmentInquiryDetailBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentInquiryDetailBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val inquiryId = arguments?.getInt("inquiryId") ?: return
        val inquiryTitle = arguments?.getString("inquiryTitle") ?: ""
        val inquiryAuthor = arguments?.getString("inquiryAuthor") ?: ""
        val inquiryDate = arguments?.getString("inquiryDate") ?: ""

        binding.btnBack.setOnClickListener {
            findNavController().popBackStack()
        }

        binding.tvTitle.text = inquiryTitle
        binding.tvAuthor.text = inquiryAuthor
        binding.tvDate.text = formatDate(inquiryDate)

        loadInquiryDetail(inquiryId)
    }

    private fun loadInquiryDetail(inquiryId: Int) {
        binding.progressBar.visibility = View.VISIBLE

        lifecycleScope.launch {
            // 관리자에서 진입 시 adminPassword 사용, 아니면 일반 loginPassword
            val adminPw = arguments?.getString("adminPassword")
            val password = if (!adminPw.isNullOrEmpty()) adminPw else AuthManager.loginPassword
            CommunityRepository.viewInquiry(inquiryId, password).fold(
                onSuccess = { resp ->
                    binding.progressBar.visibility = View.GONE
                    binding.scrollContent.visibility = View.VISIBLE

                    binding.tvContent.text = resp.content ?: "(내용 없음)"

                    if (!resp.reply.isNullOrBlank()) {
                        binding.layoutReply.visibility = View.VISIBLE
                        binding.tvReply.text = resp.reply
                        binding.tvReplyDate.text = if (!resp.repliedAt.isNullOrBlank()) {
                            formatDate(resp.repliedAt)
                        } else ""
                        binding.tvNoReply.visibility = View.GONE
                    } else {
                        binding.layoutReply.visibility = View.GONE
                        binding.tvNoReply.visibility = View.VISIBLE
                    }
                },
                onFailure = { e ->
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(requireContext(), "오류: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            )
        }
    }

    private fun formatDate(dateStr: String): String {
        return try {
            val parser = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
            parser.timeZone = TimeZone.getTimeZone("UTC")
            val date = parser.parse(dateStr) ?: return dateStr
            val formatter = SimpleDateFormat("yyyy.MM.dd HH:mm", Locale.getDefault())
            formatter.format(date)
        } catch (e: Exception) {
            dateStr.take(10)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
