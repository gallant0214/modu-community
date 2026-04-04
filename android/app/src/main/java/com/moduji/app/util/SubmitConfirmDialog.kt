package com.moduji.app.util

import android.content.Context
import android.view.LayoutInflater
import android.view.View
import android.widget.CheckBox
import android.widget.TextView
import com.moduji.app.R

/**
 * 구인 등록 최종 확인 다이얼로그 (iOS 스타일)
 *
 * - 경고 메시지 + 체크박스 동의 후 등록 가능
 * - Fragment / Activity 어디서든 재사용 가능
 *
 * @param context Context
 * @param onConfirm 체크박스 동의 후 "최종 등록하기" 클릭 시 실행될 콜백
 */
fun showSubmitConfirmDialog(context: Context, onConfirm: () -> Unit) {
    val dialogView = LayoutInflater.from(context)
        .inflate(R.layout.dialog_submit_confirm, null)

    val cbConfirm = dialogView.findViewById<CheckBox>(R.id.cb_confirm)
    val btnConfirm = dialogView.findViewById<TextView>(R.id.btn_confirm)
    val btnCancel = dialogView.findViewById<View>(R.id.btn_cancel)

    val dialog = androidx.appcompat.app.AlertDialog.Builder(context)
        .setView(dialogView)
        .create()
    dialog.window?.setBackgroundDrawableResource(android.R.color.transparent)

    btnConfirm.alpha = 0.5f
    btnConfirm.isEnabled = false

    cbConfirm.setOnCheckedChangeListener { _, isChecked ->
        btnConfirm.isEnabled = isChecked
        btnConfirm.alpha = if (isChecked) 1f else 0.5f
    }

    btnCancel.setOnClickListener { dialog.dismiss() }
    btnConfirm.setOnClickListener {
        dialog.dismiss()
        onConfirm()
    }

    dialog.show()
}
