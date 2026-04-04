package com.moduji.app.util

import android.content.Context

/**
 * 탈퇴 관리 (SharedPreferences 기반)
 *
 * - 탈퇴한 Google 이메일 + 탈퇴 시각 저장
 * - 동일 이메일로 재가입 시 2주(14일) 제한
 */
object WithdrawalManager {

    private const val PREF_NAME = "withdrawal_prefs"
    private const val KEY_WITHDRAWN_EMAILS = "withdrawn_emails"
    private const val KEY_PREFIX_TIME = "withdrawn_at_"
    private const val TWO_WEEKS_MILLIS = 14L * 24 * 60 * 60 * 1000

    private fun getPrefs(context: Context) =
        SecurePrefs.get(context, PREF_NAME)

    /**
     * 탈퇴 처리: 이메일과 탈퇴 시각 기록
     */
    fun recordWithdrawal(context: Context, email: String) {
        val prefs = getPrefs(context)
        val emails = prefs.getStringSet(KEY_WITHDRAWN_EMAILS, mutableSetOf())
            ?.toMutableSet() ?: mutableSetOf()
        emails.add(email)

        prefs.edit()
            .putStringSet(KEY_WITHDRAWN_EMAILS, emails)
            .putLong(KEY_PREFIX_TIME + email, System.currentTimeMillis())
            .apply()
    }

    /**
     * 재가입 가능 여부 확인
     * @return true면 가입 가능, false면 2주 제한 중
     */
    fun canReRegister(context: Context, email: String): Boolean {
        val withdrawnAt = getPrefs(context).getLong(KEY_PREFIX_TIME + email, 0)
        if (withdrawnAt == 0L) return true
        return System.currentTimeMillis() - withdrawnAt >= TWO_WEEKS_MILLIS
    }

    /**
     * 재가입까지 남은 일수
     */
    fun getRemainingDays(context: Context, email: String): Int {
        val withdrawnAt = getPrefs(context).getLong(KEY_PREFIX_TIME + email, 0)
        if (withdrawnAt == 0L) return 0
        val elapsed = System.currentTimeMillis() - withdrawnAt
        val remaining = TWO_WEEKS_MILLIS - elapsed
        return if (remaining <= 0) 0 else ((remaining / (24 * 60 * 60 * 1000)) + 1).toInt()
    }

    /**
     * 제한 기간 만료된 이메일 기록 정리
     */
    fun clearExpiredRecord(context: Context, email: String) {
        val prefs = getPrefs(context)
        val emails = prefs.getStringSet(KEY_WITHDRAWN_EMAILS, mutableSetOf())
            ?.toMutableSet() ?: mutableSetOf()
        emails.remove(email)

        prefs.edit()
            .putStringSet(KEY_WITHDRAWN_EMAILS, emails)
            .remove(KEY_PREFIX_TIME + email)
            .apply()
    }
}
