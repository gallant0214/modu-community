package com.moduji.app.ui.common

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.moduji.app.R
import com.moduji.app.util.KeywordAlertManager

/**
 * 키워드 알림 설정 BottomSheet
 *
 * 시험후기 탭, 구인 탭에서 공통 사용.
 * Fragment에서 showKeywordAlertSheet()를 호출하면 BottomSheet가 열림.
 */
object KeywordAlertBottomSheet {

    fun show(fragment: Fragment) {
        val ctx = fragment.requireContext()
        val dialog = BottomSheetDialog(ctx)
        val sheetView = fragment.layoutInflater.inflate(
            R.layout.bottom_sheet_keyword_alert, null
        )
        dialog.setContentView(sheetView)

        val etKeyword = sheetView.findViewById<EditText>(R.id.et_keyword)
        val btnAdd = sheetView.findViewById<TextView>(R.id.btn_add_keyword)
        val rvKeywords = sheetView.findViewById<RecyclerView>(R.id.rv_keywords)
        val tvEmpty = sheetView.findViewById<TextView>(R.id.tv_empty)
        val tvHeader = sheetView.findViewById<TextView>(R.id.tv_keyword_header)

        val keywords = KeywordAlertManager.getKeywords(ctx).toMutableList()
        val adapter = KeywordAdapter(keywords) { keyword ->
            KeywordAlertManager.removeKeyword(ctx, keyword)
            keywords.remove(keyword)
            rvKeywords.adapter?.notifyDataSetChanged()
            updateEmptyState(tvEmpty, tvHeader, keywords)
            Toast.makeText(ctx, "'${keyword}' 키워드가 삭제되었습니다", Toast.LENGTH_SHORT).show()
        }

        rvKeywords.layoutManager = LinearLayoutManager(ctx)
        rvKeywords.adapter = adapter
        updateEmptyState(tvEmpty, tvHeader, keywords)

        val addAction = {
            val keyword = etKeyword.text.toString().trim()
            val error = KeywordAlertManager.addKeyword(ctx, keyword)
            if (error != null) {
                Toast.makeText(ctx, error, Toast.LENGTH_SHORT).show()
            } else {
                keywords.clear()
                keywords.addAll(KeywordAlertManager.getKeywords(ctx))
                rvKeywords.adapter?.notifyDataSetChanged()
                updateEmptyState(tvEmpty, tvHeader, keywords)
                etKeyword.text.clear()
                Toast.makeText(ctx, "'${keyword}' 키워드가 추가되었습니다", Toast.LENGTH_SHORT).show()
            }
        }

        btnAdd.setOnClickListener { addAction() }

        etKeyword.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_DONE) {
                addAction()
                true
            } else false
        }

        dialog.show()
    }

    private fun updateEmptyState(
        tvEmpty: TextView,
        tvHeader: TextView,
        keywords: List<String>
    ) {
        if (keywords.isEmpty()) {
            tvEmpty.visibility = View.VISIBLE
            tvHeader.text = "등록된 키워드"
        } else {
            tvEmpty.visibility = View.GONE
            tvHeader.text = "등록된 키워드 (${keywords.size}개)"
        }
    }

    /**
     * 키워드 목록 어댑터
     */
    private class KeywordAdapter(
        private val items: List<String>,
        private val onDelete: (String) -> Unit
    ) : RecyclerView.Adapter<KeywordAdapter.ViewHolder>() {

        inner class ViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            val tvKeyword: TextView = itemView.findViewById(R.id.tv_keyword)
            val btnDelete: TextView = itemView.findViewById(R.id.btn_delete)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_keyword, parent, false)
            return ViewHolder(view)
        }

        override fun onBindViewHolder(holder: ViewHolder, position: Int) {
            val keyword = items[position]
            holder.tvKeyword.text = keyword
            holder.btnDelete.setOnClickListener { onDelete(keyword) }
        }

        override fun getItemCount() = items.size
    }
}
