"""
Wan 2.1 Image-to-Video API server.
Downloads and runs the model from Hugging Face (no Replicate).
Endpoints: GET /health, POST /generate (image file + prompt) -> returns MP4.
"""
import os
import io
import tempfile
import numpy as np
from flask import Flask, request, send_file

# Lazy-load heavy deps after Flask app is created
app = Flask(__name__)

# Model id from Hugging Face (480P = ~13GB VRAM; use 720P for higher quality if you have more VRAM)
MODEL_ID = os.environ.get("WAN_MODEL_ID", "Wan-AI/Wan2.1-I2V-14B-480P-Diffusers")
# 480P base: 480*832; 720P would use 720*1280
MAX_AREA = int(os.environ.get("WAN_MAX_AREA", "399360"))  # 480*832

NEGATIVE_PROMPT = (
    "Bright tones, overexposed, static, blurred details, subtitles, style, works, paintings, "
    "images, static, overall gray, worst quality, low quality, JPEG compression residue, ugly, "
    "incomplete, extra fingers, poorly drawn hands, poorly drawn faces, deformed, disfigured, "
    "misshapen limbs, fused fingers, still picture, messy background."
)

pipe = None


def load_pipeline():
    global pipe
    if pipe is not None:
        return pipe
    import torch
    from diffusers import AutoencoderKLWan, WanImageToVideoPipeline
    from transformers import CLIPVisionModel

    print(f"Loading Wan I2V from Hugging Face: {MODEL_ID} ...")
    image_encoder = CLIPVisionModel.from_pretrained(
        MODEL_ID, subfolder="image_encoder", torch_dtype=torch.float32
    )
    vae = AutoencoderKLWan.from_pretrained(MODEL_ID, subfolder="vae", torch_dtype=torch.float32)
    pipe = WanImageToVideoPipeline.from_pretrained(
        MODEL_ID, vae=vae, image_encoder=image_encoder, torch_dtype=torch.bfloat16
    )
    pipe.to("cuda")
    print("Wan pipeline ready.")
    return pipe


def aspect_ratio_resize(image, pipe, max_area=None):
    max_area = max_area or MAX_AREA
    aspect_ratio = image.height / image.width
    mod_value = pipe.vae_scale_factor_spatial * pipe.transformer.config.patch_size[1]
    height = round(np.sqrt(max_area * aspect_ratio)) // mod_value * mod_value
    width = round(np.sqrt(max_area / aspect_ratio)) // mod_value * mod_value
    height, width = max(height, mod_value), max(width, mod_value)
    image = image.resize((width, height))
    return image, height, width


@app.route("/health", methods=["GET"])
def health():
    return {"status": "ok", "model": MODEL_ID}


@app.route("/generate", methods=["POST"])
def generate():
    if "image" not in request.files or not request.files["image"].filename:
        return {"error": "Missing 'image' file"}, 400
    prompt = (request.form.get("prompt") or "").strip() or "Person in frame with natural movement."
    prompt = prompt[:500]

    image_file = request.files["image"]
    image_bytes = image_file.read()

    load_pipeline()
    import torch
    from PIL import Image
    from diffusers.utils import export_to_video

    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image, height, width = aspect_ratio_resize(image, pipe)

    print(f"Generating video: {height}x{width}, prompt: {prompt[:80]}...")
    with torch.inference_mode():
        output = pipe(
            image=image,
            prompt=prompt,
            negative_prompt=NEGATIVE_PROMPT,
            height=height,
            width=width,
            num_frames=81,
            guidance_scale=5.0,
        ).frames[0]

    out = io.BytesIO()
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        export_to_video(output, tmp.name, fps=16)
        with open(tmp.name, "rb") as f:
            out.write(f.read())
        try:
            os.unlink(tmp.name)
        except Exception:
            pass
    out.seek(0)
    return send_file(out, mimetype="video/mp4", as_attachment=True, download_name="wan_i2v.mp4")


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5002))
    print(f"Wan I2V API: http://0.0.0.0:{port}")
    print("Model will load from Hugging Face on first /generate request.")
    app.run(host="0.0.0.0", port=port)
