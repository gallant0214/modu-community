package com.moduji.app.ui.community

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import com.moduji.app.databinding.FragmentCommunityBinding

/**
 * 후기(Community) 탭 Fragment
 *
 * - 서브 네비게이션 호스트 컨테이너
 * - 내부적으로 CommunityHomeFragment → PostListFragment → PostDetailFragment 등 전환
 * - BottomNavigationView에서 이 Fragment를 호스팅
 */
class CommunityFragment : Fragment() {

    private var _binding: FragmentCommunityBinding? = null
    private val binding get() = _binding!!

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCommunityBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
