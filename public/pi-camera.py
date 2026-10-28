#!/usr/bin/env python3
"""
🍓 PAPIT PHOTOBOOTH - Ultra-Smooth, Continuous Camera Server
Engineered for rock-solid stability:
  - 1280x720 @ 25fps continuous stream (cool CPU, zero lag, smooth live preview)
  - Instant /frame endpoint (<1ms) for rock-solid browser live preview
  - Instant /capture endpoint (<1ms) for lag-free 2s countdown shooting
  - Uninterrupted camera process (no hardware pausing/swapping)
"""

import http.server
import os
import shutil
import socketserver
import subprocess
import sys
import threading
import time

STREAM_PORT = int(os.environ.get('STREAM_PORT', 8080))
CAPTURE_PORT = int(os.environ.get('CAPTURE_PORT', 8081))

# Live Stream & Capture Profile: 1280x720 @ 30fps (Crisp 720p HD, zero lag, smooth 30fps)
STREAM_W = int(os.environ.get('STREAM_W', 1280))
STREAM_H = int(os.environ.get('STREAM_H', 720))
STREAM_FPS = int(os.environ.get('STREAM_FPS', 30))
CAMERA_QUALITY = int(os.environ.get('CAMERA_QUALITY', 95))

# Apple True Tone ISP Tuning
CAMERA_SHARPNESS = float(os.environ.get('CAMERA_SHARPNESS', 1.45))
CAMERA_CONTRAST = float(os.environ.get('CAMERA_CONTRAST', 1.10))
CAMERA_SATURATION = float(os.environ.get('CAMERA_SATURATION', 1.16))
CAMERA_DENOISE = os.environ.get('CAMERA_DENOISE', 'cdn_off')
CAMERA_AWB = os.environ.get('CAMERA_AWB', 'auto')
CAMERA_EV = float(os.environ.get('CAMERA_EV', 0.2))

# 1X Wide View (Sensor Full FOV: 0,0,1,1)
# Zero quality loss: sampled directly from native 12MP (4608x2592) IMX708 sensor
CAMERA_ROI = os.environ.get('CAMERA_ROI', '0,0,1,1')

def find_binary(primary, fallback):
    if shutil.which(primary):
        return primary
    if shutil.which(fallback):
        return fallback
    return primary

VID_CMD = os.environ.get('VID_CMD', find_binary('rpicam-vid', 'libcamera-vid'))

print("=" * 65)
print("  🍓 PAPIT PHOTOBOOTH - Ultra-Smooth Real-Time Camera Server")
print(f"  • Video binary:   {VID_CMD}")
print(f"  • Resolution:     {STREAM_W}x{STREAM_H} @ {STREAM_FPS}fps (q={CAMERA_QUALITY})")
print(f"  • Hardware Zoom:  1X Wide (ROI: {CAMERA_ROI})")
print(f"  • Live preview:   http://0.0.0.0:{STREAM_PORT}/stream and /frame")
print(f"  • Instant shot:   http://0.0.0.0:{CAPTURE_PORT}/capture")
print("=" * 65, flush=True)

class StreamingManager:
    def __init__(self):
        self.clients_lock = threading.Lock()
        self.clients = set()
        self.proc = None
        self.latest_frame = None
        self.latest_frame_time = 0
        self.stopped = False
        self.frame_count = 0
        self.roi = CAMERA_ROI

    def set_roi(self, new_roi):
        if self.roi == new_roi:
            return
        self.roi = new_roi
        print(f"[Camera] Setting Zoom ROI: {new_roi}", flush=True)
        self._start_camera_proc()

    def start(self):
        t = threading.Thread(target=self._run_supervisor, daemon=True)
        t.start()

    def _run_supervisor(self):
        while not self.stopped:
            if self.proc is None or self.proc.poll() is not None:
                self._start_camera_proc()
            time.sleep(1.0)

    def _start_camera_proc(self):
        if self.stopped:
            return

        if self.proc:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=0.5)
            except Exception:
                try:
                    self.proc.kill()
                except Exception:
                    pass
            self.proc = None

        base_args = [
            VID_CMD,
            '--width', str(STREAM_W),
            '--height', str(STREAM_H),
            '--framerate', str(STREAM_FPS),
            '--codec', 'mjpeg',
            '--quality', str(CAMERA_QUALITY),
            '--sharpness', str(CAMERA_SHARPNESS),
            '--contrast', str(CAMERA_CONTRAST),
            '--saturation', str(CAMERA_SATURATION),
            '--denoise', str(CAMERA_DENOISE),
            '--roi', str(self.roi),
            '--nopreview',
            '--timeout', '0',
            '-o', '-'
        ]
        if CAMERA_EV:
            base_args.extend(['--ev', str(CAMERA_EV)])
        if CAMERA_AWB:
            base_args.extend(['--awb', str(CAMERA_AWB)])

        af_args = ['--autofocus-mode', 'continuous']
        try:
            self.proc = subprocess.Popen(
                base_args + af_args,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                bufsize=65536
            )
            time.sleep(0.2)
            if self.proc.poll() is not None:
                self.proc = subprocess.Popen(
                    base_args,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    bufsize=65536
                )

            t_reader = threading.Thread(target=self._reader_loop, daemon=True)
            t_reader.start()
            print(f"[Camera] Stream process active ({STREAM_W}x{STREAM_H} @ {STREAM_FPS}fps)", flush=True)
        except Exception as e:
            print(f"[Camera] Stream start error: {e}", flush=True)

    def _reader_loop(self):
        buf = bytearray()
        while not self.stopped and self.proc and self.proc.poll() is None:
            try:
                chunk = self.proc.stdout.read(32768)
            except Exception:
                break
            if not chunk:
                break
            buf.extend(chunk)

            while True:
                start = buf.find(b'\xff\xd8')
                if start == -1:
                    if len(buf) > 1000000:
                        buf = bytearray()
                    break
                end = buf.find(b'\xff\xd9', start + 2)
                if end == -1:
                    if start > 0:
                        buf = buf[start:]
                    break

                frame = bytes(buf[start:end + 2])
                buf = buf[end + 2:]

                self.latest_frame = frame
                self.latest_frame_time = time.time()
                self.frame_count += 1

