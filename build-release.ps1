# 1. Ορισμός των Environment Variables
$env:EXPO_ANDROID_KEYSTORE_PATH="../keystore/@gkyriakos92__campustay-keystore.bak.jsk"
$env:EXPO_ANDROID_KEY_ALIAS="ΤΟ_ALIAS_ΣΟΥ"
$env:EXPO_ANDROID_KEYSTORE_PASSWORD="Ο_ΚΩΔΙΚΟΣ_ΣΟΥ"
$env:EXPO_ANDROID_KEY_PASSWORD="Ο_ΚΩΔΙΚΟΣ_ΣΟΥ"

# 2. Εκτέλεση του Build
cd android
.\gradlew clean
.\gradlew assembleRelease
cd ..

Write-Host "🚀 Το Release APK είναι έτοιμο!" -ForegroundColor Green