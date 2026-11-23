package com.actionflow

import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.rememberNavController
import com.actionflow.data.api.NetworkClient
import com.actionflow.data.repository.NotificationRepository
import com.actionflow.presentation.navigation.ActionFlowNavGraph
import com.actionflow.presentation.navigation.Screen
import com.actionflow.presentation.screens.auth.AuthBottomSheet
import com.actionflow.presentation.theme.ActionFlowTheme
import com.actionflow.presentation.viewmodels.AuthViewModel
import com.actionflow.presentation.viewmodels.ChatViewModel
import com.actionflow.presentation.viewmodels.DashboardViewModel
import com.actionflow.presentation.viewmodels.TaskViewModel
import com.actionflow.presentation.viewmodels.WorkspaceViewModel
import com.actionflow.services.NotificationHelper

class MainActivity : ComponentActivity() {

    private val authViewModel: AuthViewModel by viewModels()
    private val workspaceViewModel: WorkspaceViewModel by viewModels()
    private val chatViewModel: ChatViewModel by viewModels()
    private val taskViewModel: TaskViewModel by viewModels()
    private val dashboardViewModel: DashboardViewModel by viewModels()
    private var notificationRepository: NotificationRepository? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NetworkClient.applicationContext = applicationContext
        NotificationHelper.createNotificationChannel(applicationContext)
        notificationRepository = NotificationRepository()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes.layoutInDisplayCutoutMode =
                WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }

        enableEdgeToEdge()

        setContent {
            val systemDark = isSystemInDarkTheme()
            var isDarkTheme by remember { mutableStateOf(systemDark) }

            val authState by authViewModel.uiState.collectAsState()
            val workspaceState by workspaceViewModel.uiState.collectAsState()

            LaunchedEffect(workspaceState.activeWorkspace) {
                workspaceState.activeWorkspace?.let { ws ->
                    val wsId = ws.effectiveId
                    if (wsId.isNotEmpty()) {
                        chatViewModel.loadConversations(wsId)
                        taskViewModel.loadTasks(wsId)
                        dashboardViewModel.loadDashboard(wsId)
                    }
                }
            }

            ActionFlowTheme(darkTheme = isDarkTheme) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val navController = rememberNavController()

                    LaunchedEffect(intent) {
                        val destType = intent?.getStringExtra("destinationType")
                        val destId = intent?.getStringExtra("destinationId")
                        if (!destType.isNullOrEmpty() && !destId.isNullOrEmpty()) {
                            if (destType == "conversation") {
                                navController.navigate(Screen.ChatThread.createRoute(destId))
                            } else if (destType == "task") {
                                navController.navigate(Screen.Tasks.route)
                            }
                        }
                    }

                    ActionFlowNavGraph(
                        navController = navController,
                        authViewModel = authViewModel,
                        workspaceViewModel = workspaceViewModel,
                        chatViewModel = chatViewModel,
                        taskViewModel = taskViewModel,
                        dashboardViewModel = dashboardViewModel,
                        isDarkTheme = isDarkTheme,
                        onToggleTheme = { isDarkTheme = it },
                    )

                    // Gate with AuthBottomSheet if user session is not active
                    if ((authState.user == null) && (!authState.isLoading)) {
                        AuthBottomSheet(
                            viewModel = authViewModel,
                            onDismiss = { /* Forced until login */ },
                        )
                    }
                }
            }
        }
    }
}
