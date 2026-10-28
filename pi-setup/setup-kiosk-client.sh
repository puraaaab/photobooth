#!/bin/bash
# =============================================================================
# 🍓 Photobooth Thin-Client (Auto-Start Camera & Kiosk Display)
# Runs on Raspberry Pi 4 / 5 connected to 5" Touchscreen & Camera Module
# Finds the laptop automatically and loads the booth UI from it (http://<laptop>:3847/?view=booth)
# =============================================================================

set -e
BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; RESET="\033[0m"

PC_HOST="${1:-}"   # optional: laptop IP. Leave empty to auto-discover.
PC_PORT="${2:-3847}"   # 3847 = production server (`npm start` on the laptop); 5173 only for development
PC_URL="http://${PC_HOST:-<auto-discovered>}:${PC_PORT}/?view=booth&cam=local"
APP_USER="${USER:-$(id -un)}"
USER_HOME=$(eval echo "~$APP_USER")

echo -e "${BOLD}${CYAN}───────────────────────────────────────────────────────────${RESET}"
echo -e "${BOLD}${GREEN}🍓 Photobooth Auto-Start Client Setup${RESET}"
echo -e "   Target PC Server: ${BOLD}${PC_URL}${RESET}"
echo -e "   User:             ${BOLD}${APP_USER}${RESET}"
echo -e "   Home:             ${BOLD}${USER_HOME}${RESET}"
echo -e "${BOLD}${CYAN}───────────────────────────────────────────────────────────${RESET}"

# 1. Camera stack: picamera2 = real 2304x1296 stills + hardware MJPEG preview
echo -e "${YELLOW}[1/4] Installing camera stack (python3-picamera2)...${RESET}"
sudo apt-get install -y python3-picamera2 v4l-utils >/dev/null || \
    echo -e "${YELLOW}WARN: python3-picamera2 unavailable; camera server will use legacy rpicam-vid mode${RESET}"

# 2. Place pi-camera.py in home directory (the old pi-camera.js only ever returned 720p video frames)
echo -e "${YELLOW}[2/4] Setting up pi-camera.py...${RESET}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/../public/pi-camera.py" ]; then
    cp "${SCRIPT_DIR}/../public/pi-camera.py" "${USER_HOME}/pi-camera.py"
elif [ -f "./pi-camera.py" ]; then
    cp "./pi-camera.py" "${USER_HOME}/pi-camera.py"
else
    curl -fsSL "http://${PC_HOST}:${PC_PORT}/pi-camera.py" -o "${USER_HOME}/pi-camera.py"
fi
chmod +x "${USER_HOME}/pi-camera.py"

# 3. Create & enable systemd background service for Camera Streamer
echo -e "${YELLOW}[3/4] Creating camera background service (auto-starts on boot)...${RESET}"

sudo tee /etc/systemd/system/photobooth-camera.service > /dev/null << SERVICE
[Unit]
Description=Raspberry Pi Photobooth Camera Streamer
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${USER_HOME}
ExecStart=/usr/bin/python3 ${USER_HOME}/pi-camera.py
Restart=always
RestartSec=3
KillSignal=SIGINT
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable photobooth-camera.service
sudo systemctl restart photobooth-camera.service
echo -e "${GREEN}✓ Camera service active and enabled on boot.${RESET}"

# 4. Configure Full-Screen Kiosk Autostart for the Display
echo -e "${YELLOW}[4/4] Setting up full-screen Kiosk autostart...${RESET}"

# Laptop finder: no fixed IP needed. The optional first argument just seeds the cache.
cp "${SCRIPT_DIR}/find-server.sh" "${USER_HOME}/find-server.sh"
chmod +x "${USER_HOME}/find-server.sh"
if [ -n "${1:-}" ]; then echo "${PC_HOST}:${PC_PORT}" > "${USER_HOME}/.photobooth-server"; fi

# Kiosk launcher (quoted heredoc: written literally, evaluated on the Pi at boot)
cat << 'LAUNCHER' > "${USER_HOME}/launch-photobooth.sh"
#!/bin/bash
# Disable screen blanking & power management, hide the cursor
xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true
xset -dpms 2>/dev/null || true
command -v unclutter >/dev/null 2>&1 && unclutter -idle 0.5 -root &

BROWSER_BIN=$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo chromium-browser)

find_server() {
    until SERVER="$("$HOME/find-server.sh")"; do
        echo "[kiosk] Laptop not found yet, retrying in 3s..."
        sleep 3
    done
}

start_browser() {
    pkill -f "$BROWSER_BIN.*--kiosk" 2>/dev/null
    # cam=local: the booth page uses this Pi's own camera at localhost:8080
    $BROWSER_BIN --kiosk --noerrdialogs --disable-infobars --touch-events=enabled --disable-pinch         --overscroll-history-navigation=0 --disable-translate --check-for-update-interval=31536000         --disable-session-crashed-bubble --disable-features=Translate         "http://${SERVER}/?view=booth&cam=local" &
}

find_server
start_browser

# Watchdog: if the laptop disappears for ~60s (new IP after a router restart, laptop rebooted),
# find it again and reload the kiosk. Also restarts Chromium if it crashed.
misses=0
while true; do
    sleep 20
    if curl -fs -m 3 "http://${SERVER}/api/health" >/dev/null; then
        misses=0
        pgrep -f "$BROWSER_BIN.*--kiosk" >/dev/null || start_browser
    else
        misses=$((misses + 1))
        if [ $misses -ge 3 ]; then
            OLD="$SERVER"
            find_server
            [ "$SERVER" != "$OLD" ] && echo "[kiosk] Laptop moved $OLD -> $SERVER"
            start_browser
            misses=0
        fi
    fi
done
LAUNCHER

chmod +x "${USER_HOME}/launch-photobooth.sh"

# Autostart desktop entry
mkdir -p "${USER_HOME}/.config/autostart"
cat << DESKTOP > "${USER_HOME}/.config/autostart/photobooth-kiosk.desktop"
[Desktop Entry]
Type=Application
Name=Photobooth Kiosk
Exec=${USER_HOME}/launch-photobooth.sh
Hidden=false
X-GNOME-Autostart-enabled=true
DESKTOP

echo -e ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  ✅  SETUP COMPLETE!${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "• Camera Server:  ${BOLD}Running in background on port 8080/8081${RESET}"
echo -e "• Kiosk Display:  ${BOLD}Configured to boot directly to ${PC_URL}${RESET}"
echo -e "• Status Check:   ${BOLD}sudo systemctl status photobooth-camera${RESET}"
echo -e ""
echo -e "${CYAN}Now simply reboot your Pi: ${BOLD}sudo reboot${RESET}"
