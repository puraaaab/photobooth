#!/usr/bin/env python3
"""
PAPIT PHOTOBOOTH - Raspberry Pi camera server (Camera Module 3 / IMX708)

Backends
  picamera2 (default on Raspberry Pi OS Bookworm):
    - lores stream -> Pi 4 hardware MJPEG encoder -> /stream and /frame (live preview, ~768x432)
    - main stream  -> REAL stills at 2304x1296 from the sensor's 2x2-binned mode (/capture)
      (previously /capture returned a 1280x720 MJPEG video frame, ~0.9 MP, for prints)
    - zoom via ScalerCrop: no camera restart, no black flash
    - optional sensor HDR (CAMERA_HDR=1, Camera Module 3 only, 2304x1296 mode)
  rpicam-vid (legacy fallback when picamera2 is missing): same HTTP API, capture = preview frame.

HTTP API (unchanged)
  :8080  GET /stream  /frame  /health  /zoom?level=2 | /zoom?roi=x,y,w,h
  :8081  GET|POST /capture   GET /health
"""

import glob
import http.server
import io
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

class LegacyRpicamManager:
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

    backend = 'rpicam-vid'
    still_size = (STREAM_W, STREAM_H)

    def capture_still(self):
        """Legacy backend has no separate still pipeline: return the newest preview frame."""
        frame = self.latest_frame
        for _ in range(5):
            if frame and len(frame) > 2000:
                return frame
            time.sleep(0.08)
            frame = self.latest_frame
        return None

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



# --- picamera2 backend --------------------------------------------------------
STILL_W = int(os.environ.get('STILL_W', 2304))   # 2304x1296 = IMX708 2x2 binned: fast, low noise, HDR-capable
STILL_H = int(os.environ.get('STILL_H', 1296))   # set 4608x2592 for full 12MP (slower, more RAM)
STILL_QUALITY = int(os.environ.get('STILL_QUALITY', 92))
PREVIEW_W = int(os.environ.get('PREVIEW_W', 768))
PREVIEW_H = int(os.environ.get('PREVIEW_H', 432))
CAMERA_HDR = os.environ.get('CAMERA_HDR', '0') == '1'


class _FrameSink(io.BufferedIOBase):
    """Receives complete JPEG frames from the hardware MJPEG encoder."""

    def __init__(self, manager):
        super().__init__()
        self.manager = manager

    def writable(self):
        return True

    def write(self, buf):
        self.manager.latest_frame = bytes(buf)
        self.manager.latest_frame_time = time.time()
        self.manager.frame_count += 1
        return len(buf)


def _set_sensor_hdr(enabled):
    """Camera Module 3 sensor HDR is a V4L2 subdevice control, set before the camera starts."""
    for dev in sorted(glob.glob('/dev/v4l-subdev*')):
        try:
            subprocess.run(['v4l2-ctl', '-d', dev, '--set-ctrl', 'wide_dynamic_range=%d' % (1 if enabled else 0)],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=3)
            print(f"[Camera] Sensor HDR {'ON' if enabled else 'OFF'} via {dev}", flush=True)
            return
        except Exception:
            continue


