import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import log from '../utils/logger.js';

export class LipsyncService {
  constructor(config) {
    this.config = config;
    this.apiUrl = config.sadtalker.apiUrl;
  }

  /**
   * Generate talking-head video using SadTalker
   */
  async generateTalkingHead(imagePath, audioPath, sceneId, jobId, tempDir) {
    try {
      log.info(`Generating talking head for scene ${sceneId}...`);
      log.info(`API URL: ${this.apiUrl}`);
      log.info(`Image: ${imagePath}`);
      log.info(`Audio: ${audioPath}`);

      // Check if files exist
      if (!(await fs.pathExists(imagePath))) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      if (!(await fs.pathExists(audioPath))) {
        throw new Error(`Audio file not found: ${audioPath}`);
      }

      // Check if SadTalker API is available
      try {
        log.info(`Checking SadTalker API health at ${this.apiUrl}/health...`);
        const healthResponse = await axios.get(`${this.apiUrl}/health`, { timeout: 10000 });
        log.info(`SadTalker API is healthy:`, healthResponse.data);
      } catch (error) {
        log.error(`SadTalker API health check failed:`, error.message);
        throw new Error(`SadTalker API not available at ${this.apiUrl}. Make sure the Flask server is running. Error: ${error.message}`);
      }

      // Create form data
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      
      const imageStats = await fs.stat(imagePath);
      const audioStats = await fs.stat(audioPath);
      log.info(`File sizes - Image: ${(imageStats.size / 1024 / 1024).toFixed(2)} MB, Audio: ${(audioStats.size / 1024 / 1024).toFixed(2)} MB`);
      
      formData.append('image', fs.createReadStream(imagePath), {
        filename: path.basename(imagePath),
        contentType: 'image/png'
      });
      formData.append('audio', fs.createReadStream(audioPath), {
        filename: path.basename(audioPath),
        contentType: 'audio/wav'
      });
      formData.append('preprocess', 'full'); // full, crop, resize, or full_detect
      formData.append('still_mode', 'false');
      formData.append('enhancer', 'None'); // None (much faster), gfpgan, or RestoreFormer

      const outputPath = path.join(tempDir, jobId, 'video', `talking_head_${sceneId}.mp4`);
      await fs.ensureDir(path.dirname(outputPath));

      log.info(`Sending request to ${this.apiUrl}/generate...`);
      log.info(`Request timeout: 1800000ms (30 minutes)`);

      // Call SadTalker API with better error handling
      const response = await axios.post(
        `${this.apiUrl}/generate`,
        formData,
        {
          headers: formData.getHeaders(),
          responseType: 'arraybuffer',
          timeout: 1800000, // 30 minutes timeout (should be enough with enhancer disabled and size 256)
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );

      log.info(`Received response, size: ${(response.data.length / 1024 / 1024).toFixed(2)} MB`);

      // Save video
      await fs.writeFile(outputPath, response.data);

      log.info(`Talking head video saved to ${outputPath}`);
      return outputPath;
    } catch (error) {
      log.error(`Lipsync generation failed for scene ${sceneId}:`, error.message);
      
      if (error.code === 'ECONNRESET') {
        log.error('Connection was reset by the server. This usually means:');
        log.error('1. The Flask server crashed or encountered an error');
        log.error('2. The request was too large');
        log.error('3. The server ran out of memory');
        log.error('Check the Flask server logs for more details.');
      }
      
      if (error.response) {
        log.error('API Error Status:', error.response.status);
        let errBody = error.response.data;
        if (Buffer.isBuffer(errBody) || errBody instanceof ArrayBuffer) {
          errBody = Buffer.from(errBody).toString('utf8');
        }
        if (typeof errBody === 'object' && errBody !== null) {
          errBody = JSON.stringify(errBody, null, 2);
        }
        log.error('API Error Data:', errBody || 'No error data');
      }
      
      if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        throw new Error(`Lipsync generation timed out for scene ${sceneId}. SadTalker processing may be taking too long.`);
      }
      
      throw new Error(`Lipsync generation failed for scene ${sceneId}: ${error.message}`);
    }
  }

  /**
   * Check if SadTalker API is healthy
   */
  async checkHealth() {
    try {
      const response = await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

