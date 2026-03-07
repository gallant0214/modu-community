package com.moduji.app.util

import android.content.Context

/**
 * 알림 설정 관리 (SharedPreferences 기반)
 *
 * 카테고리별 알림 ON/OFF:
 * - 게시글의 댓글
 * - 댓글의 댓글 (대댓글)
 * - 구인
 * - 공지
 * - 광고/프로모션
 */
object NotificationPrefsManager {

    private const val PREF_NAME = "notification_prefs"

    const val KEY_POST_COMMENT = "noti_post_comment"
    const val KEY_COMMENT_REPLY = "noti_comment_reply"
    const val KEY_JOB = "noti_job"
    const val KEY_NOTICE = "noti_notice"
    const val KEY_PROMO = "noti_promo"

    data class NotificationSettings(
        val postComment: Boolean,
        val commentReply: Boolean,
        val job: Boolean,
        val notice: Boolean,
        val promo: Boolean
    ) {
        val anyEnabled: Boolean
            get() = postComment || commentReply || job || notice || promo
    }

    private fun getPrefs(context: Context) =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun getSettings(context: Context): NotificationSettings {
        val prefs = getPrefs(context)
        return NotificationSettings(
            postComment = prefs.getBoolean(KEY_POST_COMMENT, true),
            commentReply = prefs.getBoolean(KEY_COMMENT_REPLY, true),
            job = prefs.getBoolean(KEY_JOB, true),
            notice = prefs.getBoolean(KEY_NOTICE, true),
            promo = prefs.getBoolean(KEY_PROMO, false)
        )
    }

    fun setSetting(context: Context, key: String, enabled: Boolean) {
        getPrefs(context).edit().putBoolean(key, enabled).apply()
    }

    fun isEnabled(context: Context, key: String): Boolean {
        val default = key != KEY_PROMO // 광고/프로모션만 기본 OFF
        return getPrefs(context).getBoolean(key, default)
    }
}
