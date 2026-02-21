import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const config = {
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.ANTHROPIC_MODEL,
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY,
    model: process.env.GOOGLE_MODEL,
  },
  elevenlabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    baseUrl: process.env.ELEVENLABS_BASE_URL,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
  },
  sadtalker: {
    apiUrl: process.env.SADTALKER_API_URL,
  },
  musetalk: {
    apiUrl: process.env.MUSETALK_API_URL || 'http://localhost:5001',
  },
  videoGeneration: {
    provider: process.env.VIDEO_GENERATION_PROVIDER || 'musetalk', // 'musetalk' or 'veo'
  },
  ffmpeg: {
    path: process.env.FFMPEG_PATH,
  },
  paths: {
    output: process.env.OUTPUT_DIR || join(__dirname, '../output'),
    temp: process.env.TEMP_DIR || join(__dirname, '../tmp'),
  },
  server: {
    port: process.env.PORT,
  },
};

// Ensure directories exist
await fs.ensureDir(config.paths.output);
await fs.ensureDir(config.paths.temp);
await fs.ensureDir(join(config.paths.temp, 'images'));
await fs.ensureDir(join(config.paths.temp, 'audio'));
await fs.ensureDir(join(config.paths.temp, 'video'));

export default config;

