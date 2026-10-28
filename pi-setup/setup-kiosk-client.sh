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
# Photobooth kiosk + watchdog.
#   booth-off  → close the kiosk and keep it closed (use the Pi for other work)
#   booth-on   → bring the kiosk back (within ~5 s)
# The kiosk uses its OWN Chromium profile, so any browser you open yourself is a separate
# program: the watchdog never closes it, and the kiosk never opens inside it.
PAUSE_FILE="$HOME/.photobooth-kiosk-off"
PROFILE="$HOME/.config/photobooth-kiosk"
MATCH="user-data-dir=$PROFILE"

xset s off 2>/dev/null || true
xset s noblank 2>/dev/null || true
xset -dpms 2>/dev/null || true

# Browser: $KIOSK_BROWSER if set, else Brave, else Chromium (all accept the same kiosk flags)
BROWSER_BIN="${KIOSK_BROWSER:-}"
for candidate in brave-browser brave chromium-browser chromium; do
    [ -n "$BROWSER_BIN" ] && break
    BROWSER_BIN=$(command -v "$candidate" 2>/dev/null)
done
if [ -z "$BROWSER_BIN" ]; then
    echo "[kiosk] No Brave/Chromium found - install one (brave-browser or chromium-browser)"
    exit 1
fi
echo "[kiosk] Using browser: $BROWSER_BIN"

paused() { [ -f "$PAUSE_FILE" ]; }

find_server() {
    until SERVER="$("$HOME/find-server.sh")"; do
        paused && return 1
        echo "[kiosk] Laptop not found yet, retrying in 3s..."
        sleep 3
    done
}

start_browser() {
    paused && return
    # Only ever touches the kiosk's own browser (matched by its private profile directory)
    pkill -f "$MATCH" 2>/dev/null
    sleep 1
    # cam=local: the booth page uses this Pi's own camera at localhost:8080
    # Brave extras (ignored by Chromium): no first-run, Rewards or Wallet popups over the booth
    "$BROWSER_BIN" --user-data-dir="$PROFILE" --kiosk --noerrdialogs --disable-infobars \
        --no-first-run --no-default-browser-check \
        --touch-events=enabled --disable-pinch --overscroll-history-navigation=0 --disable-translate \
        --check-for-update-interval=31536000 --disable-session-crashed-bubble \
        --disable-features=Translate,BraveRewards,BraveWallet,BraveNews,LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights \
        "http://${SERVER}/?view=booth&cam=local" >/dev/null 2>&1 &
}

SERVER=""
misses=0
while true; do
    if paused; then
        sleep 5
        continue
    fi
    if [ -z "$SERVER" ]; then
        find_server || continue
        start_browser
    fi
    sleep 5
    paused && continue
    if curl -fs -m 3 "http://${SERVER}/api/health" >/dev/null; then
        misses=0
        pgrep -f "$MATCH" >/dev/null || start_browser   # crashed or closed by mistake
    else
        # Laptop gone for ~45 s (new IP after a router restart, laptop rebooted): find it again
        misses=$((misses + 1))
        if [ $misses -ge 9 ]; then
            OLD="$SERVER"
            SERVER=""
            find_server && { [ "$SERVER" != "$OLD" ] && echo "[kiosk] Laptop moved $OLD -> $SERVER"; start_browser; }
            misses=0
        fi
    fi
done
LAUNCHER
chmod +x "${USER_HOME}/launch-photobooth.sh"

# On/off switches: terminal commands + desktop icons
mkdir -p "${USER_HOME}/.local/bin"
cat << 'OFF' > "${USER_HOME}/.local/bin/booth-off"
#!/bin/bash
# Close the photobooth kiosk and keep it closed until `booth-on`.
touch "$HOME/.photobooth-kiosk-off"
pkill -f "user-data-dir=$HOME/.config/photobooth-kiosk" 2>/dev/null
echo "Photobooth kiosk OFF. Run booth-on (or the 'Booth ON' desktop icon) to bring it back."
OFF
cat << 'ON' > "${USER_HOME}/.local/bin/booth-on"
#!/bin/bash
# Bring the photobooth kiosk back (the watchdog relaunches it within ~5 s).
rm -f "$HOME/.photobooth-kiosk-off"
pgrep -f launch-photobooth.sh >/dev/null || (nohup "$HOME/launch-photobooth.sh" >/dev/null 2>&1 &)
echo "Photobooth kiosk ON."
ON
chmod +x "${USER_HOME}/.local/bin/booth-off" "${USER_HOME}/.local/bin/booth-on"
ln -sf "${USER_HOME}/.local/bin/booth-off" "${USER_HOME}/booth-off"
ln -sf "${USER_HOME}/.local/bin/booth-on" "${USER_HOME}/booth-on"

if [ -d "${USER_HOME}/Desktop" ]; then
    for mode in on off; do
        label=$([ "$mode" = on ] && echo "Booth ON" || echo "Booth OFF")
        cat << ICON > "${USER_HOME}/Desktop/booth-${mode}.desktop"
[Desktop Entry]
Type=Application
Name=${label}
Exec=${USER_HOME}/.local/bin/booth-${mode}
Icon=camera-photo
Terminal=false
ICON
        chmod +x "${USER_HOME}/Desktop/booth-${mode}.desktop"
    done
fi

# Autostart at boot (KIOSK_AUTOSTART=0 → never start by itself; open the booth manually instead)
mkdir -p "${USER_HOME}/.config/autostart"
if [ "${KIOSK_AUTOSTART:-1}" = "0" ]; then
    rm -f "${USER_HOME}/.config/autostart/photobooth-kiosk.desktop"
    echo -e "${YELLOW}Kiosk autostart disabled. Start it any time with: booth-on${RESET}"
else
# Running setup means "I want the booth": clear a leftover booth-off pause (it survives reboots)
rm -f "${USER_HOME}/.photobooth-kiosk-off"
cat << DESKTOP > "${USER_HOME}/.config/autostart/photobooth-kiosk.desktop"
[Desktop Entry]
Type=Application
Name=Photobooth Kiosk
Exec=${USER_HOME}/launch-photobooth.sh
Hidden=false
X-GNOME-Autostart-enabled=true
DESKTOP
fi

echo -e ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  ✅  SETUP COMPLETE!${RESET}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "• Camera Server:  ${BOLD}Running in background on port 8080/8081${RESET}"
echo -e "• Kiosk Display:  ${BOLD}Configured to boot directly to ${PC_URL}${RESET}"
echo -e "• Status Check:   ${BOLD}sudo systemctl status photobooth-camera${RESET}"
echo -e "• Other work:     ${BOLD}booth-off${RESET} closes the kiosk, ${BOLD}booth-on${RESET} brings it back (or the desktop icons)"
echo -e ""
echo -e "${CYAN}Now simply reboot your Pi: ${BOLD}sudo reboot${RESET}"
