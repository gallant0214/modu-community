package com.moduji.app.util

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys

/**
 * 암호화된 SharedPreferences 제공
 *
 * AES256-GCM으로 값 암호화, AES256-SIV로 키 암호화.
 * 기존 평문 데이터는 첫 접근 시 자동 마이그레이션됨.
 */
object SecurePrefs {

    private val cache = mutableMapOf<String, SharedPreferences>()

    fun get(context: Context, name: String): SharedPreferences {
        return cache.getOrPut(name) {
            try {
                val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)

                // 기존 평문 데이터 마이그레이션
                val oldPrefs = context.getSharedPreferences(name, Context.MODE_PRIVATE)
                val encrypted = EncryptedSharedPreferences.create(
                    "enc_$name",
                    masterKeyAlias,
                    context,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )

                // 평문 → 암호화 마이그레이션 (한 번만)
                if (oldPrefs.all.isNotEmpty()) {
                    val editor = encrypted.edit()
                    for ((key, value) in oldPrefs.all) {
                        when (value) {
                            is String -> editor.putString(key, value)
                            is Boolean -> editor.putBoolean(key, value)
                            is Int -> editor.putInt(key, value)
                            is Long -> editor.putLong(key, value)
                            is Float -> editor.putFloat(key, value)
                            is Set<*> -> {
                                @Suppress("UNCHECKED_CAST")
                                editor.putStringSet(key, value as Set<String>)
                            }
                        }
                    }
                    editor.apply()
                    oldPrefs.edit().clear().apply()
                }

                encrypted
            } catch (_: Exception) {
                // 암호화 실패 시 평문 fallback (구형 기기 등)
                context.getSharedPreferences(name, Context.MODE_PRIVATE)
            }
        }
    }
}
