package com.actionflow.presentation.navigation

sealed class Screen(val route: String) {
    object ChatList : Screen("chats")
    object ChatThread : Screen("chat_thread/{conversationId}") {
        fun createRoute(conversationId: String) = "chat_thread/$conversationId"
    }
    object Tasks : Screen("tasks")
    object Dashboard : Screen("dashboard")
    object Settings : Screen("settings")
    object GlobalSearch : Screen("search")
}
