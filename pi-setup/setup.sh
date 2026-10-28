#!/bin/bash
# =============================================================================
# 🍓 Raspberry Pi 4 Photobooth - Automated Setup Script
# =============================================================================
# Run this ONCE after flashing Raspberry Pi OS (64-bit) to your SD card.
#
# Usage (on the Pi, in terminal):
#   chmod +x setup.sh && ./setup.sh
#
# What this does:
#   1.  System update + essential packages
#   2.  Node.js 20 LTS via NVM
#   3.  Copy app from USB pendrive (if present) or use existing dir
#   4.  npm install + build
#   5.  Camera Module 3 configuration
#   6.  Waveshare 5" DSI touchscreen configuration
#   7.  Kiosk mode (no cursor, no screensaver, no sleep)
#   8.  Systemd autostart service
#   9.  USB pendrive auto-mount for photo exports
#   10. CUPS printer setup
# =============================================================================

set -e
BOLD="\033[1m"; GREEN="\033[32m"; YELLOW="\033[33m"
RED="\033[31m";  CYAN="\033[36m";  RESET="\033[0m"

APP_USER="${SUDO_USER:-$USER}"
USER_HOME=$(eval echo "~$APP_USER")
APP_DIR="${USER_HOME}/photobooth"
SERVICE_NAME="photobooth"
NODE_VERSION="20"

log()    { echo -e "${CYAN}[SETUP]${RESET} $1"; }
success(){ echo -e "${GREEN}[  OK  ]${RESET} $1"; }
warn()   { echo -e "${YELLOW}[ WARN ]${RESET} $1"; }
error()  { echo -e "${RED}[ERROR ]${RESET} $1"; exit 1; }

echo -e "${BOLD}${GREEN}"
cat << 'BANNER'
  ____  _           _        _                 _   _
 |  _ \| |__   ___ | |_ ___ | |__   ___   ___ | |_| |__
 | |_) | '_ \ / _ \| __/ _ \| '_ \ / _ \ / _ \| __| '_ \
 |  __/| | | | (_) | || (_) | |_) | (_) | (_) | |_| | | |
 |_|   |_| |_|\___/ \__\___/|_.__/ \___/ \___/ \__|_| |_|
  Raspberry Pi 4 Setup — v1.0
BANNER
echo -e "${RESET}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1: System Update
# ─────────────────────────────────────────────────────────────────────────────
log "Step 1/10: Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq \
    curl wget git \
    build-essential \
    libgtk-3-dev \
    libnotify-dev \
    libnss3 \
    libxss1 \
    libxtst6 \
    xauth xvfb \
    libgbm-dev \
    libasound2-dev \
    libcups2-dev \
    cups cups-bsd \
    python3 python3-pip \
    unzip \
    libcamera-apps libcamera-tools \
    v4l-utils usbutils \
    x11-xserver-utils xinput-calibrator \
    xserver-xorg-input-evdev \
    unclutter \
    jq
success "System packages installed."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2: Node.js 20 via NVM
# ─────────────────────────────────────────────────────────────────────────────
log "Step 2/10: Installing Node.js ${NODE_VERSION} via NVM..."
if [ ! -d "$HOME/.nvm" ]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
fi

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install $NODE_VERSION
nvm use $NODE_VERSION
nvm alias default $NODE_VERSION

NODE_BIN=$(which node)
NPM_BIN=$(which npm)
sudo ln -sf "$NODE_BIN" /usr/local/bin/node
sudo ln -sf "$NPM_BIN"  /usr/local/bin/npm

success "Node.js $(node --version) installed."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3: Copy App from USB Pendrive (or use existing)
# ─────────────────────────────────────────────────────────────────────────────
log "Step 3/10: Setting up app at ${APP_DIR}..."
PENDRIVE_APP=$(find /media/pi -name "photobooth" -type d 2>/dev/null | head -1)
if [ -d "$PENDRIVE_APP" ] && [ "$PENDRIVE_APP" != "$APP_DIR" ]; then
    log "  Found app on USB at: $PENDRIVE_APP — copying..."
    cp -r "$PENDRIVE_APP" "$APP_DIR"
    success "Copied from USB pendrive."
elif [ -d "$APP_DIR" ]; then
    success "App already at $APP_DIR."
else
    error "App not found! Copy your 'photobooth' folder to a USB drive and plug it in, then re-run."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4: Install Dependencies & Build
# ─────────────────────────────────────────────────────────────────────────────
log "Step 4/10: Installing npm dependencies and building..."
cd "$APP_DIR"
npm install
npm run build
success "App built successfully."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5: Camera Module 3 Config
# ─────────────────────────────────────────────────────────────────────────────
log "Step 5/10: Configuring Camera Module 3 (Wide)..."
CONFIG_FILE="/boot/firmware/config.txt"
[ ! -f "$CONFIG_FILE" ] && CONFIG_FILE="/boot/config.txt"

add_config_line() {
    grep -qxF "$1" "$CONFIG_FILE" || echo "$1" | sudo tee -a "$CONFIG_FILE" > /dev/null
}

add_config_line "camera_auto_detect=1"
add_config_line "gpu_mem=256"

