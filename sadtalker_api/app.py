"""
SadTalker Flask API Wrapper
Provides REST API endpoint for generating talking-head videos
"""
import sys
import os

# Set up basic error handling first
try:
    import logging
    import traceback
    
    # Configure detailed logging
    logging.basicConfig(
        level=logging.DEBUG,
        format='[%(asctime)s] %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        force=True  # Force reconfiguration
    )
    logger = logging.getLogger(__name__)
    logger.info('Logging initialized')
except Exception as e:
    # Fallback to print if logging fails
    print(f'ERROR: Failed to initialize logging: {e}')
    import traceback
    traceback.print_exc()
    logger = None

# Import Flask and other dependencies
try:
    from flask import Flask, request, send_file, jsonify
    from flask_cors import CORS
    import tempfile
    import shutil
    import subprocess
    from pathlib import Path
    import site
    if logger:
        logger.info('All imports successful')
except Exception as e:
    error_msg = f'ERROR: Failed to import dependencies: {e}'
    if logger:
        logger.critical(error_msg)
    else:
        print(error_msg)
    import traceback
    traceback.print_exc()
    raise

# Add SadTalker to path
sadtalker_dir = os.path.join(os.path.dirname(__file__), 'SadTalker')
sys.path.insert(0, sadtalker_dir)

app = Flask(__name__)
CORS(app)  # Enable CORS for Node.js backend

# Increase max content length for large file uploads (100MB)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

# Add error handlers to catch all exceptions
@app.errorhandler(Exception)
def handle_exception(e):
    """Catch all exceptions and return proper error response"""
    error_trace = traceback.format_exc()
    try:
        if logger:
            logger.critical(f'Unhandled exception: {e}')
            logger.critical(f'Traceback:\n{error_trace}')
    except:
        pass
    print(f'CRITICAL: Unhandled exception: {e}')
    print(f'Traceback:\n{error_trace}')
    return jsonify({
        'error': f'Server error: {str(e)}',
        'trace': error_trace[-2000:] if len(error_trace) > 2000 else error_trace
    }), 500

# Configuration
UPLOAD_FOLDER = tempfile.gettempdir()
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'mp3', 'wav', 'mp4'}

# SadTalker paths
SADTALKER_DIR = os.path.join(os.path.dirname(__file__), 'SadTalker')
INFERENCE_SCRIPT = os.path.join(SADTALKER_DIR, 'inference.py')
CHECKPOINT_DIR = os.path.join(os.path.dirname(__file__), 'checkpoints')

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok', 
        'service': 'sadtalker-api',
        'sadtalker_path': SADTALKER_DIR,
        'inference_script_exists': os.path.exists(INFERENCE_SCRIPT)
    })

@app.route('/test', methods=['POST'])
def test():
    """Test endpoint to verify server is working"""
    try:
        print('[INFO] Test endpoint called')
        return jsonify({
            'status': 'ok',
            'message': 'Server is responding',
            'files_received': len(request.files) if request.files else 0
        })
    except Exception as e:
        import traceback
        return jsonify({
            'error': str(e),
            'trace': traceback.format_exc()[-500:]
        }), 500

@app.route('/generate', methods=['POST'])
def generate():
    """
    Generate talking-head video from image and audio
    
    Expected form data:
    - image: Image file (PNG/JPG)
    - audio: Audio file (WAV/MP3)
    - preprocess: 'full', 'crop', 'resize', 'extcrop', 'extfull' (default: 'full')
    - still_mode: 'true' or 'false' (default: 'false')
    - enhancer: 'gfpgan', 'RestoreFormer', or None (default: 'gfpgan')
    """
    # Catch ALL exceptions, even before we can log
    try:
        return _handle_generate_request()
    except Exception as e:
        error_trace = traceback.format_exc()
        # Use both logger and print to ensure we see the error
        try:
            if logger:
                logger.critical(f'CRITICAL ERROR in generate endpoint: {e}')
                logger.critical(f'Full traceback:\n{error_trace}')
        except:
            pass
        print(f'CRITICAL ERROR in generate endpoint: {e}')
        print(f'Full traceback:\n{error_trace}')
        return jsonify({
            'error': f'Server error: {str(e)}',
            'trace': error_trace[-2000:] if len(error_trace) > 2000 else error_trace
        }), 500

def _handle_generate_request():
    """Internal handler for generate request"""
    temp_dir = None
    request_id = os.urandom(4).hex()
    
    try:
        if logger:
            logger.info(f'[REQUEST {request_id}] ====== NEW REQUEST RECEIVED ======')
        else:
            print(f'[REQUEST {request_id}] ====== NEW REQUEST RECEIVED ======')
        logger.info(f'[REQUEST {request_id}] Method: {request.method}')
        logger.info(f'[REQUEST {request_id}] Content-Type: {request.content_type}')
        logger.info(f'[REQUEST {request_id}] Content-Length: {request.content_length}')
        logger.info(f'[REQUEST {request_id}] Headers: {dict(request.headers)}')
        
        # Import here to catch import errors early
        import sys
        logger.info(f'[REQUEST {request_id}] Python version: {sys.version}')
        logger.info(f'[REQUEST {request_id}] Python executable: {sys.executable}')
        logger.info(f'[REQUEST {request_id}] Python path: {sys.path[:3]}')
        
        print(f'[INFO] Python path: {sys.path[:3]}')
        print(f'[INFO] Starting /generate endpoint')
        sys.stdout.flush()
        
        try:
            print(f'[INFO] Request method: {request.method}')
            print(f'[INFO] Request content type: {request.content_type}')
            print(f'[INFO] Request content length: {request.content_length}')
            print(f'[INFO] Request has files: {bool(request.files)}')
            sys.stdout.flush()
        except Exception as e:
            print(f'[ERROR] Error reading request metadata: {e}')
            sys.stdout.flush()
            return jsonify({'error': f'Error reading request: {str(e)}'}), 400
        
        # Check for required files with better error handling
        try:
            if not request.files:
                print('[ERROR] No files in request')
                sys.stdout.flush()
                return jsonify({'error': 'No files in request'}), 400
            
            if 'image' not in request.files:
                print('[ERROR] Missing image file in request')
                sys.stdout.flush()
                return jsonify({'error': 'Missing image file'}), 400
            
            if 'audio' not in request.files:
                print('[ERROR] Missing audio file in request')
                sys.stdout.flush()
                return jsonify({'error': 'Missing audio file'}), 400
            
            image_file = request.files['image']
            audio_file = request.files['audio']
            
            print(f'[INFO] Image filename: {image_file.filename if image_file else "None"}')
            print(f'[INFO] Audio filename: {audio_file.filename if audio_file else "None"}')
            sys.stdout.flush()
            
            if not image_file or image_file.filename == '':
                print('[ERROR] Empty image file provided')
                sys.stdout.flush()
                return jsonify({'error': 'Empty image file provided'}), 400
            
            if not audio_file or audio_file.filename == '':
                print('[ERROR] Empty audio file provided')
                sys.stdout.flush()
                return jsonify({'error': 'Empty audio file provided'}), 400
                
        except Exception as e:
            import traceback
            print(f'[ERROR] Error reading files from request: {e}')
            print(f'[ERROR] Traceback: {traceback.format_exc()}')
            sys.stdout.flush()
            return jsonify({'error': f'Error reading files: {str(e)}'}), 400
        
        logger.info(f'[REQUEST {request_id}] Image file: {image_file.filename}')
        logger.info(f'[REQUEST {request_id}] Audio file: {audio_file.filename}')
        
        # Get optional parameters
        try:
            preprocess = request.form.get('preprocess', 'full')
            still_mode = request.form.get('still_mode', 'false').lower() == 'true'
            enhancer = request.form.get('enhancer', 'gfpgan')
            logger.info(f'[REQUEST {request_id}] Parameters - preprocess: {preprocess}, still_mode: {still_mode}, enhancer: {enhancer}')
        except Exception as e:
            logger.error(f'[REQUEST {request_id}] Error reading form parameters: {e}')
            return jsonify({'error': f'Error reading parameters: {str(e)}', 'request_id': request_id}), 400
        
        # Validate preprocess option
        valid_preprocess = ['crop', 'extcrop', 'resize', 'full', 'extfull']
        if preprocess not in valid_preprocess:
            logger.warning(f'[REQUEST {request_id}] Invalid preprocess "{preprocess}", defaulting to "full"')
            preprocess = 'full'
        
        # Validate enhancer - allow None to skip enhancement
        if enhancer and enhancer.lower() in ['none', 'null', '']:
            enhancer = None
            logger.info(f'[REQUEST {request_id}] Enhancer disabled')
        elif enhancer and enhancer not in ['gfpgan', 'RestoreFormer']:
            logger.warning(f'[REQUEST {request_id}] Invalid enhancer "{enhancer}", defaulting to None')
            enhancer = None
        
        # Create temporary directory for this request
        try:
            temp_dir = tempfile.mkdtemp()
            logger.info(f'[REQUEST {request_id}] Created temp directory: {temp_dir}')
        except Exception as e:
            logger.error(f'[REQUEST {request_id}] Failed to create temp directory: {e}')
            return jsonify({'error': f'Failed to create temp directory: {str(e)}', 'request_id': request_id}), 500
        
        image_path = os.path.join(temp_dir, 'input_image.png')
        audio_path = os.path.join(temp_dir, 'input_audio.wav')
        result_dir = os.path.join(temp_dir, 'results')
        
        # Save uploaded files
        try:
            logger.info(f'[REQUEST {request_id}] Saving image to {image_path}...')
            image_file.save(image_path)
            image_size = os.path.getsize(image_path)
            logger.info(f'[REQUEST {request_id}] Image saved: {image_size / 1024 / 1024:.2f} MB')
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f'[REQUEST {request_id}] Failed to save image: {e}')
            logger.error(f'[REQUEST {request_id}] Traceback:\n{error_trace}')
            return jsonify({
                'error': f'Failed to save image: {str(e)}',
                'trace': error_trace[-1000:],
                'request_id': request_id
            }), 500
        
        try:
            logger.info(f'[REQUEST {request_id}] Saving audio to {audio_path}...')
            audio_file.save(audio_path)
            audio_size = os.path.getsize(audio_path)
            logger.info(f'[REQUEST {request_id}] Audio saved: {audio_size / 1024 / 1024:.2f} MB')
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f'[REQUEST {request_id}] Failed to save audio: {e}')
            logger.error(f'[REQUEST {request_id}] Traceback:\n{error_trace}')
            return jsonify({
                'error': f'Failed to save audio: {str(e)}',
                'trace': error_trace[-1000:],
                'request_id': request_id
            }), 500
        
        # Convert audio to WAV if needed (SadTalker prefers WAV)
        if not audio_path.endswith('.wav'):
            wav_path = os.path.join(temp_dir, 'input_audio.wav')
            # Use ffmpeg to convert
            ffmpeg_cmd = f'ffmpeg -i "{audio_path}" -ar 16000 -ac 1 "{wav_path}" -y'
            result = subprocess.run(ffmpeg_cmd, shell=True, capture_output=True, text=True)
            if result.returncode != 0:
                return jsonify({'error': f'Audio conversion failed: {result.stderr}'}), 500
            audio_path = wav_path
        
        # Check if inference script exists
        if not os.path.exists(INFERENCE_SCRIPT):
            return jsonify({
                'error': 'SadTalker inference script not found',
                'expected_path': INFERENCE_SCRIPT,
                'message': 'Please ensure SadTalker is properly installed'
            }), 500
        
        # Check if checkpoints exist
        if not os.path.exists(CHECKPOINT_DIR):
            return jsonify({
                'error': 'SadTalker checkpoints not found',
                'expected_path': CHECKPOINT_DIR,
                'message': 'Please download SadTalker checkpoints'
            }), 500
        
        # Build SadTalker command - use Python 3.9 (compatible with basicsr/gfpgan)
        # Try to find Python 3.9 explicitly
        python_cmd = None
        python_paths_to_try = [
            r'C:\Program Files\Python39\python.exe',  # Common Windows Python 3.9 path
            'python',  # Default python command
            sys.executable  # Current Python
        ]
        
        for python_path in python_paths_to_try:
            try:
                test_result = subprocess.run(
                    [python_path, '--version'],
                    capture_output=True,
                    timeout=2,
                    text=True
                )
                if test_result.returncode == 0:
                    version_output = test_result.stdout.strip()
                    # Check if it's Python 3.9
                    if '3.9' in version_output or python_path == python_paths_to_try[-1]:
                        python_cmd = python_path
                        logger.info(f'[REQUEST {request_id}] Using Python: {version_output} at {python_path}')
                        break
            except Exception as e:
                logger.debug(f'[REQUEST {request_id}] Could not test Python at {python_path}: {e}')
                continue
        
        if not python_cmd:
            python_cmd = sys.executable
            logger.warning(f'[REQUEST {request_id}] Using fallback Python: {sys.executable}')
        
        cmd = [
            python_cmd,
            INFERENCE_SCRIPT,
            '--driven_audio', audio_path,
            '--source_image', image_path,
            '--result_dir', result_dir,
            '--checkpoint_dir', CHECKPOINT_DIR,
            '--preprocess', preprocess,
            '--size', '256',  # 256 is faster than 512 (4x faster processing)
        ]
        
        # Add optional flags
        if still_mode:
            cmd.append('--still')
            logger.info(f'[REQUEST {request_id}] Still mode enabled')
        
        # Only add enhancer if it's specified and not None
        if enhancer and enhancer.lower() not in ['none', 'null', '']:
            cmd.append('--enhancer')
            cmd.append(enhancer)
            logger.info(f'[REQUEST {request_id}] Using enhancer: {enhancer}')
        
        # Use CPU if CUDA not available (optional - remove if you have GPU)
        # cmd.append('--cpu')  # Uncomment if you want to force CPU
        
        logger.info(f'[REQUEST {request_id}] Running SadTalker command: {" ".join(cmd)}')
        logger.info(f'[REQUEST {request_id}] Working directory: {SADTALKER_DIR}')
        logger.info(f'[REQUEST {request_id}] Image path: {image_path}')
        logger.info(f'[REQUEST {request_id}] Audio path: {audio_path}')
        logger.info(f'[REQUEST {request_id}] Result dir: {result_dir}')
        
        # Run SadTalker with better error handling
        # Set environment to ensure Python can find installed packages
        # Use clean environment but include Python 3.9 site-packages
        env = os.environ.copy()
        
        # Get the correct Python's site-packages (Python 3.9)
        try:
            # Get site-packages for the Python executable we're using
            test_python = subprocess.run(
                [python_cmd, '-c', 'import site; import sysconfig; import sys; print(site.getusersitepackages()); print(sysconfig.get_path("purelib")); print(sys.executable)'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if test_python.returncode == 0:
                lines = test_python.stdout.strip().split('\n')
                user_site = lines[0] if len(lines) > 0 else None
                purelib = lines[1] if len(lines) > 1 else None
                python_exe = lines[2] if len(lines) > 2 else None
                
                logger.info(f'[REQUEST {request_id}] Python executable: {python_exe}')
                logger.info(f'[REQUEST {request_id}] User site-packages: {user_site}')
                logger.info(f'[REQUEST {request_id}] Purelib: {purelib}')
                
                # Build PYTHONPATH with Python 3.9 paths first, then filter existing
                pythonpath_parts = []
                
                # Add Python 3.9 site-packages first (highest priority)
                if user_site and os.path.exists(user_site) and 'Python313' not in user_site:
                    pythonpath_parts.append(user_site)
                if purelib and os.path.exists(purelib) and 'Python313' not in purelib:
                    pythonpath_parts.append(purelib)
                
                # Add SadTalker directory
                pythonpath_parts.append(SADTALKER_DIR)
                
                # Filter existing PYTHONPATH to remove Python 3.13 paths
                current_pythonpath = env.get('PYTHONPATH', '')
                if current_pythonpath:
                    existing_paths = current_pythonpath.split(os.pathsep)
                    # Only keep paths that don't contain Python313
                    filtered_paths = [p for p in existing_paths if p and 'Python313' not in p and 'Python313' not in p.replace('\\', '/')]
                    pythonpath_parts.extend(filtered_paths)
                
                env['PYTHONPATH'] = os.pathsep.join(pythonpath_parts)
                logger.info(f'[REQUEST {request_id}] PYTHONPATH (Python 3.9 first): {env["PYTHONPATH"]}')
            else:
                logger.warning(f'[REQUEST {request_id}] Could not determine Python site-packages: {test_python.stderr}')
                # Fallback: filter existing PYTHONPATH
                current_pythonpath = env.get('PYTHONPATH', '')
                if current_pythonpath:
                    existing_paths = current_pythonpath.split(os.pathsep)
                    filtered_paths = [p for p in existing_paths if p and 'Python313' not in p]
                    env['PYTHONPATH'] = os.pathsep.join([SADTALKER_DIR] + filtered_paths)
                else:
                    env['PYTHONPATH'] = SADTALKER_DIR
        except Exception as e:
            logger.warning(f'[REQUEST {request_id}] Error setting PYTHONPATH: {e}, filtering existing')
            # Fallback: filter existing PYTHONPATH to remove Python 3.13
            current_pythonpath = env.get('PYTHONPATH', '')
            if current_pythonpath:
                existing_paths = current_pythonpath.split(os.pathsep)
                filtered_paths = [p for p in existing_paths if p and 'Python313' not in p]
                env['PYTHONPATH'] = os.pathsep.join([SADTALKER_DIR] + filtered_paths)
            else:
                env['PYTHONPATH'] = SADTALKER_DIR
        
        try:
            logger.info(f'[REQUEST {request_id}] Starting SadTalker subprocess...')
            result = subprocess.run(
                cmd,
                cwd=SADTALKER_DIR,
                capture_output=True,
                text=True,
                timeout=1800,  # 30 minutes timeout (should be enough with enhancer disabled and size 256)
                env=env  # Use modified environment
            )
            
            # Log output for debugging
            logger.info(f'[REQUEST {request_id}] SadTalker process completed with return code: {result.returncode}')
            
            # Log full output (not truncated)
            if result.stdout:
                logger.info(f'[REQUEST {request_id}] SadTalker STDOUT (full):\n{result.stdout}')
            if result.stderr:
                logger.warning(f'[REQUEST {request_id}] SadTalker STDERR (full):\n{result.stderr}')
            
            if result.returncode != 0:
                # Combine both stdout and stderr for full error message
                error_msg = ''
                if result.stderr:
                    error_msg += f'STDERR:\n{result.stderr}\n'
                if result.stdout:
                    error_msg += f'STDOUT:\n{result.stdout}\n'
                if not error_msg:
                    error_msg = 'Unknown error - no output from SadTalker'
                
                logger.error(f'[REQUEST {request_id}] SadTalker failed with return code {result.returncode}')
                logger.error(f'[REQUEST {request_id}] Full error output:\n{error_msg}')
                
                # Return more details (up to 5000 chars for API response)
                return jsonify({
                    'error': 'SadTalker generation failed',
                    'return_code': result.returncode,
                    'details': error_msg[:5000],  # Increased from 2000 to 5000
                    'request_id': request_id
                }), 500
        except subprocess.TimeoutExpired as e:
            logger.error(f'[REQUEST {request_id}] SadTalker process timed out after 30 minutes')
            return jsonify({
                'error': 'SadTalker generation timed out',
                'message': 'The process exceeded 30 minutes. Try with a shorter audio or check if SadTalker is stuck.',
                'request_id': request_id
            }), 504
        except Exception as e:
            error_trace = traceback.format_exc()
            logger.error(f'[REQUEST {request_id}] Exception running SadTalker: {e}')
            logger.error(f'[REQUEST {request_id}] Traceback:\n{error_trace}')
            return jsonify({
                'error': 'Failed to run SadTalker',
                'exception': str(e),
                'trace': error_trace[-2000:] if len(error_trace) > 2000 else error_trace,
                'request_id': request_id
            }), 500
        
        # Find output video
        # SadTalker saves as: result_dir/YYYY_MM_DD_HH.MM.SS.mp4
        output_videos = list(Path(result_dir).glob('*.mp4'))
        
        if not output_videos:
            # Try parent directory (SadTalker moves file)
            output_videos = list(Path(temp_dir).glob('*.mp4'))
        
        if not output_videos:
            return jsonify({
                'error': 'SadTalker did not produce output video',
                'result_dir': result_dir,
                'stdout': result.stdout[-500:] if result.stdout else None
            }), 500
        
        output_video = str(output_videos[0])
        
        # Return the video file
        return send_file(
            output_video,
            mimetype='video/mp4',
            as_attachment=False,
            download_name='talking_head.mp4'
        )
        
    except Exception as e:
        error_trace = traceback.format_exc()
        request_id_str = f'[REQUEST {request_id}]' if 'request_id' in locals() else '[UNKNOWN REQUEST]'
        logger.critical(f'{request_id_str} ====== EXCEPTION IN GENERATE ENDPOINT ======')
        logger.critical(f'{request_id_str} Exception type: {type(e).__name__}')
        logger.critical(f'{request_id_str} Exception message: {str(e)}')
        logger.critical(f'{request_id_str} Full traceback:\n{error_trace}')
        
        # Make sure we return a response before the connection closes
        try:
            response = jsonify({
                'error': str(e),
                'error_type': type(e).__name__,
                'trace': error_trace[-2000:] if len(error_trace) > 2000 else error_trace,
                'request_id': request_id if 'request_id' in locals() else None
            })
            return response, 500
        except Exception as response_error:
            # If we can't return JSON, at least log the error
            logger.critical(f'{request_id_str} Could not return error response: {response_error}')
            logger.critical(f'{request_id_str} Original error: {error_trace}')
            # Re-raise to let Flask handle it
            raise
    finally:
        # Cleanup temp directory after a delay (optional - for debugging)
        # Uncomment to keep files for debugging
        if temp_dir and os.path.exists(temp_dir):
            # Keep temp files for now - uncomment to auto-cleanup
            # shutil.rmtree(temp_dir)
            pass

@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle request too large error"""
    return jsonify({
        'error': 'Request too large',
        'message': 'File size exceeds 100MB limit. Please use smaller files.'
    }), 413

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print(f'Starting SadTalker API on port {port}')
    print(f'Python version: {sys.version}')
    print(f'Python executable: {sys.executable}')
    print(f'SadTalker directory: {SADTALKER_DIR}')
    print(f'Inference script: {INFERENCE_SCRIPT}')
    print(f'Checkpoints directory: {CHECKPOINT_DIR}')
    print(f'Checkpoints exist: {os.path.exists(CHECKPOINT_DIR)}')
    print(f'Max upload size: 100MB')
    print(f'Note: Using Python 3.9 for SadTalker (compatible with basicsr/gfpgan)')
    app.run(host='0.0.0.0', port=port, debug=True)
