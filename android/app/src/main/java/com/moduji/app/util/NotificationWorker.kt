package com.moduji.app.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.moduji.app.data.repository.CommunityRepository
import com.moduji.app.data.repository.JobsRepository

/**
 * 백그라운드 알림 폴링 Worker
 *
 * 주기적으로 서버에서 새 게시글/구인글을 확인하고
 * 사용자 알림 설정에 따라 로컬 푸시 알림을 전송합니다.
 *
 * 체크 항목:
 * - 새 게시글 (커뮤니티)
 * - 새 구인글
 * - 키워드 알림 (등록된 키워드가 포함된 게시글)
 */
class NotificationWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    companion object {
        const val WORK_NAME = "notification_poll"
        private const val PREFS_NAME = "notification_worker_prefs"
        private const val KEY_LAST_POST_ID = "last_post_id"
        private const val KEY_LAST_JOB_ID = "last_job_id"
    }

    override suspend fun doWork(): Result {
        // 알림 권한 체크 (Android 13+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(
                    applicationContext,
                    Manifest.permission.POST_NOTIFICATIONS
                ) != PackageManager.PERMISSION_GRANTED
            ) {
                return Result.success()
            }
        }

        val prefs = SecurePrefs.get(applicationContext, PREFS_NAME)
        val lastPostId = prefs.getInt(KEY_LAST_POST_ID, 0)
        val lastJobId = prefs.getInt(KEY_LAST_JOB_ID, 0)

        // 새 게시글 체크
        checkNewPosts(lastPostId, prefs)

        // 새 구인글 체크
        checkNewJobs(lastJobId, prefs)

        return Result.success()
    }

    private suspend fun checkNewPosts(lastPostId: Int, prefs: android.content.SharedPreferences) {
        CommunityRepository.getLatestPosts(5).getOrNull()?.let { posts ->
            if (posts.isEmpty()) return

            val newestId = posts.maxOf { it.id }

            // 최초 실행 시 ID만 저장하고 알림 보내지 않음
            if (lastPostId == 0) {
                prefs.edit().putInt(KEY_LAST_POST_ID, newestId).apply()
                return
            }

            // 새 게시글이 있으면 알림
            val newPosts = posts.filter { it.id > lastPostId }
            if (newPosts.isNotEmpty()) {
                // 게시글 알림 (공지 채널 사용)
                if (NotificationPrefsManager.isEnabled(
                        applicationContext,
                        NotificationPrefsManager.KEY_NOTICE
                    )
                ) {
                    val title = if (newPosts.size == 1) newPosts[0].title
                    else "${newPosts[0].title} 외 ${newPosts.size - 1}개"
                    NotificationHelper.sendNoticeNotification(
                        applicationContext,
                        "새 게시글: $title"
                    )
                }

                // 키워드 알림 체크
                val keywords = KeywordAlertManager.getKeywords(applicationContext)
                if (keywords.isNotEmpty()) {
                    newPosts.forEach { post ->
                        keywords.forEach { keyword ->
                            if (post.title.contains(keyword, ignoreCase = true) ||
                                post.content.contains(keyword, ignoreCase = true)
                            ) {
                                NotificationHelper.sendKeywordAlertNotification(
                                    applicationContext,
                                    keyword,
                                    post.title
                                )
                            }
                        }
                    }
                }

                prefs.edit().putInt(KEY_LAST_POST_ID, newestId).apply()
            }
        }
    }

    private suspend fun checkNewJobs(lastJobId: Int, prefs: android.content.SharedPreferences) {
        JobsRepository.getLatestJobs(3).getOrNull()?.let { jobs ->
            if (jobs.isEmpty()) return

            val newestId = jobs.maxOf { it.id }

            // 최초 실행 시 ID만 저장
            if (lastJobId == 0) {
                prefs.edit().putInt(KEY_LAST_JOB_ID, newestId).apply()
                return
            }

            val newJobs = jobs.filter { it.id > lastJobId }
            if (newJobs.isNotEmpty() && NotificationPrefsManager.isEnabled(
                    applicationContext,
                    NotificationPrefsManager.KEY_JOB
                )
            ) {
                val title = if (newJobs.size == 1) newJobs[0].title
                else "${newJobs[0].title} 외 ${newJobs.size - 1}개"
                NotificationHelper.sendJobNotification(applicationContext, title)

                prefs.edit().putInt(KEY_LAST_JOB_ID, newestId).apply()
            }
        }
    }
}
