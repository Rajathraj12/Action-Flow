package com.actionflow.data.api

import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor : Interceptor {
    var authToken: String? = null
    var activeWorkspaceId: String? = null

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val builder = original.newBuilder()

        builder.header("Content-Type", "application/json")
        authToken?.let {
            builder.header("Authorization", "Bearer $it")
        }
        activeWorkspaceId?.let {
            builder.header("x-workspace-id", it)
        }

        return chain.proceed(builder.build())
    }
}
