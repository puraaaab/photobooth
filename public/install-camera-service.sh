#!/bin/bash
# ==============================================================================
# 🍓 PAPIT PHOTOBOOTH - Auto-Start Camera Service Installer
# Installs pi-camera.py as a permanent systemd service that starts on every boot.
# ==============================================================================
set -e

HOST_IP="${1:-192.168.29.33}:${2:-3847}"   # laptop running `npm start` (5173 only in development)
USER_NAME="${USER:-prbtlr}"
INSTALL_DIR="/home/$USER_NAME"
TARGET_SCRIPT="$INSTALL_DIR/pi-camera.py"
SERVICE_FILE="/etc/systemd/system/photobooth-camera.service"

echo "============================================================"
echo "  🍓 Installing Photobooth Camera Auto-Start Service"
echo "  • User: $USER_NAME"
echo "  • Directory: $INSTALL_DIR"
echo "  • PC Server: $HOST_IP"
echo "============================================================"

# 0. Camera stack: picamera2 gives real stills + hardware MJPEG preview
sudo apt-get install -y python3-picamera2 v4l-utils >/dev/null || echo "WARN: python3-picamera2 unavailable; legacy rpicam-vid mode will be used"

# 1. Fetch latest pi-camera.py
echo "📥 Downloading camera script from PC..."
curl -fsSL "http://$HOST_IP/pi-camera.py" -o "$TARGET_SCRIPT"
chmod +x "$TARGET_SCRIPT"

# 2. Register systemd unit file
echo "⚙️  Configuring systemd service..."
sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Papit Photobooth Camera Streamer (rpicam)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER_NAME
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/python3 $TARGET_SCRIPT
Restart=always
RestartSec=2
KillSignal=SIGINT
StandardOutput=journal
StandardError=journal
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

# 3. Reload daemon, enable auto-start on boot, and start right now
echo "🚀 Enabling and starting service..."
sudo systemctl daemon-reload
sudo systemctl enable photobooth-camera.service
sudo systemctl restart photobooth-camera.service

echo ""
echo "============================================================"
echo "  ✅ SUCCESS! Photobooth Camera Service is ACTIVE & PERMANENT"
echo "  • Started right now on ports 8080 & 8081"
echo "  • Will start AUTOMATICALLY every time the Pi powers on"
echo "  • You do NOT need to run any commands in the future"
echo "============================================================"
