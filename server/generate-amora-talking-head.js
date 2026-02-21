import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Generate a talking head video of a beautiful girl talking about Amora Companion
 */
async function generateAmoraTalkingHead() {
  try {
    console.log('🎬 Generating talking head video for Amora Companion...\n');

    const requestBody = {
      idea: 'A beautiful, warm, and friendly young woman talking directly to the camera about Amora Companion - an AI-powered romantic companion app. She should explain how Amora helps people find meaningful connections, emotional support, and genuine conversations. The tone should be warm, inviting, and personal. She should mention that it\'s available at amoracompanion.site. This should be ONE talking head scene only - just her speaking to the camera.',
      tone: 'warm, friendly, and inviting',
      platform: 'tiktok',
      duration: 30
    };

    console.log('📝 Request:', JSON.stringify(requestBody, null, 2));
    console.log('\n⏳ Sending request to server...\n');

    // Step 1: Start generation
    const generateResponse = await axios.post(`${API_URL}/generate`, requestBody);
    const { jobId, status } = generateResponse.data;

    console.log(`✅ Job started!`);
    console.log(`📋 Job ID: ${jobId}`);
    console.log(`📊 Status: ${status}\n`);

    // Step 2: Poll for status
    console.log('⏳ Waiting for video generation to complete...\n');
    
    let attempts = 0;
    const maxAttempts = 180; // 15 minutes max (5 second intervals) - longer for SadTalker processing
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
      try {
        const statusResponse = await axios.get(`${API_URL}/status/${jobId}`);
        const jobStatus = statusResponse.data;
        
        console.log(`[${new Date().toLocaleTimeString()}] Status: ${jobStatus.status} (Attempt ${attempts + 1}/${maxAttempts})`);
        
        if (jobStatus.status === 'completed') {
          console.log('\n🎉 Video generation completed!\n');
          console.log('📥 Downloading video...\n');
          
          // Step 3: Download video
          const downloadResponse = await axios.get(`${API_URL}/download/${jobId}`, {
            responseType: 'stream'
          });
          
          const outputDir = path.join(__dirname, '..', 'output');
          await fs.promises.mkdir(outputDir, { recursive: true });
          const outputPath = path.join(outputDir, `amora-talking-head-${jobId}.mp4`);
          
          const writer = fs.createWriteStream(outputPath);
          downloadResponse.data.pipe(writer);
          
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
          
          console.log(`✅ Video saved to: ${outputPath}`);
          console.log(`\n🎬 Your talking head video is ready!\n`);
          console.log(`📹 The video features a beautiful girl talking about Amora Companion`);
          console.log(`🔗 Visit: amoracompanion.site\n`);
          return;
        } else if (jobStatus.status === 'failed') {
          console.error('\n❌ Video generation failed!');
          console.error('Error:', jobStatus.error || 'Unknown error');
          return;
        }
      } catch (error) {
        if (error.response?.status === 404) {
          console.log('⏳ Job not found yet, waiting...');
        } else {
          console.error('Error checking status:', error.message);
        }
      }
      
      attempts++;
    }
    
    console.error('\n⏱️  Timeout: Video generation is taking longer than expected.');
    console.log(`Check status manually: curl ${API_URL}/status/${jobId}`);
    
  } catch (error) {
    console.error('\n❌ Error generating video:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

// Run the script
generateAmoraTalkingHead();