class Picamera2Manager:
    backend = 'picamera2'

    def __init__(self):
        from picamera2 import Picamera2
        from picamera2.encoders import MJPEGEncoder
        from picamera2.outputs import FileOutput
        self._Picamera2 = Picamera2
        self._MJPEGEncoder = MJPEGEncoder
        self._FileOutput = FileOutput
        self.picam2 = None
        self.latest_frame = None
        self.latest_frame_time = 0
        self.frame_count = 0
        self.stopped = False
        self.roi = CAMERA_ROI
        self.still_size = (STILL_W, STILL_H)
        self.capture_lock = threading.Lock()

    def start(self):
        if CAMERA_HDR:
            _set_sensor_hdr(True)
        self.picam2 = self._Picamera2()
        config = self.picam2.create_video_configuration(
            main={'size': (STILL_W, STILL_H), 'format': 'RGB888'},
            lores={'size': (PREVIEW_W, PREVIEW_H), 'format': 'YUV420'},
            buffer_count=4,
            controls={'FrameRate': STREAM_FPS},
        )
        self.picam2.configure(config)
        self.picam2.options['quality'] = STILL_QUALITY
        self._apply_tuning()
        encoder = self._MJPEGEncoder()
        self.picam2.start_recording(encoder, self._FileOutput(_FrameSink(self)), name='lores')
        self._apply_roi(self.roi)
        print(f"[Camera] picamera2 ready: stills {STILL_W}x{STILL_H} q{STILL_QUALITY}, preview {PREVIEW_W}x{PREVIEW_H} @ {STREAM_FPS}fps", flush=True)

    def _apply_tuning(self):
        wanted = {
            'Sharpness': CAMERA_SHARPNESS,
            'Contrast': CAMERA_CONTRAST,
            'Saturation': CAMERA_SATURATION,
            'ExposureValue': CAMERA_EV,
        }
        try:
            from libcamera import controls as lc
            wanted['AfMode'] = lc.AfModeEnum.Continuous
            wanted['AfSpeed'] = lc.AfSpeedEnum.Fast
            # cdn_off made every shot noisy; the 'fast' denoiser is free on the ISP
            wanted['NoiseReductionMode'] = (lc.draft.NoiseReductionModeEnum.Off if CAMERA_DENOISE == 'off'
                                            else lc.draft.NoiseReductionModeEnum.Fast)
        except Exception:
            pass
        for key, value in wanted.items():
            try:
                self.picam2.set_controls({key: value})
            except Exception as e:
                print(f"[Camera] Control {key} not supported: {e}", flush=True)

    def _apply_roi(self, roi):
        try:
            x, y, w, h = [float(v) for v in roi.split(',')]
            mx, my, mw, mh = self.picam2.camera_properties['ScalerCropMaximum']
            crop = (int(mx + x * mw), int(my + y * mh), max(64, int(w * mw)), max(64, int(h * mh)))
            self.picam2.set_controls({'ScalerCrop': crop})
        except Exception as e:
            print(f"[Camera] Zoom (ScalerCrop) failed for ROI {roi}: {e}", flush=True)

    def set_roi(self, new_roi):
        if self.roi == new_roi:
            return
        self.roi = new_roi
        print(f"[Camera] Setting Zoom ROI: {new_roi}", flush=True)
        self._apply_roi(new_roi)  # live: no restart, no black frames

    def capture_still(self):
        """Grab the next full-quality frame from the main stream and JPEG-encode it."""
        if not self.picam2:
            return None
        with self.capture_lock:
            request = self.picam2.capture_request()
            try:
                out = io.BytesIO()
                request.save('main', out, format='jpeg')
                return out.getvalue()
            finally:
                request.release()


def create_manager():
    if os.environ.get('CAMERA_BACKEND', 'auto') != 'rpicam':
        try:
            mgr = Picamera2Manager()
            mgr.start()
            return mgr
        except Exception as e:
            print(f"[Camera] picamera2 unavailable ({e}); falling back to {VID_CMD}", flush=True)
    mgr = LegacyRpicamManager()
    mgr.start()
    return mgr

streaming_mgr = None

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
            sw, sh = streaming_mgr.still_size
            body = f'{{"status":"ok","streaming":{str(has_feed).lower()},"backend":"{streaming_mgr.backend}","fps":{STREAM_FPS},"still":"{sw}x{sh}"}}'.encode('utf-8')
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
        try:
            frame = streaming_mgr.capture_still()
        except Exception as e:
            print(f"[Camera] Still capture failed: {e}", flush=True)
            frame = None
        if not frame:
            frame = streaming_mgr.latest_frame  # last resort: a preview frame beats a missed shot

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

def _announce_loop():
    """Tell the laptop where this Pi is (every 10 s), so it never has to scan the network for us.
    The laptop address comes from SERVER_URL or ~/.photobooth-server (written by find-server.sh)."""
    import urllib.request
    cache = os.path.expanduser('~/.photobooth-server')
    while True:
        target = os.environ.get('SERVER_URL', '').strip()
        if not target:
            try:
                with open(cache) as f:
                    target = 'http://' + f.read().strip()
            except OSError:
                target = ''
        if target:
            try:
                req = urllib.request.Request(target.rstrip('/') + '/api/camera/announce', data=b'{}', method='POST',
                                             headers={'Content-Type': 'application/json'})
                urllib.request.urlopen(req, timeout=3).read()
            except Exception:
                pass
        time.sleep(10)


def run_servers():
    global streaming_mgr
    streaming_mgr = create_manager()
    threading.Thread(target=_announce_loop, daemon=True).start()

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
