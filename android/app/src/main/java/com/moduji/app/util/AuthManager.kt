package com.moduji.app.util

import com.google.firebase.auth.FirebaseAuth

object AuthManager {
    var isMockLoggedIn = false

    val isLoggedIn: Boolean
        get() {
            return try {
                FirebaseAuth.getInstance().currentUser != null
            } catch (_: Exception) {
                isMockLoggedIn
            }
        }

    /** 로그인 사용자의 자동 비밀번호 (Firebase UID 기반, mock 시 기본값) */
    val loginPassword: String
        get() {
            return try {
                FirebaseAuth.getInstance().currentUser?.uid ?: "auto_login"
            } catch (_: Exception) {
                "auto_login"
            }
        }
}
