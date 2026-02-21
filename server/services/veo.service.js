import { GoogleGenAI } from '@google/genai';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import log from '../utils/logger.js';

export class VeoService {
  constructor(config) {
    this.config = config;
    this.apiKey = config.google.apiKey;
    
    if (!this.apiKey) {
      throw new Error('Google API key is missing. Please set GOOGLE_API_KEY in your .env file.');
    }

    // Initialize SDK client
    this.client = new GoogleGenAI({
      apiKey: this.apiKey,
    });
  }

  /**
   * Generate video using Veo 3.1 SDK
   * Supports text-to-video and image-to-video
   * Based on: https://ai.google.dev/gemini-api/docs/video
   */
  async generateVideo(prompt, options = {}) {
    try {
      const {
        imagePath = null, // Optional: reference image for image-to-video
        model = 'veo-3.1-generate-preview', // or 'veo-3.1-fast-generate-preview'
        outputPath = null, // Optional: path to save video directly
      } = options;

      log.info(`Generating video with Veo 3.1 (${model})...`);
      log.info(`Prompt: ${prompt.substring(0, 100)}...`);

      // Prepare video generation options
      const videoOptions = {
        model: model,
        prompt: prompt,
      };

      // Add image if provided (image-to-video)
      if (imagePath) {
        if (!(await fs.pathExists(imagePath))) {
          throw new Error(`Image file not found: ${imagePath}`);
        }

        log.info(`Reading image for image-to-video: ${imagePath}`);
        
        // Read image and convert to base64 string (SDK requires string, not Buffer)
        const imageBuffer = await fs.readFile(imagePath);
        const imageBase64 = imageBuffer.toString('base64');
        const imageMimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

        // SDK format: { imageBytes: "base64string", mimeType: "image/png" }
        videoOptions.image = {
          imageBytes: imageBase64, // Must be base64 string, not Buffer
          mimeType: imageMimeType,
        };

        log.info(`Using image-to-video mode with image (${imageMimeType}, ${(imageBuffer.length / 1024).toFixed(1)} KB)`);
      }

      // Start video generation (async operation)
      log.info(`Sending request to Veo API via SDK...`);
      let operation = await this.client.models.generateVideos(videoOptions);

      log.info(`Video generation started. Operation: ${operation.name || 'started'}`);

      // Poll for completion
      const videoFile = await this.pollOperation(operation, model);

      // Download video
      const videoBuffer = await this.downloadVideo(videoFile);

      // Save to file if output path provided
      if (outputPath) {
        await fs.ensureDir(path.dirname(outputPath));
        await fs.writeFile(outputPath, videoBuffer);
        log.info(`Video saved to: ${outputPath}`);
        return outputPath;
      }

      return videoBuffer; // Return buffer if no output path
    } catch (error) {
      log.error(`Veo video generation failed:`, error.message);
      if (error.stack) {
        log.error(`Stack trace:`, error.stack);
      }
      throw new Error(`Veo video generation failed: ${error.message}`);
    }
  }

  /**
   * Poll operation status until video is ready
   */
  async pollOperation(operation, model, maxAttempts = 60, pollInterval = 10000) {
    log.info(`Polling operation status (max ${maxAttempts} attempts, ${pollInterval}ms interval)...`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check if operation is done
        if (operation.done) {
          if (operation.error) {
            throw new Error(`Operation failed: ${JSON.stringify(operation.error)}`);
          }

          // Extract video file reference
          log.info('Operation response:', JSON.stringify(operation.response, null, 2));
          
          const generatedVideo = operation.response?.generatedVideos?.[0];
          if (!generatedVideo) {
            log.error('No generatedVideos in operation response');
            log.error('Full operation response:', JSON.stringify(operation.response, null, 2));
            throw new Error('No generatedVideos in operation response');
          }
          
          if (!generatedVideo.video) {
            log.error('No video in generatedVideo');
            log.error('Generated video object:', JSON.stringify(generatedVideo, null, 2));
            throw new Error('No video in generatedVideo');
          }

          const videoFile = generatedVideo.video;
          log.info(`Video generation complete! Video file:`, JSON.stringify(videoFile, null, 2));
          return videoFile;
        }

        log.info(`Attempt ${attempt}/${maxAttempts}: Video generation in progress...`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        // Get updated operation status
        operation = await this.client.operations.getVideosOperation({
          operation: operation,
        });
      } catch (error) {
        log.error(`Polling error:`, error.message);
        throw error;
      }
    }

    throw new Error(`Video generation timed out after ${maxAttempts} attempts`);
  }

