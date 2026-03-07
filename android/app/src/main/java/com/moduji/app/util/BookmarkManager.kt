package com.moduji.app.util

import android.content.Context
import android.content.SharedPreferences

/**
 * 북마크 관리 (SharedPreferences 영구 저장)
 * - 구인 게시글: bookmarked_ids
 * - 커뮤니티 게시글: community_bookmarked_ids
 */
object BookmarkManager {

    private const val PREFS_NAME = "bookmark_prefs"
    private const val KEY_IDS = "bookmarked_ids"
    private const val KEY_COMMUNITY_IDS = "community_bookmarked_ids"

    private val bookmarkedIds = mutableSetOf<Int>()
    private val communityBookmarkedIds = mutableSetOf<Int>()
    private var initialized = false

    fun init(context: Context) {
        if (initialized) return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getStringSet(KEY_IDS, emptySet()) ?: emptySet()
        bookmarkedIds.addAll(saved.mapNotNull { it.toIntOrNull() })
        val commSaved = prefs.getStringSet(KEY_COMMUNITY_IDS, emptySet()) ?: emptySet()
        communityBookmarkedIds.addAll(commSaved.mapNotNull { it.toIntOrNull() })
        initialized = true
    }

    // ── 구인 북마크 ──

    fun isBookmarked(postId: Int): Boolean = postId in bookmarkedIds

    fun toggle(context: Context, postId: Int): Boolean {
        init(context)
        return if (bookmarkedIds.contains(postId)) {
            bookmarkedIds.remove(postId)
            save(context)
            false
        } else {
            bookmarkedIds.add(postId)
            save(context)
            true
        }
    }

    fun toggle(postId: Int): Boolean {
        return if (bookmarkedIds.contains(postId)) {
            bookmarkedIds.remove(postId)
            false
        } else {
            bookmarkedIds.add(postId)
            true
        }
    }

    fun getBookmarkedIds(): Set<Int> = bookmarkedIds.toSet()

    fun count(): Int = bookmarkedIds.size

    // ── 커뮤니티 북마크 ──

    fun isCommunityBookmarked(postId: Int): Boolean = postId in communityBookmarkedIds

    fun toggleCommunity(context: Context, postId: Int): Boolean {
        init(context)
        return if (communityBookmarkedIds.contains(postId)) {
            communityBookmarkedIds.remove(postId)
            save(context)
            false
        } else {
            communityBookmarkedIds.add(postId)
            save(context)
            true
        }
    }

    fun getCommunityBookmarkedIds(): Set<Int> = communityBookmarkedIds.toSet()

    fun communityCount(): Int = communityBookmarkedIds.size

    fun totalCount(): Int = bookmarkedIds.size + communityBookmarkedIds.size

    // ── 저장 ──

    private fun save(context: Context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putStringSet(KEY_IDS, bookmarkedIds.map { it.toString() }.toSet())
            .putStringSet(KEY_COMMUNITY_IDS, communityBookmarkedIds.map { it.toString() }.toSet())
            .apply()
    }
}