log "  Testing camera..."
if libcamera-hello --timeout 1 --nopreview 2>/dev/null; then
    success "Camera detected!"
else
    warn "Camera not detected yet — check FFC cable, then reboot."
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6: Waveshare 5" DSI Touchscreen Config
# ─────────────────────────────────────────────────────────────────────────────
log "Step 6/10: Configuring Waveshare 5\" DSI touchscreen..."
add_config_line "dtoverlay=vc4-kms-v3d"
add_config_line "display_auto_detect=1"

# udev rule for Goodix touch controller (used by Waveshare 5" DSI)
sudo tee /etc/udev/rules.d/99-touchscreen.rules > /dev/null << 'UDEV'
SUBSYSTEM=="input", ATTRS{name}=="Goodix Capacitive TouchScreen", \
    ENV{LIBINPUT_CALIBRATION_MATRIX}="1 0 0 0 1 0 0 0 1"
UDEV
sudo udevadm control --reload-rules
success "DSI touchscreen configured."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7: Kiosk Mode
# ─────────────────────────────────────────────────────────────────────────────
log "Step 7/10: Enabling kiosk mode..."

sudo tee /etc/X11/xorg.conf.d/99-kiosk.conf > /dev/null << 'XORG'
Section "ServerFlags"
    Option "BlankTime"   "0"
    Option "StandbyTime" "0"
    Option "SuspendTime" "0"
    Option "OffTime"     "0"
EndSection
Section "Extensions"
    Option "DPMS" "Disable"
EndSection
XORG

mkdir -p "${USER_HOME}/.config/autostart"
tee "${USER_HOME}/.config/autostart/kiosk.desktop" > /dev/null << 'KIOSK'
[Desktop Entry]
Type=Application
Name=Kiosk Settings
Exec=bash -c "xset s off; xset s noblank; xset -dpms; unclutter -idle 0.1 -root &"
Hidden=false
X-GNOME-Autostart-enabled=true
KIOSK

success "Kiosk mode configured."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8: Systemd Autostart Service
# ─────────────────────────────────────────────────────────────────────────────
log "Step 8/10: Creating systemd autostart service..."

NVM_NODE_PATH="${USER_HOME}/.nvm/versions/node/v${NODE_VERSION}/bin"

sudo tee /etc/systemd/system/${SERVICE_NAME}.service > /dev/null << SERVICE
[Unit]
Description=Photobooth Electron App
After=graphical.target network.target
Wants=graphical.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
Environment=DISPLAY=:0
Environment=XAUTHORITY=${USER_HOME}/.Xauthority
Environment=HOME=${USER_HOME}
Environment=NODE_ENV=production
Environment=PATH=${NVM_NODE_PATH}:/usr/local/bin:/usr/bin:/bin
ExecStartPre=/bin/sleep 5
ExecStart=${NVM_NODE_PATH}/node ${APP_DIR}/node_modules/.bin/electron . --no-sandbox
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=graphical.target
SERVICE

sudo systemctl daemon-reload
sudo systemctl enable ${SERVICE_NAME}.service
success "Systemd service created and enabled."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 9: USB Auto-Mount for Photo Exports
# ─────────────────────────────────────────────────────────────────────────────
log "Step 9/10: Configuring USB auto-mount..."
sudo tee /etc/udev/rules.d/99-usb-photomount.rules > /dev/null << USB
ACTION=="add", SUBSYSTEMS=="usb", SUBSYSTEM=="block", ENV{ID_FS_USAGE}=="filesystem", \\
    RUN{program}+="/bin/mkdir -p /media/${APP_USER}/%k", \\
    RUN{program}+="/bin/mount /dev/%k /media/${APP_USER}/%k -o uid=${APP_USER},gid=${APP_USER},umask=0002"
ACTION=="remove", SUBSYSTEM=="block", ENV{ID_FS_USAGE}=="filesystem", \\
    RUN{program}+="/bin/umount /media/${APP_USER}/%k"
USB
sudo udevadm control --reload-rules
success "USB auto-mount configured."

# ─────────────────────────────────────────────────────────────────────────────
# STEP 10: CUPS Printer
# ─────────────────────────────────────────────────────────────────────────────
log "Step 10/10: Setting up CUPS print server..."
sudo systemctl enable cups
sudo systemctl start cups
sudo usermod -a -G lpadmin "${APP_USER}"
sudo cupsctl --remote-admin --remote-any --share-printers
sudo systemctl restart cups
PI_IP=$(hostname -I | awk '{print $1}')
success "CUPS ready. Admin: http://${PI_IP}:631"

# ─────────────────────────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  ✅  SETUP COMPLETE!${RESET}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Pi IP:${RESET}          ${PI_IP}"
echo -e "  ${BOLD}App:${RESET}            ${APP_DIR}"
echo -e "  ${BOLD}Service logs:${RESET}   sudo journalctl -u ${SERVICE_NAME} -f"
echo -e "  ${BOLD}CUPS admin:${RESET}     http://${PI_IP}:631"
echo ""
echo -e "  ${YELLOW}⚠️  Reboot required to apply all changes!${RESET}"
echo ""
read -rp "  Reboot now? [y/N]: " do_reboot
[[ "$do_reboot" =~ ^[Yy]$ ]] && sudo reboot
