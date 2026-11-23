package com.actionflow.presentation.viewmodels

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.actionflow.data.models.AuthUser
import com.actionflow.data.repository.AuthRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class AuthUiState(
    val user: AuthUser? = null,
    val token: String? = null,
    val isLoading: Boolean = false,
    val error: String? = null
)

val SEEDED_DEV_ACCOUNTS = listOf(
    "Rajath" to "rajath@actionflow.com",
    "Ankit" to "ankit@actionflow.com",
    "Chirag" to "chirag@actionflow.com",
    "Harsha" to "harsha@actionflow.com",
    "Harsh" to "harsh@actionflow.com"
)

class AuthViewModel(
    private val repository: AuthRepository = AuthRepository()
) : ViewModel() {
    private val _uiState = MutableStateFlow(AuthUiState())
    val uiState = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.currentUser.collect { user ->
                _uiState.value = _uiState.value.copy(user = user)
            }
        }
        viewModelScope.launch {
            repository.token.collect { token ->
                _uiState.value = _uiState.value.copy(token = token)
            }
        }
        restoreSession()
    }

    fun restoreSession() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.restoreSession()
            result.onFailure { err ->
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = err.message
                )
            }.onSuccess {
                _uiState.value = _uiState.value.copy(isLoading = false)
            }
        }
    }

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.login(email.trim(), password)
            result.onSuccess {
                _uiState.value = _uiState.value.copy(isLoading = false)
            }.onFailure { err ->
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = err.message ?: "Authentication failed"
                )
            }
        }
    }

    fun signup(email: String, password: String, displayName: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.signup(email.trim(), password, displayName.trim())
            result.onSuccess {
                _uiState.value = _uiState.value.copy(isLoading = false)
            }.onFailure { err ->
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = err.message ?: "Signup failed"
                )
            }
        }
    }

    fun logout() {
        repository.logout()
    }
}
