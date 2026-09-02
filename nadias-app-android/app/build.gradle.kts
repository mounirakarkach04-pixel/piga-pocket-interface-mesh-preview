plugins {
    id("com.android.application")
}

android {
    namespace = "com.nadias.familyapp"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.nadias.familyapp"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "3.0.0"
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
