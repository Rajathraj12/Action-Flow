package com.actionflow.data.api

import com.actionflow.data.models.*
import kotlinx.serialization.Serializable
import retrofit2.http.*

@Serializable
data class LoginRequest(val email: String, val password: String? = null)

@Serializable
data class SignupRequest(val email: String, val password: String, val displayName: String)

@Serializable
data class DevLoginRequest(val email: String)

@Serializable
data class WorkspacesResponse(val workspaces: List<Workspace> = emptyList())

@Serializable
data class SingleWorkspaceResponse(val workspace: Workspace)

@Serializable
data class WorkspaceMembersResponse(val members: List<WorkspaceMember> = emptyList())

@Serializable
data class ConversationsResponse(val conversations: List<Conversation> = emptyList())

@Serializable
data class SingleConversationResponse(val conversation: Conversation)

@Serializable
data class MessagesResponse(val messages: List<Message> = emptyList())

@Serializable
data class SingleMessageResponse(val message: Message)

@Serializable
data class TasksResponse(val tasks: List<Task> = emptyList())

@Serializable
data class SingleTaskResponse(val task: Task)

@Serializable
data class NotificationsResponse(val notifications: List<NotificationItem> = emptyList())

@Serializable
data class CreateDirectConvRequest(
    val participantId: String,
    val userId: String? = null
)

@Serializable
data class CreateGroupConvRequest(
    val name: String,
    val description: String? = null,
    val participantIds: List<String>
)

@Serializable
data class SendMessageRequest(val text: String, val localKey: String? = null)

@Serializable
data class EditMessageRequest(val text: String)

@Serializable
data class DeleteMessageRequest(val deleteType: String = "everyone")

@Serializable
data class CreateTaskRequest(
    val title: String,
    val description: String = "",
    val priority: String = "MEDIUM",
    val dueDate: String? = null,
    val assigneeId: String? = null,
    val sourceMessageId: String? = null,
    val sourceConversationId: String? = null
)

@Serializable
data class UpdateTaskRequest(
    val title: String? = null,
    val description: String? = null,
    val status: String? = null,
    val priority: String? = null,
    val dueDate: String? = null,
    val assigneeId: String? = null
)

@Serializable
data class FcmTokenRequest(
    val fcmToken: String,
    val deviceType: String = "android",
    val deviceName: String = "Android Device"
)

@Serializable
data class SimpleSuccessResponse(val success: Boolean = true, val message: String? = null)

interface ActionFlowApiService {
    // Auth
    @POST("api/auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("api/auth/signup")
    suspend fun signup(@Body body: SignupRequest): AuthResponse

    @POST("api/auth/dev-login")
    suspend fun devLogin(@Body body: DevLoginRequest): AuthResponse

    @GET("api/auth/me")
    suspend fun getMe(): AuthResponse

    // FCM Device Token Management
    @POST("api/users/fcm-token")
    suspend fun registerFcmToken(@Body body: FcmTokenRequest): SimpleSuccessResponse

    @HTTP(method = "DELETE", path = "api/users/fcm-token", hasBody = true)
    suspend fun unregisterFcmToken(@Body body: FcmTokenRequest): SimpleSuccessResponse

    // Workspaces
    @GET("api/workspaces")
    suspend fun getWorkspaces(): WorkspacesResponse

    @POST("api/workspaces")
    suspend fun createWorkspace(@Body body: Map<String, String>): SingleWorkspaceResponse

    @GET("api/workspaces/{id}/members")
    suspend fun getWorkspaceMembers(@Path("id") workspaceId: String): WorkspaceMembersResponse

    // Conversations
    @GET("api/workspaces/{id}/conversations")
    suspend fun getConversations(@Path("id") workspaceId: String): ConversationsResponse

    @POST("api/workspaces/{id}/conversations/direct")
    suspend fun createDirectConversation(
        @Path("id") workspaceId: String,
        @Body body: CreateDirectConvRequest
    ): SingleConversationResponse

    @POST("api/workspaces/{id}/conversations/group")
    suspend fun createGroupConversation(
        @Path("id") workspaceId: String,
        @Body body: CreateGroupConvRequest
    ): SingleConversationResponse

    @GET("api/workspaces/{id}/conversations/{convId}")
    suspend fun getConversationDetails(
        @Path("id") workspaceId: String,
        @Path("convId") convId: String
    ): SingleConversationResponse

    // Messages
    @GET("api/conversations/{convId}/messages")
    suspend fun getMessages(@Path("convId") convId: String): MessagesResponse

    @POST("api/conversations/{convId}/messages")
    suspend fun sendMessage(
        @Path("convId") convId: String,
        @Body body: SendMessageRequest
    ): SingleMessageResponse

    @PUT("api/conversations/{convId}/messages/{msgId}")
    suspend fun editMessage(
        @Path("convId") convId: String,
        @Path("msgId") msgId: String,
        @Body body: EditMessageRequest
    ): SingleMessageResponse

    @HTTP(method = "DELETE", path = "api/conversations/{convId}/messages/{msgId}", hasBody = true)
    suspend fun deleteMessage(
        @Path("convId") convId: String,
        @Path("msgId") msgId: String,
        @Body body: DeleteMessageRequest
    ): SimpleSuccessResponse

    // Tasks
    @GET("api/workspaces/{id}/tasks")
    suspend fun getTasks(
        @Path("id") workspaceId: String,
        @Query("filter") filter: String? = null,
        @Query("status") status: String? = null,
        @Query("priority") priority: String? = null,
        @Query("assigneeId") assigneeId: String? = null,
        @Query("search") search: String? = null
    ): TasksResponse

    @POST("api/workspaces/{id}/tasks")
    suspend fun createTask(
        @Path("id") workspaceId: String,
        @Body body: CreateTaskRequest
    ): SingleTaskResponse

    @GET("api/workspaces/{id}/tasks/{taskId}")
    suspend fun getTask(
        @Path("id") workspaceId: String,
        @Path("taskId") taskId: String
    ): SingleTaskResponse

    @PATCH("api/workspaces/{id}/tasks/{taskId}")
    suspend fun updateTask(
        @Path("id") workspaceId: String,
        @Path("taskId") taskId: String,
        @Body body: UpdateTaskRequest
    ): SingleTaskResponse

    @DELETE("api/workspaces/{id}/tasks/{taskId}")
    suspend fun deleteTask(
        @Path("id") workspaceId: String,
        @Path("taskId") taskId: String
    ): SimpleSuccessResponse

    @GET("api/workspaces/{id}/tasks/summary")
    suspend fun getTaskSummary(@Path("id") workspaceId: String): TaskSummaryResponse

    // Global Search & Notifications
    @GET("api/search")
    suspend fun globalSearch(
        @Query("q") query: String,
        @Query("workspaceId") workspaceId: String? = null
    ): GlobalSearchResponse

    @GET("api/notifications")
    suspend fun getNotifications(): NotificationsResponse

    @PATCH("api/notifications/{id}/read")
    suspend fun markNotificationRead(@Path("id") id: String): SimpleSuccessResponse

    @POST("api/notifications/mark-all-read")
    suspend fun markAllNotificationsRead(): SimpleSuccessResponse
}
