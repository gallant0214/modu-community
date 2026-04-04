package com.moduji.app

import android.app.Application
import com.moduji.app.util.ThemeHelper

class App : Application() {

    companion object {
        lateinit var instance: App
            private set
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        ThemeHelper.applySavedTheme(this)
    }
}
