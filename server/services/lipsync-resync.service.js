import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import log from '../utils/logger.js';

/**
 * Lip re-sync: existing video + new audio → video with mouth synced to audio.
 * Uses self-hosted Wav2Lip API (open-source model from Hugging Face). No Replicate.
 */
export class LipsyncResyncService {
  constructor(config) {
    this.config = config;
    this.apiUrl = config.wav2lip?.apiUrl;
    if (!this.apiUrl) {
      log.warn('Wav2Lip API URL not set (WAV2LIP_API_URL). wan-lipsync lip re-sync step will fail.');
    }
  }

  /**
   * Re-sync lips in video to match the provided audio.
   */
  async resync(videoPath, audioPath, sceneId, jobId, tempDir) {
    if (!this.apiUrl) {
      throw new Error(
        'Wav2Lip API URL is required. Set WAV2LIP_API_URL in .env and run the Wav2Lip API server (see server/wav2lip_api/README.md).'
      );
    }

    if (!(await fs.pathExists(videoPath))) {
      throw new Error(`Video file not found: ${videoPath}`);
    }
    if (!(await fs.pathExists(audioPath))) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const outputPath = path.join(tempDir, jobId, 'video', `lipsync_resync_${sceneId}.mp4`);
    await fs.ensureDir(path.dirname(outputPath));

    log.info(`Lip re-sync for scene ${sceneId} via ${this.apiUrl}`);

    try {
      const healthUrl = `${this.apiUrl.replace(/\/$/, '')}/health`;
      await axios.get(healthUrl, { timeout: 10000 });
    } catch (err) {
      log.error('Wav2Lip API health check failed:', err.message);
      throw new Error(
        `Wav2Lip API not available at ${this.apiUrl}. Start the Wav2Lip API server (see server/wav2lip_api/README.md).`
      );
    }

    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('face', fs.createReadStream(videoPath), {
      filename: path.basename(videoPath),
      contentType: 'video/mp4',
    });
    formData.append('audio', fs.createReadStream(audioPath), {
      filename: path.basename(audioPath),
      contentType: 'audio/wav',
    });

    const response = await axios.post(
      `${this.apiUrl.replace(/\/$/, '')}/generate`,
      formData,
      {
        headers: formData.getHeaders(),
        responseType: 'arraybuffer',
        timeout: 600000, // 10 min
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );

    await fs.writeFile(outputPath, response.data);
    log.info(`Lip re-sync saved to ${outputPath}`);
    return outputPath;
  }
}
