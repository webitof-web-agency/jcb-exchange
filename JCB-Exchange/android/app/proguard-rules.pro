# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# --- React Native Core & Hermes ---
-keep class com.facebook.react.** { *; }
-keepclassmembers class com.facebook.react.** { *; }
-dontwarn com.facebook.react.**
-keep class com.facebook.hermes.** { *; }
-dontwarn com.facebook.hermes.**

# --- React Native WebView ---
-keep class com.reactnativecommunity.webview.** { *; }
-keepclassmembers class com.reactnativecommunity.webview.** { *; }
-dontwarn com.reactnativecommunity.webview.**

# --- React Native Firebase & Google Play Services ---
-keep class io.invertase.firebase.** { *; }
-dontwarn io.invertase.firebase.**
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# --- Custom App Native Modules ---
-keep class com.webitof.jcbexchange.** { *; }
-keepclassmembers class com.webitof.jcbexchange.** { *; }

# --- Keep Annotations, Enums, Signatures ---
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod
