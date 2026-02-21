"""
SadTalker Flask API - standalone server (Linux).
GET /health, POST /generate (image + audio) -> video.
"""
import sys
import os
import logging
import traceback
import tempfile
import subprocess
from pathlib import Path

from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

logging.basicConfig(level=logging.INFO, format='[%(asctime)s] %(levelname)s - %(message)s', datefmt='%Y-%m-%d %H:%M:%S')
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SADTALKER_DIR = os.path.join(BASE_DIR, 'SadTalker')
INFERENCE_SCRIPT = os.path.join(SADTALKER_DIR, 'inference.py')
CHECKPOINT_DIR = os.path.join(BASE_DIR, 'checkpoints')

sys.path.insert(0, SADTALKER_DIR)

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024


@app.errorhandler(Exception)
def handle_exception(e):
    return jsonify({'error': str(e), 'trace': traceback.format_exc()[-2000:]}), 500


@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'service': 'sadtalker-api',
        'sadtalker_path': SADTALKER_DIR,
        'inference_script_exists': os.path.exists(INFERENCE_SCRIPT),
        'checkpoints_exist': os.path.isdir(CHECKPOINT_DIR),
    })


@app.route('/generate', methods=['POST'])
def generate():
    temp_dir = None
    request_id = os.urandom(4).hex()
    try:
        if not request.files or 'image' not in request.files or 'audio' not in request.files:
            return jsonify({'error': 'Missing image or audio file'}), 400
        image_file = request.files['image']
        audio_file = request.files['audio']
        if not image_file.filename or not audio_file.filename:
            return jsonify({'error': 'Empty image or audio file'}), 400

        preprocess = request.form.get('preprocess', 'full')
        still_mode = request.form.get('still_mode', 'false').lower() == 'true'
        enhancer = request.form.get('enhancer', 'gfpgan')
        if enhancer and enhancer.lower() in ('none', 'null', ''):
            enhancer = None

        temp_dir = tempfile.mkdtemp()
        image_path = os.path.join(temp_dir, 'input_image.png')
        audio_path = os.path.join(temp_dir, 'input_audio.wav')
        result_dir = os.path.join(temp_dir, 'results')
        os.makedirs(result_dir, exist_ok=True)

        image_file.save(image_path)
        audio_file.save(audio_path)

        if not audio_path.endswith('.wav'):
            wav_path = os.path.join(temp_dir, 'input_audio.wav')
            r = subprocess.run(f'ffmpeg -i "{audio_path}" -ar 16000 -ac 1 "{wav_path}" -y', shell=True, capture_output=True, text=True)
            if r.returncode != 0:
                return jsonify({'error': f'Audio conversion failed: {r.stderr}'}), 500
            audio_path = wav_path

        if not os.path.exists(INFERENCE_SCRIPT):
            return jsonify({'error': 'SadTalker inference script not found', 'expected_path': INFERENCE_SCRIPT}), 500
        if not os.path.isdir(CHECKPOINT_DIR):
            return jsonify({'error': 'Checkpoints not found', 'expected_path': CHECKPOINT_DIR}), 500

        # Use venv's python so subprocess sees setuptools, torch, etc. (same dir as app.py)
        venv_python = os.path.join(BASE_DIR, 'venv', 'bin', 'python')
        python_exe = venv_python if os.path.isfile(venv_python) else sys.executable
        cmd = [
            python_exe,
            INFERENCE_SCRIPT,
            '--driven_audio', audio_path,
            '--source_image', image_path,
            '--result_dir', result_dir,
            '--checkpoint_dir', CHECKPOINT_DIR,
            '--preprocess', preprocess,
            '--size', '256',
        ]
        if still_mode:
            cmd.append('--still')
        if enhancer:
            cmd.extend(['--enhancer', enhancer])

        env = os.environ.copy()
        # Only add SadTalker to PYTHONPATH; do not replace so venv site-packages stay (pkg_resources, torch).
        env['PYTHONPATH'] = os.pathsep.join([SADTALKER_DIR, env.get('PYTHONPATH', '')])

        logger.info('[%s] Running SadTalker...', request_id)
        result = subprocess.run(cmd, cwd=SADTALKER_DIR, capture_output=True, text=True, timeout=1800, env=env)

        if result.returncode != 0:
            err = (result.stderr or '') + (result.stdout or '')
            return jsonify({
                'error': 'SadTalker generation failed',
                'return_code': result.returncode,
                'details': err[:5000],
                'request_id': request_id,
            }), 500

        output_videos = list(Path(result_dir).glob('*.mp4')) or list(Path(temp_dir).glob('*.mp4'))
        if not output_videos:
            return jsonify({'error': 'No output video produced', 'result_dir': result_dir}), 500

        return send_file(str(output_videos[0]), mimetype='video/mp4', as_attachment=False, download_name='talking_head.mp4')
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'SadTalker timed out (30 min)', 'request_id': request_id}), 504
    except Exception as e:
        logger.exception(e)
        return jsonify({'error': str(e), 'trace': traceback.format_exc()[-2000:], 'request_id': request_id}), 500
    finally:
        if temp_dir and os.path.exists(temp_dir):
            try:
                import shutil
                shutil.rmtree(temp_dir)
            except Exception:
                pass


@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'Request too large (max 100MB)'}), 413


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print('SadTalker API:', BASE_DIR)
    print('Listening on http://0.0.0.0:%s' % port)
    app.run(host='0.0.0.0', port=port, debug=False)
