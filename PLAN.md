# AI Short-Form Video Generation MVP - Implementation Plan

## Executive Summary

This document outlines the technical plan for building an automated pipeline that generates short-form vertical AI videos (TikTok/Reels/Shorts format). The system will orchestrate multiple AI services to create scripted, narrated, and visually animated videos without manual intervention.

---

## Technology Stack Deep Dive

### Core Runtime
**Node.js (v18+)**
- **Why**: Excellent async/await support, rich ecosystem for API integrations, native file system operations
- **Role**: Main orchestration layer, API server, service coordination
- **Alternatives Considered**: Python (better for ML, but Node.js preferred per spec for API-heavy workload)

### Video Processing
**FFmpeg**
- **Why**: Industry-standard, handles all video operations (encoding, decoding, filtering, concatenation)
- **Role**: 
  - Image-to-video conversion with motion effects (zoom, pan)
  - Video concatenation
  - Audio/video synchronization
  - Format conversion (9:16 vertical, 30fps)
- **Installation**: Local binary or Docker container
- **Key Operations**:
  - `zoompan` filter for zoom effects
  - `crop` + position for pan effects
  - `concat` demuxer for stitching clips
  - Audio mixing and sync

### AI Services

#### 1. Script Generation: OpenAI GPT-4/3.5
- **API**: OpenAI Chat Completions API
- **Why**: Best-in-class for structured JSON generation, understands context and tone
- **Role**: Convert user idea → structured script with scenes, dialogue, visual prompts
- **Key Features**:
  - Structured output (JSON schema)
  - Tone/style control
  - Platform-specific optimization
- **Cost**: Pay-per-token (~$0.01-0.03 per video script)

#### 2. Image Generation: Nano Banana
- **API**: Nano Banana Image Generation API
- **Why**: Fast, cost-effective, good quality for scene generation
- **Role**: Generate 9:16 aspect ratio images from visual prompts
- **Key Requirements**:
  - Consistent character appearance across scenes
  - No text in images
  - Cinematic quality
- **Alternative**: Midjourney API, Stable Diffusion API, DALL-E 3
- **Note**: May need to verify actual API endpoint structure

#### 3. Voice Synthesis: ElevenLabs
- **API**: ElevenLabs Text-to-Speech API
- **Why**: Most natural-sounding AI voice, excellent for short-form content
- **Role**: Convert dialogue text → natural-sounding speech audio
- **Key Features**:
  - Voice cloning (optional)
  - Emotion control
  - High clarity settings
- **Cost**: Pay-per-character (~$0.18 per 1000 characters)
- **Output Format**: WAV/MP3

#### 4. Lip Sync: SadTalker
- **Technology**: Python-based ML model (PyTorch)
- **Why**: Open-source, good quality talking-head generation
- **Role**: Generate talking-head video from image + audio
- **Challenge**: Requires Python environment, GPU preferred (CPU fallback possible)
- **Integration Strategy**:
  - Option A: Python subprocess from Node.js (spawn process)
  - Option B: Python Flask API wrapper (microservice)
  - Option C: Docker container with API endpoint
- **Input**: Image (PNG) + Audio (WAV)
- **Output**: MP4 video with lip-synced talking head
- **Performance**: ~10-30 seconds per clip (GPU), ~1-2 minutes (CPU)

---

## Architecture Design

### Service-Oriented Pipeline

```
┌─────────────┐
│   Client    │
│  (Browser/  │
│   API Call) │
└──────┬──────┘
       │ POST /generate
       │ { idea, tone, platform, duration }
       ▼
┌─────────────────────────────────────┐
│      Express API Server             │
│  (src/server.js)                    │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│    Pipeline Orchestrator            │
│  (src/pipeline.js)                  │
│  - Sequential execution              │
│  - Error handling                   │
│  - Cleanup management                │
└──────┬──────────────────────────────┘
       │
       ├──► Script Service ──────► OpenAI API
       │    (script.service.js)
       │
       ├──► Image Service ───────► Nano Banana API
       │    (image.service.js)
       │
       ├──► Voice Service ───────► ElevenLabs API
       │    (voice.service.js)
       │
       ├──► Lipsync Service ─────► SadTalker (Python)
       │    (lipsync.service.js)
       │
       └──► Video Service ───────► FFmpeg (local)
            (video.service.js)
```

### Data Flow

1. **Input**: User idea + metadata
2. **Script Generation**: Idea → JSON script with scenes
3. **Image Generation**: Visual prompts → Scene images (parallel)
4. **Voice Generation**: Dialogue → Audio files (parallel)
5. **Lipsync Generation**: Image + Audio → Talking-head video (only for talking_head scenes)
6. **Video Animation**: Static images → Animated clips (FFmpeg)
7. **Video Stitching**: All clips + audio → Final MP4
8. **Output**: `output.mp4` file

