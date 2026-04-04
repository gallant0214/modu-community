package com.moduji.app.util

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.moduji.app.data.model.NicknameRegisterRequest
import com.moduji.app.data.network.RetrofitClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * 닉네임 관리 (SharedPreferences + 서버 동기화)
 *
 * - 로컬 저장/조회 + 서버 동기화
 * - 변경 후 3주(21일) 동안 재변경 불가
 * - 중복 닉네임 체크 (서버)
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
        getNickname(context)?.let { used.remove(it) }
        used.add(nickname)

        getPrefs(context).edit()
            .putString(KEY_NICKNAME, nickname)
            .putLong(KEY_LAST_CHANGED, System.currentTimeMillis())
            .putStringSet(KEY_USED_NICKNAMES, used)
            .apply()
    }

    /**
     * 닉네임 설정 + 서버 동기화
     * Firebase 인증된 상태에서 호출
     */
    suspend fun setNicknameWithSync(context: Context, nickname: String, oldName: String? = null) {
        val oldNickname = oldName ?: getNickname(context)
        setNickname(context, nickname)

        // 서버에 동기화
        try {
            val user = FirebaseAuth.getInstance().currentUser ?: return
            val token = withContext(Dispatchers.IO) {
                com.google.android.gms.tasks.Tasks.await(user.getIdToken(false))
            }?.token ?: return

            withContext(Dispatchers.IO) {
                val client = RetrofitClient.communityApi
                // AuthInterceptor가 토큰을 자동으로 붙이므로 직접 호출
                client.registerNickname(NicknameRegisterRequest(
                    name = nickname,
                    oldName = oldNickname
                ))
            }
        } catch (_: Exception) {
            // 서버 동기화 실패해도 로컬은 저장됨
        }
    }

    /**
     * 서버에서 닉네임 가져와서 로컬에 저장 (앱 시작/로그인 시 호출)
     */
    suspend fun syncFromServer(context: Context) {
        try {
            val user = FirebaseAuth.getInstance().currentUser ?: return
            val response = withContext(Dispatchers.IO) {
                RetrofitClient.communityApi.getNicknameByUid(user.uid)
            }
            if (response.isSuccessful) {
                val body = response.body()
                val serverNickname = body?.nickname
                if (!serverNickname.isNullOrBlank()) {
                    val localNickname = getNickname(context)
                    val editor = getPrefs(context).edit()
                    if (localNickname != serverNickname) {
                        editor.putString(KEY_NICKNAME, serverNickname)
                    }
                    // 서버의 변경 제한 정보를 로컬에 동기화
                    if (body.canChange == false && body.remainingDays > 0) {
                        // 서버에서 아직 변경 불가 → 로컬 last_changed_at을 역산
                        val elapsed = (THREE_WEEKS_MILLIS - body.remainingDays.toLong() * 24 * 60 * 60 * 1000)
                        editor.putLong(KEY_LAST_CHANGED, System.currentTimeMillis() - elapsed)
                    }
                    editor.apply()
                } else {
                    val localNickname = getNickname(context)
                    if (!localNickname.isNullOrBlank()) {
                        setNicknameWithSync(context, localNickname)
                    }
                }
            }
        } catch (_: Exception) {
        }
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

    fun generateRandomNickname(context: Context): String {
        val used = getUsedNicknames(context)
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

        for (i in 0 until 50) {
            val nick = "${NOUNS.random()}${(1..99).random()}"
            if (nick.length in MIN_LENGTH..MAX_LENGTH && nick !in used) return nick
        }
        return "지도사${(100..999).random()}"
    }
}
