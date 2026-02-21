"""
Wav2Lip API server: video + audio → video with lip sync.
Uses the open-source Wav2Lip model (Hugging Face). No Replicate.

Setup: Clone Wav2Lip and download checkpoint once (see README). Set WAV2LIP_ROOT.
Endpoints: GET /health, POST /generate (face=video, audio=audio) -> returns MP4.
"""
import os
import sys
import tempfile
import subprocess
from flask import Flask, request, send_file

app = Flask(__name__)

# Root of Wav2Lip repo (clone from GitHub or download from Hugging Face)
WAV2LIP_ROOT = os.environ.get("WAV2LIP_ROOT", os.path.join(os.path.dirname(__file__), "wav2lip_repo"))
CHECKPOINT = os.environ.get("WAV2LIP_CHECKPOINT") or os.path.join(WAV2LIP_ROOT, "checkpoints", "wav2lip_gan.pth")
INFERENCE_SCRIPT = os.path.join(WAV2LIP_ROOT, "inference.py")


def ensure_wav2lip():
    if not os.path.isfile(INFERENCE_SCRIPT):
        raise FileNotFoundError(
            f"Wav2Lip repo not found at {WAV2LIP_ROOT}. "
            "Clone it (see README): git clone https://github.com/Rudrabha/Wav2Lip wav2lip_repo"
        )
    if not os.path.isfile(CHECKPOINT):
        raise FileNotFoundError(
            f"Checkpoint not found at {CHECKPOINT}. "
            "Download wav2lip_gan.pth from Hugging Face (see README) into checkpoints/"
        )
    os.makedirs(os.path.join(WAV2LIP_ROOT, "temp"), exist_ok=True)


@app.route("/health", methods=["GET"])
def health():
    try:
        ensure_wav2lip()
        return {"status": "ok", "wav2lip_root": WAV2LIP_ROOT}
    except FileNotFoundError as e:
        return {"status": "error", "message": str(e)}, 503


@app.route("/generate", methods=["POST"])
def generate():
    if "face" not in request.files or not request.files["face"].filename:
        return {"error": "Missing 'face' video file"}, 400
    if "audio" not in request.files or not request.files["audio"].filename:
        return {"error": "Missing 'audio' file"}, 400

    ensure_wav2lip()

    face_file = request.files["face"]
    audio_file = request.files["audio"]

    with tempfile.TemporaryDirectory(prefix="wav2lip_") as tmp:
        face_path = os.path.join(tmp, "face.mp4")
        audio_path = os.path.join(tmp, "audio.wav")
        out_path = os.path.join(tmp, "output.mp4")

        face_file.save(face_path)
        # Keep original extension for audio; inference.py converts non-.wav to temp wav internally
        audio_ext = os.path.splitext(audio_file.filename or "audio.wav")[1] or ".wav"
        audio_path = os.path.join(tmp, "audio" + audio_ext)
        audio_file.save(audio_path)

        cmd = [
            sys.executable,
            INFERENCE_SCRIPT,
            "--face", face_path,
            "--audio", audio_path,
            "--outfile", out_path,
            "--checkpoint_path", CHECKPOINT,
            "--pads", "0", "10", "0", "0",
            "--resize_factor", "1",
        ]

        result = subprocess.run(cmd, cwd=WAV2LIP_ROOT, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            return {
                "error": "Wav2Lip inference failed",
                "stderr": result.stderr or result.stdout or "",
            }, 500

        if not os.path.isfile(out_path):
            return {"error": "Wav2Lip did not produce output file", "stderr": result.stderr}, 500

        return send_file(out_path, mimetype="video/mp4", as_attachment=True, download_name="wav2lip.mp4")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5003))
    print(f"Wav2Lip API: http://0.0.0.0:{port}")
    print(f"WAV2LIP_ROOT={WAV2LIP_ROOT}")
    app.run(host="0.0.0.0", port=port)
