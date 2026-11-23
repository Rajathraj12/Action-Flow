package com.actionflow.presentation.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val LightColorScheme = lightColorScheme(
    primary = LightPrimary,
    onPrimary = LightOnPrimary,
    primaryContainer = LightPrimaryContainer,
    onPrimaryContainer = LightOnPrimaryContainer,
    background = LightBackground,
    onBackground = LightOnBackground,
    surface = LightSurface,
    onSurface = LightOnSurface,
    surfaceVariant = LightSurfaceVariant,
    onSurfaceVariant = LightOnSurfaceVariant,
    outline = LightOutline,
    error = LightDestructive
)

private val DarkColorScheme = darkColorScheme(
    primary = DarkPrimary,
    onPrimary = DarkOnPrimary,
    primaryContainer = DarkPrimaryContainer,
    onPrimaryContainer = DarkOnPrimaryContainer,
    background = DarkBackground,
    onBackground = DarkOnBackground,
    surface = DarkSurface,
    onSurface = DarkOnSurface,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkOnSurfaceVariant,
    outline = DarkOutline,
    error = DarkDestructive
)

private val LightCustomColors = ActionFlowCustomColors(
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

private val DarkCustomColors = ActionFlowCustomColors(
    bubbleOut = DarkBubbleOut,
    bubbleOutForeground = DarkBubbleOutForeground,
    bubbleIn = DarkBubbleIn,
    bubbleInForeground = DarkBubbleInForeground,
    rail = DarkRail,
    railForeground = DarkRailForeground,
    online = DarkOnline,
    readTicks = DarkReadTicks,
    destructive = DarkDestructive,
    warning = DarkWarning
)

object ActionFlowTheme {
    val customColors: ActionFlowCustomColors
        @Composable
        @ReadOnlyComposable
        get() = LocalActionFlowColors.current
}

@Composable
fun ActionFlowTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val customColors = if (darkTheme) DarkCustomColors else LightCustomColors

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            if (android.os.Build.VERSION.SDK_INT < 35) {
                @Suppress("DEPRECATION")
                window.statusBarColor = colorScheme.background.toArgb()
                @Suppress("DEPRECATION")
                window.navigationBarColor = colorScheme.surface.toArgb()
            }
            val insetsController = WindowCompat.getInsetsController(window, view)
            insetsController.isAppearanceLightStatusBars = !darkTheme
            insetsController.isAppearanceLightNavigationBars = !darkTheme
        }
    }

    CompositionLocalProvider(LocalActionFlowColors provides customColors) {
        MaterialTheme(
            colorScheme = colorScheme,
            typography = ActionFlowTypography,
            shapes = ActionFlowShapes,
            content = content
        )
    }
}
