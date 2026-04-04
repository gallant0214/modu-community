package com.moduji.app

import android.app.Application
import com.moduji.app.util.ThemeHelper

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // Activity 생성 전에 다크모드 설정을 적용해야
        // 모든 화면이 올바른 테마로 렌더링됨
        ThemeHelper.applySavedTheme(this)
    }
}
