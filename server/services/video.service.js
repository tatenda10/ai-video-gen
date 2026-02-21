import path from 'path';
import fs from 'fs-extra';
import log from '../utils/logger.js';
import * as ffmpeg from '../utils/ffmpeg.js';

export class VideoService {
  constructor(config) {
    this.config = config;
  }

  /**
   * Animate image scenes
   */
  async animateImageScenes(scenes, imageMap, jobId, tempDir) {
    const videoMap = {};
    const videoDir = path.join(tempDir, jobId, 'video');
    await fs.ensureDir(videoDir);

    for (const scene of scenes) {
      if (scene.type === 'talking_head') {
        // Skip - will be handled by lipsync service
        continue;
      }

      const imagePath = imageMap[scene.scene_id];
      if (!imagePath) {
        throw new Error(`Image not found for scene ${scene.scene_id}`);
      }

      const outputPath = path.join(videoDir, `scene_${scene.scene_id}.mp4`);
      
      // Calculate duration (default 4 seconds if not specified)
      const duration = this.calculateSceneDuration(scene);

      log.info(`Animating scene ${scene.scene_id} with motion: ${scene.camera_motion}`);
      
      await ffmpeg.animateImage(
        imagePath,
        outputPath,
        scene.camera_motion,
        duration,
        this.config
      );

      videoMap[scene.scene_id] = outputPath;
    }

    return videoMap;
  }

  /**
   * Stitch all video clips together
   */
  async stitchVideos(scenes, videoMap, talkingHeadMap, audioMap, jobId, tempDir, outputDir) {
    log.info('Stitching videos together...');

    // Build ordered list of video files
    const videoFiles = [];
    const audioFiles = [];

    for (const scene of scenes.sort((a, b) => a.scene_id - b.scene_id)) {
      // All videos are now in videoMap (Veo generates all scenes)
      const videoPath = videoMap[scene.scene_id];

      if (!videoPath || !(await fs.pathExists(videoPath))) {
        throw new Error(`Video not found for scene ${scene.scene_id}`);
      }

      videoFiles.push(videoPath);
      
      // Get corresponding audio
      const audioPath = audioMap[scene.scene_id];
      if (audioPath && await fs.pathExists(audioPath)) {
        audioFiles.push(audioPath);
      }
    }

    // Step 1: Concatenate videos
    const concatVideoPath = path.join(tempDir, jobId, 'video', 'concat_no_audio.mp4');
    await ffmpeg.concatenateVideos(videoFiles, concatVideoPath, this.config);

    // Step 2: Ensure vertical format
    const formattedVideoPath = path.join(tempDir, jobId, 'video', 'formatted.mp4');
    await ffmpeg.ensureVerticalFormat(concatVideoPath, formattedVideoPath, this.config);

    // Step 3: Add audio (concatenate all audio first, then add to video)
    const finalOutputPath = path.join(outputDir, `output_${jobId}.mp4`);
    
    if (audioFiles.length > 0) {
      // Concatenate audio files - use M4A format (AAC codec) for better compatibility
      const concatAudioPath = path.join(tempDir, jobId, 'audio', 'full_audio.m4a');
      await ffmpeg.concatenateAudio(audioFiles, concatAudioPath, this.config);
      
      // Add concatenated audio to video
      await ffmpeg.addAudioToVideo(formattedVideoPath, concatAudioPath, finalOutputPath, this.config);
    } else {
      // No audio, just copy video
      await fs.copy(formattedVideoPath, finalOutputPath);
    }

    log.info(`Final video saved to ${finalOutputPath}`);
    return finalOutputPath;
  }

  /**
   * Calculate scene duration based on dialogue length
   */
  calculateSceneDuration(scene) {
    // Rough estimate: 150 words per minute = 2.5 words per second
    const words = scene.dialogue.split(/\s+/).length;
    const estimatedSeconds = Math.max(3, Math.min(6, words / 2.5));
    return Math.round(estimatedSeconds);
  }

  /**
   * Replace audio in video with new audio file
   */
  async replaceAudio(videoPath, audioPath, sceneId, jobId, tempDir) {
    try {
      log.info(`Replacing audio in video for scene ${sceneId}...`);

      if (!(await fs.pathExists(videoPath))) {
        throw new Error(`Video file not found: ${videoPath}`);
      }

      if (!(await fs.pathExists(audioPath))) {
        log.warn(`Audio file not found: ${audioPath}, keeping original audio`);
        return videoPath;
      }

      const outputPath = path.join(tempDir, jobId, 'video', `scene_${sceneId}_with_audio.mp4`);
      await fs.ensureDir(path.dirname(outputPath));

      // Use FFmpeg to replace audio
      await ffmpeg.addAudioToVideo(videoPath, audioPath, outputPath, this.config);

      log.info(`Audio replaced. New video saved to: ${outputPath}`);
      return outputPath;
    } catch (error) {
      log.error(`Failed to replace audio for scene ${sceneId}:`, error.message);
      // Return original video if replacement fails
      return videoPath;
    }
  }

  /**
   * Animate single image (fallback method)
   */
  async animateImage(imagePath, motion, sceneId, jobId, tempDir) {
    try {
      const outputPath = path.join(tempDir, jobId, 'video', `scene_${sceneId}.mp4`);
      await fs.ensureDir(path.dirname(outputPath));

      // Default duration
      const duration = 4;

      log.info(`Animating image for scene ${sceneId} with motion: ${motion}`);
      
      await ffmpeg.animateImage(
        imagePath,
        outputPath,
        motion,
        duration,
        this.config
      );

      return outputPath;
    } catch (error) {
      log.error(`Failed to animate image for scene ${sceneId}:`, error.message);
      throw error;
    }
  }
}

