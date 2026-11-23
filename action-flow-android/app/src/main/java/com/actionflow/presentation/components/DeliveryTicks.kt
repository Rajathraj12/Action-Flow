package com.actionflow.presentation.components

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.actionflow.presentation.theme.ActionFlowTheme

@Composable
fun DeliveryTicks(
    status: String,
    modifier: Modifier = Modifier
) {
    when (status.lowercase()) {
        "read" -> {
            Icon(
                imageVector = Icons.Default.DoneAll,
                contentDescription = "Read",
                tint = ActionFlowTheme.customColors.readTicks,
                modifier = modifier.size(15.dp)
            )
        }
        "delivered" -> {
            Icon(
                imageVector = Icons.Default.DoneAll,
                contentDescription = "Delivered",
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                modifier = modifier.size(15.dp)
            )
        }
        else -> { // "sent"
            Icon(
                imageVector = Icons.Default.Check,
                contentDescription = "Sent",
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                modifier = modifier.size(14.dp)
            )
        }
    }
}
