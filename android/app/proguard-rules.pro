# Capacitor ProGuard Rules
# These rules ensure the bridge between JavaScript and Native code remains intact during minification.

# Keep Capacitor Core
-keep class com.getcapacitor.** { *; }
-keep interface com.getcapacitor.** { *; }

# Keep JavaScript Interfaces (Critical for the Bridge)
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Plugin classes
-keep public class * extends com.getcapacitor.Plugin

# Keep Cordova Plugins (if any are used)
-keep class org.apache.cordova.** { *; }
-keep interface org.apache.cordova.** { *; }

# Handle Reflection (Common in Plugins)
-keepattributes Signature
-keepattributes *Annotation*
-keepattributes EnclosingMethod
-keepattributes InnerClasses

# Preserve line numbers for better crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Specific rules for common Capacitor plugins
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.capacitor_community.** { *; }

# If using Google GenAI or other libraries that might use reflection
-dontwarn com.google.android.gms.**
-keep class com.google.android.gms.** { *; }

# Optimization settings
-optimizationpasses 5
-allowaccessmodification
-dontpreverify