### File Structure

```
ai-video-gen/
├── src/
│   ├── server.js              # Express API server
│   ├── config.js              # Environment config loader
│   ├── pipeline.js            # Main orchestration logic
│   ├── services/
│   │   ├── script.service.js  # OpenAI integration
│   │   ├── image.service.js   # Nano Banana integration
│   │   ├── voice.service.js   # ElevenLabs integration
│   │   ├── lipsync.service.js # SadTalker wrapper
│   │   └── video.service.js   # FFmpeg operations
│   └── utils/
│       ├── ffmpeg.js          # FFmpeg command builders
│       ├── cleanup.js          # Temp file management
│       └── logger.js           # Logging utility
├── tmp/                        # Temporary files (gitignored)
│   ├── images/                 # Generated scene images
│   ├── audio/                  # Generated voice files
│   └── video/                  # Intermediate video clips
├── output/                     # Final videos (gitignored)
├── .env                        # Environment variables
├── .env.example                # Template
├── package.json
├── README.md
└── PLAN.md                     # This file
```

---

## Implementation Phases

### Phase 1: Foundation (Day 1)
**Goal**: Set up project structure and basic infrastructure

- [ ] Initialize Node.js project with dependencies
- [ ] Create environment configuration system
- [ ] Set up directory structure (tmp, output)
- [ ] Create Express server skeleton
- [ ] Implement basic error handling and logging
- [ ] Create cleanup utilities for temp files

**Deliverable**: Server runs, accepts requests, manages temp directories

---

### Phase 2: Script Generation (Day 1-2)
**Goal**: Convert user idea into structured script

- [ ] Implement OpenAI API client
- [ ] Create prompt template system
- [ ] Build JSON schema validation
- [ ] Handle API errors and retries
- [ ] Save script to `/tmp/script.json`

**Deliverable**: `/generate` endpoint returns structured script JSON

**Testing**: Verify script structure matches data contract exactly

---

### Phase 3: Image Generation (Day 2)
**Goal**: Generate scene images from visual prompts

- [ ] Research Nano Banana API (verify endpoints, auth)
- [ ] Implement image generation service
- [ ] Handle 9:16 aspect ratio requirement
- [ ] Save images to `/tmp/images/scene_{id}.png`
- [ ] Implement parallel generation for multiple scenes

**Deliverable**: All scene images generated and saved

**Note**: May need to adjust for actual Nano Banana API structure

---

### Phase 4: Voice Generation (Day 2-3)
**Goal**: Generate natural-sounding voice audio

- [ ] Implement ElevenLabs API client
- [ ] Create per-scene audio generation
- [ ] Configure voice settings (stability, clarity)
- [ ] Save audio files to `/tmp/audio/scene_{id}.wav`
- [ ] Optionally create concatenated full audio file

**Deliverable**: Audio files for each scene with dialogue

---

### Phase 5: Lipsync Integration (Day 3-4)
**Goal**: Generate talking-head videos from images + audio

**Challenge**: SadTalker is Python-based, needs integration strategy

**Option A: Python Subprocess** (Simplest)
- Spawn Python process from Node.js
- Pass image + audio paths as arguments
- Wait for output video
- **Pros**: Simple, no extra services
- **Cons**: Blocking, harder error handling

**Option B: Python Flask API** (Recommended)
- Create lightweight Python Flask wrapper
- Expose `/generate` endpoint
- Node.js calls via HTTP
- **Pros**: Non-blocking, better error handling, scalable
- **Cons**: Requires Python environment setup

**Option C: Docker Container** (Production-ready)
- Containerize SadTalker with API
- Run as microservice
- **Pros**: Isolated, GPU support, scalable
- **Cons**: More complex setup

**Implementation Steps**:
- [ ] Choose integration strategy (recommend Option B)
- [ ] Set up Python environment (if needed)
- [ ] Create SadTalker wrapper service
- [ ] Implement Node.js service to call it
- [ ] Handle only `talking_head` scene types
- [ ] Save output to `/tmp/video/talking_head_{id}.mp4`

**Deliverable**: Talking-head videos generated for designated scenes

---

### Phase 6: Video Animation (Day 4)
**Goal**: Animate static images with camera motion

- [ ] Implement FFmpeg command builders for each motion type:
  - `slow zoom in`: zoompan filter
  - `slow zoom out`: reverse zoompan
  - `pan left/right`: crop + position animation
  - `static`: simple image-to-video conversion
- [ ] Calculate timing based on scene duration
- [ ] Generate animated clips to `/tmp/video/scene_{id}.mp4`
- [ ] Handle only `image_scene` types (skip talking_head)

**Deliverable**: All image scenes converted to animated video clips

---

### Phase 7: Video Stitching (Day 4-5)
**Goal**: Combine all clips into final video

