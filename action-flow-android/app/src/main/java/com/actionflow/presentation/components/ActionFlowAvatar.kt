package com.actionflow.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Group
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.actionflow.presentation.theme.ActionFlowTheme

@Composable
fun ActionFlowAvatar(
    initials: String,
    online: Boolean = false,
    isGroup: Boolean = false,
    size: Dp = 44.dp,
    modifier: Modifier = Modifier,
    onClick: (() -> Unit)? = null
) {
    val cornerRadius = (size * 0.35f)
    val shape = RoundedCornerShape(cornerRadius)

    val gradientBrush = if (isGroup) {
        Brush.linearGradient(
            colors = listOf(
                MaterialTheme.colorScheme.primary.copy(alpha = 0.35f),
                MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
            )
        )
    } else {
        Brush.linearGradient(
            colors = listOf(
                MaterialTheme.colorScheme.primary.copy(alpha = 0.30f),
                MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
            )
        )
    }

    Box(
        modifier = modifier
            .size(size)
            .then(if (onClick != null) Modifier.clickable { onClick() } else Modifier)
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .clip(shape)
                .background(gradientBrush)
                .border(
                    width = 1.dp,
                    color = MaterialTheme.colorScheme.primary.copy(alpha = 0.25f),
                    shape = shape
                ),
            contentAlignment = Alignment.Center
        ) {
            if (isGroup) {
                Icon(
                    imageVector = Icons.Default.Group,
                    contentDescription = "Group",
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(size * 0.5f)
                )
            } else {
                Text(
                    text = initials.ifBlank { "U" },
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold,
                    fontSize = (size.value * 0.35f).sp
                )
            }
        }

        // Online dot indicator
        if (online && !isGroup) {
            val dotSize = (size * 0.28f).coerceAtLeast(10.dp)
            Box(
                modifier = Modifier
                    .size(dotSize)
                    .align(Alignment.BottomEnd)
                    .clip(CircleShape)
                    .background(ActionFlowTheme.customColors.online)
                    .border(2.dp, MaterialTheme.colorScheme.surface, CircleShape)
            )
        }
    }
}
