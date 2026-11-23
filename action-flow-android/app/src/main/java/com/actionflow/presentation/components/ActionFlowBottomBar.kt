package com.actionflow.presentation.components

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.CheckBox
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun ActionFlowBottomBar(
    currentRoute: String,
    onNavigate: (String) -> Unit,
    unreadChatCount: Int = 0,
    pendingTaskCount: Int = 0,
    modifier: Modifier = Modifier
) {
    NavigationBar(
        modifier = modifier.windowInsetsPadding(
            WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)
        ),
        containerColor = MaterialTheme.colorScheme.surface,
        tonalElevation = 4.dp,
        windowInsets = WindowInsets.safeDrawing.only(
            WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal
        )
    ) {
        // Chats
        NavigationBarItem(
            selected = currentRoute == "chats",
            onClick = { onNavigate("chats") },
            icon = {
                BadgedBox(
                    badge = {
                        if (unreadChatCount > 0) {
                            Badge(containerColor = MaterialTheme.colorScheme.primary) {
                                Text(unreadChatCount.toString(), fontSize = 10.sp)
                            }
                        }
                    }
                ) {
                    Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "Chats")
                }
            },
            label = {
                Text(
                    "Chats",
                    fontWeight = if (currentRoute == "chats") FontWeight.Bold else FontWeight.Medium
                )
            },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = MaterialTheme.colorScheme.primary,
                selectedTextColor = MaterialTheme.colorScheme.primary,
                indicatorColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            )
        )

        // Tasks
        NavigationBarItem(
            selected = currentRoute == "tasks",
            onClick = { onNavigate("tasks") },
            icon = {
                BadgedBox(
                    badge = {
                        if (pendingTaskCount > 0) {
                            Badge(containerColor = MaterialTheme.colorScheme.secondary) {
                                Text(pendingTaskCount.toString(), fontSize = 10.sp)
                            }
                        }
                    }
                ) {
                    Icon(Icons.Default.CheckBox, contentDescription = "Tasks")
                }
            },
            label = {
                Text(
                    "Tasks",
                    fontWeight = if (currentRoute == "tasks") FontWeight.Bold else FontWeight.Medium
                )
            },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = MaterialTheme.colorScheme.primary,
                selectedTextColor = MaterialTheme.colorScheme.primary,
                indicatorColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            )
        )

        // Dashboard
        NavigationBarItem(
            selected = currentRoute == "dashboard",
            onClick = { onNavigate("dashboard") },
            icon = {
                Icon(Icons.Default.BarChart, contentDescription = "Dashboard")
            },
            label = {
                Text(
                    "Dashboard",
                    fontWeight = if (currentRoute == "dashboard") FontWeight.Bold else FontWeight.Medium
                )
            },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = MaterialTheme.colorScheme.primary,
                selectedTextColor = MaterialTheme.colorScheme.primary,
                indicatorColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            )
        )

        // Settings
        NavigationBarItem(
            selected = currentRoute == "settings",
            onClick = { onNavigate("settings") },
            icon = {
                Icon(Icons.Default.Settings, contentDescription = "Settings")
            },
            label = {
                Text(
                    "Settings",
                    fontWeight = if (currentRoute == "settings") FontWeight.Bold else FontWeight.Medium
                )
            },
            colors = NavigationBarItemDefaults.colors(
                selectedIconColor = MaterialTheme.colorScheme.primary,
                selectedTextColor = MaterialTheme.colorScheme.primary,
                indicatorColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
            )
        )
    }
}
