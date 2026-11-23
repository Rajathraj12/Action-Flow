package com.actionflow.presentation.components

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.actionflow.data.models.Message
import com.actionflow.presentation.theme.ActionFlowTheme
import com.actionflow.presentation.theme.BubbleInShape
import com.actionflow.presentation.theme.BubbleOutShape

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun MessageBubble(
    message: Message,
    isMine: Boolean,
    onLongClick: () -> Unit,
    onAiTaskReviewClick: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) {
    val bubbleColor = if (isMine) {
        ActionFlowTheme.customColors.bubbleOut
    } else {
        ActionFlowTheme.customColors.bubbleIn
    }

    val textColor = if (isMine) {
        ActionFlowTheme.customColors.bubbleOutForeground
    } else {
        ActionFlowTheme.customColors.bubbleInForeground
    }

    val bubbleShape = if (isMine) BubbleOutShape else BubbleInShape

    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 12.dp, vertical = 2.dp),
        horizontalArrangement = if (isMine) Arrangement.End else Arrangement.Start,
    ) {
        Surface(
            shape = bubbleShape,
            color = bubbleColor,
            shadowElevation = 1.dp,
            modifier = Modifier
                .widthIn(max = 310.dp)
                .clip(bubbleShape)
                .combinedClickable(
                    onClick = {},
                    onLongClick = onLongClick,
                ),
        ) {
            Column(
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
            ) {
                // Sender display name in Group chat for inbound messages
                if (!isMine && message.sender != null) {
                    Text(
                        text = message.sender.displayName,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(bottom = 2.dp),
                    )
                }

                // Message Text
                Text(
                    text = message.effectiveText,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (message.isDeletedForEveryone || message.isDeleted) textColor.copy(alpha = 0.6f) else textColor,
                )

                // AI Task Detection Badge (if AI detected action item in message)
                if (message.aiTaskDetection?.isTaskCandidate == true && (!message.isDeletedForEveryone) && (!message.isDeleted)) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Surface(
                        shape = MaterialTheme.shapes.extraSmall,
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f),
                        modifier = Modifier.padding(vertical = 2.dp),
                        onClick = { onAiTaskReviewClick?.invoke() },
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Default.AutoAwesome,
                                contentDescription = "AI Action Item",
                                tint = MaterialTheme.colorScheme.primary,
                                modifier = Modifier.size(12.dp),
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = "AI Action Item Detected • Tap to review",
                                fontSize = 10.sp,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.primary,
                            )
                        }
                    }
                }

                // Footer metadata (Edited badge, Time, Delivery Ticks)
                Row(
                    modifier = Modifier
                        .align(Alignment.End)
                        .padding(top = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    if (message.isEdited) {
                        Text(
                            text = "edited",
                            fontSize = 10.sp,
                            color = textColor.copy(alpha = 0.6f),
                        )
                    }

                    Text(
                        text = message.effectiveTime,
                        fontSize = 10.sp,
                        color = textColor.copy(alpha = 0.65f),
                    )

                    if (isMine) {
                        DeliveryTicks(status = message.status)
                    }
                }
            }
        }
    }
}
