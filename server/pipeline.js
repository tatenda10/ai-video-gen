import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs-extra';
import log from './utils/logger.js';
import { ScriptService } from './services/script.service.js';
import { ImageService } from './services/image.service.js';
import { VoiceService } from './services/voice.service.js';
import { VeoService } from './services/veo.service.js';
import { MuseTalkService } from './services/musetalk.service.js';
import { VideoService } from './services/video.service.js';
import { cleanupJob } from './utils/cleanup.js';

export class VideoPipeline {
  constructor(config) {
    this.config = config;
    this.scriptService = new ScriptService(config);
    this.imageService = new ImageService(config);
    this.voiceService = new VoiceService(config);
    this.veoService = new VeoService(config);
    this.musetalkService = new MuseTalkService(config);
    this.videoService = new VideoService(config);
    
    // Determine which video generation provider to use
    this.videoProvider = config.videoGeneration?.provider || 'musetalk';
    log.info(`Using video generation provider: ${this.videoProvider}`);
  }

  /**
   * Execute full video generation pipeline
   */
  async generateVideo(idea, tone, platform, duration, jobId = null) {
    if (!jobId) {
      jobId = uuidv4();
    }
    const jobDir = path.join(this.config.paths.temp, jobId);
    
    log.info(`Starting video generation job ${jobId}`);

    try {
      // Step 1: Generate script
      log.info('Step 1/7: Generating script...');
      const script = await this.scriptService.generateScript(idea, tone, platform, duration);
      await this.scriptService.saveScript(script, jobId, this.config.paths.temp);

      // Step 2: Generate images (parallel)
      log.info('Step 2/7: Generating images...');
      const imageMap = await this.imageService.generateAllImages(
        script.scenes,
        jobId,
        this.config.paths.temp
      );

      // Step 3: Generate voice (parallel)
      log.info('Step 3/7: Generating voice...');
      const audioMap = await this.voiceService.generateAllVoices(
        script.scenes,
        jobId,
        this.config.paths.temp
      );

      // Step 4: Generate video (only 1 scene)
      const providerName = this.videoProvider === 'musetalk' ? 'MuseTalk' : 'Veo 3.1';
      log.info(`Step 4/7: Generating video with ${providerName}...`);
      const videoMap = {};
      
      // Only process the single scene
      const scene = script.scenes[0];
      const imagePath = imageMap[scene.scene_id];
      const audioPath = audioMap[scene.scene_id];
      
      if (!imagePath) {
        throw new Error(`Image not generated for scene ${scene.scene_id}`);
      }

      if (scene.type !== 'talking_head') {
        throw new Error(`Scene must be talking_head type, got: ${scene.type}`);
      }

      let videoPath;
      
      // Generate talking-head video based on configured provider
      if (this.videoProvider === 'musetalk') {
        // MuseTalk: image + audio → video
        log.info(`Generating single talking-head video with MuseTalk...`);
        videoPath = await this.musetalkService.generateTalkingHead(
          imagePath,
          audioPath,
          scene.scene_id,
          jobId,
          this.config.paths.temp
        );
        // MuseTalk already includes audio, so we might not need to replace it
        // But we can still replace it with ElevenLabs audio for consistency
        if (audioPath && videoPath) {
          log.info(`Replacing audio with ElevenLabs audio...`);
          const finalVideoPath = await this.videoService.replaceAudio(
            videoPath,
            audioPath,
            scene.scene_id,
            jobId,
            this.config.paths.temp
          );
          videoMap[scene.scene_id] = finalVideoPath;
        } else {
          videoMap[scene.scene_id] = videoPath;
        }
      } else {
        // Veo 3.1: image + prompt → video (then replace audio)
        const audioPrompt = scene.dialogue || scene.text;
        log.info(`Generating single talking-head video with Veo 3.1...`);
        
        videoPath = await this.veoService.generateTalkingHead(
          imagePath,
          audioPrompt,
          scene.scene_id,
          jobId,
          this.config.paths.temp
        );

        // Replace audio with ElevenLabs audio if available
        if (audioPath && videoPath) {
          log.info(`Replacing audio with ElevenLabs audio...`);
          const finalVideoPath = await this.videoService.replaceAudio(
            videoPath,
            audioPath,
            scene.scene_id,
            jobId,
            this.config.paths.temp
          );
          videoMap[scene.scene_id] = finalVideoPath;
        } else {
          videoMap[scene.scene_id] = videoPath;
        }
      }

      // Step 5: Final video (only 1 scene, no stitching needed)
      log.info('Step 5/7: Preparing final video...');
      const finalVideoPathFromMap = videoMap[scene.scene_id];
      
      // Copy to output directory with proper name
      const finalVideoPath = path.join(
        this.config.paths.output,
        `video-${jobId}.mp4`
      );
      await fs.copy(finalVideoPathFromMap, finalVideoPath);
      
      log.info(`Final video saved to ${finalVideoPath}`);

      log.info(`Step 6/7: Video generation complete! Output: ${finalVideoPath}`);

      return {
        jobId,
        status: 'completed',
        outputPath: finalVideoPath,
        script,
      };
    } catch (error) {
      log.error(`Pipeline failed for job ${jobId}:`, error.message);
      
      // Cleanup on error (optional - you might want to keep for debugging)
      // await cleanupJob(jobId, this.config.paths.temp);
      
      throw error;
    }
  }
}

