package com.actionflow.presentation.screens.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.actionflow.data.models.Message
import com.actionflow.presentation.components.ActionFlowAvatar
import com.actionflow.presentation.components.DynamicIslandTaskCapsule
import com.actionflow.presentation.components.MessageBubble
import com.actionflow.presentation.components.MessageInputBar
import com.actionflow.presentation.components.QuickEmojiReactionRow
import com.actionflow.presentation.viewmodels.ChatViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatThreadScreen(
    conversationId: String,
    viewModel: ChatViewModel,
    onBackClick: () -> Unit,
    onGroupInfoClick: () -> Unit,
    onConvertTaskClick: (Message) -> Unit,
    modifier: Modifier = Modifier,
    workspaceId: String? = null,
) {
    val uiState by viewModel.uiState.collectAsState()
    val conv = uiState.activeConversation

    var draftText by remember { mutableStateOf("") }
    var selectedMessageForOptions by remember { mutableStateOf<Message?>(null) }
    var showEmojiQuickRow by remember { mutableStateOf(false) }

    val listState = rememberLazyListState()

    DisposableEffect(conversationId, workspaceId) {
        viewModel.selectConversation(conversationId, workspaceId)
        onDispose {
            viewModel.closeConversation()
        }
    }

    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            Surface(
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp,
                shadowElevation = 1.dp,
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .windowInsetsPadding(
                            WindowInsets.safeDrawing.only(
                                WindowInsetsSides.Top + WindowInsetsSides.Horizontal
                            )
                        )
                        .padding(horizontal = 8.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = onBackClick) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }

                    ActionFlowAvatar(
                        initials = conv?.effectiveInitials ?: "U",
                        online = conv?.online ?: false,
                        isGroup = conv?.type == "GROUP",
                        size = 38.dp,
                        onClick = onGroupInfoClick,
                    )

                    Spacer(modifier = Modifier.width(10.dp))

                    Column(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onGroupInfoClick() },
                    ) {
                        Text(
                            text = conv?.effectiveName ?: "Conversation",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        Text(
                            text = if (conv?.online == true) "Online" else if (conv?.type == "GROUP") "${conv.participantCount} members" else "Offline",
                            style = MaterialTheme.typography.labelSmall,
                            color = if (conv?.online == true) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }

                    IconButton(onClick = {}) {
                        Icon(Icons.Default.Call, contentDescription = "Audio Call", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = {}) {
                        Icon(Icons.Default.Videocam, contentDescription = "Video Call", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    IconButton(onClick = onGroupInfoClick) {
                        Icon(Icons.Default.MoreVert, contentDescription = "Options", tint = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        },
        bottomBar = {
            Column {
                if (showEmojiQuickRow) {
                    QuickEmojiReactionRow(
                        onEmojiSelected = { emoji ->
                            draftText += emoji
                            showEmojiQuickRow = false
                        },
                        modifier = Modifier
                            .align(Alignment.CenterHorizontally)
                            .padding(bottom = 6.dp),
                    )
                }

                MessageInputBar(
                    text = draftText,
                    onTextChange = { draftText = it },
                    onSend = {
                        viewModel.sendMessage(draftText)
                        draftText = ""
                    },
                    onEmojiToggle = { showEmojiQuickRow = !showEmojiQuickRow },
                    onAttach = {},
                )
            }
        },
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(MaterialTheme.colorScheme.background),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Top Dynamic Island for active tasks
                DynamicIslandTaskCapsule(
                    ongoingCount = 2,
                    latestTaskTitle = "Review authentication & session handling",
                    onClick = {},
                )

                // Message Canvas
                LazyColumn(
                    state = listState,
                    modifier = Modifier
                        .fillMaxSize()
                        .windowInsetsPadding(
                            WindowInsets.safeDrawing.only(WindowInsetsSides.Horizontal)
                        )
                        .padding(vertical = 8.dp),
                ) {
                    items(uiState.messages, key = { it.effectiveId }) { msg ->
                        MessageBubble(
                            message = msg,
                            isMine = msg.from == "me",
                            onLongClick = { selectedMessageForOptions = msg },
                            onAiTaskReviewClick = { onConvertTaskClick(msg) },
                        )
                    }
                }
            }
        }
    }

    // Long-press Context Modal Sheet
    selectedMessageForOptions?.let { msg ->
        ModalBottomSheet(
            onDismissRequest = { selectedMessageForOptions = null },
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp)
                    .windowInsetsPadding(
                        WindowInsets.safeDrawing.only(
                            WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal
                        )
                    ),
            ) {
                Text(
                    text = "Message Options",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                Spacer(modifier = Modifier.height(14.dp))

                // Convert to Task
                ListItem(
                    headlineContent = { Text("Create Task from Message", fontWeight = FontWeight.SemiBold) },
                    leadingContent = { Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    modifier = Modifier.clickable {
                        selectedMessageForOptions = null
                        onConvertTaskClick(msg)
                    },
                )

                // Edit (if mine)
                if (msg.from == "me") {
                    ListItem(
                        headlineContent = { Text("Edit Message") },
                        leadingContent = { Icon(Icons.Default.Edit, contentDescription = null) },
                        modifier = Modifier.clickable {
                            selectedMessageForOptions = null
                            draftText = msg.effectiveText
                        },
                    )
                }

                // Delete
                ListItem(
                    headlineContent = { Text("Delete Message", color = MaterialTheme.colorScheme.error) },
                    leadingContent = { Icon(Icons.Default.Delete, contentDescription = null, tint = MaterialTheme.colorScheme.error) },
                    modifier = Modifier.clickable {
                        viewModel.deleteMessage(msg.effectiveId, forEveryone = true)
                        selectedMessageForOptions = null
                    },
                )
            }
        }
    }
}
