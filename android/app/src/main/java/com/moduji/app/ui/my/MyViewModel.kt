package com.moduji.app.ui.my

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.GoogleAuthProvider
import com.moduji.app.util.AuthManager

/**
 * My 탭 ViewModel
 *
 * - Firebase Auth를 통한 Google 로그인/로그아웃 관리
 * - AuthStateListener로 로그인 상태 자동 반영
 * - signInEvent를 통해 Fragment에서 Google Sign-In Intent 시작
 */
class MyViewModel : ViewModel() {

    data class User(
        val nickname: String,
        val email: String,
        val photoUrl: String?,
        val joinDate: String,
        val postCount: Int,
        val bookmarkCount: Int
    )

    private var auth: FirebaseAuth? = null
    private var firebaseAvailable = false

    // 로그인 상태
    private val _isLoggedIn = MutableLiveData(false)
    val isLoggedIn: LiveData<Boolean> = _isLoggedIn

    // 사용자 정보
    private val _user = MutableLiveData<User?>()
    val user: LiveData<User?> = _user

    // Google Sign-In Intent 시작 이벤트
    private val _signInEvent = MutableLiveData<Boolean>()
    val signInEvent: LiveData<Boolean> = _signInEvent

    // 에러 메시지
    private val _error = MutableLiveData<String?>()
    val error: LiveData<String?> = _error

    // 로딩 상태
    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    // Firebase 사용 가능 여부
    private val _isFirebaseAvailable = MutableLiveData(false)
    val isFirebaseAvailable: LiveData<Boolean> = _isFirebaseAvailable

    private var authStateListener: FirebaseAuth.AuthStateListener? = null

    init {
        try {
            auth = FirebaseAuth.getInstance()
            firebaseAvailable = true
            _isFirebaseAvailable.value = true

            authStateListener = FirebaseAuth.AuthStateListener { firebaseAuth ->
                val firebaseUser = firebaseAuth.currentUser
                if (firebaseUser != null) {
                    _isLoggedIn.value = true
                    _user.value = User(
                        nickname = firebaseUser.displayName ?: "사용자",
                        email = firebaseUser.email ?: "",
                        photoUrl = firebaseUser.photoUrl?.toString(),
                        joinDate = "Google 계정 로그인",
                        postCount = 0,
                        bookmarkCount = 0
                    )
                } else {
                    _isLoggedIn.value = false
                    _user.value = null
                }
            }
            auth?.addAuthStateListener(authStateListener!!)
        } catch (e: Exception) {
            firebaseAvailable = false
            _isFirebaseAvailable.value = false
            _isLoggedIn.value = false
        }
    }

    fun onGoogleLoginClick() {
        if (!firebaseAvailable) {
            // Firebase 미설정 시 테스트용 모의 로그인
            AuthManager.isMockLoggedIn = true
            _isLoggedIn.value = true
            _user.value = User(
                nickname = "테스트 사용자",
                email = "test@moduji.com",
                photoUrl = null,
                joinDate = "테스트 계정",
                postCount = 0,
                bookmarkCount = 0
            )
            return
        }
        _signInEvent.value = true
    }

    fun onSignInEventConsumed() {
        _signInEvent.value = false
    }

    fun handleSignInResult(idToken: String) {
        if (!firebaseAvailable) return
        _isLoading.value = true
        val credential = GoogleAuthProvider.getCredential(idToken, null)
        auth?.signInWithCredential(credential)
            ?.addOnCompleteListener { task ->
                _isLoading.value = false
                if (task.isSuccessful) {
                    _error.value = null
                } else {
                    _error.value = "로그인에 실패했습니다: ${task.exception?.localizedMessage}"
                }
            }
    }

    fun onSignInFailed(message: String) {
        _isLoading.value = false
        _error.value = message
    }

    fun onLogout() {
        if (firebaseAvailable) {
            auth?.signOut()
        } else {
            // 모의 로그인 상태 해제
            AuthManager.isMockLoggedIn = false
            _isLoggedIn.value = false
            _user.value = null
        }
    }

    fun onErrorConsumed() {
        _error.value = null
    }

    override fun onCleared() {
        super.onCleared()
        authStateListener?.let { auth?.removeAuthStateListener(it) }
    }
}
