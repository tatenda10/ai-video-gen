import fs from 'fs-extra';
import path from 'path';
import log from './logger.js';

/**
 * Clean up temporary files for a specific job
 */
export async function cleanupJob(jobId, tempDir) {
  try {
    const jobDir = path.join(tempDir, jobId);
    if (await fs.pathExists(jobDir)) {
      await fs.remove(jobDir);
      log.info(`Cleaned up temp files for job ${jobId}`);
    }
  } catch (error) {
    log.error(`Failed to cleanup job ${jobId}:`, error.message);
  }
}

/**
 * Clean up old temporary files (older than specified hours)
 */
export async function cleanupOldFiles(tempDir, maxAgeHours = 24) {
  try {
    const entries = await fs.readdir(tempDir);
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    for (const entry of entries) {
      const entryPath = path.join(tempDir, entry);
      const stats = await fs.stat(entryPath);
      
      if (now - stats.mtimeMs > maxAge) {
        await fs.remove(entryPath);
        log.info(`Cleaned up old file: ${entry}`);
      }
    }
  } catch (error) {
    log.error('Failed to cleanup old files:', error.message);
  }
}

