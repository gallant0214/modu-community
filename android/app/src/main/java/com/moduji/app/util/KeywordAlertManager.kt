package com.moduji.app.util

import android.content.Context

/**
 * 키워드 알림 관리 (SharedPreferences 기반)
 *
 * - 사용자가 등록한 키워드 목록 저장/조회/삭제
 * - 새 게시글 제목/내용에 키워드가 포함되면 알림 발송
 * - 시험후기 탭, 구인 탭 모두에서 공통 사용
 */
object KeywordAlertManager {

    private const val PREF_NAME = "keyword_alert_prefs"
    private const val KEY_KEYWORDS = "alert_keywords"
    private const val MAX_KEYWORDS = 20

    private fun getPrefs(context: Context) =
        SecurePrefs.get(context, PREF_NAME)

    /**
     * 등록된 키워드 목록 반환
     */
    fun getKeywords(context: Context): List<String> {
        val set = getPrefs(context).getStringSet(KEY_KEYWORDS, emptySet()) ?: emptySet()
        return set.sorted()
    }

    /**
     * 키워드 추가
     * @return null이면 성공, 에러 메시지면 실패
     */
    fun addKeyword(context: Context, keyword: String): String? {
        val trimmed = keyword.trim()
        if (trimmed.isEmpty()) return "키워드를 입력하세요"
        if (trimmed.length < 2) return "2자 이상 입력하세요"
        if (trimmed.length > 20) return "20자 이하로 입력하세요"

        val current = getPrefs(context).getStringSet(KEY_KEYWORDS, emptySet())
            ?.toMutableSet() ?: mutableSetOf()

        if (trimmed in current) return "이미 등록된 키워드입니다"
        if (current.size >= MAX_KEYWORDS) return "최대 ${MAX_KEYWORDS}개까지 등록할 수 있습니다"

        current.add(trimmed)
        getPrefs(context).edit().putStringSet(KEY_KEYWORDS, current).apply()
        return null
    }

    /**
     * 키워드 삭제
     */
    fun removeKeyword(context: Context, keyword: String) {
        val current = getPrefs(context).getStringSet(KEY_KEYWORDS, emptySet())
            ?.toMutableSet() ?: mutableSetOf()
        current.remove(keyword)
        getPrefs(context).edit().putStringSet(KEY_KEYWORDS, current).apply()
    }

    /**
     * 텍스트에 등록된 키워드가 포함되어 있는지 확인
     * @return 매칭된 키워드 목록
     */
    fun findMatchingKeywords(context: Context, text: String): List<String> {
        return getKeywords(context).filter { keyword ->
            text.contains(keyword, ignoreCase = true)
        }
    }

    /**
     * 새 게시글에 대해 키워드 알림 체크 및 발송
     */
    fun checkAndNotify(context: Context, title: String, content: String = "") {
        val searchText = "$title $content"
        val matched = findMatchingKeywords(context, searchText)
        matched.forEach { keyword ->
            NotificationHelper.sendKeywordAlertNotification(context, keyword, title)
        }
    }
}
