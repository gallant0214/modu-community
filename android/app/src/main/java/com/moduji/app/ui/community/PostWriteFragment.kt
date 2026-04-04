package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import com.moduji.app.R
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.moduji.app.data.model.CreatePostRequest
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.FragmentPostWriteBinding
import com.moduji.app.util.AuthManager
import com.moduji.app.util.showCenterSplash
import com.moduji.app.util.MyActivityTracker
import com.moduji.app.util.NicknameManager
import kotlinx.coroutines.launch

class PostWriteFragment : Fragment() {

    private var _binding: FragmentPostWriteBinding? = null
    private val binding get() = _binding!!

    private var categoryId = 0
    private var categoryName = ""
    private var selectedTag = ""

    private val tagOptions = arrayOf("기타", "실기", "구술")

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

        // 헤더 제목: "(종목) 후기 글쓰기"
        if (categoryName.isNotEmpty()) {
            binding.tvHeaderTitle.text = "$categoryName 후기 글쓰기"
        }

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

        binding.tvTagSelect.setOnClickListener { showTagDialog() }

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
        val tags = listOf(categoryName, selectedTag).filter { it.isNotEmpty() }.joinToString(",")

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
        if (selectedTag.isEmpty()) {
            Toast.makeText(requireContext(), "태그를 선택하세요", Toast.LENGTH_SHORT).show()
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
                    showCenterSplash("게시되었습니다")
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

    private fun showTagDialog() {
        val dialogView = layoutInflater.inflate(R.layout.dialog_tag_select, null)
        val dialog = androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setView(dialogView)
            .create()
        dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

        val segIds = intArrayOf(R.id.seg_0, R.id.seg_1, R.id.seg_2)
        val dividerIds = intArrayOf(R.id.divider_0, R.id.divider_1)
        val selectedBgs = intArrayOf(
            R.drawable.bg_segment_start_selected,
            R.drawable.bg_segment_center_selected,
            R.drawable.bg_segment_end_selected
        )
        val selectedIndex = tagOptions.indexOf(selectedTag)

        fun applySegmentStyle(index: Int) {
            segIds.forEachIndexed { i, id ->
                val seg = dialogView.findViewById<android.widget.TextView>(id)
                if (i == index) {
                    seg.setBackgroundResource(selectedBgs[i])
                    seg.setTextColor(resources.getColor(R.color.md_theme_onPrimary, null))
                    seg.setTypeface(null, android.graphics.Typeface.BOLD)
                } else {
                    seg.setBackgroundResource(0)
                    seg.setTextColor(resources.getColor(R.color.app_text_primary, null))
                    seg.setTypeface(null, android.graphics.Typeface.NORMAL)
                }
            }
            // 선택된 세그먼트 옆 구분선 숨김
            dividerIds.forEachIndexed { i, id ->
                val divider = dialogView.findViewById<View>(id)
                divider.visibility = if (i == index || i + 1 == index) View.INVISIBLE else View.VISIBLE
            }
        }

        if (selectedIndex >= 0) applySegmentStyle(selectedIndex)

        segIds.forEachIndexed { i, id ->
            dialogView.findViewById<View>(id).setOnClickListener {
                selectedTag = tagOptions[i]
                binding.tvTagSelect.text = selectedTag
                binding.tvTagSelect.setTypeface(null, android.graphics.Typeface.BOLD)
                dialog.dismiss()
            }
        }

        dialogView.findViewById<View>(R.id.btn_cancel).setOnClickListener {
            dialog.dismiss()
        }
        dialog.show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
