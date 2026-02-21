#!/bin/bash
# Install only SadTalker + minimal API on this server.
# Run from an empty directory. Optionally set REPO_RAW_URL to download app.py.
set -e

INSTALL_DIR="$(pwd)"
cd "$INSTALL_DIR"
echo "==> Install directory: $INSTALL_DIR"
echo ""

REPO_URL="${REPO_RAW_URL:-$REPO}"
if [ -n "$REPO_URL" ]; then
  echo "==> Downloading app.py from $REPO_URL"
  curl -sL -f "$REPO_URL/sadtalker_standalone/app.py" -o "$INSTALL_DIR/app.py" || true
fi
if [ ! -f "$INSTALL_DIR/app.py" ]; then
  echo "ERROR: app.py not found. Copy app.py here or set REPO_RAW_URL (e.g. https://raw.githubusercontent.com/USER/ai-video-gen/main)"
  exit 1
fi

if [ ! -d "$INSTALL_DIR/SadTalker" ] || [ ! -f "$INSTALL_DIR/SadTalker/inference.py" ]; then
  echo "==> Cloning SadTalker from GitHub..."
  rm -rf "$INSTALL_DIR/SadTalker"
  git clone --depth 1 https://github.com/OpenTalker/SadTalker.git "$INSTALL_DIR/SadTalker"
else
  echo "==> SadTalker already present."
fi

if ! command -v ffmpeg &>/dev/null; then
  (apt-get update -qq && apt-get install -y -qq ffmpeg) 2>/dev/null || echo "  Install ffmpeg if needed: apt-get install ffmpeg"
fi

PYTHON="${PYTHON:-python3}"
for p in python3.9 python3.10 python3; do
  command -v "$p" &>/dev/null && PYTHON="$p" && break
done
echo "==> Using Python: $PYTHON ($($PYTHON --version 2>&1))"

VENV_DIR="$INSTALL_DIR/venv"
if [ ! -d "$VENV_DIR" ]; then
  echo "==> Creating venv..."
  $PYTHON -m venv "$VENV_DIR"
fi
source "$VENV_DIR/bin/activate"

pip install -U pip setuptools wheel -q
# pkg_resources (setuptools) required by librosa
pip install setuptools -q
echo "==> Installing PyTorch (CUDA)..."
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118 -q 2>/dev/null || pip install torch torchvision -q
echo "==> Installing SadTalker dependencies..."
pip install "numpy<2" -q
pip install -r "$INSTALL_DIR/SadTalker/requirements.txt" -q
pip install flask flask-cors -q

CHECKPOINTS_DIR="$INSTALL_DIR/checkpoints"
mkdir -p "$CHECKPOINTS_DIR"
if [ ! -f "$CHECKPOINTS_DIR/SadTalker_V0.0.2_256.safetensors" ]; then
  echo "==> Downloading checkpoints..."
  BASE="https://github.com/OpenTalker/SadTalker/releases/download/v0.0.2-rc"
  for f in SadTalker_V0.0.2_512.safetensors SadTalker_V0.0.2_256.safetensors mapping_00109-model.pth.tar mapping_00229-model.pth.tar; do
    echo "  $f"
    curl -sL -f -o "$CHECKPOINTS_DIR/$f" "$BASE/$f"
  done
else
  echo "==> Checkpoints already present."
fi

# Fix basicsr + torchvision compatibility (functional_tensor was removed in newer torchvision)
BASICSR_DEG="$(python -c "import basicsr; import os; print(os.path.join(os.path.dirname(basicsr.__file__), 'data', 'degradations.py'))" 2>/dev/null)" || true
if [ -n "$BASICSR_DEG" ] && [ -f "$BASICSR_DEG" ]; then
  if grep -q 'functional_tensor' "$BASICSR_DEG" 2>/dev/null; then
    echo "==> Patching basicsr for torchvision compatibility..."
    sed -i.bak 's/from torchvision.transforms.functional_tensor import rgb_to_grayscale/from torchvision.transforms.functional import rgb_to_grayscale/' "$BASICSR_DEG"
  fi
fi

echo ""
echo "=============================================="
echo "SadTalker API installed in: $INSTALL_DIR"
echo "Start: cd $INSTALL_DIR && source venv/bin/activate && python app.py"
echo "Set SADTALKER_API_URL=http://THIS_SERVER_IP:5000 on your Node server."
echo "=============================================="
