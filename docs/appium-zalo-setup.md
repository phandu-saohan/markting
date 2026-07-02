# ══════════════════════════════════════════════════════
# Hướng dẫn cài đặt Appium cho Zalo Personal Diary
# ══════════════════════════════════════════════════════

## 1. Cài đặt Java & Android SDK
```bash
# Ubuntu/Debian (VPS)
sudo apt update
sudo apt install -y openjdk-17-jdk

# Tải Android cmdline-tools
wget https://dl.google.com/android/repository/commandlinetools-linux-9477386_latest.zip
unzip commandlinetools-linux-*.zip -d $HOME/android
export ANDROID_HOME=$HOME/android
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/bin:$ANDROID_HOME/platform-tools

# Cài platform tools và emulator
sdkmanager "platform-tools" "emulator" "system-images;android-33;google_apis;x86_64"
```

## 2. Tạo Android Virtual Device (AVD)
```bash
# Tạo emulator
avdmanager create avd \
  --name "Pixel_6_API33" \
  --package "system-images;android-33;google_apis;x86_64" \
  --device "pixel_6"

# Khởi động emulator headless (không cần GUI)
emulator -avd Pixel_6_API33 -no-window -no-audio -gpu swiftshader_indirect &

# Kiểm tra emulator đã sẵn sàng
adb wait-for-device
adb devices
```

## 3. Cài Zalo APK lên emulator
```bash
# Tải Zalo APK (từ APKPure hoặc extract từ điện thoại thật)
adb install zalo.apk

# Hoặc push file lên emulator
adb push /path/to/zalo.apk /sdcard/

# Đăng nhập thủ công lần đầu qua scrcpy
scrcpy --no-audio  # mirror màn hình emulator
```

## 4. Cài Appium
```bash
# Cài Node.js & Appium
npm install -g appium@latest
appium driver install uiautomator2

# Kiểm tra Appium environment
appium doctor --android

# Khởi động Appium server
appium --port 4723 --log-timestamp --log-no-colors &
```

## 5. Thêm vào docker-compose.prod.yml (nếu cần)
```yaml
  # Appium + Android emulator (resource intensive!)
  appium:
    image: budtmo/docker-android:emulator_13.0
    container_name: ma_appium
    privileged: true
    environment:
      EMULATOR_DEVICE: "Samsung Galaxy S10"
      WEB_VNC: true           # Xem màn hình qua http://host:6080
      APPIUM: true
    ports:
      - "4723:4723"   # Appium API
      - "6080:6080"   # noVNC (xem màn hình)
    volumes:
      - ./zalo.apk:/root/tmp/zalo.apk
    networks:
      - internal
```

## 6. Push media files lên emulator (khi đăng ảnh/video)
```bash
# Trong worker, trước khi Appium chọn ảnh:
# 1. Download file từ S3 về /tmp/media.jpg
# 2. Push lên emulator
adb push /tmp/media.jpg /sdcard/Pictures/

# 3. Refresh media scanner
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Pictures/media.jpg
```

## 7. Cài thêm dependency trong workers/package.json
```bash
pnpm --filter workers add webdriverio @wdio/appium-service
```

## Lưu ý quan trọng
- Zalo có thể yêu cầu xác minh OTP khi đăng nhập lần đầu
- Nên dùng **1 tài khoản Zalo = 1 emulator** để tránh bị logout
- Resource: Mỗi emulator cần ~2GB RAM + 2 CPU cores
- Với nhiều tài khoản, nên dùng cloud Android như **Genycloud** hoặc **BrowserStack**