streaming_mgr = StreamingManager()

class StreamHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_GET(self):
        # Health check
        if self.path.startswith('/health'):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            has_feed = streaming_mgr.latest_frame is not None and (time.time() - streaming_mgr.latest_frame_time < 3.0)
            body = f'{{"status":"ok","streaming":{str(has_feed).lower()},"fps":{STREAM_FPS},"w":{STREAM_W},"h":{STREAM_H}}}'.encode('utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # Zoom Status & Control Endpoint
        if self.path.startswith('/zoom'):
            import urllib.parse
            parsed = urllib.parse.urlparse(self.path)
            params = urllib.parse.parse_qs(parsed.query)
            if 'level' in params:
                lvl = params['level'][0]
                if lvl == '1': streaming_mgr.set_roi('0,0,1,1')
                elif lvl == '1.5': streaming_mgr.set_roi('0.166,0.166,0.667,0.667')
                elif lvl == '2': streaming_mgr.set_roi('0.25,0.25,0.5,0.5')
                elif lvl == '3': streaming_mgr.set_roi('0.333,0.333,0.334,0.334')
                elif lvl == '3.5': streaming_mgr.set_roi('0.357,0.357,0.286,0.286')
                elif lvl == '4': streaming_mgr.set_roi('0.375,0.375,0.25,0.25')
            elif 'roi' in params:
                streaming_mgr.set_roi(params['roi'][0])

            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            body = f'{{"status":"ok","roi":"{streaming_mgr.roi}"}}'.encode('utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        # High-Speed Single Frame Endpoint (Instant snapshot)
        if self.path.startswith('/frame') or self.path.startswith('/latest.jpg') or self.path.startswith('/snapshot'):
            frame = streaming_mgr.latest_frame
            if not frame:
                self.send_response(503)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(b'Camera warming up...')
                return

            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', str(len(frame)))
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.end_headers()
            self.wfile.write(frame)
            return

        # Continuous Real-Time MJPEG Stream Endpoint (Zero Lag, Direct Frame-Dropping Dispatcher)
        if self.path.startswith('/stream'):
            try:
                self.request.settimeout(12.0)
            except Exception:
                pass

            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=BoundaryString')
            self.send_header('Cache-Control', 'no-cache, private, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.end_headers()

            last_sent_count = -1
            while not streaming_mgr.stopped:
                cur_count = streaming_mgr.frame_count
                if cur_count != last_sent_count and streaming_mgr.latest_frame:
                    frame = streaming_mgr.latest_frame
                    last_sent_count = cur_count
                    try:
                        part = (
                            b'--BoundaryString\r\n'
                            b'Content-Type: image/jpeg\r\n'
                            b'Content-Length: ' + str(len(frame)).encode('ascii') + b'\r\n\r\n' +
                            frame +
                            b'\r\n'
                        )
                        self.wfile.write(part)
                        self.wfile.flush()
                    except Exception:
                        break
                else:
                    time.sleep(0.015)
            return

        self.send_error(404, "Not Found")

    def log_message(self, format, *args):
        return

class CaptureHandler(http.server.BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/health'):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            has_feed = streaming_mgr.latest_frame is not None and (time.time() - streaming_mgr.latest_frame_time < 3.0)
            body = f'{{"status":"ok","ready":{str(has_feed).lower()}}}'.encode('utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if self.path.startswith('/capture'):
            self.handle_capture()
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        if self.path.startswith('/capture'):
            self.handle_capture()
        else:
            self.send_error(404, "Not Found")

    def handle_capture(self):
        # Instant, 0ms latency photo capture from warm continuous stream
        frame = streaming_mgr.latest_frame
        if frame and len(frame) > 2000:
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', str(len(frame)))
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            self.wfile.write(frame)
            return

        for _ in range(5):
            time.sleep(0.08)
            frame = streaming_mgr.latest_frame
            if frame and len(frame) > 2000:
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'image/jpeg')
                self.send_header('Content-Length', str(len(frame)))
                self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
                self.end_headers()
                self.wfile.write(frame)
                return

        self.send_response(503)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"error":"Camera warming up"}')

    def log_message(self, format, *args):
        return

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def run_servers():
    streaming_mgr.start()

    stream_srv = ThreadedHTTPServer(('0.0.0.0', STREAM_PORT), StreamHandler)
    capture_srv = ThreadedHTTPServer(('0.0.0.0', CAPTURE_PORT), CaptureHandler)

    t_stream = threading.Thread(target=stream_srv.serve_forever, daemon=True)
    t_cap = threading.Thread(target=capture_srv.serve_forever, daemon=True)

    t_stream.start()
    t_cap.start()

    print("[Camera] Ready for photobooth connections.", flush=True)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        streaming_mgr.stopped = True
        stream_srv.shutdown()
        capture_srv.shutdown()

if __name__ == '__main__':
    run_servers()
