package com.actionflow.presentation.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.unit.dp

val ActionFlowShapes = Shapes(
    extraSmall = RoundedCornerShape(4.dp),
    small = RoundedCornerShape(8.dp),
    medium = RoundedCornerShape(12.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(24.dp)
)

val BubbleOutShape = RoundedCornerShape(
    topStart = 16.dp,
    topEnd = 4.dp,
    bottomEnd = 16.dp,
    bottomStart = 16.dp
)

val BubbleInShape = RoundedCornerShape(
    topStart = 4.dp,
    topEnd = 16.dp,
    bottomEnd = 16.dp,
    bottomStart = 16.dp
)

val DynamicIslandShape = RoundedCornerShape(24.dp)
