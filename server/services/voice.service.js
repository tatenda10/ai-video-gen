import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import log from '../utils/logger.js';

const execAsync = promisify(exec);

export class VoiceService {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.elevenlabs.baseUrl;
    this.apiKey = config.elevenlabs.apiKey;
    this.voiceId = config.elevenlabs.voiceId;
  }

  /**
   * Generate voice audio for a scene
   * ElevenLabs returns MP3 by default, but SadTalker needs WAV format
   */
  async generateVoice(dialogue, sceneId, jobId, tempDir) {
    try {
      log.info(`Generating voice for scene ${sceneId}...`);

      if (!this.apiKey) {
        throw new Error('ElevenLabs API key is missing. Please set ELEVENLABS_API_KEY in your .env file.');
      }

      if (!this.voiceId) {
        throw new Error('ElevenLabs voice ID is missing. Please set ELEVENLABS_VOICE_ID in your .env file.');
      }

      const url = `${this.baseUrl}/text-to-speech/${this.voiceId}`;
      
      // Request MP3 format (ElevenLabs default)
      const response = await axios.post(
        url,
        {
          text: dialogue,
          model_id: 'eleven_turbo_v2', // Updated to newer model
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        },
        {
          headers: {
            'Accept': 'audio/mpeg',
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          timeout: 30000, // 30 second timeout
        }
      );

      // Save MP3 temporarily
      const mp3Path = path.join(tempDir, jobId, 'audio', `scene_${sceneId}.mp3`);
      const wavPath = path.join(tempDir, jobId, 'audio', `scene_${sceneId}.wav`);
      await fs.ensureDir(path.dirname(mp3Path));

      await fs.writeFile(mp3Path, response.data);
      log.info(`MP3 audio saved to ${mp3Path}`);

      // Convert MP3 to WAV for SadTalker compatibility
      // SadTalker requires WAV format
      log.info(`Converting MP3 to WAV for SadTalker compatibility...`);
      
      try {
        await this.convertMp3ToWav(mp3Path, wavPath);
        log.info(`Voice saved to ${wavPath}`);
        return wavPath;
      } catch (conversionError) {
        // If conversion fails, return MP3 path and let the pipeline handle it
        // The error message will indicate FFmpeg needs to be configured
        log.error(`MP3 to WAV conversion failed: ${conversionError.message}`);
        log.warn(`Returning MP3 path instead. Ensure FFMPEG_PATH is set in .env`);
        return mp3Path;
      }
    } catch (error) {
      log.error(`Voice generation failed for scene ${sceneId}:`, error.message);
      
      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        if (status === 401) {
          throw new Error(`ElevenLabs API key is invalid. Please check your ELEVENLABS_API_KEY.`);
        } else if (status === 404) {
          throw new Error(`ElevenLabs voice ID '${this.voiceId}' not found. Please check your ELEVENLABS_VOICE_ID.`);
        } else if (status === 429) {
          throw new Error(`ElevenLabs rate limit exceeded. Please wait before retrying.`);
        } else if (status === 422) {
          throw new Error(`Invalid request to ElevenLabs: ${JSON.stringify(data)}`);
        }
        
        log.error('API Error Status:', status);
        log.error('API Error Data:', JSON.stringify(data, null, 2));
      }
      
      if (error.code === 'ECONNABORTED') {
        throw new Error(`ElevenLabs API request timed out. Please try again.`);
      }
      
      throw new Error(`Voice generation failed for scene ${sceneId}: ${error.message}`);
    }
  }

  /**
   * Convert MP3 to WAV using FFmpeg
   */
  async convertMp3ToWav(mp3Path, wavPath) {
    try {
      const ffmpegPath = this.config.ffmpeg.path;
      
      if (!ffmpegPath) {
        throw new Error('FFmpeg path is not configured. Please set FFMPEG_PATH in your .env file.');
      }
      
      const command = `"${ffmpegPath}" -i "${mp3Path}" -ar 16000 -ac 1 "${wavPath}" -y`;
      
      log.debug(`Converting audio: ${command}`);
      await execAsync(command);
      
      // Verify WAV file was created
      if (!(await fs.pathExists(wavPath))) {
        throw new Error('WAV conversion failed - output file not found');
      }
      
      log.info(`Successfully converted MP3 to WAV`);
    } catch (error) {
      log.error('FFmpeg conversion error:', error.message);
      
      // If conversion fails, return MP3 path instead of trying to copy
      // SadTalker might accept MP3, or the user needs to fix FFmpeg configuration
      log.warn('FFmpeg conversion failed. Returning MP3 path - ensure FFMPEG_PATH is set correctly in .env');
      throw new Error(`FFmpeg conversion failed: ${error.message}. Please check FFMPEG_PATH in your .env file.`);
    }
  }

  /**
   * Generate all scene audio files in parallel
   */
  async generateAllVoices(scenes, jobId, tempDir) {
    const voicePromises = scenes.map(scene =>
      this.generateVoice(scene.dialogue, scene.scene_id, jobId, tempDir)
        .then(path => ({ sceneId: scene.scene_id, path }))
        .catch(error => {
          log.error(`Failed to generate voice for scene ${scene.scene_id}:`, error.message);
          throw error;
        })
    );

    const results = await Promise.all(voicePromises);
    
    // Return map of scene_id to audio path
    const audioMap = {};
    results.forEach(({ sceneId, path }) => {
      audioMap[sceneId] = path;
    });

    return audioMap;
  }

  /**
   * Concatenate all audio files into one
   */
  async concatenateAudio(audioPaths, outputPath) {
    // This would use FFmpeg to concatenate, but for MVP we can skip
    // and use per-scene audio during video stitching
    log.info('Audio concatenation skipped - using per-scene audio');
    return outputPath;
  }
}

