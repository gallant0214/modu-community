package com.moduji.app.data.model

import java.time.DayOfWeek
import java.time.LocalDateTime
import java.time.LocalTime

// ====================================================
// 종목(카테고리) 데이터 모델
// ====================================================
data class Category(
    val id: Int,
    val name: String,
    val emoji: String,
    val postCount: Int
)

// ====================================================
// 게시글/후기 데이터 모델
// ====================================================
data class Post(
    val id: Int,
    val title: String,
    val preview: String,
    val author: String,
    val categoryName: String,
    val region: String,
    val likes: Int,
    val commentsCount: Int,
    val date: String
)

// ====================================================
// 홈 화면용 구인 공고 (간략 표시)
// ====================================================
data class Job(
    val id: Int,
    val title: String,
    val categoryName: String,
    val region: String,
    val salary: String,
    val date: String
)

// ====================================================
// 구인 게시판 게시글 데이터 모델 (상세)
// - regionCode로 지역 필터링
// - createdAt으로 오늘 글 여부(N 배지) 판단
// - employmentType으로 고용형태 Chip 표시
// ====================================================
data class JobPost(
    val id: Int,
    val title: String,
    val preview: String,
    val author: String,
    val categoryName: String,
    val region: String,
    val regionCode: String,        // 지역 코드 (예: "GUMI", "SEOUL")
    val employmentType: String,    // 고용형태 (정규직, 계약직, 파트타임)
    val salary: String,
    val likes: Int,
    val commentsCount: Int,
    val views: Int,
    val date: String,
    val createdAt: LocalDateTime,
    val isClosed: Boolean = false,
    val description: String = "",  // 전체 내용
    val contact: String = "",      // 연락처
    val headcount: String = "",    // 모집 인원
    val benefits: String = "",     // 복리후생
    val preferences: String = "",  // 우대조건
    val deadline: String = ""      // 모집기간 (상시모집, 정원마감시, 날짜)
)

// ====================================================
// 지역 데이터 모델
// ====================================================

/** 상위 그룹 유형: 도(PROVINCE) 또는 광역시/특별시(METROPOLITAN) */
enum class RegionGroupType { PROVINCE, METROPOLITAN }

/** 상위 지역 그룹 — 아코디언(펼침/접힘) 형태로 하위 지역 포함 */
data class RegionGroup(
    val code: String,
    val name: String,
    val type: RegionGroupType,
    val subRegions: List<SubRegion>,
    val isExpanded: Boolean = false
)

/** 하위 지역 (실제 선택 단위: 시/군/구) */
data class SubRegion(
    val code: String,
    val name: String,
    val totalCount: Int,
    val hasTodayPost: Boolean
)

// ====================================================
// 구인 글쓰기 관련 모델
// ====================================================

/** 근무형태 */
enum class JobType(val label: String) {
    FULL_TIME("정규직"),
    CONTRACT("계약직"),
    PART_TIME_JOB("아르바이트"),
    FREELANCER("프리랜서(위촉직)"),
    PART_TIME("파트타임"),
    TRAINEE("교육생/연수생"),
    INTERN("인턴")
}

/** 급여 유형 */
enum class SalaryType(val label: String) {
    HOURLY("시급"),
    MONTHLY("월급"),
    PER_CASE("건당"),
    NEGOTIABLE("협의")
}

/** 급여 정보 */
data class SalaryInfo(
    val type: SalaryType,
    val amount: Int?,
    val hasIncentive: Boolean = false,
    val canDailyOrWeeklyPay: Boolean = false
) {
    /** 화면 표시용 요약 텍스트 */
    fun toSummary(): String {
        val base = when (type) {
            SalaryType.NEGOTIABLE -> "급여 협의"
            SalaryType.HOURLY -> "시급 ${formatAmount(amount)}원"
            SalaryType.MONTHLY -> "월급 ${formatAmount(amount)}원"
            SalaryType.PER_CASE -> "건당 ${formatAmount(amount)}원"
        }
        val extras = mutableListOf<String>()
        if (hasIncentive) extras.add("인센티브")
        if (canDailyOrWeeklyPay) extras.add("주급/당일지급")
        return if (extras.isEmpty()) base else "$base + ${extras.joinToString(", ")}"
    }

    private fun formatAmount(amount: Int?): String {
        if (amount == null) return "0"
        return java.text.NumberFormat.getNumberInstance(java.util.Locale.KOREA).format(amount)
    }
}

