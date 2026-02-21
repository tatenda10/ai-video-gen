# SadTalker Flask API

Flask wrapper for SadTalker talking-head video generation.

## Setup

### 1. Activate Virtual Environment

If you have a virtual environment:
```bash
# Windows
sadtalker_api\venv\Scripts\activate

# Linux/Mac
source sadtalker_api/venv/bin/activate
```

### 2. Install Dependencies

```bash
cd sadtalker_api
pip install -r requirements.txt
```

### 3. Download SadTalker Checkpoints

SadTalker needs model checkpoints. They should be in the `checkpoints` folder.

If missing, download them:
```bash
cd SadTalker
python scripts/download_models.sh
# Or manually download from: https://github.com/OpenTalker/SadTalker#checkpoints
```

### 4. Verify Installation

Check that inference script exists:
```bash
# Should exist:
sadtalker_api/SadTalker/inference.py
sadtalker_api/checkpoints/
```

### 5. Start the Flask Server

```bash
cd sadtalker_api
python app.py
```

The API will run on `http://localhost:5000`

## Endpoints

- `GET /health` - Health check (shows if SadTalker is configured)
- `POST /generate` - Generate talking-head video
  - Form data:
    - `image`: Image file (PNG/JPG)
    - `audio`: Audio file (WAV/MP3)
    - `preprocess`: 'full', 'crop', 'resize', 'extcrop', 'extfull' (default: 'full')
    - `still_mode`: 'true' or 'false' (default: 'false')
    - `enhancer`: 'gfpgan', 'RestoreFormer', or None (default: 'gfpgan')

## Testing

Test the health endpoint:
```bash
curl http://localhost:5000/health
```

## Troubleshooting

1. **Checkpoints not found**: Download SadTalker checkpoints to `checkpoints/` folder
2. **CUDA errors**: Add `--cpu` flag in app.py if you don't have GPU
3. **FFmpeg not found**: Ensure FFmpeg is installed and in PATH
4. **Python path issues**: Make sure you're using the correct Python environment
