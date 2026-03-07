package com.moduji.app.data.network

import com.google.gson.GsonBuilder
import com.google.gson.JsonDeserializationContext
import com.google.gson.JsonDeserializer
import com.google.gson.JsonElement
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.lang.reflect.Type
import java.util.concurrent.TimeUnit

object RetrofitClient {
    private const val BASE_URL = "https://diary-app-seven-indol.vercel.app/"

    private val okHttpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .addInterceptor(HttpLoggingInterceptor().apply {
                level = HttpLoggingInterceptor.Level.BODY
            })
            .build()
    }

    private val gson by lazy {
        GsonBuilder()
            .setLenient()
            .registerTypeAdapter(Int::class.java, JsonDeserializer { json, _, _ ->
                try {
                    json.asInt
                } catch (_: Exception) {
                    json.asString.toIntOrNull() ?: 0
                }
            })
            .registerTypeAdapter(Boolean::class.java, JsonDeserializer { json, _, _ ->
                try {
                    json.asBoolean
                } catch (_: Exception) {
                    json.asString.toBooleanStrictOrNull() ?: false
                }
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