- [ ] Create FFmpeg concat file list (ordered by scene_id)
- [ ] Concatenate video clips
- [ ] Mix audio track (full voice or per-scene)
- [ ] Ensure 9:16 aspect ratio (1080x1920)
- [ ] Set 30fps
- [ ] Export to `/output/output.mp4`

**Deliverable**: Single playable MP4 file

---

### Phase 8: Integration & Testing (Day 5)
**Goal**: End-to-end pipeline working

- [ ] Connect all services in pipeline orchestrator
- [ ] Implement sequential execution with error handling
- [ ] Add progress tracking/logging
- [ ] Test with various inputs
- [ ] Optimize render time (< 2 minutes target)
- [ ] Clean up temp files after completion
- [ ] Handle edge cases (no talking_head, single scene, etc.)

**Deliverable**: Complete working MVP

---

## Technical Challenges & Solutions

### Challenge 1: SadTalker Integration
**Problem**: Python ML model needs to run from Node.js

**Solution**: 
- Create Python Flask microservice
- Expose REST API endpoint
- Node.js calls via HTTP with image/audio paths
- Handle async execution (polling or webhooks)

**Fallback**: If SadTalker setup is complex, can skip talking_head feature initially

---

### Challenge 2: API Rate Limits
**Problem**: Multiple API calls may hit rate limits

**Solution**:
- Implement exponential backoff retry logic
- Add request queuing for parallel operations
- Cache API responses where possible
- Monitor API usage

---

### Challenge 3: File Management
**Problem**: Temp files can accumulate, disk space issues

**Solution**:
- Automatic cleanup after video generation
- Unique job IDs for temp directories
- Configurable temp directory size limits
- Cleanup on error

---

### Challenge 4: Render Time Optimization
**Problem**: Target < 2 minutes for full pipeline

**Solution**:
- Parallelize image and voice generation
- Optimize FFmpeg commands (hardware acceleration if available)
- Use lower resolution for intermediate steps
- Cache where possible

---

### Challenge 5: Character Consistency
**Problem**: Images should maintain character appearance across scenes

**Solution**:
- Include character description in all visual prompts
- Use seed values if API supports it
- Consider character memory system (future upgrade)

---

## API Endpoint Design

### POST /generate

**Request Body**:
```json
{
  "idea": "How to make perfect coffee at home",
  "tone": "educational",
  "platform": "tiktok",
  "duration": 30
}
```

**Response**:
```json
{
  "jobId": "uuid-here",
  "status": "processing",
  "message": "Video generation started"
}
```

### GET /status/:jobId

**Response**:
```json
{
  "status": "completed",
  "progress": 100,
  "outputUrl": "/output/output.mp4"
}
```

### GET /download/:jobId

**Response**: File download of MP4

---

## Environment Setup Requirements

### Development
- Node.js 18+
- FFmpeg installed locally
- Python 3.8+ (for SadTalker)
- API keys for OpenAI, Nano Banana, ElevenLabs

### Production
- Docker containerization (optional but recommended)
- GPU support for SadTalker (optional, CPU fallback works)
- Sufficient disk space for temp files
- Network access to APIs

---

## Success Metrics

1. **Functionality**: Single API call produces playable MP4
2. **Quality**: Output passes as "real video" on TikTok
3. **Performance**: Render time < 2 minutes
4. **Reliability**: Handles errors gracefully, cleans up resources
5. **Scalability**: Can process multiple requests (with queuing)

---

## Future Enhancements (Post-MVP)

- Runway/Luma integration for hero scenes
- Auto-generated captions/subtitles
- Background music bed
- Scene emotion tagging
- Character memory system
- Multi-language support
- Batch processing
- Webhook notifications
- Progress streaming (SSE)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Nano Banana API changes | High | Abstract API calls, easy to swap providers |
| SadTalker setup complexity | Medium | Provide clear setup docs, Docker option |
| API rate limits | Medium | Implement retry logic, queuing |
| Render time exceeds target | Low | Optimize FFmpeg, parallel processing |
| Character consistency issues | Low | Acceptable for MVP, improve in v2 |

---

## Next Steps

1. **Review this plan** - Confirm approach and technologies
2. **Set up development environment** - Install dependencies
3. **Begin Phase 1** - Foundation setup
4. **Iterate through phases** - Build and test incrementally
5. **Deploy MVP** - Test with real use cases

---

## Questions to Resolve

1. **Nano Banana API**: Need to verify actual API structure (endpoints, auth, parameters)
2. **SadTalker Setup**: Confirm if user has Python environment or prefers Docker
3. **Voice Selection**: Which ElevenLabs voice to use by default?
4. **Error Handling**: How should partial failures be handled? (e.g., one image fails)
5. **Output Format**: Confirm 1080x1920, 30fps is correct for all platforms

---

**Ready to proceed with implementation once plan is approved.**

