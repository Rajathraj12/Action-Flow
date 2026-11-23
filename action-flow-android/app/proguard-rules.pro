# Proguard rules for ActionFlow
-keepattributes *Annotation*
-keepclassmembers class * {
    @kotlinx.serialization.SerialName <fields>;
}
-dontwarn io.socket.**
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
