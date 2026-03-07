package com.moduji.app.util

import android.content.Context
import android.view.LayoutInflater
import android.widget.CheckBox
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.moduji.app.R

// TODO: 신고 시스템 연동 가능
// TODO: 허위 구인 반복 시 자동 차단 로직 추가 가능

/**
 * 구인 등록 최종 확인 다이얼로그
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

    val dialog = MaterialAlertDialogBuilder(context)
        .setTitle("등록 전 확인")
        .setView(dialogView)
        .setNegativeButton("취소") { d, _ -> d.dismiss() }
        .setPositiveButton("최종 등록하기", null)
        .create()

    dialog.setOnShowListener {
        val positiveBtn = dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE)
        positiveBtn.isEnabled = false

        cbConfirm.setOnCheckedChangeListener { _, isChecked ->
            positiveBtn.isEnabled = isChecked
        }

        positiveBtn.setOnClickListener {
            dialog.dismiss()
            onConfirm()
        }
    }

    dialog.show()
}
