package com.moduji.app.ui.community

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.moduji.app.R
import com.moduji.app.databinding.FragmentCommunityHomeBinding
import com.moduji.app.ui.common.KeywordAlertBottomSheet
import com.moduji.app.ui.community.adapter.CategoryAdapter

class CommunityHomeFragment : Fragment() {

    private var _binding: FragmentCommunityHomeBinding? = null
    private val binding get() = _binding!!

    private val viewModel: CommunityViewModel by activityViewModels()
    private lateinit var popularAdapter: CategoryAdapter
    private lateinit var allAdapter: CategoryAdapter

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCommunityHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupAdapters()
        setupSearch()
        setupLinks()
        observeData()

        binding.btnKeywordAlert.setOnClickListener {
            KeywordAlertBottomSheet.show(this)
        }
    }

    private fun setupAdapters() {
        val onCategoryClick = { cat: com.moduji.app.data.model.CommunityCategory ->
            val bundle = Bundle().apply {
                putInt("categoryId", cat.id)
                putString("categoryName", cat.name)
                putString("categoryEmoji", cat.emoji)
            }
            findNavController().navigate(R.id.action_home_to_postList, bundle)
        }

        popularAdapter = CategoryAdapter(onCategoryClick)
        allAdapter = CategoryAdapter(onCategoryClick)

        binding.rvPopular.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = popularAdapter
        }

        binding.rvAll.apply {
            layoutManager = LinearLayoutManager(requireContext())
            adapter = allAdapter
        }
    }

    private fun setupSearch() {
        binding.etSearch.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val query = s?.toString()?.trim() ?: ""
                viewModel.filterCategories(query)
            }
        })
    }

    private fun setupLinks() {
        binding.btnRetry.setOnClickListener {
            viewModel.loadCategories()
        }
    }

    private fun showContentSections(isSearching: Boolean) {
        binding.layoutError.visibility = View.GONE
        binding.tvEmpty.visibility = View.GONE
        binding.sectionPopular.visibility = if (isSearching) View.GONE else View.VISIBLE
        binding.dividerPopular.visibility = if (isSearching) View.GONE else View.VISIBLE
        binding.sectionAll.visibility = View.VISIBLE
        binding.tvAllTitle.text = if (isSearching) "검색 결과" else "전체 카테고리"
    }

    private fun showErrorState(message: String) {
        binding.layoutError.visibility = View.VISIBLE
        binding.tvError.text = message
        binding.sectionPopular.visibility = View.GONE
        binding.dividerPopular.visibility = View.GONE
        binding.sectionAll.visibility = View.GONE
        binding.tvEmpty.visibility = View.GONE
    }

    private fun observeData() {
        viewModel.isLoading.observe(viewLifecycleOwner) { loading ->
            binding.progressBar.visibility = if (loading) View.VISIBLE else View.GONE
        }

        viewModel.error.observe(viewLifecycleOwner) { error ->
            if (error != null) {
                showErrorState(error)
            }
        }

        viewModel.popularCategories.observe(viewLifecycleOwner) { list ->
            popularAdapter.submitList(list)
            // 데이터 로드 성공 시 컨텐츠 표시
            showContentSections(isSearching = false)
        }

        viewModel.filteredCategories.observe(viewLifecycleOwner) { list ->
            allAdapter.submitList(list)
            val isSearching = binding.etSearch.text?.isNotEmpty() == true

            if (isSearching && list.isEmpty()) {
                binding.tvEmpty.visibility = View.VISIBLE
                binding.sectionAll.visibility = View.GONE
            } else {
                binding.tvEmpty.visibility = View.GONE
                binding.sectionAll.visibility = View.VISIBLE
            }

            // 검색 중에는 인기 카테고리 숨김
            binding.sectionPopular.visibility = if (isSearching) View.GONE else View.VISIBLE
            binding.dividerPopular.visibility = if (isSearching) View.GONE else View.VISIBLE
            binding.tvAllTitle.text = if (isSearching) "검색 결과" else "전체 카테고리"
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
