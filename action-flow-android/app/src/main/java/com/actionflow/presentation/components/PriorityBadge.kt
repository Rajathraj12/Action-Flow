package com.actionflow.presentation.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun PriorityBadge(
    priority: String,
    modifier: Modifier = Modifier
) {
    val (bgColor, textColor) = when (priority.uppercase()) {
        "URGENT" -> Color(0xFFFEE2E2) to Color(0xFFDC2626)
        "HIGH" -> Color(0xFFFEF3C7) to Color(0xFFD97706)
        "MEDIUM" -> Color(0xFFE0F2FE) to Color(0xFF0284C7)
        else -> Color(0xFFF1F5F9) to Color(0xFF64748B) // LOW
    }

    Box(
        modifier = modifier
            .background(bgColor, RoundedCornerShape(6.dp))
            .padding(horizontal = 7.dp, vertical = 2.dp)
    ) {
        Text(
            text = priority.uppercase(),
            color = textColor,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 0.3.sp
        )
    }
}
