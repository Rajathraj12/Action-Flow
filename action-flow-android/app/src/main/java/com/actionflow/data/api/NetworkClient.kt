package com.actionflow.data.api

import android.content.Context
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import java.util.concurrent.TimeUnit

object NetworkClient {
    const val CLOUD_BASE_URL = "https://action-flow-802k.onrender.com/"
    const val EMULATOR_LOCAL_URL = "http://10.0.2.2:5000/"

    var currentBaseUrl: String = CLOUD_BASE_URL
        private set

    var currentUserId: String? = null
    var applicationContext: Context? = null

    val authInterceptor = AuthInterceptor()
    val socketManager = SocketManager()

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        encodeDefaults = true
        coerceInputValues = true
    }

    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        })
        .connectTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .build()

    private var _apiService: ActionFlowApiService? = null

    val apiService: ActionFlowApiService
        get() {
            if (_apiService == null) {
                _apiService = buildApiService(currentBaseUrl)
            }
            return _apiService!!
        }

    private fun buildApiService(url: String): ActionFlowApiService {
        val sanitized = if (url.endsWith("/")) url else "$url/"
        return Retrofit.Builder()
            .baseUrl(sanitized)
            .client(okHttpClient)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(ActionFlowApiService::class.java)
    }

    fun setBaseUrl(newUrl: String) {
        currentBaseUrl = newUrl
        _apiService = buildApiService(newUrl)
        if (authInterceptor.authToken != null) {
            socketManager.connect(currentBaseUrl, authInterceptor.authToken)
        }
    }

    fun setAuthToken(token: String?) {
        authInterceptor.authToken = token
        if (!token.isNullOrEmpty()) {
            socketManager.connect(currentBaseUrl, token)
        } else {
            socketManager.disconnect()
        }
    }

    fun setActiveWorkspace(workspaceId: String?) {
        authInterceptor.activeWorkspaceId = workspaceId
        if (!workspaceId.isNullOrEmpty()) {
            socketManager.joinWorkspace(workspaceId)
        }
    }
}
