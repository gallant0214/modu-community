package com.moduji.app.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.moduji.app.MainActivity
import com.moduji.app.R

/**
 * 로컬 알림 발송 헬퍼
 *
 * 알림 채널:
 * - post_comment: 게시글의 댓글
 * - comment_reply: 댓글의 댓글
 * - job: 구인
 * - notice: 공지
 * - promo: 광고/프로모션
 *
 * 사용법:
 *   NotificationHelper.sendPostCommentNotification(context, postTitle, commenterName)
 */
object NotificationHelper {

    private const val CHANNEL_POST_COMMENT = "post_comment"
    private const val CHANNEL_COMMENT_REPLY = "comment_reply"
    private const val CHANNEL_JOB = "job"
    private const val CHANNEL_NOTICE = "notice"
    private const val CHANNEL_PROMO = "promo"
    private const val CHANNEL_KEYWORD = "keyword_alert"

    private var nextNotificationId = 1000

    /**
     * 앱 시작 시 알림 채널 생성 (Android 8.0+)
     */
    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val channels = listOf(
            NotificationChannel(CHANNEL_POST_COMMENT, "게시글 댓글", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "내 게시글에 새 댓글이 달리면 알림"
            },
            NotificationChannel(CHANNEL_COMMENT_REPLY, "댓글 답글", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "내 댓글에 대댓글이 달리면 알림"
            },
            NotificationChannel(CHANNEL_JOB, "구인", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "새로운 구인 게시글 알림"
            },
            NotificationChannel(CHANNEL_NOTICE, "공지", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "서비스 공지사항 알림"
            },
            NotificationChannel(CHANNEL_PROMO, "광고/프로모션", NotificationManager.IMPORTANCE_LOW).apply {
                description = "이벤트 및 프로모션 알림"
            },
            NotificationChannel(CHANNEL_KEYWORD, "키워드 알림", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "등록한 키워드가 포함된 게시글 알림"
            }
        )

        channels.forEach { manager.createNotificationChannel(it) }
    }

    /**
     * 게시글에 댓글 알림
     */
    fun sendPostCommentNotification(
        context: Context,
        postTitle: String,
        commenterName: String
    ) {
        if (!NotificationPrefsManager.isEnabled(context, NotificationPrefsManager.KEY_POST_COMMENT)) return
        sendNotification(
            context,
            CHANNEL_POST_COMMENT,
            "새 댓글",
            "${commenterName}님이 '${postTitle}'에 댓글을 남겼습니다."
        )
    }

    /**
     * 댓글에 대댓글 알림
     */
    fun sendCommentReplyNotification(
        context: Context,
        replierName: String
    ) {
        if (!NotificationPrefsManager.isEnabled(context, NotificationPrefsManager.KEY_COMMENT_REPLY)) return
        sendNotification(
            context,
            CHANNEL_COMMENT_REPLY,
            "새 답글",
            "${replierName}님이 내 댓글에 답글을 남겼습니다."
        )
    }

    /**
     * 구인 알림
     */
    fun sendJobNotification(
        context: Context,
        jobTitle: String
    ) {
        if (!NotificationPrefsManager.isEnabled(context, NotificationPrefsManager.KEY_JOB)) return
        sendNotification(
            context,
            CHANNEL_JOB,
            "새 구인글",
            jobTitle
        )
    }

    /**
     * 공지 알림
     */
    fun sendNoticeNotification(
        context: Context,
        noticeTitle: String
    ) {
        if (!NotificationPrefsManager.isEnabled(context, NotificationPrefsManager.KEY_NOTICE)) return
        sendNotification(
            context,
            CHANNEL_NOTICE,
            "공지사항",
            noticeTitle
        )
    }

    /**
     * 광고/프로모션 알림
     */
    fun sendPromoNotification(
        context: Context,
        promoTitle: String
    ) {
        if (!NotificationPrefsManager.isEnabled(context, NotificationPrefsManager.KEY_PROMO)) return
        sendNotification(
            context,
            CHANNEL_PROMO,
            "프로모션",
            promoTitle
        )
    }

    /**
     * 키워드 알림
     */
    fun sendKeywordAlertNotification(
        context: Context,
        keyword: String,
        postTitle: String
    ) {
        sendNotification(
            context,
            CHANNEL_KEYWORD,
            "키워드 알림: $keyword",
            "'${keyword}' 키워드가 포함된 새 글: $postTitle"
        )
    }

    private fun sendNotification(
        context: Context,
        channelId: String,
        title: String,
        message: String
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(message)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(nextNotificationId++, notification)
    }
}
