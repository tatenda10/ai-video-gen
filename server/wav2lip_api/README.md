# Wav2Lip API (open-source, Hugging Face – no Replicate)

Lip re-sync: **video + audio → video** with mouth synced to audio. Uses the free, open-source [Wav2Lip](https://github.com/Rudrabha/Wav2Lip) model. Model weights can be downloaded from Hugging Face.

## 1. Clone Wav2Lip and install its dependencies

```bash
cd server/wav2lip_api
git clone https://github.com/Rudrabha/Wav2Lip wav2lip_repo
cd wav2lip_repo
pip install -r requirements.txt
cd ..
```

Or clone from Hugging Face (same layout):

```bash
git clone https://huggingface.co/camenduru/Wav2Lip wav2lip_repo
cd wav2lip_repo
pip install -r requirements.txt
cd ..
```

## 2. Download the checkpoint (Hugging Face)

**Option A – Hugging Face Hub (recommended):**

```bash
cd wav2lip_repo
mkdir -p checkpoints
# Official checkpoint (Rudrabha repo links to this; you may need to get it from the paper’s link)
# Or use camenduru’s lipsync_expert (rename to wav2lip_gan.pth if your inference expects that name):
pip install huggingface_hub
python -c "
from huggingface_hub import hf_hub_download
hf_hub_download(repo_id='camenduru/Wav2Lip', filename='checkpoints/wav2lip_gan.pth', local_dir='.')
"
# If camenduru only has 'lipsync_expert.pth', download that and symlink or copy:
# hf_hub_download(repo_id='camenduru/Wav2Lip', filename='checkpoints/lipsync_expert.pth', local_dir='.')
# cp checkpoints/lipsync_expert.pth checkpoints/wav2lip_gan.pth
cd ..
```

**Option B – Manual download:**  
From the [Wav2Lip paper/repo](https://github.com/Rudrabha/Wav2Lip), get `wav2lip_gan.pth` and put it in `wav2lip_repo/checkpoints/wav2lip_gan.pth`. Some Hugging Face repos (e.g. camenduru) provide `lipsync_expert.pth` or similar; place or symlink it as `checkpoints/wav2lip_gan.pth` if your `inference.py` expects that name.

## 3. Install this API’s dependencies

```bash
cd server/wav2lip_api
python -m venv venv
# Windows: venv\Scripts\activate
# macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
```

Use the same venv as Wav2Lip if you installed Wav2Lip’s requirements in it.

## 4. Run the API

```bash
# From server/wav2lip_api with venv active
export WAV2LIP_ROOT=$(pwd)/wav2lip_repo   # or set in .env
python app.py
```

- Server: `http://localhost:5003`
- **GET /health** – checks that `WAV2LIP_ROOT` and checkpoint exist  
- **POST /generate** – form: `face` (video file), `audio` (audio file). Returns MP4.

## 5. Node app configuration

In `server/.env`:

```env
WAV2LIP_API_URL=http://localhost:5003
VIDEO_GENERATION_PROVIDER=wan-lipsync
```

No Replicate token needed; Wan and Wav2Lip are both self-hosted (Wan from Hugging Face, Wav2Lip from this repo + Hugging Face checkpoint).

## Troubleshooting

- **“Wav2Lip repo not found”** – Set `WAV2LIP_ROOT` to the directory that contains `inference.py`.
- **“Checkpoint not found”** – Ensure `wav2lip_gan.pth` (or equivalent) is in `checkpoints/`. Use `WAV2LIP_CHECKPOINT` to point to a different path.
- **FFmpeg** – Required by Wav2Lip for audio conversion; must be on `PATH`.
- **GPU** – Wav2Lip runs on CPU if no CUDA; GPU is faster.
