# Wan 2.1 Image-to-Video API (Hugging Face, no Replicate)

This server downloads and runs **Wan 2.1 I2V** from Hugging Face locally. The Node app calls this API for the `wan-lipsync` provider instead of Replicate.

## Requirements

- Python 3.10+
- NVIDIA GPU with ~14GB+ VRAM (480P model). For 720P use more VRAM and set `WAN_MODEL_ID` (see below).
- [Hugging Face](https://huggingface.co) account (optional for gated models; Wan-AI models are typically public).

## Setup

```bash
cd server/wan_api
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python app.py
```

- Server: `http://localhost:5002`
- **First `/generate` request will download the model from Hugging Face** (several GB). Later runs use cache.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5002` | API port |
| `WAN_MODEL_ID` | `Wan-AI/Wan2.1-I2V-14B-480P-Diffusers` | Hugging Face model. Use `Wan-AI/Wan2.1-I2V-14B-720P-Diffusers` for 720P (more VRAM). |
| `WAN_MAX_AREA` | `399360` (480×832) | Max pixel area for 480P. For 720P use `921600` (720×1280). |

## Node app

In `server/.env`:

```env
WAN_API_URL=http://localhost:5002
VIDEO_GENERATION_PROVIDER=wan-lipsync
```

If the Wan API runs on another machine (e.g. RunPod), set `WAN_API_URL` to that URL. No Replicate token is needed for the Wan step; Replicate is only used for the **lip re-sync** (Wav2Lip) step if you keep that.

## Endpoints

- **GET /health** – `{"status":"ok","model":"Wan-AI/..."}`
- **POST /generate** – form: `image` (file), `prompt` (string). Returns MP4.
