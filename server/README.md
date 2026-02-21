# AI Video Gen – Server

## Video generation providers

- **sadtalker** (default) – Lip-sync from one image + audio (e.g. RunPod SadTalker).
- **musetalk** – Lip-sync via MuseTalk API.
- **wan-lipsync** – Full-scene image-to-video (Wan 2.1 from Hugging Face) then lip re-sync (Wav2Lip from Hugging Face). **No Replicate:** both steps are free, open-source, and self-hosted.

### Using `wan-lipsync` (all self-hosted, no Replicate)

1. **Run the Wan API server** (image → full-scene video):
   ```bash
   cd server/wan_api
   python -m venv venv && venv\Scripts\activate
   pip install -r requirements.txt
   python app.py
   ```
   See `server/wan_api/README.md` (model downloads from Hugging Face on first use; ~14GB VRAM for 480P).

2. **Run the Wav2Lip API server** (video + audio → lip-synced video):
   ```bash
   cd server/wav2lip_api
   # Clone Wav2Lip and download checkpoint from Hugging Face (one-time)
   # See server/wav2lip_api/README.md
   pip install -r requirements.txt
   export WAV2LIP_ROOT=$(pwd)/wav2lip_repo
   python app.py
   ```
   See `server/wav2lip_api/README.md` for cloning Wav2Lip and downloading the free checkpoint from Hugging Face.

3. **In `server/.env` set:**
   ```env
   WAN_API_URL=http://localhost:5002
   WAV2LIP_API_URL=http://localhost:5003
   VIDEO_GENERATION_PROVIDER=wan-lipsync
   ```

4. Run the pipeline. Step 4 will:
   - Generate full-scene video via your **Wan API** (Hugging Face).
   - Re-sync lips via your **Wav2Lip API** (open-source, Hugging Face checkpoint). No API token or Replicate required.
