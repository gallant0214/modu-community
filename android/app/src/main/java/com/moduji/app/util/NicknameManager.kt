package com.moduji.app.util

import android.content.Context

/**
 * 닉네임 관리 (SharedPreferences 기반)
 *
 * - 닉네임 저장/조회
 * - 변경 후 3주(21일) 동안 재변경 불가
 * - 중복 닉네임 체크
 * - 랜덤 재미있는 닉네임 생성
 */
object NicknameManager {

    private const val PREF_NAME = "nickname_prefs"
    private const val KEY_NICKNAME = "nickname"
    private const val KEY_LAST_CHANGED = "last_changed_at"
    private const val KEY_USED_NICKNAMES = "used_nicknames"
    private const val THREE_WEEKS_MILLIS = 21L * 24 * 60 * 60 * 1000

    const val MIN_LENGTH = 2
    const val MAX_LENGTH = 8

    private val ADJECTIVES = listOf(
        "행복한", "졸린", "용감한", "배고픈", "신나는",
        "깜찍한", "수줍은", "엉뚱한", "느긋한", "씩씩한",
        "귀여운", "당당한", "활발한", "조용한", "멋진",
        "반짝이는", "소심한", "든든한", "장난친", "심심한"
    )

    private val NOUNS = listOf(
        "수달", "판다", "고양이", "강아지", "토끼",
        "펭귄", "다람쥐", "해달", "코알라", "여우",
        "오리", "곰돌이", "부엉이", "햄스터", "거북이",
        "미어캣", "알파카", "치타", "수박", "감자"
    )

    private fun getPrefs(context: Context) =
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)

    fun getNickname(context: Context): String? =
        getPrefs(context).getString(KEY_NICKNAME, null)

    fun setNickname(context: Context, nickname: String) {
        val used = getUsedNicknames(context).toMutableSet()
        // 기존 닉네임 제거 후 새 닉네임 등록
        getNickname(context)?.let { used.remove(it) }
        used.add(nickname)

        getPrefs(context).edit()
            .putString(KEY_NICKNAME, nickname)
            .putLong(KEY_LAST_CHANGED, System.currentTimeMillis())
            .putStringSet(KEY_USED_NICKNAMES, used)
            .apply()
    }

    fun canChangeNickname(context: Context): Boolean {
        val lastChanged = getPrefs(context).getLong(KEY_LAST_CHANGED, 0)
        if (lastChanged == 0L) return true
        return System.currentTimeMillis() - lastChanged >= THREE_WEEKS_MILLIS
    }

    fun getRemainingDays(context: Context): Int {
        val lastChanged = getPrefs(context).getLong(KEY_LAST_CHANGED, 0)
        if (lastChanged == 0L) return 0
        val elapsed = System.currentTimeMillis() - lastChanged
        val remaining = THREE_WEEKS_MILLIS - elapsed
        return if (remaining <= 0) 0 else ((remaining / (24 * 60 * 60 * 1000)) + 1).toInt()
    }

    fun isNicknameTaken(context: Context, nickname: String): Boolean =
        nickname in getUsedNicknames(context)

    private fun getUsedNicknames(context: Context): Set<String> =
        getPrefs(context).getStringSet(KEY_USED_NICKNAMES, emptySet()) ?: emptySet()

    /**
     * 중복되지 않는 랜덤 재미있는 닉네임 생성
     * 형식: 형용사+명사 (8자 이내)
     */
    fun generateRandomNickname(context: Context): String {
        val used = getUsedNicknames(context)
        // 형용사+명사 조합 시도 (8자 이내만)
        val candidates = mutableListOf<String>()
        for (adj in ADJECTIVES.shuffled()) {
            for (noun in NOUNS.shuffled()) {
                val nick = "$adj$noun"
                if (nick.length in MIN_LENGTH..MAX_LENGTH && nick !in used) {
                    candidates.add(nick)
                    if (candidates.size >= 5) break
                }
            }
            if (candidates.size >= 5) break
        }
        if (candidates.isNotEmpty()) return candidates.random()

        // 명사+숫자 조합 폴백
        for (i in 0 until 50) {
            val nick = "${NOUNS.random()}${(1..99).random()}"
            if (nick.length in MIN_LENGTH..MAX_LENGTH && nick !in used) return nick
        }
        return "지도사${(100..999).random()}"
    }
}
