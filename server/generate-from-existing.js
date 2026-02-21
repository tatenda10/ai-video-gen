/**
 * Generate talking-head video from EXISTING image and audio (no script/image/voice API calls).
 * Usage:
 *   node generate-from-existing.js
 *   node generate-from-existing.js path/to/image.png path/to/audio.wav
 *   node generate-from-existing.js path/to/folder   (folder must contain image.png + audio.wav or scene_1.png + scene_1.wav)
 *
 * Default folder if no args: server/existing-assets/ (image.png, audio.wav)
 */
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = (await import('./config.js')).default;
const { LipsyncService } = await import('./services/lipsync.service.js');

const DEFAULT_ASSETS_DIR = path.join(__dirname, 'existing-assets');
const OUTPUT_DIR = config.paths.output;

async function findImageAndAudio(dir) {
  // Previous pipeline job dir (tmp/<jobId>) with images/ and audio/
  const imagesDir = path.join(dir, 'images');
  const audioDir = path.join(dir, 'audio');
  if (await fs.pathExists(imagesDir) && await fs.pathExists(audioDir)) {
    const candidates = [['scene_1.png', 'scene_1.wav'], ['scene_1.png', 'scene_1.mp3'], ['image.png', 'audio.wav']];
    for (const [imgName, audName] of candidates) {
      const ip = path.join(imagesDir, imgName);
      const ap = path.join(audioDir, audName);
      if (await fs.pathExists(ip) && await fs.pathExists(ap)) return { imagePath: ip, audioPath: ap };
    }
  }
  // Flat folder: image.png + audio.wav or scene_1.png + scene_1.wav
  const candidates = [
    ['image.png', 'audio.wav'],
    ['image.jpg', 'audio.wav'],
    ['scene_1.png', 'scene_1.wav'],
    ['scene_1.png', 'scene_1.mp3'],
  ];
  for (const [imgName, audName] of candidates) {
    const ip = path.join(dir, imgName);
    const ap = path.join(dir, audName);
    if (await fs.pathExists(ip) && await fs.pathExists(ap)) return { imagePath: ip, audioPath: ap };
  }
  return null;
}

async function main() {
  let imagePath, audioPath;

  const args = process.argv.slice(2);
  if (args.length >= 2) {
    imagePath = path.resolve(args[0]);
    audioPath = path.resolve(args[1]);
  } else if (args.length === 1) {
    let dir = path.resolve(args[0]);
    // If arg looks like a job ID (UUID), look in config temp dir
    if (!dir.includes(path.sep) && dir.length >= 32 && /^[0-9a-f-]+$/i.test(dir)) {
      dir = path.join(config.paths.temp, dir);
    }
    const found = await findImageAndAudio(dir);
    if (!found) {
      console.error('Folder must contain images/scene_1.png + audio/scene_1.wav (or image.png + audio.wav in folder)');
      console.error('Tried:', dir);
      process.exit(1);
    }
    imagePath = found.imagePath;
    audioPath = found.audioPath;
  } else {
    const found = await findImageAndAudio(DEFAULT_ASSETS_DIR);
    if (!found) {
      console.error('No image/audio found. Either:');
      console.error('  1. Put image.png and audio.wav in server/existing-assets/');
      console.error('  2. Run: node generate-from-existing.js path/to/image.png path/to/audio.wav');
      console.error('  3. Run: node generate-from-existing.js path/to/folder/');
      process.exit(1);
    }
    imagePath = found.imagePath;
    audioPath = found.audioPath;
  }

  if (!(await fs.pathExists(imagePath))) {
    console.error('Image not found:', imagePath);
    process.exit(1);
  }
  if (!(await fs.pathExists(audioPath))) {
    console.error('Audio not found:', audioPath);
    process.exit(1);
  }

  if (!config.sadtalker?.apiUrl) {
    console.error('SADTALKER_API_URL not set in .env');
    process.exit(1);
  }

  console.log('Using image:', imagePath);
  console.log('Using audio:', audioPath);
  console.log('SadTalker API:', config.sadtalker.apiUrl);
  console.log('');

  const jobId = uuidv4();
  const lipsync = new LipsyncService(config);

  try {
    const videoPath = await lipsync.generateTalkingHead(
      imagePath,
      audioPath,
      'scene_1',
      jobId,
      config.paths.temp
    );
    await fs.ensureDir(OUTPUT_DIR);
    const outName = `talking-head-from-existing-${Date.now()}.mp4`;
    const outPath = path.join(OUTPUT_DIR, outName);
    await fs.copy(videoPath, outPath);
    console.log('Video saved to:', outPath);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exit(1);
  }
}

main();
