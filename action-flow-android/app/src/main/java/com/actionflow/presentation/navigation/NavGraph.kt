package com.actionflow.presentation.navigation

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.navArgument
import com.actionflow.presentation.components.ActionFlowBottomBar
import com.actionflow.presentation.components.ActionFlowTopBar
import com.actionflow.presentation.screens.chat.ChatListScreen
import com.actionflow.presentation.screens.chat.ChatThreadScreen
import com.actionflow.presentation.screens.dashboard.DashboardScreen
import com.actionflow.presentation.screens.search.GlobalSearchScreen
import com.actionflow.presentation.screens.settings.SettingsScreen
import com.actionflow.presentation.screens.tasks.TasksScreen
import com.actionflow.presentation.viewmodels.AuthViewModel
import com.actionflow.presentation.viewmodels.ChatViewModel
import com.actionflow.presentation.viewmodels.DashboardViewModel
import com.actionflow.presentation.viewmodels.TaskViewModel
import com.actionflow.presentation.viewmodels.WorkspaceViewModel

@Composable
fun ActionFlowNavGraph(
    navController: NavHostController,
    authViewModel: AuthViewModel,
    workspaceViewModel: WorkspaceViewModel,
    chatViewModel: ChatViewModel,
    taskViewModel: TaskViewModel,
    dashboardViewModel: DashboardViewModel,
    isDarkTheme: Boolean,
    onToggleTheme: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: Screen.ChatList.route

    val workspaceState by workspaceViewModel.uiState.collectAsState()
    val authState by authViewModel.uiState.collectAsState()
    val activeWsId = workspaceState.activeWorkspace?.effectiveId ?: ""
    val activeWsName = workspaceState.activeWorkspace?.name?.ifEmpty { "Soul Business Solutions" } ?: "Soul Business Solutions"

    val isTopLevelRoute = currentRoute in listOf(
        Screen.ChatList.route,
        Screen.Tasks.route,
        Screen.Dashboard.route,
        Screen.Settings.route,
    )

    Scaffold(
        modifier = modifier,
        contentWindowInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal),
        topBar = {
            if (isTopLevelRoute) {
                ActionFlowTopBar(
                    workspaceName = activeWsName,
                    onWorkspaceClick = { workspaceViewModel.loadWorkspaces() },
                    onSearchClick = { navController.navigate(Screen.GlobalSearch.route) },
                    onNotificationsClick = { /* Opens Notification drawer */ },
                    unreadNotificationCount = 3,
                )
            }
        },
        bottomBar = {
            if (isTopLevelRoute) {
                ActionFlowBottomBar(
                    currentRoute = currentRoute,
                    onNavigate = { route ->
                        navController.navigate(route) {
                            popUpTo(Screen.ChatList.route) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }
                    },
                    unreadChatCount = 3,
                    pendingTaskCount = 2,
                )
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.ChatList.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            // Chats List
            composable(Screen.ChatList.route) {
                LaunchedEffect(activeWsId) {
                    if (activeWsId.isNotEmpty()) {
                        chatViewModel.loadConversations(activeWsId)
                    } else {
                        workspaceViewModel.loadWorkspaces()
                    }
                }
                ChatListScreen(
                    viewModel = chatViewModel,
                    workspaceId = activeWsId,
                    onConversationClick = { convId ->
                        navController.navigate(Screen.ChatThread.createRoute(convId))
                    },
                    onNewChatClick = {
                        if (activeWsId.isNotEmpty()) {
                            chatViewModel.loadConversations(activeWsId)
                        } else {
                            workspaceViewModel.loadWorkspaces()
                        }
                    },
                )
            }

            // Chat Thread
            composable(
                route = Screen.ChatThread.route,
                arguments = listOf(navArgument("conversationId") { type = NavType.StringType }),
            ) { backStackEntry ->
                val conversationId = backStackEntry.arguments?.getString("conversationId") ?: ""
                ChatThreadScreen(
                    conversationId = conversationId,
                    workspaceId = activeWsId,
                    viewModel = chatViewModel,
                    onBackClick = { navController.popBackStack() },
                    onGroupInfoClick = { /* Group info bottom sheet */ },
                    onConvertTaskClick = { msg ->
                        taskViewModel.createTask(
                            workspaceId = activeWsId,
                            title = msg.effectiveText.take(60),
                            description = msg.effectiveText,
                            priority = "HIGH",
                            dueDate = null,
                            assigneeId = null,
                        )
                        navController.navigate(Screen.Tasks.route)
                    },
                )
            }

            // Tasks
            composable(Screen.Tasks.route) {
                TasksScreen(
                    viewModel = taskViewModel,
                    workspaceId = activeWsId,
                )
            }

            // Dashboard
            composable(Screen.Dashboard.route) {
                DashboardScreen(
                    viewModel = dashboardViewModel,
                    workspaceId = activeWsId,
                )
            }

            // Settings
            composable(Screen.Settings.route) {
                SettingsScreen(
                    currentUser = authState.user,
                    isDarkTheme = isDarkTheme,
                    onToggleTheme = onToggleTheme,
                    onLogout = { authViewModel.logout() },
                )
            }

            // Global Search
            composable(Screen.GlobalSearch.route) {
                GlobalSearchScreen(
                    onBackClick = { navController.popBackStack() },
                )
            }
        }
    }
}
