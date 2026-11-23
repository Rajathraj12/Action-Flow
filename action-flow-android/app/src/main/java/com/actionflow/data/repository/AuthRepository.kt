package com.actionflow.data.repository

import android.os.Build
import android.util.Log
import com.actionflow.data.api.ActionFlowApiService
import com.actionflow.data.api.FcmTokenRequest
import com.actionflow.data.api.NetworkClient
import com.actionflow.data.models.AuthResponse
import com.actionflow.data.models.AuthUser
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.UserProfileChangeRequest
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await

class AuthRepository(
    private val apiService: ActionFlowApiService = NetworkClient.apiService,
    private val firebaseAuth: FirebaseAuth = FirebaseAuth.getInstance()
) {
    private val repositoryScope = CoroutineScope(Dispatchers.IO)
    private val tag = "ActionFlowAuth"

    companion object {
        private val _currentUser = MutableStateFlow<AuthUser?>(null)
        val currentUserFlow = _currentUser.asStateFlow()

        private val _token = MutableStateFlow<String?>(null)
        val tokenFlow = _token.asStateFlow()
    }

    val currentUser = currentUserFlow
    val token = tokenFlow

    private val idTokenListener = FirebaseAuth.IdTokenListener { auth ->
        val user = auth.currentUser
        if (user != null) {
            user.getIdToken(false).addOnSuccessListener { tokenResult ->
                val newToken = tokenResult.token
                if (!newToken.isNullOrEmpty() && newToken != _token.value) {
                    NetworkClient.setAuthToken(newToken)
                    _token.value = newToken
                    registerCurrentFcmToken()
                }
            }
        } else {
            _token.value = null
            _currentUser.value = null
            NetworkClient.currentUserId = null
            NetworkClient.setAuthToken(null)
        }
    }

    init {
        firebaseAuth.addIdTokenListener(idTokenListener)
    }

    private fun registerCurrentFcmToken() {
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { fcmToken ->
                    if (!fcmToken.isNullOrEmpty()) {
                        repositoryScope.launch {
                            try {
                                val deviceName = "${Build.MANUFACTURER} ${Build.MODEL}"
                                apiService.registerFcmToken(
                                    FcmTokenRequest(
                                        fcmToken = fcmToken,
                                        deviceType = "android",
                                        deviceName = deviceName
                                    )
                                )
                                Log.d(tag, "[FCM Token] Registered token with backend: ${fcmToken.take(15)}...")
                            } catch (e: Exception) {
                                Log.w(tag, "[FCM Token] Failed to register token with backend: ${e.message}")
                            }
                        }
                    }
                }
        } catch (e: Exception) {
            Log.w(tag, "[FCM Token] Error getting FCM token: ${e.message}")
        }
    }

    suspend fun restoreSession(): Result<AuthUser?> = runCatching {
        val firebaseUser = firebaseAuth.currentUser ?: run {
            _token.value = null
            _currentUser.value = null
            NetworkClient.currentUserId = null
            NetworkClient.setAuthToken(null)
            return@runCatching null
        }

        val tokenResult = firebaseUser.getIdToken(false).await()
        val idToken = tokenResult.token ?: throw IllegalStateException("Firebase ID token is null")

        NetworkClient.setAuthToken(idToken)
        _token.value = idToken

        val meRes: AuthResponse = try {
            apiService.getMe()
        } catch (_: Exception) {
            AuthResponse(token = idToken)
        }

        val resolvedUser = meRes.user ?: AuthUser(
            id = firebaseUser.uid,
            firebaseUid = firebaseUser.uid,
            email = firebaseUser.email ?: "",
            displayName = firebaseUser.displayName ?: firebaseUser.email?.substringBefore("@")?.replaceFirstChar { it.uppercase() } ?: "User",
            initials = (firebaseUser.displayName ?: firebaseUser.email ?: "U").take(2).uppercase(),
            role = "Member",
            online = true
        )

        NetworkClient.currentUserId = resolvedUser.uid
        _currentUser.value = resolvedUser

        registerCurrentFcmToken()

        resolvedUser
    }

    suspend fun login(email: String, password: String = ""): Result<AuthResponse> = runCatching {
        val trimmedEmail = email.trim()
        require(trimmedEmail.isNotEmpty()) { "Email address cannot be empty" }
        require(password.isNotEmpty()) { "Password cannot be empty" }

        // 1. Authenticate with Firebase Auth SDK
        val authResult = firebaseAuth.signInWithEmailAndPassword(trimmedEmail, password).await()
        val firebaseUser = authResult.user ?: throw IllegalStateException("Firebase user is null after sign in")

        // 2. Obtain Firebase ID token
        val tokenResult = firebaseUser.getIdToken(false).await()
        val idToken = tokenResult.token ?: throw IllegalStateException("Failed to obtain Firebase ID token")

        // 3. Set auth token in NetworkClient for REST & Socket.IO
        NetworkClient.setAuthToken(idToken)
        _token.value = idToken

        // 4. Fetch MongoDB user profile via GET /api/auth/me
        val meRes: AuthResponse = try {
            apiService.getMe()
        } catch (_: Exception) {
            AuthResponse(token = idToken)
        }

        val resolvedUser = meRes.user ?: AuthUser(
            id = firebaseUser.uid,
            firebaseUid = firebaseUser.uid,
            email = firebaseUser.email ?: trimmedEmail,
            displayName = firebaseUser.displayName ?: trimmedEmail.substringBefore("@").replaceFirstChar { it.uppercase() },
            initials = (firebaseUser.displayName ?: trimmedEmail).take(2).uppercase(),
            role = "Member",
            online = true
        )

        NetworkClient.currentUserId = resolvedUser.uid
        _currentUser.value = resolvedUser

        registerCurrentFcmToken()

        AuthResponse(token = idToken, user = resolvedUser)
    }

    suspend fun signup(email: String, password: String, displayName: String): Result<AuthResponse> = runCatching {
        val trimmedEmail = email.trim()
        val trimmedName = displayName.trim()
        require(trimmedEmail.isNotEmpty()) { "Email address cannot be empty" }
        require(password.isNotEmpty()) { "Password cannot be empty" }

        // 1. Create account in Firebase Auth SDK
        val authResult = firebaseAuth.createUserWithEmailAndPassword(trimmedEmail, password).await()
        val firebaseUser = authResult.user ?: throw IllegalStateException("Firebase user is null after sign up")

        // 2. Update Firebase display name if provided
        if (trimmedName.isNotEmpty()) {
            val profileUpdates = UserProfileChangeRequest.Builder()
                .setDisplayName(trimmedName)
                .build()
            firebaseUser.updateProfile(profileUpdates).await()
        }

        // 3. Obtain Firebase ID token
        val tokenResult = firebaseUser.getIdToken(false).await()
        val idToken = tokenResult.token ?: throw IllegalStateException("Failed to obtain Firebase ID token")

        // 4. Set auth token in NetworkClient for REST & Socket.IO
        NetworkClient.setAuthToken(idToken)
        _token.value = idToken

        // 5. Fetch/Sync MongoDB user profile via GET /api/auth/me
        val meRes: AuthResponse = try {
            apiService.getMe()
        } catch (_: Exception) {
            AuthResponse(token = idToken)
        }

        val resolvedUser = meRes.user ?: AuthUser(
            id = firebaseUser.uid,
            firebaseUid = firebaseUser.uid,
            email = firebaseUser.email ?: trimmedEmail,
            displayName = if (trimmedName.isNotEmpty()) trimmedName else trimmedEmail.substringBefore("@").replaceFirstChar { it.uppercase() },
            initials = if (trimmedName.isNotEmpty()) trimmedName.take(2).uppercase() else trimmedEmail.take(2).uppercase(),
            role = "Member",
            online = true
        )

        NetworkClient.currentUserId = resolvedUser.uid
        _currentUser.value = resolvedUser

        registerCurrentFcmToken()

        AuthResponse(token = idToken, user = resolvedUser)
    }

    suspend fun devLogin(email: String): Result<AuthResponse> = login(email, "Password123!")

    fun logout() {
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { fcmToken ->
                    if (!fcmToken.isNullOrEmpty()) {
                        repositoryScope.launch {
                            try {
                                apiService.unregisterFcmToken(
                                    FcmTokenRequest(fcmToken = fcmToken)
                                )
                            } catch (_: Exception) {}
                        }
                    }
                }
            firebaseAuth.signOut()
        } catch (_: Exception) {}
        _token.value = null
        _currentUser.value = null
        NetworkClient.currentUserId = null
        NetworkClient.setAuthToken(null)
        NetworkClient.setActiveWorkspace(null)
    }
}
