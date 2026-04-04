package com.moduji.app.util

import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.fragment.app.Fragment
import com.moduji.app.R

fun Fragment.showCenterSplash(message: String) {
    val activity = activity ?: return
    val contentView = activity.findViewById<ViewGroup>(android.R.id.content)

    val textView = TextView(requireContext()).apply {
        text = message
        textSize = 15f
        setTextColor(Color.WHITE)
        setBackgroundResource(R.drawable.bg_splash_message)
        setPadding(56, 28, 56, 28)
        alpha = 0f
    }

    val params = FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.WRAP_CONTENT,
        FrameLayout.LayoutParams.WRAP_CONTENT
    ).apply {
        gravity = Gravity.CENTER
    }

    contentView.addView(textView, params)

    textView.animate()
        .alpha(1f)
        .setDuration(300)
        .withEndAction {
            textView.postDelayed({
                textView.animate()
                    .alpha(0f)
                    .setDuration(500)
                    .withEndAction { contentView.removeView(textView) }
                    .start()
            }, 1500)
        }
        .start()
}
