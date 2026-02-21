import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import config from './config.js';
import log from './utils/logger.js';
import { VideoPipeline } from './pipeline.js';
import { cleanupJob } from './utils/cleanup.js';

const app = express();
app.use(express.json());

// Store job statuses in memory (use Redis/DB in production)
const jobStatuses = new Map();

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * POST /generate
 * Generate a video from an idea
 */
app.post('/generate', async (req, res) => {
  try {
    const { idea, tone = 'engaging', platform = 'tiktok', duration = 30 } = req.body;

    if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'idea is required and must be a non-empty string',
      });
    }

    if (duration < 10 || duration > 60) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'duration must be between 10 and 60 seconds',
      });
    }

    // Generate job ID first
    const jobId = uuidv4();

    // Initialize job status
    jobStatuses.set(jobId, {
      status: 'processing',
      progress: 0,
      createdAt: new Date().toISOString(),
    });

    // Initialize pipeline and start generation asynchronously
    const pipeline = new VideoPipeline(config);
    
    pipeline.generateVideo(idea, tone, platform, duration, jobId)
      .then(result => {
        jobStatuses.set(jobId, {
          status: 'completed',
          progress: 100,
          outputPath: result.outputPath,
          outputUrl: `/download/${jobId}`,
          createdAt: jobStatuses.get(jobId)?.createdAt || new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
        log.info(`Job ${jobId} completed successfully`);
      })
      .catch(error => {
        jobStatuses.set(jobId, {
          status: 'failed',
          progress: 0,
          error: error.message,
          createdAt: jobStatuses.get(jobId)?.createdAt || new Date().toISOString(),
          failedAt: new Date().toISOString(),
        });
        log.error(`Job ${jobId} failed:`, error.message);
      });

    res.status(202).json({
      jobId,
      status: 'processing',
      message: 'Video generation started',
    });
  } catch (error) {
    log.error('Generate endpoint error:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

/**
 * GET /status/:jobId
 * Get status of a video generation job
 */
app.get('/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const status = jobStatuses.get(jobId);

  if (!status) {
    return res.status(404).json({
      error: 'Not found',
      message: `Job ${jobId} not found`,
    });
  }

  res.json(status);
});

/**
 * GET /download/:jobId
 * Download the generated video
 */
app.get('/download/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const status = jobStatuses.get(jobId);

  if (!status) {
    return res.status(404).json({
      error: 'Not found',
      message: `Job ${jobId} not found`,
    });
  }

  if (status.status !== 'completed' || !status.outputPath) {
    return res.status(400).json({
      error: 'Not ready',
      message: `Job ${jobId} is not completed yet`,
    });
  }

  const filePath = status.outputPath;
  
  if (!(await fs.pathExists(filePath))) {
    return res.status(404).json({
      error: 'File not found',
      message: 'Video file was not found on server',
    });
  }

  const fileName = path.basename(filePath);
  res.download(filePath, fileName, (err) => {
    if (err) {
      log.error('Download error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Download failed' });
      }
    }
  });
});

/**
 * DELETE /jobs/:jobId
 * Delete a job and clean up files
 */
app.delete('/jobs/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const status = jobStatuses.get(jobId);

  if (!status) {
    return res.status(404).json({
      error: 'Not found',
      message: `Job ${jobId} not found`,
    });
  }

  try {
    await cleanupJob(jobId, config.paths.temp);
    
    // Delete output file if exists
    if (status.outputPath && await fs.pathExists(status.outputPath)) {
      await fs.remove(status.outputPath);
    }

    jobStatuses.delete(jobId);

    res.json({
      message: `Job ${jobId} deleted successfully`,
    });
  } catch (error) {
    log.error('Delete job error:', error.message);
    res.status(500).json({
      error: 'Failed to delete job',
      message: error.message,
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  log.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Start server
const PORT = config.server.port;
app.listen(PORT, () => {
  log.info(`Server running on port ${PORT}`);
  log.info(`Health check: http://localhost:${PORT}/health`);
  log.info(`API docs: POST /generate, GET /status/:jobId, GET /download/:jobId`);
});

