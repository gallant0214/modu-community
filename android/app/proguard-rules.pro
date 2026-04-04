# ============================================
# Moduji App ProGuard Rules
# ============================================

# --- 제네릭 타입 정보 보존 (Gson + Retrofit 필수) ---
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses
-keepattributes Exceptions

# --- Retrofit ---
# allowobfuscation 제거: 제네릭 반환 타입(Response<List<T>> 등) 보존 필수
-keep interface com.moduji.app.data.network.** { *; }
-keepclassmembers interface com.moduji.app.data.network.** { *; }
-keep class retrofit2.Response { *; }
-keep class retrofit2.** { *; }
-dontwarn retrofit2.**
# Retrofit suspend 함수 + R8 호환
-if interface * { @retrofit2.http.* <methods>; }
-keep,allowobfuscation interface <1>
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}

# --- Kotlin 코루틴 (Retrofit suspend 함수 필수) ---
-keep class kotlin.coroutines.** { *; }
-keep interface kotlin.coroutines.** { *; }
-keepclassmembers class kotlin.coroutines.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# --- Gson ---
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken { *; }
-keep class com.google.gson.** { *; }
-dontwarn com.google.gson.**
-keep class * implements com.google.gson.TypeAdapterFactory { *; }
-keep class * implements com.google.gson.JsonSerializer { *; }
-keep class * implements com.google.gson.JsonDeserializer { *; }
-keep class * extends com.google.gson.TypeAdapter { *; }

# --- 데이터 모델 완전 보존 ---
-keep class com.moduji.app.data.model.** { *; }
-keepclassmembers class com.moduji.app.data.model.** { *; }

# --- 네트워크 레이어 보존 (AuthInterceptor 등) ---
-keep class com.moduji.app.data.network.** { *; }
-keepclassmembers class com.moduji.app.data.network.** { *; }

# --- Firebase ---
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.firebase.**

# --- OkHttp ---
-dontwarn okhttp3.**
-dontwarn okio.**
-keep class okhttp3.** { *; }

# --- 디버깅용 ---
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
