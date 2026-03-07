package com.moduji.app.util

/**
 * 한글 초성 검색 유틸리티
 *
 * - 카테고리 검색 시 초성 입력으로 필터링 지원
 * - 예: "ㅊㄱ" 입력 시 "축구" 매칭
 */
object ChosungSearch {
    private val CHOSUNG = charArrayOf(
        'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
        'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    )
    private val CHOSUNG_SET = CHOSUNG.toSet()

    private fun getChosung(char: Char): Char? {
        val code = char.code - 0xAC00
        if (code < 0 || code > 11171) return null
        return CHOSUNG[code / (21 * 28)]
    }

    private fun isChosung(char: Char): Boolean = char in CHOSUNG_SET

    fun matches(name: String, query: String): Boolean {
        if (query.isEmpty()) return true
        // 일반 포함 검색
        if (name.lowercase().contains(query.lowercase())) return true
        // 초성 검색: 쿼리가 모두 초성인 경우
        if (query.all { isChosung(it) }) {
            val nameChosungs = name.map { getChosung(it) ?: it }
            val queryChars = query.toList()
            // 연속 매칭
            for (i in 0..nameChosungs.size - queryChars.size) {
                var matched = true
                for (j in queryChars.indices) {
                    if (nameChosungs[i + j] != queryChars[j]) {
                        matched = false
                        break
                    }
                }
                if (matched) return true
            }
        }
        return false
    }
}