  /**
   * Download video from Veo API using SDK
   * SDK downloads directly to a file path
   */
  async downloadVideo(videoFile) {
    try {
      log.info(`Downloading video file...`);
      
      if (!videoFile) {
        throw new Error('Video file is undefined or null');
      }
      
      log.info(`Video file object:`, JSON.stringify(videoFile, null, 2));

      // SDK download method saves directly to file path
      // Create temp file path
      const tempPath = path.join(os.tmpdir(), `veo_video_${Date.now()}.mp4`);
      
      log.info(`Downloading to temp path: ${tempPath}`);

      // Download using SDK - saves directly to file
      await this.client.files.download({
        file: videoFile,
        downloadPath: tempPath,
      });

      // Read the downloaded file
      const buffer = await fs.readFile(tempPath);
      
      // Clean up temp file
      await fs.remove(tempPath).catch(() => {}); // Ignore cleanup errors

      log.info(`Video downloaded (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
      return buffer;
    } catch (error) {
      log.error(`Failed to download video:`, error.message);
      if (error.stack) {
        log.error(`Stack trace:`, error.stack);
      }
      throw error;
    }
  }

  /**
   * Generate talking-head video from image and audio prompt
   * This replaces SadTalker for talking head scenes
   * Uses image-to-video: takes the generated image and animates it
   */
  async generateTalkingHead(imagePath, audioPrompt, sceneId, jobId, tempDir) {
    try {
      log.info(`Generating talking-head video for scene ${sceneId} using Veo 3.1 (image-to-video)...`);
      log.info(`Image path: ${imagePath}`);
      log.info(`Audio prompt: ${audioPrompt}`);

      // For image-to-video, the prompt should describe the motion/animation
      // Since we already have the image (person holding phone), we just need to animate it
      const prompt = `Animate this image: A beautiful person holding a smartphone in portrait mode, looking directly at the camera. The person is speaking naturally with realistic lip sync - their mouth opens and closes naturally as they speak. Subtle natural head movements, blinking eyes, and genuine facial expressions. The smartphone screen remains clearly visible and stable in their hands. The person maintains eye contact with the camera while speaking. Professional quality, cinematic lighting, smooth natural motion.`;

      const outputPath = path.join(tempDir, jobId, 'video', `talking_head_${sceneId}.mp4`);
      await fs.ensureDir(path.dirname(outputPath));

      // Generate video with image reference (image-to-video mode)
      // SDK supports imageBytes directly - this will work!
      await this.generateVideo(prompt, {
        imagePath: imagePath, // SDK will read and convert to imageBytes
        model: 'veo-3.1-generate-preview',
        outputPath: outputPath,
      });

      log.info(`Talking-head video saved to ${outputPath}`);
      return outputPath;
    } catch (error) {
      log.error(`Talking-head generation failed for scene ${sceneId}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate scene video from image and visual description
   * For non-talking-head scenes
   */
  async generateSceneVideo(imagePath, visualPrompt, sceneId, jobId, tempDir) {
    try {
      log.info(`Generating scene video for scene ${sceneId} using Veo 3.1...`);

      const outputPath = path.join(tempDir, jobId, 'video', `scene_${sceneId}.mp4`);
      await fs.ensureDir(path.dirname(outputPath));

      // Generate video with image reference (image-to-video mode)
      await this.generateVideo(visualPrompt, {
        imagePath: imagePath,
        model: 'veo-3.1-generate-preview',
        outputPath: outputPath,
      });

      log.info(`Scene video saved to ${outputPath}`);
      return outputPath;
    } catch (error) {
      log.error(`Scene video generation failed for scene ${sceneId}:`, error.message);
      throw error;
    }
  }
}
