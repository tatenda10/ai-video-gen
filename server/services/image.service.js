import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import log from '../utils/logger.js';

export class ImageService {
  constructor(config) {
    this.config = config;
    this.apiKey = config.google.apiKey;
    this.model = config.google.model;
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  }

  /**
   * Generate image for a scene using Google Gemini API
   * Based on: ai.google.dev/gemini-api/docs/image-generation
   */
  async generateImage(visualPrompt, sceneId, jobId, tempDir) {
    try {
      log.info(`Generating image for scene ${sceneId} using Gemini API...`);

      if (!this.apiKey) {
        throw new Error('Google API key is missing. Please set GOOGLE_API_KEY in your .env file.');
      }

      if (!this.model) {
        throw new Error('Google model is missing. Please set GOOGLE_MODEL in your .env file.');
      }

      // Enhance prompt for 9:16 aspect ratio and no text
      // For talking head scenes, ensure it includes phone with screen visible
      let enhancedPrompt = `${visualPrompt}. Vertical 9:16 aspect ratio (1080x1920), cinematic quality, high resolution, professional photography, no text, no words, no letters, no watermarks, no signatures.`;
      
      // If it's a talking head scene, ensure phone screen is visible
      if (visualPrompt.toLowerCase().includes('phone') || visualPrompt.toLowerCase().includes('smartphone') || visualPrompt.toLowerCase().includes('holding')) {
        enhancedPrompt = `${visualPrompt}. The person is holding a smartphone in portrait orientation, the phone screen is clearly visible and shows app content or interface. Close-up shot, person looking at camera. Vertical 9:16 aspect ratio (1080x1920), cinematic quality, high resolution, professional photography, no text overlays, no watermarks, no signatures.`;
      }
      
      log.info(`Image generation prompt for scene ${sceneId}: ${enhancedPrompt.substring(0, 200)}...`);

      // Use Gemini image generation endpoint
      // According to documentation: POST /v1beta/models/{model}:generateContent
      const url = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

      // Build generation config according to Gemini image generation documentation
      const imageConfig = {
        aspectRatio: '9:16'
      };

      // Add imageSize only for gemini-3-pro-image-preview
      if (this.model === 'gemini-3-pro-image-preview') {
        imageConfig.imageSize = '1K'; // Options: "1K", "2K", "4K"
      }

      const requestBody = {
        contents: [{
          parts: [{
            text: enhancedPrompt
          }]
        }],
        generationConfig: {
          imageConfig: imageConfig
        }
      };

      log.debug(`Calling Gemini API: ${url}`);
      log.debug(`Request body:`, JSON.stringify(requestBody, null, 2));

      const response = await axios.post(url, requestBody, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Parse response according to Gemini API format
      // Response format: response.candidates[0].content.parts[0].inlineData or inline_data
      const candidates = response.data?.candidates || [];
      
      if (candidates.length === 0) {
        log.error('No candidates in response. Full response:', JSON.stringify(response.data, null, 2));
        throw new Error('No candidates returned from Gemini API');
      }

      const candidate = candidates[0];
      const content = candidate?.content;
      const parts = content?.parts || [];

      log.debug(`Found ${parts.length} parts in response`);

      let imageData = null;
      let mimeType = 'image/png';

      // Find the image part - check for both inlineData and inline_data (different SDK versions)
      const imagePart = parts.find(part => 
        part.inlineData || part.inline_data
      );

      if (imagePart) {
        // Handle both inlineData and inline_data naming conventions
        const imgData = imagePart.inlineData || imagePart.inline_data;
        
        if (imgData && imgData.data) {
          imageData = imgData.data; // Base64 string
          mimeType = imgData.mimeType || imgData.mime_type || 'image/png';
          log.info(`Found image data: ${mimeType}, size: ${imageData.length} bytes`);
        }
      }

      // Also check text parts for debugging
      const textParts = parts.filter(part => part.text);
      if (textParts.length > 0) {
        log.debug(`Text parts found: ${textParts.map(p => p.text.substring(0, 100)).join('...')}`);
      }

      if (!imageData) {
        // Log full response for debugging
        log.error('No image data found in response.');
        log.error('Full API response:', JSON.stringify(response.data, null, 2));
        log.error('Response parts:', JSON.stringify(parts, null, 2));
        throw new Error('No image data found in API response. Make sure you are using an image generation model like gemini-2.5-flash-image or gemini-3-pro-image-preview.');
      }

      const imagePath = path.join(tempDir, jobId, 'images', `scene_${sceneId}.png`);
      await fs.ensureDir(path.dirname(imagePath));

      // Convert base64 to buffer and save
      const imageBuffer = Buffer.from(imageData, 'base64');
      await fs.writeFile(imagePath, imageBuffer);

      log.info(`Image saved to ${imagePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);
      return imagePath;
    } catch (error) {
      log.error(`Image generation failed for scene ${sceneId}:`, error.message);
      
      if (error.response) {
        log.error('API Error Status:', error.response.status);
        log.error('API Error Data:', JSON.stringify(error.response.data, null, 2));
        
        if (error.response.status === 401) {
          throw new Error(`Google API key is invalid or missing. Please check your GOOGLE_API_KEY environment variable.`);
        }
        
        if (error.response.status === 404) {
          throw new Error(`Model ${this.model} not found. Please check the model name. Use gemini-2.5-flash-image or gemini-3-pro-image-preview for image generation.`);
        }
      }
      
      throw error;
    }
  }

  /**
   * Generate all scene images in parallel
   */
  async generateAllImages(scenes, jobId, tempDir) {
    const imagePromises = scenes.map(scene =>
      this.generateImage(scene.visual_prompt, scene.scene_id, jobId, tempDir)
        .then(path => ({ sceneId: scene.scene_id, path }))
        .catch(error => {
          log.error(`Failed to generate image for scene ${scene.scene_id}:`, error.message);
          throw error;
        })
    );

    const results = await Promise.all(imagePromises);
    
    // Return map of scene_id to image path
    const imageMap = {};
    results.forEach(({ sceneId, path }) => {
      imageMap[sceneId] = path;
    });

    return imageMap;
  }
}
