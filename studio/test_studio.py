"""Boundary and real FFmpeg integration tests, with isolated project storage."""
import io
import json
from pathlib import Path
import tempfile
import subprocess
import unittest
import wave
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import numpy as np
from PIL import Image
from fastapi.testclient import TestClient
import engine as e
import server


class StudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.directory = tempfile.TemporaryDirectory(dir=e.DATA, prefix="test-")
        cls.root = Path(cls.directory.name)
        cls.patcher = patch.object(e, "PROJECTS", cls.root / "projects")
        cls.patcher.start()
        cls.client = TestClient(server.app)
        cls.headers = {"X-OneSplatt": "studio", "Origin": "http://127.0.0.1:8765"}
        cls.project = cls.client.post("/api/projects", json={"name": "Integration test"}, headers=cls.headers).json()

    @classmethod
    def tearDownClass(cls):
        cls.patcher.stop()
        cls.directory.cleanup()

    def test_external_calls_and_path_escape_are_rejected(self):
        self.assertEqual(self.client.post("/api/projects", json={"name": "bad"}).status_code, 403)
        self.assertEqual(self.client.post("/api/projects", json={}, headers={**self.headers, "Origin": "https://example.com"}).status_code, 403)
        for url in ["https://127.0.0.1:8188", "http://example.com", "http://user@localhost:8188"]:
            with self.assertRaises(ValueError):
                e.comfy_url(url)
        with self.assertRaises(ValueError):
            e.project_path("../../secrets")
        with self.assertRaises(ValueError):
            e.asset_path({"path": "../outside.txt"})

    def test_comfy_graph_preserves_source_and_has_no_dangling_links(self):
        source = e.workflow()
        original = json.dumps(source)
        graph = e.prepare_workflow(source, {"seed": 17, "prompt": "Test orbit", "videoDuration": 8}, "studio/test.png")
        self.assertEqual(json.dumps(source), original)
        self.assertNotIn("119", graph)
        self.assertEqual(graph["105:15"]["inputs"]["noise_seed"], 17)
        self.assertEqual(graph["114"]["inputs"]["image"], "studio/test.png")
        for node in graph.values():
            for value in node["inputs"].values():
                if isinstance(value, list):
                    self.assertIn(str(value[0]), graph)

    def test_comfy_formats_reach_generator_with_exact_ratio_and_bounded_size(self):
        source = e.workflow()
        original = json.dumps(source)
        sizes = {"16:9": (1024, 576), "9:16": (576, 1024), "1:1": (768, 768)}
        boot_formats = self.client.get("/api/bootstrap").json()["workflow"]["formats"]
        for aspect, (width, height) in sizes.items():
            with self.subTest(aspect=aspect):
                graph = e.prepare_workflow(source, {"aspect": aspect, "resolution": "2160", "fps": 60}, "first.png")
                inputs = graph["105:104"]["inputs"]
                self.assertEqual((inputs["width"], inputs["height"]), (width, height))
                self.assertEqual(boot_formats[aspect], {"width": width, "height": height})
                w, h = map(int, aspect.split(":"))
                self.assertEqual(width * h, height * w)
                self.assertEqual(width % 32, 0)
                self.assertEqual(height % 32, 0)
                self.assertLessEqual(width * height, 600000)
                self.assertEqual(graph["105:91"]["inputs"]["fps"], 24)
                self.assertNotIn("115", graph)
        self.assertEqual(json.dumps(source), original)
        self.assertEqual(e.prepare_workflow(source, {}, "first.png")["105:104"]["inputs"]["width"], 1024)
        with self.assertRaises(ValueError):
            e.prepare_workflow(source, {"aspect": "banana"}, "first.png")

    def test_comfy_input_is_fitted_without_stretching_or_changing_original(self):
        source = self.root / "portrait.png"
        image = Image.new("RGB", (40, 80), "red")
        image.paste("blue", (10, 30, 30, 50))
        image.save(source)
        original = source.read_bytes()
        target = self.root / "fitted.png"
        size = {"width": 160, "height": 80}
        e.prepare_comfy_image(source, target, size, "contain")
        with Image.open(target) as fitted:
            self.assertEqual(fitted.size, (160, 80))
            self.assertEqual(fitted.getpixel((0, 40)), (0, 0, 0))
            self.assertEqual(fitted.getpixel((60, 0)), (255, 0, 0))
            self.assertEqual(fitted.getpixel((80, 40)), (0, 0, 255))
            blue = np.all(np.array(fitted) == [0, 0, 255], axis=2)
            y, x = np.where(blue)
            self.assertEqual(x.max() - x.min(), y.max() - y.min())
        e.prepare_comfy_image(source, target, size, "cover")
        with Image.open(target) as fitted:
            self.assertEqual(fitted.size, (160, 80))
            self.assertEqual(fitted.getpixel((0, 40)), (255, 0, 0))
            self.assertEqual(fitted.getpixel((80, 40)), (0, 0, 255))
        self.assertEqual(source.read_bytes(), original)
        with self.assertRaises(ValueError):
            e.prepare_comfy_image(source, target, size, "stretch")

    def test_comfy_submission_and_video_retrieval_over_http(self):
        captured = {}
        graph = e.prepare_workflow(e.workflow(), {}, "source.png")
        class ComfyFixture(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def send(self, body):
                self.send_response(200); self.end_headers()
                self.wfile.write(json.dumps(body).encode())
            def do_GET(self):
                if self.path == "/system_stats": self.send({"devices": []})
                elif self.path == "/object_info": self.send({n["class_type"]: {} for n in graph.values()})
                elif self.path.startswith("/history/"): self.send({"fixture-prompt": {"status": {"completed": True}, "outputs": {"92": {"images": [{"filename": "orbit.mp4", "type": "output", "subfolder": "video"}]}}}})
                elif self.path.startswith("/view?"):
                    self.send_response(200); self.end_headers(); self.wfile.write(b"test-video-download")
                else: self.send({"queue_running": [], "queue_pending": []})
            def do_POST(self):
                content = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                if self.path == "/upload/image": self.send({"name": "uploaded.png", "subfolder": "studio"})
                elif self.path == "/prompt":
                    captured.update(json.loads(content)); self.send({"prompt_id": "fixture-prompt"})
                else: self.send({})
        http = ThreadingHTTPServer(("127.0.0.1", 0), ComfyFixture)
        threading.Thread(target=http.serve_forever, daemon=True).start()
        try:
            image = self.root / "image.png"; Image.new("RGB", (32, 32)).save(image)
            a = e.add_asset(self.project["id"], image, "image")
            folder = self.root / "comfy-job"; folder.mkdir()
            job = {"id": e.ident(), "folder": folder.relative_to(e.ROOT).as_posix()}
            e.CANCEL[job["id"]] = threading.Event()
            with patch.object(e, "DATA", self.root):
                result = e.generate_video(job, e.get_project(self.project["id"]), {"comfyUrl": f"http://127.0.0.1:{http.server_port}", "imageId": a["id"], "seed": 129, "aspect": "9:16"})
            self.assertEqual(e.asset_path(result).read_bytes(), b"test-video-download")
            self.assertEqual(captured["prompt"]["114"]["inputs"]["image"], "studio/uploaded.png")
            self.assertEqual(captured["prompt"]["105:15"]["inputs"]["noise_seed"], 129)
            inputs = captured["prompt"]["105:104"]["inputs"]
            self.assertEqual((inputs["width"], inputs["height"]), (576, 1024))
            with Image.open(folder / "prepared-input.png") as prepared:
                self.assertEqual(prepared.size, (576, 1024))
        finally:
            http.shutdown(); http.server_close()

    def test_music_analysis_and_real_export_with_sound(self):
        rate = 16000
        t = np.arange(rate * 2) / rate
        samples = .4 * np.sin(2 * np.pi * 80 * t) * (t < 1) + .4 * np.sin(2 * np.pi * 4000 * t) * (t >= 1)
        wav = io.BytesIO()
        with wave.open(wav, "wb") as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(rate)
            f.writeframes((samples * 32767).astype("<i2").tobytes())
        pid = self.project["id"]
        r = self.client.post(f"/api/projects/{pid}/upload/music", files={"file": ("bands.wav", wav.getvalue(), "audio/wav")}, headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        music = r.json()
        analysis = self.client.get(f"/api/projects/{pid}/assets/{music['id']}/analysis").json()
        self.assertGreater(np.mean(analysis["bass"][10:45]), .8)
        self.assertLess(np.mean(analysis["bass"][85:115]), .2)
        self.assertGreater(np.mean(analysis["high"][85:115]), .8)
        begin = self.client.post(f"/api/projects/{pid}/exports", json={"width": 320, "height": 240, "fps": 24, "duration": 1,
                                "musicId": music["id"], "audioOffset": .5, "volume": .5}, headers=self.headers)
        self.assertEqual(begin.status_code, 200, begin.text)
        eid = begin.json()["id"]
        self.assertEqual(self.client.post(f"/api/exports/{eid}/finish", json={}, headers=self.headers).status_code, 400)
        for index in range(24):
            image = Image.new("RGB", (320, 240), (index * 8, 80, 100))
            png = io.BytesIO(); image.save(png, "PNG")
            if index == 0:
                r = self.client.post(f"/api/exports/{eid}/frames/1", content=png.getvalue(), headers=self.headers)
                self.assertEqual(r.status_code, 400)
            r = self.client.post(f"/api/exports/{eid}/frames/{index}", content=png.getvalue(), headers=self.headers)
            self.assertEqual(r.status_code, 200, r.text)
        r = self.client.post(f"/api/exports/{eid}/finish", json={}, headers=self.headers)
        self.assertEqual(r.status_code, 200, r.text)
        out = e.asset_path(r.json())
        result = subprocess.run([e.CONFIG["ffprobe"], "-v", "error", "-show_streams", "-show_format", "-of", "json", str(out)], capture_output=True, text=True)
        data = json.loads(result.stdout)
        video = next(s for s in data["streams"] if s["codec_type"] == "video")
        audio = next(s for s in data["streams"] if s["codec_type"] == "audio")
        self.assertEqual(video["nb_frames"], "24")
        self.assertEqual(video["codec_name"], "h264")
        self.assertEqual(audio["codec_name"], "aac")
        self.assertAlmostEqual(float(data["format"]["duration"]), 1, delta=.06)

    def test_invalid_dimensions_and_cancel(self):
        pid = self.project["id"]
        self.assertEqual(self.client.post(f"/api/projects/{pid}/exports", json={"width": 321, "height": 240, "fps": 24, "duration": 1}, headers=self.headers).status_code, 400)
        begin = self.client.post(f"/api/projects/{pid}/exports", json={"width": 320, "height": 240, "fps": 24, "duration": 1}, headers=self.headers).json()
        r = self.client.post(f"/api/exports/{begin['id']}/cancel", json={}, headers=self.headers)
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(server.EXPORTS[begin['id']]["process"].poll())


if __name__ == "__main__":
    unittest.main(verbosity=2)
