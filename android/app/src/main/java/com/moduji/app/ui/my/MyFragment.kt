package com.moduji.app.ui.my

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import androidx.fragment.app.viewModels
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.materialswitch.MaterialSwitch
import androidx.navigation.fragment.findNavController
import com.moduji.app.R
import com.moduji.app.databinding.FragmentMyBinding
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.data.repository.JobsRepository
import com.moduji.app.ui.jobs.adapter.JobPostAdapter
import com.moduji.app.ui.common.KeywordAlertBottomSheet
import com.moduji.app.util.BookmarkManager
import com.moduji.app.util.KeywordAlertManager
import com.moduji.app.util.MyActivityTracker
import com.moduji.app.util.NicknameManager
import com.moduji.app.util.NotificationPrefsManager
import com.moduji.app.util.ThemeHelper
import com.moduji.app.util.WithdrawalManager

/**
 * My 탭 Fragment
 *
 * 로그인 상태에 따라 두 가지 UI를 전환:
 * - 게스트: 앱 소개 + Google 로그인 버튼 + 약관 안내
 * - 로그인: 프로필 + 내 활동 + 설정 메뉴
 *
 * Google Sign-In + Firebase Auth 연동
 */
class MyFragment : Fragment() {

    private var _binding: FragmentMyBinding? = null
    private val binding get() = _binding!!

    private val viewModel: MyViewModel by viewModels()