/** 근무요일 옵션 */
enum class DayOption(val label: String) {
    WEEKDAYS("평일(월~금)"),
    WEEKENDS("주말(토·일)"),
    FIVE_DAYS("주 5일"),
    SIX_DAYS("주 6일"),
    CUSTOM_DAYS("요일 직접 선택"),
    NEGOTIABLE("협의 가능")
}

/** 근무시간 옵션 */
enum class TimeOption(val label: String) {
    FIXED("시간 직접 선택"),
    NEGOTIABLE("시간 협의")
}

/** 근무요일·시간 정보 */
data class WorkSchedule(
    val dayOption: DayOption,
    val customDays: List<DayOfWeek> = emptyList(),
    val timeOption: TimeOption,
    val startTime: LocalTime? = null,
    val endTime: LocalTime? = null,
    val hasBreakTime: Boolean = false,
    val isShiftWork: Boolean = false
) {
    /** 화면 표시용 요약 텍스트 */
    fun toSummary(): String {
        val dayPart = when (dayOption) {
            DayOption.WEEKDAYS -> "월~금"
            DayOption.WEEKENDS -> "토·일"
            DayOption.FIVE_DAYS -> "주 5일"
            DayOption.SIX_DAYS -> "주 6일"
            DayOption.NEGOTIABLE -> "요일 협의"
            DayOption.CUSTOM_DAYS -> {
                val dayNames = mapOf(
                    DayOfWeek.MONDAY to "월", DayOfWeek.TUESDAY to "화",
                    DayOfWeek.WEDNESDAY to "수", DayOfWeek.THURSDAY to "목",
                    DayOfWeek.FRIDAY to "금", DayOfWeek.SATURDAY to "토",
                    DayOfWeek.SUNDAY to "일"
                )
                customDays.joinToString(",") { dayNames[it] ?: "" }
            }
        }
        val timePart = when (timeOption) {
            TimeOption.NEGOTIABLE -> "시간 협의"
            TimeOption.FIXED -> {
                val s = startTime?.let { String.format("%02d:%02d", it.hour, it.minute) } ?: "?"
                val e = endTime?.let { String.format("%02d:%02d", it.hour, it.minute) } ?: "?"
                "$s~$e"
            }
        }
        return "$dayPart · $timePart"
    }
}

/** 복리후생 */
enum class JobBenefit(val label: String) {
    INSURANCE("4대보험"),
    INCENTIVE("인센티브"),
    MEAL("식대지원"),
    MEMBERSHIP("회원권 제공"),
    EDUCATION("교육 지원"),
    RETIREMENT("퇴직금")
}

/** 우대 조건 */
enum class JobPreference(val label: String) {
    EXPERIENCED("동종업계 경력자"),
    CERTIFIED("관련 자격증 소지자"),
    LONG_TERM("장기근무 가능자"),
    BEGINNER_OK("초보 가능"),
    NEARBY("인근 거주자"),
    STUDENT_OK("대학생 가능"),
    DRIVER("운전 가능자")
}

/** 구인 게시글 검색 유형 */
enum class JobSearchType(val label: String) {
    SPORT("종목"),
    TITLE("제목"),
    AUTHOR("작성자"),
    CONTENT("내용"),
    TITLE_CONTENT("제목+내용")
}

/** 구인 글 등록 요청 데이터 */
data class JobPostRequest(
    val regionCode: String,
    val regionName: String,
    val sport: String,
    val jobType: JobType,
    val centerName: String,
    val address: String = "",
    val title: String,
    val salary: SalaryInfo,
    val contact: String,
    val description: String,
    val headcount: String?,
    val benefits: List<JobBenefit>,
    val preferences: List<JobPreference>,
    val deadline: String = ""
)
