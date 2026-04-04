package com.moduji.app.util

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

/**
 * 화면 테마(라이트/다크/시스템) 관리
 *
 * SharedPreferences에 사용자 선택을 저장하고,
 * AppCompatDelegate로 실제 테마를 적용한다.
 */
object ThemeHelper {

    private const val PREFS_NAME = "app_settings"
    private const val KEY_THEME = "theme_mode"

    const val THEME_LIGHT = 0
    const val THEME_DARK = 1
    const val THEME_SYSTEM = 2

    private val themeLabels = arrayOf("화이트", "다크", "시스템")

    /** 테마 선택지 라벨 배열 반환 */
    fun getThemeLabels(): Array<String> = themeLabels

    /** 저장된 테마 모드 반환 (기본: 화이트) */
    fun getSavedTheme(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getInt(KEY_THEME, THEME_LIGHT)
    }

    /** 테마 모드 저장 + 즉시 적용 */
    fun applyTheme(context: Context, themeMode: Int) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putInt(KEY_THEME, themeMode).apply()

        applyNightMode(themeMode)
    }

    /** 저장된 테마를 AppCompatDelegate에 적용 (앱 시작 시 호출) */
    fun applySavedTheme(context: Context) {
        applyNightMode(getSavedTheme(context))
    }

    /** 현재 테마의 라벨 텍스트 반환 */
    fun getThemeLabel(themeMode: Int): String {
        return themeLabels.getOrElse(themeMode) { themeLabels[THEME_SYSTEM] }
    }

    private fun applyNightMode(themeMode: Int) {
        val nightMode = when (themeMode) {
            THEME_LIGHT -> AppCompatDelegate.MODE_NIGHT_NO
            THEME_DARK -> AppCompatDelegate.MODE_NIGHT_YES
            else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
        }
        AppCompatDelegate.setDefaultNightMode(nightMode)
    }
}
