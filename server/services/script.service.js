import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs-extra';
import path from 'path';
import log from '../utils/logger.js';

export class ScriptService {
  constructor(config) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.anthropic.apiKey,
    });
  }

  /**
   * Generate script from user idea using Anthropic Claude
   */
  async generateScript(idea, tone = 'engaging', platform = 'tiktok', duration = 30) {
    try {
      log.info(`Generating script for idea: ${idea.substring(0, 50)}...`);

      if (!this.config.anthropic.apiKey) {
        throw new Error('Anthropic API key is missing. Please set ANTHROPIC_API_KEY in your .env file.');
      }

      const prompt = this.buildPrompt(idea, tone, platform, duration);
      
      const response = await this.client.messages.create({
        model: this.config.anthropic.model,
        max_tokens: 4096,
        temperature: 0.8,
        system: 'You are an AI video script generator optimized for short-form vertical videos. Always return valid JSON only, no markdown, no code blocks, no explanations - just the JSON object.',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text from response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Anthropic API');
      }

      let scriptText = content.text.trim();
      
      // Remove markdown code blocks if present
      scriptText = scriptText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      
      const script = JSON.parse(scriptText);

      // Validate script structure
      this.validateScript(script);

      log.info(`Script generated: ${script.scenes.length} scenes`);
      return script;
    } catch (error) {
      log.error('Script generation failed:', error.message);
      
      if (error.message.includes('API key')) {
        throw new Error(`Anthropic API key is invalid or missing. Please check your ANTHROPIC_API_KEY environment variable.`);
      }
      
      if (error instanceof SyntaxError) {
        log.error('Failed to parse JSON response:', error.message);
        throw new Error(`Script generation failed: Invalid JSON response from API. ${error.message}`);
      }
      
      throw new Error(`Script generation failed: ${error.message}`);
    }
  }

  /**
   * Build prompt for Anthropic Claude
   */
  buildPrompt(idea, tone, platform, duration) {
    return `You are an AI video script generator optimized for short-form vertical videos.

Rules:
- Spoken language only
- Short sentences (max 12 words)
- High retention pacing
- Think visually
- ONLY ONE SCENE - must be talking_head type
- Scene duration should match total video duration
- visual_prompt must describe "a beautiful person holding a smartphone showing the screen, portrait orientation, looking at camera"

Return ONLY valid JSON, no markdown, no code blocks, no explanations.

Generate a ${duration} second script about:
${idea}

Tone: ${tone}
Platform: ${platform}

Return JSON in this exact format:
{
  "title": "string",
  "duration_seconds": ${duration},
  "scenes": [
    {
      "scene_id": 1,
      "type": "talking_head",
      "dialogue": "Short spoken sentence optimized for AI voice. This should be the full script for the ${duration} second video.",
      "visual_prompt": "A beautiful person holding a smartphone showing the screen, portrait orientation, looking at camera, natural lighting, professional quality",
      "camera_motion": "static"
    }
  ]
}`;
  }

  /**
   * Validate script structure
   */
  validateScript(script) {
    if (!script.title || !script.scenes || !Array.isArray(script.scenes)) {
      throw new Error('Invalid script structure: missing title or scenes');
    }

    // Must have exactly 1 scene
    if (script.scenes.length !== 1) {
      throw new Error('Script must have exactly 1 scene');
    }

    const scene = script.scenes[0];
    
    if (!scene.scene_id || !scene.type || !scene.dialogue || !scene.visual_prompt || !scene.camera_motion) {
      throw new Error(`Invalid scene structure: ${JSON.stringify(scene)}`);
    }

    // Must be talking_head type
    if (scene.type !== 'talking_head') {
      throw new Error(`Scene must be talking_head type, got: ${scene.type}`);
    }

    // Validate visual_prompt contains phone/smartphone
    if (!scene.visual_prompt.toLowerCase().includes('phone') && !scene.visual_prompt.toLowerCase().includes('smartphone')) {
      throw new Error('visual_prompt must include "phone" or "smartphone"');
    }
  }

  /**
   * Save script to file
   */
  async saveScript(script, jobId, tempDir) {
    const scriptPath = path.join(tempDir, jobId, 'script.json');
    await fs.ensureDir(path.dirname(scriptPath));
    await fs.writeJson(scriptPath, script, { spaces: 2 });
    log.info(`Script saved to ${scriptPath}`);
    return scriptPath;
  }
}
