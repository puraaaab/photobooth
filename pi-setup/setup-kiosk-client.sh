#!/bin/bash
# =============================================================================
# 🍓 Photobooth Thin-Client (Auto-Start Camera & Kiosk Display)
# Runs on Raspberry Pi 4 / 5 connected to 5" Touchscreen & Camera Module
# Loads the Photobooth UI directly from the PC at http://192.168.29.33:5173
# =============================================================================

set -e
BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"; CYAN="\033[36m"; RESET="\033[0m"

PC_HOST="${1:-192.168.29.33}"
PC_URL="http://${PC_HOST}:5173"
APP_USER="${USER:-$(id -un)}"
USER_HOME=$(eval echo "~$APP_USER")

echo -e "${BOLD}${CYAN}───────────────────────────────────────────────────────────${RESET}"
echo -e "${BOLD}${GREEN}🍓 Photobooth Auto-Start Client Setup${RESET}"
echo -e "   Target PC Server: ${BOLD}${PC_URL}${RESET}"
echo -e "   User:             ${BOLD}${APP_USER}${RESET}"
echo -e "   Home:             ${BOLD}${USER_HOME}${RESET}"
echo -e "${BOLD}${CYAN}───────────────────────────────────────────────────────────${RESET}"

# 1. Ensure Node.js is installed
if ! command -v node >/dev/null 2>&1; then
    echo -e "${YELLOW}[1/4] Installing Node.js...${RESET}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
else
    echo -e "${GREEN}[1/4] Node.js is already installed: $(node -v)${RESET}"
fi

# 2. Place pi-camera.js in home directory
echo -e "${YELLOW}[2/4] Setting up pi-camera.js...${RESET}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/../public/pi-camera.js" ]; then
    cp "${SCRIPT_DIR}/../public/pi-camera.js" "${USER_HOME}/pi-camera.js"
elif [ -f "./pi-camera.js" ]; then
    cp "./pi-camera.js" "${USER_HOME}/pi-camera.js"
fi
chmod +x "${USER_HOME}/pi-camera.js"

# 3. Create & enable systemd background service for Camera Streamer
echo -e "${YELLOW}[3/4] Creating camera background service (auto-starts on boot)...${RESET}"
NODE_PATH=$(which node)

sudo tee /etc/systemd/system/photobooth-camera.service > /dev/null << SERVICE
[Unit]
Description=Raspberry Pi Photobooth Camera Streamer
After=network.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${USER_HOME}
ExecStart=${NODE_PATH} ${USER_HOME}/pi-camera.js
Restart=always
RestartSec=3
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable photobooth-camera.service
sudo systemctl restart photobooth-camera.service
echo -e "${GREEN}✓ Camera service active and enabled on boot.${RESET}"

# 4. Configure Full-Screen Kiosk Autostart for the Display
echo -e "${YELLOW}[4/4] Setting up full-screen Kiosk autostart...${RESET}"

# Kiosk launcher script
cat << LAUNCHER > "${USER_HOME}/launch-photobooth.sh"
#!/bin/bash
# Wait for display and network
sleep 4

# Disable screen blanking & power management
xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true
xset -dpms 2>/dev/null || true

# Hide mouse cursor when idle
if command -v unclutter >/dev/null 2>&1; then
    unclutter -idle 0.5 -root &
fi

# Launch Chromium in Kiosk full-screen pointing to PC
BROWSER_BIN=\$(which chromium-browser 2>/dev/null || which chromium 2>/dev/null || echo "chromium-browser")

\$BROWSER_BIN \\
  --kiosk \\
  --enable-virtual-keyboard \\
  --touch-events=enabled \\
  --noerrdialogs \\
  --disable-infobars \\
  --check-for-update-interval=31536000 \\
  --disable-pinch \\
  --overscroll-history-navigation=0 \\
  --disable-translate \\
  --fast \\
  --fast-start \\
  "${PC_URL}"
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
