package com.moduji.app

import android.Manifest
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.view.MotionEvent
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.MobileAds
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.databinding.ActivityMainBinding
import com.moduji.app.util.NotificationHelper
import com.moduji.app.util.NotificationWorker
import com.moduji.app.util.ThemeHelper
import kotlinx.coroutines.launch
import java.util.concurrent.TimeUnit

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { /* 거절해도 앱 사용에 지장 없음 */ }

    override fun onCreate(savedInstanceState: Bundle?) {
        // 저장된 테마 적용 (스플래시 전에 호출해야 깜빡임 방지)
        ThemeHelper.applySavedTheme(this)

        installSplashScreen()
        super.onCreate(savedInstanceState)

        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // NavController 연결
        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment) as NavHostFragment
        val navController = navHostFragment.navController
        binding.bottomNavigation.setupWithNavController(navController)

        // 같은 탭 재선택 시 해당 탭의 시작 화면으로 복귀
        binding.bottomNavigation.setOnItemReselectedListener { item ->
            navController.popBackStack(item.itemId, false)

            // 구인 탭: 서브 네비게이션도 지역선택 페이지로 초기화
            if (item.itemId == R.id.navigation_jobs) {
                val currentFragment = navHostFragment.childFragmentManager.primaryNavigationFragment
                if (currentFragment is com.moduji.app.ui.jobs.JobsFragment) {
                    val jobsNavHost = currentFragment.childFragmentManager
                        .findFragmentById(R.id.nav_host_jobs) as? NavHostFragment
                    jobsNavHost?.navController?.popBackStack(R.id.regionSelectFragment, false)
                }
            }
        }

        // 하단 네비게이션 아이콘/텍스트 색상 (테마 대응)
        val selectedColor = ContextCompat.getColor(this, R.color.app_text_primary)
        val unselectedColor = ContextCompat.getColor(this, R.color.app_text_hint)
        val iconColorList = ColorStateList(
            arrayOf(
                intArrayOf(android.R.attr.state_checked),
                intArrayOf()
            ),
            intArrayOf(selectedColor, unselectedColor)
        )
        binding.bottomNavigation.itemIconTintList = iconColorList
        binding.bottomNavigation.itemTextColor = iconColorList
        binding.bottomNavigation.setBackgroundColor(
            ContextCompat.getColor(this, R.color.app_nav_bar_bg)
        )

        // 알림 채널 생성
        NotificationHelper.createNotificationChannels(this)

        // 북마크 영구 저장 초기화
        com.moduji.app.util.BookmarkManager.init(this)

        // AdMob 초기화 및 배너 광고 로드
        MobileAds.initialize(this)
        binding.adView.loadAd(AdRequest.Builder().build())

        // 후기 탭 카테고리를 앱 시작 시 미리 로드 (Vercel 콜드 스타트 대비)
        lifecycleScope.launch {
            CommunityRepository.preloadCategories()
        }

        // 알림 권한 요청 (Android 13+)
        requestNotificationPermission()

        // WorkManager 주기적 알림 폴링 등록 (15분 간격)
        scheduleNotificationWorker()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    this, Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun scheduleNotificationWorker() {
        val workRequest = PeriodicWorkRequestBuilder<NotificationWorker>(
            15, TimeUnit.MINUTES
        ).build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            NotificationWorker.WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            workRequest
        )
    }

    /**
     * 후기 탭의 서브 네비게이션을 시작 화면(카테고리 선택)으로 초기화
     */
    fun resetCommunityNavigation() {
        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment) as? NavHostFragment ?: return
        navHostFragment.childFragmentManager.fragments.forEach { frag ->
            if (frag is com.moduji.app.ui.community.CommunityFragment) {
                val communityNavHost = frag.childFragmentManager
                    .findFragmentById(R.id.nav_host_community) as? NavHostFragment
                communityNavHost?.navController?.popBackStack(R.id.communityHomeFragment, false)
            }
        }
    }

    /**
     * 구인 탭의 서브 네비게이션을 시작 화면(지역 선택)으로 초기화
     */
    fun resetJobsNavigation() {
        val navHostFragment = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment) as? NavHostFragment ?: return
        navHostFragment.childFragmentManager.fragments.forEach { frag ->
            if (frag is com.moduji.app.ui.jobs.JobsFragment) {
                val jobsNavHost = frag.childFragmentManager
                    .findFragmentById(R.id.nav_host_jobs) as? NavHostFragment
                jobsNavHost?.navController?.popBackStack(R.id.regionSelectFragment, false)
            }
        }
    }

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.action == MotionEvent.ACTION_DOWN) {
            val focused = currentFocus
            if (focused is EditText) {
                val rect = Rect()
                focused.getGlobalVisibleRect(rect)
                if (!rect.contains(ev.rawX.toInt(), ev.rawY.toInt())) {
                    focused.clearFocus()
                    val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
                    imm.hideSoftInputFromWindow(focused.windowToken, 0)
                }
            }
        }
        return super.dispatchTouchEvent(ev)
    }
}
