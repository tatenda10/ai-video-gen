import axios from 'axios';

const API_URL = process.env.API_URL || 'http://localhost:3000';

/**
 * Generate a promotional video for Amora Companion
 */
async function generatePromoVideo() {
  try {
    console.log('🎬 Starting video generation for Amora Companion...\n');

    const requestBody = {
      idea: 'Amora Companion - Your AI-powered romantic companion. Experience meaningful conversations, emotional support, and genuine connections with advanced AI technology. Available now at amoracompanion.site',
      tone: 'warm and inviting',
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
    const maxAttempts = 120; // 10 minutes max (5 second intervals)
    
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
          
          const fs = await import('fs');
          const path = await import('path');
          const outputPath = path.join(process.cwd(), '..', 'output', `amora-companion-promo-${jobId}.mp4`);
          
          const writer = fs.createWriteStream(outputPath);
          downloadResponse.data.pipe(writer);
          
          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });
          
          console.log(`✅ Video saved to: ${outputPath}`);
          console.log(`\n🎬 Your promotional video is ready!\n`);
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
generatePromoVideo();

