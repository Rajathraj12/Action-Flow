package com.actionflow.presentation.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

// ActionFlow Light Theme
val LightPrimary = Color(0xFF008069)
val LightOnPrimary = Color(0xFFFFFFFF)
val LightPrimaryContainer = Color(0xFFE0F2F1)
val LightOnPrimaryContainer = Color(0xFF004D40)

val LightBackground = Color(0xFFF0F2F5)
val LightOnBackground = Color(0xFF111B21)
val LightSurface = Color(0xFFFFFFFF)
val LightOnSurface = Color(0xFF111B21)
val LightSurfaceVariant = Color(0xFFE9EDEF)
val LightOnSurfaceVariant = Color(0xFF667781)

val LightOutline = Color(0xFFE2E8F0)
val LightDestructive = Color(0xFFEF4444)
val LightWarning = Color(0xFFF59E0B)

val LightBubbleOut = Color(0xFFD9FDD3)
val LightBubbleOutForeground = Color(0xFF111B21)
val LightBubbleIn = Color(0xFFFFFFFF)
val LightBubbleInForeground = Color(0xFF111B21)

val LightRail = Color(0xFF1F2C34)
val LightRailForeground = Color(0xFFE9EDEF)
val LightOnline = Color(0xFF25D366)
val LightReadTicks = Color(0xFF53BDEB)

// ActionFlow Dark Theme
val DarkPrimary = Color(0xFF00A884)
val DarkOnPrimary = Color(0xFF111B21)
val DarkPrimaryContainer = Color(0xFF005C4B)
val DarkOnPrimaryContainer = Color(0xFFE9EDEF)

val DarkBackground = Color(0xFF111B21)
val DarkOnBackground = Color(0xFFE9EDEF)
val DarkSurface = Color(0xFF202C33)
val DarkOnSurface = Color(0xFFE9EDEF)
val DarkSurfaceVariant = Color(0xFF2A3942)
val DarkOnSurfaceVariant = Color(0xFF8696A0)

val DarkOutline = Color(0xFF222E35)
val DarkDestructive = Color(0xFFEF4444)
val DarkWarning = Color(0xFFF59E0B)

val DarkBubbleOut = Color(0xFF005C4B)
val DarkBubbleOutForeground = Color(0xFFE9EDEF)
val DarkBubbleIn = Color(0xFF202C33)
val DarkBubbleInForeground = Color(0xFFE9EDEF)

val DarkRail = Color(0xFF202C33)
val DarkRailForeground = Color(0xFFAEBAC1)
val DarkOnline = Color(0xFF00A884)
val DarkReadTicks = Color(0xFF53BDEB)

@Immutable
data class ActionFlowCustomColors(
    val bubbleOut: Color,
    val bubbleOutForeground: Color,
    val bubbleIn: Color,
    val bubbleInForeground: Color,
    val rail: Color,
    val railForeground: Color,
    val online: Color,
    val readTicks: Color,
    val destructive: Color,
    val warning: Color
)

val LocalActionFlowColors = staticCompositionLocalOf {
    ActionFlowCustomColors(
        bubbleOut = LightBubbleOut,
        bubbleOutForeground = LightBubbleOutForeground,
        bubbleIn = LightBubbleIn,
        bubbleInForeground = LightBubbleInForeground,
        rail = LightRail,
        railForeground = LightRailForeground,
        online = LightOnline,
        readTicks = LightReadTicks,
        destructive = LightDestructive,
        warning = LightWarning
    )
}
