package com.moduji.app.data.network

import com.google.gson.GsonBuilder
import com.google.gson.JsonDeserializer
import com.moduji.app.App
import com.moduji.app.BuildConfig
import okhttp3.Cache
import okhttp3.CacheControl
import okhttp3.ConnectionPool
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.io.File
import java.util.concurrent.TimeUnit

object RetrofitClient {
    private const val BASE_URL = "https://moducm.com/"
    private const val CACHE_SIZE = 10L * 1024 * 1024 // 10MB

    private val okHttpClient: OkHttpClient by lazy {
        val builder = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            // 연결 풀: 5개 연결을 5분간 유지 (재사용으로 cold start 회피)
            .connectionPool(ConnectionPool(5, 5, TimeUnit.MINUTES))
            // 인증 인터셉터
            .addInterceptor(AuthInterceptor())
            // GET 요청에 캐시 적용 (네트워크 실패 시 캐시 사용)
            .addNetworkInterceptor(cacheInterceptor())

        // 캐시 디렉터리 설정
        try {
            val cacheDir = File(App.instance.cacheDir, "http_cache")
            builder.cache(Cache(cacheDir, CACHE_SIZE))
        } catch (_: Exception) { }

        // 디버그 로깅
        if (BuildConfig.DEBUG) {
            builder.addInterceptor(HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BASIC
            })
        }

        builder.build()
    }

    /** 네트워크 응답에 Cache-Control 헤더 추가 (GET 요청만) */
    private fun cacheInterceptor() = Interceptor { chain ->
        val response = chain.proceed(chain.request())
        if (chain.request().method == "GET") {
            val cacheControl = CacheControl.Builder()
                .maxAge(30, TimeUnit.SECONDS)
                .build()
            response.newBuilder()
                .removeHeader("Pragma")
                .removeHeader("Cache-Control")
                .header("Cache-Control", cacheControl.toString())
                .build()
        } else {
            response
        }
    }

    private val gson by lazy {
        GsonBuilder()
            .setLenient()
            .registerTypeAdapter(Int::class.java, JsonDeserializer { json, _, _ ->
                try { json.asInt } catch (_: Exception) { json.asString.toIntOrNull() ?: 0 }
            })
            .registerTypeAdapter(Boolean::class.java, JsonDeserializer { json, _, _ ->
                try { json.asBoolean } catch (_: Exception) { json.asString.toBooleanStrictOrNull() ?: false }
            })
            .create()
    }

    private val retrofit: Retrofit by lazy {
        Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    val communityApi: CommunityApi by lazy {
        retrofit.create(CommunityApi::class.java)
    }

    val jobsApi: JobsApi by lazy {
        retrofit.create(JobsApi::class.java)
    }
}
