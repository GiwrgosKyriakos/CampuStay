# ===================================================================
# CampuStay Automated Local Release Build Script
# ===================================================================

# 0. Environmental Variables for Paths
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
$env:Path += ";$env:JAVA_HOME\bin"
$env:ANDROID_HOME="C:\Users\gkiri\AppData\Local\Android\Sdk"
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process
$env:EXPO_TOKEN="48hI64bRVF-1gHEAoMOfdEgbEhEzh2_-H4eVKdV"

# 1. Εκτέλεση Expo Prebuild
npx expo prebuild --platform android

# 2. ΑΥΤΟΜΑΤΗ ΕΓΓΡΑΦΗ ΣΤΟ android/gradle.properties (Μετά το prebuild)
$gradleProps = @"

MYAPP_UPLOAD_STORE_FILE=my-upload-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=123456
MYAPP_UPLOAD_KEY_PASSWORD=123456
"@
Add-Content -Path "android/gradle.properties" -Value $gradleProps

# 3. ΑΥΤΟΜΑΤΗ ΔΙΟΡΘΩΣΗ ΤΟΥ android/app/build.gradle (Μετά το prebuild)
$buildGradlePath = "android/app/build.gradle"
$buildGradleContent = Get-Content $buildGradlePath -Raw

# Αλλαγή του signingConfig από debug σε release
$buildGradleContent = $buildGradleContent -replace 'signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release'

# Προσθήκη του release block στο signingConfigs
$signingReleaseBlock = @"
        release {
            if (project.hasProperty('MYAPP_UPLOAD_STORE_FILE')) {
                storeFile file(MYAPP_UPLOAD_STORE_FILE)
                storePassword MYAPP_UPLOAD_STORE_PASSWORD
                keyAlias MYAPP_UPLOAD_KEY_ALIAS
                keyPassword MYAPP_UPLOAD_KEY_PASSWORD
            }
        }
"@

if ($buildGradleContent -notmatch "signingConfigs\s*\{\s*release") {
    $buildGradleContent = $buildGradleContent -replace 'signingConfigs\s*\{', "signingConfigs {`n$signingReleaseBlock"
}

Set-Content -Path $buildGradlePath -Value $buildGradleContent

# 4. Εκτέλεση του Release Build (Gradle)
cd android
.\gradlew bundleRelease
cd ..