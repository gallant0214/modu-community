package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.navigation.fragment.findNavController
import com.moduji.app.R
import com.moduji.app.databinding.FragmentInquiryListBinding

class InquiryListFragment : Fragment() {

    private var _binding: FragmentInquiryListBinding? = null
    private val binding get() = _binding!!

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

        binding.btnWrite.setOnClickListener {
            findNavController().navigate(R.id.action_inquiry_to_write)
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