    private var googleSignInClient: GoogleSignInClient? = null
    private lateinit var signInLauncher: ActivityResultLauncher<Intent>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // ActivityResultLauncher 등록 (onCreate에서 등록해야 함)
        signInLauncher = registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            try {
                val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
                val account = task.getResult(ApiException::class.java)
                val idToken = account?.idToken
                val email = account?.email

                // 탈퇴 후 2주 제한 체크
                if (email != null && !WithdrawalManager.canReRegister(requireContext(), email)) {
                    val remaining = WithdrawalManager.getRemainingDays(requireContext(), email)
                    googleSignInClient?.signOut()
                    AlertDialog.Builder(requireContext())
                        .setTitle("재가입 제한")
                        .setMessage("탈퇴한 계정은 2주 후에 재가입이 가능합니다.\n${remaining}일 후에 다시 시도해주세요.")
                        .setPositiveButton("확인", null)
                        .show()
                    return@registerForActivityResult
                }

                if (idToken != null) {
                    viewModel.handleSignInResult(idToken)
                } else {
                    viewModel.onSignInFailed("Google 계정 정보를 가져올 수 없습니다.")
                }
            } catch (e: ApiException) {
                if (e.statusCode != 12501) {
                    viewModel.onSignInFailed("Google 로그인 실패: ${e.localizedMessage}")
                }
            }
        }

        // Google Sign-In 초기화 (google-services.json 없으면 건너뜀)
        try {
            val clientId = getString(R.string.default_web_client_id)
            if (clientId != "PLACEHOLDER" && clientId.isNotBlank()) {
                val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                    .requestIdToken(clientId)
                    .requestEmail()
                    .build()
                googleSignInClient = GoogleSignIn.getClient(requireActivity(), gso)
            }
        } catch (_: Exception) {
            // google-services.json 미설정 시 무시
        }
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentMyBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        setupGoogleLoginButton()
        setupMenuItems()
        setupAppVersion()
        observeLoginState()
        observeSignInEvent()
        observeError()
        applyNickname()
    }

    // ====================================================
    // 로그인 상태 관찰 → 부분 UI 전환
    // ====================================================
    private fun observeLoginState() {
        viewModel.isLoggedIn.observe(viewLifecycleOwner) { isLoggedIn ->
            // 프로필 영역
            binding.layoutProfile.visibility = if (isLoggedIn) View.VISIBLE else View.GONE
            // Google 로그인 버튼
            binding.layoutGoogleLogin.visibility = if (isLoggedIn) View.GONE else View.VISIBLE
            // 로그아웃 / 탈퇴하기 메뉴
            binding.menuLogout.root.visibility = if (isLoggedIn) View.VISIBLE else View.GONE
            binding.menuWithdraw.root.visibility = if (isLoggedIn) View.VISIBLE else View.GONE

            // 로그인 시 다른 탭(후기 등) 네비게이션 초기화 (글쓰기 등 중간 화면 제거)
            if (isLoggedIn) {
                resetOtherTabsNavigation()
            }

            // 로그인 직후 닉네임 미설정 시 설정 다이얼로그 표시
            if (isLoggedIn && NicknameManager.getNickname(requireContext()) == null) {
                showInitialNicknameDialog()
            }
        }

        viewModel.user.observe(viewLifecycleOwner) { user ->
            user?.let {
                // 저장된 닉네임이 있으면 우선 사용
                val saved = NicknameManager.getNickname(requireContext())
                binding.tvNickname.text = saved ?: it.nickname
                binding.tvEmail.text = it.email.ifEmpty { "이메일 없음" }
                updateCounts()
            }
        }

        // 프로필 닉네임 옆 [변경] 버튼
        binding.btnChangeNickname.setOnClickListener {
            showNicknameDialog()
        }
    }

    // ====================================================
    // Google Sign-In Event 관찰
    // ====================================================
    private fun observeSignInEvent() {
        viewModel.signInEvent.observe(viewLifecycleOwner) { shouldSignIn ->
            if (shouldSignIn) {
                viewModel.onSignInEventConsumed()
                val client = googleSignInClient
                if (client != null) {
                    signInLauncher.launch(client.signInIntent)
                } else {
                    Toast.makeText(requireContext(), "로그인 서비스가 준비되지 않았습니다", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    // ====================================================
    // 에러 관찰
    // ====================================================
    private fun observeError() {
        viewModel.error.observe(viewLifecycleOwner) { errorMsg ->
            errorMsg?.let {
                Toast.makeText(requireContext(), it, Toast.LENGTH_SHORT).show()
                viewModel.onErrorConsumed()
            }
        }
    }

    // ====================================================
    // Google 로그인 버튼
    // ====================================================
    private fun setupGoogleLoginButton() {
        binding.btnGoogleLogin.setOnClickListener {
            // 탈퇴 후 재가입 제한 체크: 마지막 로그인 이메일 확인
            val lastEmail = getLastWithdrawnEmail()
            if (lastEmail != null && !WithdrawalManager.canReRegister(requireContext(), lastEmail)) {
                val remaining = WithdrawalManager.getRemainingDays(requireContext(), lastEmail)
                AlertDialog.Builder(requireContext())
                    .setTitle("재가입 제한")
                    .setMessage("탈퇴한 계정은 2주 후에 재가입이 가능합니다.\n${remaining}일 후에 다시 시도해주세요.")
                    .setPositiveButton("확인", null)
                    .show()
                return@setOnClickListener
            }
            viewModel.onGoogleLoginClick()
        }
    }

    private fun getLastWithdrawnEmail(): String? {
        val prefs = requireContext().getSharedPreferences("withdrawal_prefs", android.content.Context.MODE_PRIVATE)
        val emails = prefs.getStringSet("withdrawn_emails", emptySet()) ?: emptySet()
        // 가장 최근 탈퇴한 이메일 반환
        return emails.maxByOrNull { prefs.getLong("withdrawn_at_$it", 0) }
    }

    /**
     * 로그인 필요 기능 클릭 시 분기 처리
     */
    private fun requireLogin(onClick: () -> Unit) {
        if (viewModel.isLoggedIn.value == true) {
            onClick()
        } else {
            Toast.makeText(requireContext(), "로그인해주세요", Toast.LENGTH_SHORT).show()
        }
    }

    // ====================================================
    // 닉네임 적용 (저장된 닉네임이 있으면 표시)
    // ====================================================
    private fun applyNickname() {
        val saved = NicknameManager.getNickname(requireContext())
        if (!saved.isNullOrBlank()) {
            binding.tvNickname.text = saved
        }
    }

    // ====================================================
    // 메뉴 아이템 설정
    // ====================================================
    private fun setupMenuItems() {
        // --- 내 활동 섹션 (로그인 필요) ---
        setupMenuItem(
            binding.menuMyPosts.root,
            R.drawable.ic_article, "내가 쓴 글"
        ) {
            requireLogin { showMyPosts() }
        }

        setupMenuItem(
            binding.menuMyComments.root,
            R.drawable.ic_comment, "내가 댓글 단 글"
        ) {
            requireLogin { showMyCommentedPosts() }
        }

        setupMenuItem(
            binding.menuBookmarks.root,
            R.drawable.ic_bookmark, "북마크"
        ) {
            showBookmarkedPosts()
        }

        setupMenuItem(
            binding.menuMyJobs.root,
            R.drawable.ic_work, "내가 등록한 구인글"
        ) {
            requireLogin { showMyJobPosts() }
        }

        setupMenuItem(
            binding.menuJobBookmarks.root,
            R.drawable.ic_bookmark, "구인 북마크"
        ) {
            showBookmarkedJobs()
        }

        // --- 설정 섹션 ---
        setupMenuItem(
            binding.menuNotiSettings.root,
            R.drawable.ic_notifications_active, "알림 설정"
        ) {
            showNotificationSettingsSheet()
        }

        setupThemeMenu()

        setupMenuItem(
            binding.menuLogout.root,
            R.drawable.ic_logout, "로그아웃"
        ) {
            viewModel.onLogout()
            googleSignInClient?.signOut()
            Toast.makeText(requireContext(), "로그아웃되었습니다", Toast.LENGTH_SHORT).show()
        }

        // 로그아웃: 설정 섹션 마지막 항목이므로 하단 divider 숨김
        binding.menuLogout.root.findViewById<View>(R.id.divider)?.visibility = View.GONE

        // --- 기타 섹션 ---
        setupMenuItem(
            binding.menuInquiry.root,
            R.drawable.ic_comment, "문의하기"
        ) {
            findNavController().navigate(R.id.action_profile_to_inquiry)
        }

        setupMenuItem(
            binding.menuWithdraw.root,
            R.drawable.ic_profile, "탈퇴하기"
        ) {
            showWithdrawDialog()
        }

        setupMenuItem(
            binding.menuTerms.root,
            R.drawable.ic_description, "이용약관"
        ) {
            val intent = android.content.Intent(
                android.content.Intent.ACTION_VIEW,
                android.net.Uri.parse("https://moducm.pages.dev/terms")
            )
            startActivity(intent)
        }

        setupMenuItem(
            binding.menuAdmin.root,
            R.drawable.ic_settings, "관리자"
        ) {
            findNavController().navigate(R.id.action_profile_to_admin)
        }

        // 관리자: 마지막 항목이므로 하단 divider 숨김
        binding.menuAdmin.root.findViewById<View>(R.id.divider)?.visibility = View.GONE
    }

    // ====================================================
    // 알림 설정 BottomSheet
    // ====================================================
    private fun showNotificationSettingsSheet() {
        val ctx = requireContext()
        val dialog = BottomSheetDialog(ctx)
        val sheetView = layoutInflater.inflate(R.layout.bottom_sheet_notification_settings, null)
        dialog.setContentView(sheetView)

        val settings = NotificationPrefsManager.getSettings(ctx)

        val switchPostComment = sheetView.findViewById<MaterialSwitch>(R.id.switch_post_comment)
        val switchCommentReply = sheetView.findViewById<MaterialSwitch>(R.id.switch_comment_reply)
        val switchJob = sheetView.findViewById<MaterialSwitch>(R.id.switch_job)
        val switchNotice = sheetView.findViewById<MaterialSwitch>(R.id.switch_notice)
        val switchPromo = sheetView.findViewById<MaterialSwitch>(R.id.switch_promo)

        switchPostComment.isChecked = settings.postComment
        switchCommentReply.isChecked = settings.commentReply
        switchJob.isChecked = settings.job
        switchNotice.isChecked = settings.notice
        switchPromo.isChecked = settings.promo

        switchPostComment.setOnCheckedChangeListener { _, checked ->
            NotificationPrefsManager.setSetting(ctx, NotificationPrefsManager.KEY_POST_COMMENT, checked)
        }
        switchCommentReply.setOnCheckedChangeListener { _, checked ->
            NotificationPrefsManager.setSetting(ctx, NotificationPrefsManager.KEY_COMMENT_REPLY, checked)
        }
        switchJob.setOnCheckedChangeListener { _, checked ->
            NotificationPrefsManager.setSetting(ctx, NotificationPrefsManager.KEY_JOB, checked)
        }
        switchNotice.setOnCheckedChangeListener { _, checked ->
            NotificationPrefsManager.setSetting(ctx, NotificationPrefsManager.KEY_NOTICE, checked)
        }
        switchPromo.setOnCheckedChangeListener { _, checked ->
            NotificationPrefsManager.setSetting(ctx, NotificationPrefsManager.KEY_PROMO, checked)
        }

        // 이용자 설정 알림 (키워드) 항목
        val keywordCount = KeywordAlertManager.getKeywords(ctx).size
        val tvKeywordCount = sheetView.findViewById<TextView>(R.id.tv_keyword_count)
        if (keywordCount > 0) {
            tvKeywordCount.text = "등록된 키워드 ${keywordCount}개"
        }

        sheetView.findViewById<View>(R.id.btn_keyword_settings).setOnClickListener {
            dialog.dismiss()
            KeywordAlertBottomSheet.show(this)
        }

        dialog.show()
    }

    // ====================================================
    // 화면 테마 선택 (화이트 / 다크 / 시스템)
    // ====================================================
    private fun setupThemeMenu() {
        val menuView = binding.menuTheme.root
        menuView.findViewById<ImageView>(R.id.iv_menu_icon)?.setImageResource(R.drawable.ic_dark_mode)
        menuView.findViewById<TextView>(R.id.tv_menu_title)?.text = "화면 테마"

        updateThemeLabel()

        menuView.setOnClickListener { showThemeDialog() }
    }

    private fun updateThemeLabel() {
        val saved = ThemeHelper.getSavedTheme(requireContext())
        binding.menuTheme.root.findViewById<TextView>(R.id.tv_menu_value)?.text =
            ThemeHelper.getThemeLabel(saved)
    }

    private fun showThemeDialog() {
        val saved = ThemeHelper.getSavedTheme(requireContext())
        val dialog = BottomSheetDialog(requireContext())
        val sheetView = layoutInflater.inflate(R.layout.dialog_theme_select, null)
        dialog.setContentView(sheetView)

        val checks = listOf(
            sheetView.findViewById<ImageView>(R.id.ic_check_light),
            sheetView.findViewById<ImageView>(R.id.ic_check_dark),
            sheetView.findViewById<ImageView>(R.id.ic_check_system)
        )
        checks[saved]?.visibility = View.VISIBLE

        val options = listOf(
            sheetView.findViewById<View>(R.id.option_light) to ThemeHelper.THEME_LIGHT,
            sheetView.findViewById<View>(R.id.option_dark) to ThemeHelper.THEME_DARK,
            sheetView.findViewById<View>(R.id.option_system) to ThemeHelper.THEME_SYSTEM
        )
        options.forEach { (view, theme) ->
            view?.setOnClickListener {
                ThemeHelper.applyTheme(requireContext(), theme)
                updateThemeLabel()
                dialog.dismiss()
            }
        }

        dialog.show()
    }

    /**
     * 일반 메뉴 아이템 설정 (아이콘 + 텍스트 + 화살표)
     */
    private fun setupMenuItem(
        menuView: View,
        iconRes: Int,
        title: String,
        onClick: () -> Unit
    ) {
        menuView.findViewById<ImageView>(R.id.iv_menu_icon)?.setImageResource(iconRes)
        menuView.findViewById<TextView>(R.id.tv_menu_title)?.text = title
        menuView.setOnClickListener { onClick() }
    }

    // ====================================================
    // 최초 로그인 시 닉네임 설정 다이얼로그
    // ====================================================
    private fun showInitialNicknameDialog() {
        val ctx = requireContext()
        viewLifecycleOwner.lifecycleScope.launch {
            val randomNickname = generateUniqueNickname(ctx)

            val editText = EditText(ctx).apply {
                setText(randomNickname)
                setSelectAllOnFocus(true)
                setPadding(64, 40, 64, 20)
                maxLines = 1
                isSingleLine = true
                filters = arrayOf(android.text.InputFilter.LengthFilter(NicknameManager.MAX_LENGTH))
            }

            val dialog = AlertDialog.Builder(ctx)
                .setTitle("닉네임을 설정하세요")
                .setMessage("커뮤니티에서 사용할 닉네임을 입력해주세요.\n(${NicknameManager.MIN_LENGTH}~${NicknameManager.MAX_LENGTH}자)")
                .setView(editText)
                .setCancelable(false)
                .setPositiveButton("설정", null)
                .create()

            dialog.show()

            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val nickname = editText.text.toString().trim()
                val error = validateNicknameLocal(nickname)
                if (error != null) {
                    Toast.makeText(ctx, error, Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                viewLifecycleOwner.lifecycleScope.launch {
                    val available = CommunityRepository.checkNickname(nickname).getOrNull()
                    if (available == false) {
                        Toast.makeText(ctx, "이미 사용 중인 닉네임입니다", Toast.LENGTH_SHORT).show()
                        return@launch
                    }
                    val oldName = NicknameManager.getNickname(ctx)
                    CommunityRepository.registerNickname(nickname, oldName)
                    dialog.dismiss()
                    NicknameManager.setNickname(ctx, nickname)
                    binding.tvNickname.text = nickname

                    AlertDialog.Builder(ctx)
                        .setTitle("닉네임 설정 완료")
                        .setMessage("닉네임이 '${nickname}'(으)로 설정되었습니다.\n닉네임 변경은 3주 뒤에 가능합니다.")
                        .setPositiveButton("확인", null)
                        .show()
                }
            }
        }
    }

    // ====================================================
    // 닉네임 설정 다이얼로그 (설정 메뉴에서 호출)
    // ====================================================
    private fun showNicknameDialog() {
        val ctx = requireContext()

        // 3주 제한 체크
        if (!NicknameManager.canChangeNickname(ctx)) {
            val remaining = NicknameManager.getRemainingDays(ctx)
            AlertDialog.Builder(ctx)
                .setTitle("닉네임 변경 불가")
                .setMessage("닉네임 변경은 3주마다 가능합니다.\n${remaining}일 후에 변경할 수 있습니다.")
                .setPositiveButton("확인", null)
                .show()
            return
        }

        val currentNickname = NicknameManager.getNickname(ctx) ?: ""

        viewLifecycleOwner.lifecycleScope.launch {
            val suggestedNickname = if (currentNickname.isEmpty())
                generateUniqueNickname(ctx) else currentNickname

            val editText = EditText(ctx).apply {
                setText(suggestedNickname)
                setSelectAllOnFocus(true)
                setPadding(64, 40, 64, 20)
                maxLines = 1
                isSingleLine = true
                filters = arrayOf(android.text.InputFilter.LengthFilter(NicknameManager.MAX_LENGTH))
            }

            val title = if (currentNickname.isEmpty()) "닉네임 설정" else "닉네임 변경"

            val dialog = AlertDialog.Builder(ctx)
                .setTitle(title)
                .setMessage("${NicknameManager.MIN_LENGTH}~${NicknameManager.MAX_LENGTH}자로 입력해주세요.")
                .setView(editText)
                .setPositiveButton("저장", null)
                .setNegativeButton("취소", null)
                .create()

            dialog.show()

            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val newNickname = editText.text.toString().trim()
                val error = validateNicknameLocal(newNickname)
                if (error != null) {
                    Toast.makeText(ctx, error, Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }
                if (newNickname == currentNickname) {
                    dialog.dismiss()
                    return@setOnClickListener
                }
                viewLifecycleOwner.lifecycleScope.launch {
                    val available = CommunityRepository.checkNickname(newNickname).getOrNull()
                    if (available == false) {
                        Toast.makeText(ctx, "이미 사용 중인 닉네임입니다", Toast.LENGTH_SHORT).show()
                        return@launch
                    }
                    CommunityRepository.registerNickname(newNickname, currentNickname)
                    dialog.dismiss()
                    NicknameManager.setNickname(ctx, newNickname)
                    binding.tvNickname.text = newNickname
                    Toast.makeText(ctx, "닉네임이 설정되었습니다", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun validateNicknameLocal(nickname: String): String? {
        if (nickname.isEmpty()) return "닉네임을 입력하세요"
        if (nickname.length < NicknameManager.MIN_LENGTH)
            return "닉네임은 ${NicknameManager.MIN_LENGTH}자 이상 입력하세요"
        if (nickname.length > NicknameManager.MAX_LENGTH)
            return "닉네임은 ${NicknameManager.MAX_LENGTH}자 이하로 입력하세요"
        return null
    }

    private suspend fun generateUniqueNickname(ctx: android.content.Context): String {
        // 서버에서 중복 확인하며 랜덤 닉네임 생성
        repeat(10) {
            val candidate = NicknameManager.generateRandomNickname(ctx)
            val available = CommunityRepository.checkNickname(candidate).getOrNull()
            if (available != false) return candidate
        }
        return NicknameManager.generateRandomNickname(ctx)
    }

    // ====================================================
    // 탈퇴하기
    // ====================================================
    private fun showWithdrawDialog() {
        val ctx = requireContext()
        AlertDialog.Builder(ctx)
            .setTitle("탈퇴하기")
            .setMessage("정말 탈퇴하시겠습니까?\n\n탈퇴 후 동일한 계정으로 재가입은 2주 뒤에 가능합니다.\n작성한 글과 댓글은 삭제되지 않습니다.")
            .setPositiveButton("탈퇴") { _, _ ->
                performWithdrawal()
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun performWithdrawal() {
        val ctx = requireContext()
        val email = viewModel.user.value?.email ?: ""

        // 탈퇴 기록 저장
        if (email.isNotEmpty()) {
            WithdrawalManager.recordWithdrawal(ctx, email)
        }

        // 닉네임 초기화
        NicknameManager.setNickname(ctx, "")
        ctx.getSharedPreferences("nickname_prefs", android.content.Context.MODE_PRIVATE)
            .edit().remove("nickname").remove("last_changed_at").apply()

        // 로그아웃 처리
        viewModel.onLogout()
        googleSignInClient?.signOut()

        Toast.makeText(ctx, "탈퇴가 완료되었습니다", Toast.LENGTH_SHORT).show()
    }

    // ====================================================
    // 구인 북마크 목록 표시
    // ====================================================
    private fun showBookmarkedJobs() {
        viewLifecycleOwner.lifecycleScope.launch {
            val bookmarkedIds = BookmarkManager.getBookmarkedIds()
            val bookmarkedPosts = bookmarkedIds.mapNotNull { id ->
                JobsRepository.getJobPostById(id).getOrNull()
            }

            if (bookmarkedPosts.isEmpty()) {
                Toast.makeText(requireContext(), "등록한 게시글이 없습니다", Toast.LENGTH_SHORT).show()
                return@launch
            }

            val ctx = requireContext()
            val dialog = BottomSheetDialog(ctx)

        val container = android.widget.LinearLayout(ctx).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(0, 24, 0, 0)
        }

        // 타이틀
        val title = TextView(ctx).apply {
            text = "구인 북마크"
            textSize = 18f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(ctx.getColor(R.color.app_text_primary))
            setPadding(48, 16, 48, 24)
        }
        container.addView(title)

        // RecyclerView
        val recyclerView = androidx.recyclerview.widget.RecyclerView(ctx).apply {
            layoutManager = androidx.recyclerview.widget.LinearLayoutManager(ctx)
            adapter = JobPostAdapter(bookmarkedPosts) { post ->
                dialog.dismiss()
                Toast.makeText(ctx, post.title, Toast.LENGTH_SHORT).show()
            }
        }
        container.addView(recyclerView, ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ))

            dialog.setContentView(container)
            dialog.show()
        }
    }

    // ====================================================
    // 커뮤니티 북마크 목록 표시
    // ====================================================
    private fun showBookmarkedPosts() {
        viewLifecycleOwner.lifecycleScope.launch {
            BookmarkManager.init(requireContext())
            val bookmarkedIds = BookmarkManager.getCommunityBookmarkedIds()

            if (bookmarkedIds.isEmpty()) {
                Toast.makeText(requireContext(), "북마크한 게시글이 없습니다", Toast.LENGTH_SHORT).show()
                return@launch
            }

            val bookmarkedPosts = bookmarkedIds.mapNotNull { id ->
                CommunityRepository.getPost(id).getOrNull()
            }

            if (bookmarkedPosts.isEmpty()) {
                Toast.makeText(requireContext(), "북마크한 게시글이 없습니다", Toast.LENGTH_SHORT).show()
                return@launch
            }

            val ctx = requireContext()
            val dialog = BottomSheetDialog(ctx)

            val container = android.widget.LinearLayout(ctx).apply {
                orientation = android.widget.LinearLayout.VERTICAL
                setPadding(0, 24, 0, 0)
            }

            val title = TextView(ctx).apply {
                text = "북마크"
                textSize = 18f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(ctx.getColor(R.color.app_text_primary))
                setPadding(48, 16, 48, 24)
            }
            container.addView(title)

            val recyclerView = androidx.recyclerview.widget.RecyclerView(ctx).apply {
                layoutManager = androidx.recyclerview.widget.LinearLayoutManager(ctx)
                adapter = com.moduji.app.ui.community.adapter.PostListAdapter({ post ->
                    dialog.dismiss()
                    val bundle = Bundle().apply {
                        putInt("postId", post.id)
                        putInt("categoryId", post.categoryId)
                    }
                    findNavController().navigate(R.id.action_profile_to_postDetail, bundle)
                }).also { adapter ->
                    adapter.submitList(bookmarkedPosts.map {
                        com.moduji.app.ui.community.adapter.PostListItem.PostItem(it)
                    })
                }
            }
            container.addView(recyclerView, ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ))

            dialog.setContentView(container)
            dialog.show()
        }
    }

    // ====================================================
    // 내가 쓴 글
    // ====================================================
    private fun showMyPosts() {
        val nickname = NicknameManager.getNickname(requireContext())
        if (nickname.isNullOrBlank()) {
            Toast.makeText(requireContext(), "닉네임을 먼저 설정하세요", Toast.LENGTH_SHORT).show()
            return
        }
        viewLifecycleOwner.lifecycleScope.launch {
            val posts = CommunityRepository.getMyPosts(nickname).getOrNull() ?: emptyList()
            if (posts.isEmpty()) {
                Toast.makeText(requireContext(), "작성한 게시글이 없습니다", Toast.LENGTH_SHORT).show()
                return@launch
            }
            showPostListBottomSheet("내가 쓴 글", posts)
        }
    }

    // ====================================================
    // 내가 댓글 단 글
    // ====================================================
    private fun showMyCommentedPosts() {
        val nickname = NicknameManager.getNickname(requireContext())
        if (nickname.isNullOrBlank()) {
            Toast.makeText(requireContext(), "닉네임을 먼저 설정하세요", Toast.LENGTH_SHORT).show()
            return
        }
        viewLifecycleOwner.lifecycleScope.launch {
            val posts = CommunityRepository.getMyCommentedPosts(nickname).getOrNull() ?: emptyList()
            if (posts.isEmpty()) {
                Toast.makeText(requireContext(), "댓글을 작성한 게시글이 없습니다", Toast.LENGTH_SHORT).show()
                return@launch
            }
            showPostListBottomSheet("내가 댓글 단 글", posts)
        }
    }

    // ====================================================
    // 내가 등록한 구인글
    // ====================================================
    private fun showMyJobPosts() {
        val nickname = NicknameManager.getNickname(requireContext())
        if (nickname.isNullOrBlank()) {
            Toast.makeText(requireContext(), "닉네임을 먼저 설정하세요", Toast.LENGTH_SHORT).show()
            return
        }
        viewLifecycleOwner.lifecycleScope.launch {
            val posts = JobsRepository.getMyJobPosts(nickname).getOrNull() ?: emptyList()
            if (posts.isEmpty()) {
                Toast.makeText(requireContext(), "등록한 구인글이 없습니다", Toast.LENGTH_SHORT).show()
                return@launch
            }

            val ctx = requireContext()
            val dialog = BottomSheetDialog(ctx)
            val container = android.widget.LinearLayout(ctx).apply {
                orientation = android.widget.LinearLayout.VERTICAL
                setPadding(0, 24, 0, 0)
            }
            val title = TextView(ctx).apply {
                text = "내가 등록한 구인글"
                textSize = 18f
                setTypeface(typeface, android.graphics.Typeface.BOLD)
                setTextColor(ctx.getColor(R.color.app_text_primary))
                setPadding(48, 16, 48, 24)
            }
            container.addView(title)

            val recyclerView = androidx.recyclerview.widget.RecyclerView(ctx).apply {
                layoutManager = androidx.recyclerview.widget.LinearLayoutManager(ctx)
                adapter = JobPostAdapter(posts) { post ->
                    dialog.dismiss()
                    Toast.makeText(ctx, post.title, Toast.LENGTH_SHORT).show()
                }
            }
            container.addView(recyclerView, ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ))
            dialog.setContentView(container)
            dialog.show()
        }
    }

    // ====================================================
    // 게시글 목록 BottomSheet 공통
    // ====================================================
    private fun showPostListBottomSheet(titleText: String, posts: List<com.moduji.app.data.model.CommunityPost>) {
        val ctx = requireContext()
        val dialog = BottomSheetDialog(ctx)
        val container = android.widget.LinearLayout(ctx).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(0, 24, 0, 0)
        }
        val title = TextView(ctx).apply {
            text = titleText
            textSize = 18f
            setTypeface(typeface, android.graphics.Typeface.BOLD)
            setTextColor(ctx.getColor(R.color.app_text_primary))
            setPadding(48, 16, 48, 24)
        }
        container.addView(title)

        val recyclerView = androidx.recyclerview.widget.RecyclerView(ctx).apply {
            layoutManager = androidx.recyclerview.widget.LinearLayoutManager(ctx)
            adapter = com.moduji.app.ui.community.adapter.PostListAdapter({ post ->
                dialog.dismiss()
                val bundle = Bundle().apply {
                    putInt("postId", post.id)
                    putInt("categoryId", post.categoryId)
                }
                findNavController().navigate(R.id.action_profile_to_postDetail, bundle)
            }).also { adapter ->
                adapter.submitList(posts.map {
                    com.moduji.app.ui.community.adapter.PostListItem.PostItem(it)
                })
            }
        }
        container.addView(recyclerView, ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        dialog.setContentView(container)
        dialog.show()
    }

    // ====================================================
    // 작성글/북마크 카운트 갱신
    // ====================================================
    private fun updateCounts() {
        val ctx = requireContext()
        BookmarkManager.init(ctx)
        binding.tvPostCount.text = MyActivityTracker.getTotalPostCount(ctx).toString()
        binding.tvBookmarkCount.text = BookmarkManager.totalCount().toString()
    }

    override fun onResume() {
        super.onResume()
        applyNickname()
        if (viewModel.isLoggedIn.value == true) {
            updateCounts()
        }
    }

    // ====================================================
    // 앱 버전 표시
    // ====================================================
    private fun setupAppVersion() {
        val versionName = try {
            requireContext().packageManager
                .getPackageInfo(requireContext().packageName, 0).versionName
        } catch (_: Exception) {
            "1.0"
        }
        binding.tvAppVersion.text = "앱 버전 $versionName"
    }

    /**
     * 로그인 시 후기 탭 등 다른 탭의 서브 네비게이션을 시작 화면으로 초기화
     */
    private fun resetOtherTabsNavigation() {
        (activity as? com.moduji.app.MainActivity)?.resetCommunityNavigation()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
