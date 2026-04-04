package com.moduji.app.data.network

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await
import okhttp3.Interceptor
import okhttp3.Response

/**
 * OkHttp 인터셉터: Firebase ID Token을 Authorization 헤더에 자동 추가
 *
 * - 로그인 상태: Bearer <idToken>
 * - 비로그인 상태: 헤더 없이 요청 (서버에서 비인증 요청으로 처리)
 */
class AuthInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()

        val user = try {
            FirebaseAuth.getInstance().currentUser
        } catch (_: Exception) {
            null
        }

        if (user == null) {
            return chain.proceed(original)
        }

        val token = try {
            runBlocking { user.getIdToken(false).await().token }
        } catch (_: Exception) {
            null
        }

        if (token.isNullOrEmpty()) {
            return chain.proceed(original)
        }

        val request = original.newBuilder()
            .header("Authorization", "Bearer $token")
            .build()

        return chain.proceed(request)
    }
}
