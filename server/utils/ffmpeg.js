import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import log from './logger.js';

const execAsync = promisify(exec);

/**
 * Execute FFmpeg command
 */
export async function executeFFmpeg(command, config) {
  try {
    const fullCommand = `${config.ffmpeg.path} ${command}`;
    log.debug(`Executing FFmpeg: ${fullCommand}`);
    
    const { stdout, stderr } = await execAsync(fullCommand);
    if (stderr && !stderr.includes('frame=')) {
      log.warn('FFmpeg stderr:', stderr);
    }
    return { success: true, stdout, stderr };
  } catch (error) {
    log.error('FFmpeg error:', error.message);
    throw error;
  }
}

/**
 * Animate image with camera motion
 */
export async function animateImage(inputPath, outputPath, motion, duration, config) {
  const fps = 30;
  const totalFrames = fps * duration;
  const targetWidth = 1080;
  const targetHeight = 1920;
  
  let filterComplex = '';
  
  switch (motion) {
    case 'slow zoom in':
      // Zoom in from 1.0 to 1.1 over duration
      // Scale first to ensure image fits target size, then zoom
      filterComplex = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='min(zoom+0.001,1.1)':d=${totalFrames}:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):s=${targetWidth}x${targetHeight}`;
      break;
      
    case 'slow zoom out':
      // Zoom out from 1.1 to 1.0 over duration
      filterComplex = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight},zoompan=z='if(lte(zoom,1.0),1.1,max(1.0,zoom-0.001))':d=${totalFrames}:x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):s=${targetWidth}x${targetHeight}`;
      break;
      
    case 'pan left':
      // Pan from right to left
      // Scale image larger than target to allow panning, then crop with moving position
      // Simplified: scale to fit height, center crop (pan effect can be enhanced later)
      filterComplex = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(iw-ow)/2:(ih-oh)/2`;
      break;
      
    case 'pan right':
      // Pan from left to right
      // Simplified: scale to fit height, center crop (pan effect can be enhanced later)
      filterComplex = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=increase,crop=${targetWidth}:${targetHeight}:(iw-ow)/2:(ih-oh)/2`;
      break;
      
    case 'static':
    default:
      // Simple static image to video - scale and pad to fit target size
      filterComplex = `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black`;
      break;
  }
  
  const command = `-loop 1 -i "${inputPath}" -vf "${filterComplex}" -t ${duration} -r ${fps} -pix_fmt yuv420p "${outputPath}"`;
  
  return executeFFmpeg(command, config);
}

/**
 * Concatenate video files
 */
export async function concatenateVideos(videoFiles, outputPath, config) {
  const listPath = path.join(path.dirname(outputPath), 'concat_list.txt');
  
  // Create concat file list
  const listContent = videoFiles.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listPath, listContent);
  
  const command = `-f concat -safe 0 -i "${listPath}" -c copy "${outputPath}"`;
  
  try {
    await executeFFmpeg(command, config);
    await fs.remove(listPath); // Clean up list file
    return { success: true };
  } catch (error) {
    await fs.remove(listPath); // Clean up even on error
    throw error;
  }
}

/**
 * Concatenate audio files
 */
export async function concatenateAudio(audioFiles, outputPath, config) {
  const listPath = path.join(path.dirname(outputPath), 'audio_concat_list.txt');
  
  // Create concat file list
  const listContent = audioFiles.map(file => `file '${file.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listPath, listContent);
  
  // Determine output format based on file extension
  const outputExt = path.extname(outputPath).toLowerCase();
  let audioCodec = 'aac';
  let outputFormat = 'mp4'; // Default container for AAC
  
  if (outputExt === '.mp3') {
    // For MP3 output, use libmp3lame codec
    audioCodec = 'libmp3lame';
    outputFormat = 'mp3';
  } else if (outputExt === '.wav') {
    // For WAV, use pcm_s16le (uncompressed)
    audioCodec = 'pcm_s16le';
    outputFormat = 'wav';
  } else if (outputExt === '.m4a' || outputExt === '.aac') {
    // For M4A/AAC, use AAC codec
    audioCodec = 'aac';
    outputFormat = 'mp4';
  }
  
  // Build command with proper format and codec
  const command = `-f concat -safe 0 -i "${listPath}" -c:a ${audioCodec} -f ${outputFormat} "${outputPath}"`;
  
  try {
    await executeFFmpeg(command, config);
    await fs.remove(listPath); // Clean up list file
    return { success: true };
  } catch (error) {
    await fs.remove(listPath); // Clean up even on error
    throw error;
  }
}

/**
 * Add audio to video
 */
export async function addAudioToVideo(videoPath, audioPath, outputPath, config) {
  const command = `-i "${videoPath}" -i "${audioPath}" -c:v copy -c:a aac -shortest "${outputPath}"`;
  return executeFFmpeg(command, config);
}

/**
 * Ensure video is 9:16 aspect ratio (1080x1920)
 */
export async function ensureVerticalFormat(inputPath, outputPath, config) {
  const command = `-i "${inputPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -r 30 -c:v libx264 -preset medium -crf 23 "${outputPath}"`;
  return executeFFmpeg(command, config);
}

