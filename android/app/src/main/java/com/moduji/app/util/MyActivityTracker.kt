package com.moduji.app.util

import android.content.Context

/**
 * 내 활동 카운트 추적 (SharedPreferences 영구 저장)
 *
 * 추적 항목:
 * - 작성글 (커뮤니티 게시글)
 * - 작성 댓글
 * - 등록 구인글
 */
object MyActivityTracker {

    private const val PREFS_NAME = "my_activity_prefs"
    private const val KEY_POST_COUNT = "post_count"
    private const val KEY_COMMENT_COUNT = "comment_count"
    private const val KEY_JOB_POST_COUNT = "job_post_count"

    fun getPostCount(context: Context): Int =
        prefs(context).getInt(KEY_POST_COUNT, 0)

    fun getCommentCount(context: Context): Int =
        prefs(context).getInt(KEY_COMMENT_COUNT, 0)

    fun getJobPostCount(context: Context): Int =
        prefs(context).getInt(KEY_JOB_POST_COUNT, 0)

    fun incrementPostCount(context: Context) {
        val current = getPostCount(context)
        prefs(context).edit().putInt(KEY_POST_COUNT, current + 1).apply()
    }

    fun incrementCommentCount(context: Context) {
        val current = getCommentCount(context)
        prefs(context).edit().putInt(KEY_COMMENT_COUNT, current + 1).apply()
    }

    fun incrementJobPostCount(context: Context) {
        val current = getJobPostCount(context)
        prefs(context).edit().putInt(KEY_JOB_POST_COUNT, current + 1).apply()
    }

    /** 총 작성글 수 (커뮤니티 + 구인) */
    fun getTotalPostCount(context: Context): Int =
        getPostCount(context) + getJobPostCount(context)

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
}
