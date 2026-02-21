import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import log from '../utils/logger.js';

/**
 * Wan 2.1 Image-to-Video via self-hosted API (Hugging Face model run locally or on RunPod).
 * No Replicate: you run the Wan API server that loads the model from Hugging Face.
 */
export class WanService {
  constructor(config) {
    this.config = config;
    this.apiUrl = config.wan?.apiUrl;
    if (!this.apiUrl) {
      log.warn('Wan API URL not set (WAN_API_URL). wan-lipsync provider will fail at I2V step.');
    }
  }

  /**
   * Generate video from image + motion prompt (I2V) by calling self-hosted Wan API.
   * @param {string} imagePath - Local path to image (PNG/JPEG)
   * @param {string} motionPrompt - Text describing the motion
   * @param {string} sceneId - Scene id for logging
   * @param {string} jobId - Job id for temp paths
   * @param {string} tempDir - Temp directory root
   * @returns {Promise<string>} Path to generated MP4
   */
  async generateVideo(imagePath, motionPrompt, sceneId, jobId, tempDir) {
    if (!this.apiUrl) {
      throw new Error('Wan API URL is required. Set WAN_API_URL in .env and run the Wan API server (see server/wan_api/README.md).');
    }

    if (!(await fs.pathExists(imagePath))) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const outputPath = path.join(tempDir, jobId, 'video', `wan_i2v_${sceneId}.mp4`);
    await fs.ensureDir(path.dirname(outputPath));

    const prompt = this.buildMotionPrompt(motionPrompt);

    log.info(`Wan I2V for scene ${sceneId} via ${this.apiUrl}`);
    log.info(`Motion prompt: ${prompt.substring(0, 120)}...`);

    try {
      const healthUrl = `${this.apiUrl.replace(/\/$/, '')}/health`;
      await axios.get(healthUrl, { timeout: 10000 });
    } catch (err) {
      log.error('Wan API health check failed:', err.message);
      throw new Error(`Wan API not available at ${this.apiUrl}. Start the Wan API server (see server/wan_api/README.md).`);
    }

    const FormData = (await import('form-data')).default;
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath), {
      filename: path.basename(imagePath),
      contentType: 'image/png',
    });
    formData.append('prompt', prompt);

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
    log.info(`Wan I2V saved to ${outputPath}`);
    return outputPath;
  }

  buildMotionPrompt(visualOrCameraPrompt) {
    const base = (visualOrCameraPrompt || 'Person in frame with natural movement.')
      .substring(0, 300)
      .trim();
    if (!base.toLowerCase().includes('mov') && !base.toLowerCase().includes('speak') && !base.toLowerCase().includes('look')) {
      return `${base}. Subtle natural movement, slight head motion, breathing.`;
    }
    return base;
  }
}
