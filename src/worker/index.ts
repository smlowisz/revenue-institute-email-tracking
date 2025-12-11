/**
 * Outbound Intent Engine - Cloudflare Worker
 * Edge worker for event ingestion, validation, and forwarding to Supabase
 * Using web_visitor architecture: anonymous visitors → web_visitor, identified → lead
 */

import { PIXEL_CODE_BASE64 } from './pixel-bundle';
import { SupabaseClient } from './supabase-web-visitor';

export interface Env {
  IDENTITY_STORE: KVNamespace;
  PERSONALIZATION: KVNamespace;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  EVENT_SIGNING_SECRET: string;
  ALLOWED_ORIGINS: string;
  ENVIRONMENT: string;
}

interface TrackingEvent {
  type: string;
  timestamp: number;
  sessionId: string;
  visitorId: string | null;
  url: string;
  referrer: string;
  data?: Record<string, any>;
}

interface EventBatch {
  events: TrackingEvent[];
  meta: {
    sentAt: number;
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCORS(request, env);
    }

    const url = new URL(request.url);

    // Route handling
    if (url.pathname === '/track' && request.method === 'POST') {
      return handleTrackEvents(request, env, ctx);
    }

    if (url.pathname === '/identify' && request.method === 'GET') {
      return handleIdentityLookup(request, env);
    }

    if (url.pathname === '/personalize' && request.method === 'GET') {
      return handlePersonalization(request, env);
    }

    if (url.pathname === '/go' && request.method === 'GET') {
      return handleRedirect(request, env);
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/test-video-event' && request.method === 'POST') {
      // Manual test endpoint to insert a video event directly
      // This bypasses client-side tracking to test Supabase insertion
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${env.EVENT_SIGNING_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }

      try {
        const testEvents = [{
          type: 'video_play',
          timestamp: Date.now(),
          sessionId: `test-session-${Date.now()}`,
          visitorId: 'test-visitor-manual-endpoint',
          url: 'https://test.example.com/video',
          referrer: 'https://test.example.com',
          data: {
            src: 'https://www.youtube.com/watch?v=DzYp5uqixz0',
            videoId: 'DzYp5uqixz0',
            platform: 'youtube',
            triggeredBy: 'manual_endpoint_test'
          }
        }, {
          type: 'video_watched',
          timestamp: Date.now(),
          sessionId: `test-session-${Date.now()}`,
          visitorId: 'test-visitor-manual-endpoint',
          url: 'https://test.example.com/video',
          referrer: 'https://test.example.com',
          data: {
            src: 'https://www.youtube.com/watch?v=DzYp5uqixz0',
            videoId: 'DzYp5uqixz0',
            platform: 'youtube',
            watchedSeconds: 10,
            watchedPercent: 0,
            watchTime: 10,
            threshold: 'time',
            triggeredBy: 'manual_endpoint_test'
          }
        }];

        const enrichedEvents = testEvents.map(event => enrichEvent(event, request));
        await storeEvents(enrichedEvents, env, ctx);

        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Test video events inserted',
          events: testEvents.map(e => e.type),
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: error.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/sync-kv-now' && request.method === 'POST') {
      // Manual/webhook trigger for KV sync
      // Can be called from anywhere to immediately sync new leads
      const authHeader = request.headers.get('Authorization');
      if (authHeader !== `Bearer ${env.EVENT_SIGNING_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
      }
      
      console.log('🔔 Manual KV sync triggered via webhook');
      
      try {
        await syncSupabaseToKV(env);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'KV sync completed',
          timestamp: new Date().toISOString()
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error: any) {
        console.error('❌ Manual sync failed:', error);
        return new Response(JSON.stringify({ 
          success: false, 
          error: error.message 
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (url.pathname === '/pixel.js') {
      // Serve the tracking pixel directly (decode from base64)
      const pixelCode = atob(PIXEL_CODE_BASE64);
      return new Response(pixelCode, {
        headers: { 
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=300, must-revalidate', // 5 min cache with revalidation
          'Access-Control-Allow-Origin': '*', // Allow cross-origin
          'X-Content-Type-Options': 'nosniff',
          'ETag': `"pixel-v${Date.now()}"`, // Force cache validation
          'Vary': 'Accept-Encoding'
        }
      });
    }

    if (url.pathname === '/youtube-tracking-integration.js') {
      // Serve YouTube tracking integration script
      // This will be loaded from the file system or bundled
      const youtubeTrackingCode = `/**
 * YouTube Video Tracking Integration
 * Tracks YouTube video events and sends them to Outbound Intent Engine
 */
(function() {
  'use strict';
  const trackedVideos = new Map();
  function initYouTubeTracking() {
    if (!window.oieTracker) {
      console.warn('⚠️ OutboundIntentTracker not found. YouTube tracking will not work.');
      return;
    }
    const youtubeIframes = findYouTubeIframes();
    if (youtubeIframes.length === 0) {
      console.log('🎥 No YouTube iframes found on page');
      return;
    }
    console.log(\`🎥 Found \${youtubeIframes.length} YouTube iframe(s)\`);
    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
      loadYouTubeAPI(() => {
        initializePlayers(youtubeIframes);
      });
    } else {
      if (YT.ready) {
        YT.ready(() => {
          initializePlayers(youtubeIframes);
        });
      } else {
        initializePlayers(youtubeIframes);
      }
    }
  }
  function findYouTubeIframes() {
    const youtubeIframes = [];
    const checkedIframes = new Set();
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach((iframe, index) => {
      if (checkedIframes.has(iframe)) return;
      checkedIframes.add(iframe);
      const src = iframe.src || '';
      const dataSrc = iframe.getAttribute('data-src') || '';
      const fullSrc = src || dataSrc;
      if (fullSrc.includes('youtube.com/embed/') || 
          fullSrc.includes('youtu.be/') ||
          fullSrc.includes('youtube-nocookie.com/embed/') ||
          fullSrc.includes('youtube.com/watch')) {
        const videoId = extractVideoId(fullSrc);
        if (videoId) {
          youtubeIframes.push({
            element: iframe,
            videoId: videoId,
            index: index,
            id: iframe.id || \`youtube-player-\${index}\`
          });
        }
      }
    });
    const embedlyContainers = document.querySelectorAll('[data-embed], .embedly-card, [class*="embedly"]');
    embedlyContainers.forEach((container) => {
      const iframe = container.querySelector('iframe');
      if (iframe && !checkedIframes.has(iframe)) {
        checkedIframes.add(iframe);
        const src = iframe.src || iframe.getAttribute('data-src') || '';
        if (src.includes('youtube')) {
          const videoId = extractVideoId(src);
          if (videoId) {
            youtubeIframes.push({
              element: iframe,
              videoId: videoId,
              index: youtubeIframes.length,
              id: iframe.id || \`youtube-player-\${youtubeIframes.length}\`
            });
          }
        }
      }
    });
    return youtubeIframes;
  }
  function extractVideoId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\\.com\\/embed\\/|youtu\\.be\\/|youtube-nocookie\\.com\\/embed\\/)([^?&\\/]+)/,
      /[?&]v=([^?&]+)/,
      /youtu\\.be\\/([^?&\\/]+)/,
      /youtube\\.com\\/watch\\?.*v=([^&]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }
  function loadYouTubeAPI(callback) {
    if (window.onYouTubeIframeAPIReady) {
      const originalCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function() {
        originalCallback();
        if (callback) callback();
      };
      return;
    }
    window.onYouTubeIframeAPIReady = callback;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }
  function initializePlayers(youtubeIframes) {
    youtubeIframes.forEach((iframeInfo) => {
      if (trackedVideos.has(iframeInfo.videoId)) {
        return;
      }
      try {
        if (!iframeInfo.element.id) {
          iframeInfo.element.id = iframeInfo.id;
        }
        const player = new YT.Player(iframeInfo.element.id, {
          events: {
            'onReady': (event) => {
              console.log('🎥 YouTube player ready:', iframeInfo.videoId);
              setupVideoTracking(event.target, iframeInfo.videoId);
            },
            'onStateChange': (event) => {
              handleStateChange(event, iframeInfo.videoId);
            },
            'onError': (event) => {
              console.error('🎥 YouTube player error:', event.data);
            }
          }
        });
        trackedVideos.set(iframeInfo.videoId, {
          player: player,
          tracked25: false,
          tracked50: false,
          tracked75: false,
          tracked100: false,
          trackedWatched: false,
          playStartTime: null
        });
      } catch (error) {
        console.error('🎥 Error initializing YouTube player:', error);
      }
    });
  }
  function setupVideoTracking(player, videoId) {
    const videoInfo = trackedVideos.get(videoId);
    if (!videoInfo) return;
    if (videoInfo.playStartTime === null) {
      videoInfo.playStartTime = Date.now();
    }
    const progressInterval = setInterval(() => {
      try {
        if (player.getPlayerState() === YT.PlayerState.PLAYING) {
          const currentTime = player.getCurrentTime();
          const duration = player.getDuration();
          if (!duration || duration <= 0) return;
          const percent = (currentTime / duration) * 100;
          if (!videoInfo.trackedWatched && videoInfo.playStartTime !== null) {
            const watchedTime = Date.now() - videoInfo.playStartTime;
            if (currentTime >= 10 || percent >= 25) {
              videoInfo.trackedWatched = true;
              console.log('🎥 YouTube video watched event triggered');
              trackVideoWatched(videoId, currentTime, percent, Math.round(watchedTime / 1000));
            }
          }
          if (percent >= 25 && !videoInfo.tracked25) {
            videoInfo.tracked25 = true;
            console.log('🎥 YouTube video progress: 25%');
            trackVideoProgress(videoId, 25, currentTime, duration);
          }
          if (percent >= 50 && !videoInfo.tracked50) {
            videoInfo.tracked50 = true;
            console.log('🎥 YouTube video progress: 50%');
            trackVideoProgress(videoId, 50, currentTime, duration);
          }
          if (percent >= 75 && !videoInfo.tracked75) {
            videoInfo.tracked75 = true;
            console.log('🎥 YouTube video progress: 75%');
            trackVideoProgress(videoId, 75, currentTime, duration);
          }
          if (percent >= 100 && !videoInfo.tracked100) {
            videoInfo.tracked100 = true;
            console.log('🎥 YouTube video progress: 100%');
            clearInterval(progressInterval);
            trackVideoComplete(videoId, duration);
          }
        }
      } catch (error) {
        clearInterval(progressInterval);
      }
    }, 1000);
    videoInfo.progressInterval = progressInterval;
  }
  function handleStateChange(event, videoId) {
    const player = event.target;
    const state = event.data;
    const videoInfo = trackedVideos.get(videoId);
    
    switch (state) {
      case YT.PlayerState.PLAYING:
        console.log('🎥 YouTube video play:', videoId);
        if (videoInfo) {
          videoInfo.playStartTime = Date.now();
        }
        trackVideoPlay(videoId);
        break;
      case YT.PlayerState.PAUSED:
        console.log('🎥 YouTube video pause:', videoId);
        const currentTime = player.getCurrentTime();
        trackVideoPause(videoId, currentTime);
        break;
      case YT.PlayerState.ENDED:
        console.log('🎥 YouTube video ended:', videoId);
        if (videoInfo && !videoInfo.tracked100) {
          videoInfo.tracked100 = true;
          const duration = player.getDuration();
          trackVideoComplete(videoId, duration);
        }
        break;
    }
  }
  function trackVideoPlay(videoId) {
    if (window.oieTracker) {
      window.oieTracker.track('video_play', {
        src: \`https://www.youtube.com/watch?v=\${videoId}\`,
        videoId: videoId,
        platform: 'youtube',
        videoType: 'youtube'
      });
    }
  }
  function trackVideoPause(videoId, currentTime) {
    if (window.oieTracker) {
      window.oieTracker.track('video_pause', {
        src: \`https://www.youtube.com/watch?v=\${videoId}\`,
        videoId: videoId,
        platform: 'youtube',
        currentTime: currentTime
      });
    }
  }
  function trackVideoProgress(videoId, progress, currentTime, duration) {
    if (window.oieTracker) {
      window.oieTracker.track('video_progress', {
        src: \`https://www.youtube.com/watch?v=\${videoId}\`,
        videoId: videoId,
        platform: 'youtube',
        progress: progress,
        currentTime: currentTime,
        duration: duration
      });
    }
  }
  function trackVideoComplete(videoId, duration) {
    if (window.oieTracker) {
      window.oieTracker.track('video_complete', {
        src: \`https://www.youtube.com/watch?v=\${videoId}\`,
        videoId: videoId,
        platform: 'youtube',
        duration: duration
      });
    }
  }
  function trackVideoWatched(videoId, watchedSeconds, watchedPercent, watchTime) {
    if (window.oieTracker) {
      window.oieTracker.track('video_watched', {
        src: \`https://www.youtube.com/watch?v=\${videoId}\`,
        videoId: videoId,
        platform: 'youtube',
        watchedSeconds: watchedSeconds,
        watchedPercent: Math.round(watchedPercent),
        watchTime: watchTime,
        threshold: watchedSeconds >= 10 ? 'time' : 'percentage'
      });
    }
  }
  function setupPlayButtonTracking() {
    const playButtons = document.querySelectorAll('.ytp-large-play-button, [class*="ytp-play-button"], [class*="ytp-cued-thumbnail"], .ytp-cued-thumbnail-overlay');
    console.log(\`🎥 Found \${playButtons.length} YouTube play button(s) to track\`);
    playButtons.forEach((button, index) => {
      if (button._oiePlayButtonTracked) return;
      button._oiePlayButtonTracked = true;
      button.addEventListener('click', (e) => {
        console.log('🎥 YouTube play button clicked!', button);
        e.stopPropagation();
        let videoId = null;
        const container = button.closest('[class*="ytp"], [data-video-id], iframe, [class*="embedly"], [class*="w-embed"]') || 
                        button.parentElement || 
                        document.body;
        if (container) {
          videoId = container.getAttribute('data-video-id') || 
                   container.getAttribute('data-youtube-id') ||
                   container.getAttribute('data-video') ||
                   container.getAttribute('data-embed-id');
        }
        if (!videoId) {
          const allIframes = document.querySelectorAll('iframe');
          for (const iframe of allIframes) {
            const src = iframe.src || iframe.getAttribute('data-src') || iframe.getAttribute('src') || '';
            if (src.includes('youtube') || src.includes('youtu.be')) {
              videoId = extractVideoId(src);
              if (videoId) {
                console.log('🎥 Found video ID from iframe:', videoId);
                break;
              }
            }
          }
        }
        if (!videoId) {
          const thumbnailImages = container?.querySelectorAll('img[src*="i.ytimg.com"], [style*="i.ytimg.com"]') || [];
          for (const img of thumbnailImages) {
            const src = img.src || img.getAttribute('style') || '';
            const match = src.match(/i\\.ytimg\\.com\\/vi[^\\/]+\\/([^\\/]+)\\//);
            if (match && match[1]) {
              videoId = match[1];
              console.log('🎥 Found video ID from thumbnail image:', videoId);
              break;
            }
          }
          if (!videoId) {
            const allThumbnails = document.querySelectorAll('img[src*="i.ytimg.com"], [style*="i.ytimg.com"]');
            for (const img of allThumbnails) {
              const src = img.src || img.getAttribute('style') || '';
              const match = src.match(/i\\.ytimg\\.com\\/vi[^\\/]+\\/([^\\/]+)\\//);
              if (match && match[1]) {
                videoId = match[1];
                console.log('🎥 Found video ID from thumbnail (document-wide):', videoId);
                break;
              }
            }
          }
        }
        if (!videoId) {
          let element = container;
          while (element && element !== document.body) {
            const style = window.getComputedStyle(element).backgroundImage;
            if (style) {
              const match = style.match(/i\\.ytimg\\.com\\/vi[^\\/]+\\/([^\\/]+)\\//);
              if (match && match[1]) {
                videoId = match[1];
                console.log('🎥 Found video ID from background-image:', videoId);
                break;
              }
            }
            element = element.parentElement;
          }
        }
        if (!videoId) {
          const metaVideoId = document.querySelector('meta[property="og:video"]')?.content ||
                             document.querySelector('meta[name="twitter:player"]')?.content ||
                             document.querySelector('meta[property="og:video:url"]')?.content;
          if (metaVideoId) {
            videoId = extractVideoId(metaVideoId);
            if (videoId) console.log('🎥 Found video ID from meta tag:', videoId);
          }
        }
        if (!videoId) {
          const youtubeLinks = document.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]');
          for (const link of youtubeLinks) {
            const href = link.getAttribute('href');
            if (href) {
              videoId = extractVideoId(href);
              if (videoId) {
                console.log('🎥 Found video ID from link:', videoId);
                break;
              }
            }
          }
        }
        if (!videoId) {
          const nearbyText = container?.textContent || '';
          const videoIdMatch = nearbyText.match(/(?:youtube\\.com\\/watch\\?v=|youtu\\.be\\/|embed\\/)([a-zA-Z0-9_-]{11})/);
          if (videoIdMatch && videoIdMatch[1]) {
            videoId = videoIdMatch[1];
            console.log('🎥 Found video ID from text content:', videoId);
          }
        }
        if (!videoId) {
          const allIframes = document.querySelectorAll('iframe');
          for (const iframe of allIframes) {
            const src = iframe.src || iframe.getAttribute('data-src') || '';
            const directMatch = src.match(/([a-zA-Z0-9_-]{11})(?:\\?|$)/);
            if (directMatch && directMatch[1]) {
              videoId = directMatch[1];
              console.log('🎥 Found video ID from iframe src pattern:', videoId);
              break;
            }
          }
        }
        if (videoId && window.oieTracker) {
          console.log('✅ YouTube play button clicked, tracking video:', videoId);
          const playTime = Date.now();
          // Track video_play event immediately
          window.oieTracker.track('video_play', {
            src: \`https://www.youtube.com/watch?v=\${videoId}\`,
            videoId: videoId,
            platform: 'youtube',
            triggeredBy: 'play_button_click'
          });
          // Also track video_watched immediately (clicking = intent to watch)
          console.log('✅ Tracking video_watched immediately on click');
          window.oieTracker.track('video_watched', {
            src: \`https://www.youtube.com/watch?v=\${videoId}\`,
            videoId: videoId,
            platform: 'youtube',
            watchedSeconds: 0,
            watchedPercent: 0,
            watchTime: 0,
            threshold: 'immediate_click',
            triggeredBy: 'play_button_click'
          });
          if (!window._oieYouTubeWatchTimers) {
            window._oieYouTubeWatchTimers = new Map();
          }
          if (window._oieYouTubeWatchTimers.has(videoId)) {
            clearTimeout(window._oieYouTubeWatchTimers.get(videoId));
          }
          const watchTimer = setTimeout(() => {
            if (window.oieTracker) {
              console.log('✅ YouTube video watched (fallback timer):', videoId);
              window.oieTracker.track('video_watched', {
                src: \`https://www.youtube.com/watch?v=\${videoId}\`,
                videoId: videoId,
                platform: 'youtube',
                watchedSeconds: 10,
                watchedPercent: 0,
                watchTime: 10,
                threshold: 'time',
                triggeredBy: 'fallback_timer'
              });
            }
            window._oieYouTubeWatchTimers.delete(videoId);
          }, 10000);
          window._oieYouTubeWatchTimers.set(videoId, watchTimer);
        } else {
          console.warn('⚠️ YouTube play button clicked but video ID not found. Container:', container);
          console.warn('⚠️ Available iframes:', document.querySelectorAll('iframe').length);
          console.warn('⚠️ Tracker available:', !!window.oieTracker);
        }
      }, { once: false, capture: true });
    });
  }
  function setupThumbnailOverlayTracking() {
    if (!window.oieTracker) {
      console.warn('⚠️ Tracker not available yet, retrying in 1 second...');
      setTimeout(setupThumbnailOverlayTracking, 1000);
      return;
    }
    const overlays = document.querySelectorAll('.ytp-cued-thumbnail-overlay, [class*="ytp-cued-thumbnail"]');
    console.log(\`🎥 Found \${overlays.length} YouTube thumbnail overlay(s) to track\`);
    overlays.forEach((overlay, idx) => {
      if (overlay._oieOverlayTracked) return;
      overlay._oieOverlayTracked = true;
      let videoId = null;
      const imageDiv = overlay.querySelector('.ytp-cued-thumbnail-overlay-image');
      if (imageDiv) {
        const style = window.getComputedStyle(imageDiv).backgroundImage;
        if (style) {
          const match = style.match(/i\\.ytimg\\.com\\/vi[^\\/]+\\/([^\\/]+)\\//);
          if (match && match[1]) {
            videoId = match[1];
            console.log(\`✅ Found video ID from thumbnail overlay \${idx + 1}: \${videoId}\`);
          }
        }
      }
      if (!videoId) {
        const imageDiv = overlay.querySelector('[style*="i.ytimg.com"]');
        if (imageDiv) {
          const style = imageDiv.getAttribute('style') || '';
          const match = style.match(/i\\.ytimg\\.com\\/vi[^\\/]+\\/([^\\/]+)\\//);
          if (match && match[1]) {
            videoId = match[1];
            console.log(\`✅ Found video ID from inline style \${idx + 1}: \${videoId}\`);
          }
        }
      }
      if (!videoId) {
        const container = overlay.closest('.w-embed, [data-embed], .embedly-card, [class*="embedly"], [class*="w-embed"]');
        if (container) {
          const iframe = container.querySelector('iframe');
          if (iframe) {
            const src = iframe.src || iframe.getAttribute('data-src') || '';
            if (src.includes('youtube') || src.includes('youtu.be')) {
              videoId = extractVideoId(src);
              if (videoId) console.log(\`✅ Found video ID from container iframe \${idx + 1}: \${videoId}\`);
            }
          }
        }
      }
      if (videoId) {
        console.log(\`✅ Setting up click tracking for thumbnail overlay \${idx + 1} with video: \${videoId}\`);
        overlay.addEventListener('click', (e) => {
          console.log('🎥 YouTube thumbnail overlay clicked!', { videoId: videoId, trackerAvailable: !!window.oieTracker, target: e.target });
          e.stopPropagation();
          if (!window.oieTracker) {
            console.error('❌ Tracker not available when click happened!');
            return;
          }
          try {
            console.log('📤 Sending video_play event...');
            window.oieTracker.track('video_play', {
              src: \`https://www.youtube.com/watch?v=\${videoId}\`,
              videoId: videoId,
              platform: 'youtube',
              triggeredBy: 'thumbnail_overlay_click'
            });
            console.log('✅ video_play event sent!');
            // Also trigger video_watched immediately on click
            console.log('📤 Sending video_watched event immediately...');
            window.oieTracker.track('video_watched', {
              src: \`https://www.youtube.com/watch?v=\${videoId}\`,
              videoId: videoId,
              platform: 'youtube',
              watchedSeconds: 0,
              watchedPercent: 0,
              watchTime: 0,
              threshold: 'immediate_click',
              triggeredBy: 'thumbnail_overlay_click'
            });
            console.log('✅ video_watched event sent immediately!');
            if (!window._oieYouTubeWatchTimers) {
              window._oieYouTubeWatchTimers = new Map();
            }
            if (window._oieYouTubeWatchTimers.has(videoId)) {
              clearTimeout(window._oieYouTubeWatchTimers.get(videoId));
            }
            const watchTimer = setTimeout(() => {
              if (window.oieTracker) {
                console.log('📤 Sending video_watched event (10s timer)...');
                window.oieTracker.track('video_watched', {
                  src: \`https://www.youtube.com/watch?v=\${videoId}\`,
                  videoId: videoId,
                  platform: 'youtube',
                  watchedSeconds: 10,
                  watchedPercent: 0,
                  watchTime: 10,
                  threshold: 'time',
                  triggeredBy: 'fallback_timer'
                });
                console.log('✅ video_watched event sent!');
              }
              window._oieYouTubeWatchTimers.delete(videoId);
            }, 10000);
            window._oieYouTubeWatchTimers.set(videoId, watchTimer);
          } catch (error) {
            console.error('❌ Error tracking video event:', error);
          }
        }, { capture: true });
      } else {
        console.warn(\`⚠️ Thumbnail overlay \${idx + 1} has no video ID. Overlay:\`, overlay);
      }
    });
  }
  function setupEmbedlyContainerTracking() {
    const embedContainers = document.querySelectorAll('.w-embed, [data-embed], .embedly-card, [class*="embedly"], [class*="w-embed"]');
    console.log(\`🎥 Found \${embedContainers.length} embed container(s) to track\`);
    embedContainers.forEach((container) => {
      if (container._oieEmbedTracked) return;
      container._oieEmbedTracked = true;
      let videoId = null;
      videoId = container.getAttribute('data-video-id') || 
               container.getAttribute('data-youtube-id') ||
               container.getAttribute('data-video') ||
               container.getAttribute('data-embed-id');
      if (!videoId) {
        const iframe = container.querySelector('iframe');
        if (iframe) {
          const src = iframe.src || iframe.getAttribute('data-src') || '';
          if (src.includes('youtube') || src.includes('youtu.be')) {
            videoId = extractVideoId(src);
          }
        }
      }
      if (!videoId) {
        const images = container.querySelectorAll('img');
        for (const img of images) {
          const src = img.src || img.getAttribute('src') || '';
          const match = src.match(/i\\.ytimg\\.com\\/vi[^\\/]+\\/([^\\/]+)\\//);
          if (match && match[1]) {
            videoId = match[1];
            break;
          }
        }
      }
      if (videoId) {
        console.log(\`🎥 Setting up tracking for embed container with video: \${videoId}\`);
        container.addEventListener('click', (e) => {
          console.log('🎥 Embed container clicked, video:', videoId);
          e.stopPropagation();
          if (window.oieTracker) {
            const playTime = Date.now();
            // Track video_play event immediately
            window.oieTracker.track('video_play', {
              src: \`https://www.youtube.com/watch?v=\${videoId}\`,
              videoId: videoId,
              platform: 'youtube',
              triggeredBy: 'embed_container_click'
            });
            // Also trigger video_watched immediately on click
            console.log('✅ Tracking video_watched immediately on click');
            window.oieTracker.track('video_watched', {
              src: \`https://www.youtube.com/watch?v=\${videoId}\`,
              videoId: videoId,
              platform: 'youtube',
              watchedSeconds: 0,
              watchedPercent: 0,
              watchTime: 0,
              threshold: 'immediate_click',
              triggeredBy: 'embed_container_click'
            });
            if (!window._oieYouTubeWatchTimers) {
              window._oieYouTubeWatchTimers = new Map();
            }
            if (window._oieYouTubeWatchTimers.has(videoId)) {
              clearTimeout(window._oieYouTubeWatchTimers.get(videoId));
            }
            const watchTimer = setTimeout(() => {
              if (window.oieTracker) {
                console.log('✅ YouTube video watched (fallback timer):', videoId);
                window.oieTracker.track('video_watched', {
                  src: \`https://www.youtube.com/watch?v=\${videoId}\`,
                  videoId: videoId,
                  platform: 'youtube',
                  watchedSeconds: 10,
                  watchedPercent: 0,
                  watchTime: 10,
                  threshold: 'time',
                  triggeredBy: 'fallback_timer'
                });
              }
              window._oieYouTubeWatchTimers.delete(videoId);
            }, 10000);
            window._oieYouTubeWatchTimers.set(videoId, watchTimer);
          }
        }, { capture: true });
      }
    });
  }
  function tryInitialize() {
    setupThumbnailOverlayTracking();
    setupEmbedlyContainerTracking();
    setupPlayButtonTracking();
    initYouTubeTracking();
    setTimeout(() => {
      setupEmbedlyContainerTracking();
      setupPlayButtonTracking();
      const videos = findYouTubeIframes();
      if (videos.length > 0 && trackedVideos.size === 0) {
        console.log('🎥 Found YouTube iframes on retry, initializing...');
        initYouTubeTracking();
      }
    }, 2000);
    setTimeout(() => {
      setupEmbedlyContainerTracking();
      setupPlayButtonTracking();
      const videos = findYouTubeIframes();
      if (videos.length > 0 && trackedVideos.size === 0) {
        console.log('🎥 Found YouTube iframes on second retry, initializing...');
        initYouTubeTracking();
      }
    }, 5000);
    setTimeout(() => {
      setupEmbedlyContainerTracking();
      setupPlayButtonTracking();
      initYouTubeTracking();
    }, 10000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(tryInitialize, 500);
    });
  } else {
    setTimeout(tryInitialize, 500);
  }
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      let hasNewYouTubeIframe = false;
      let hasNewEmbedContainer = false;
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const element = node;
            if (element.tagName === 'IFRAME') {
              const src = element.src || element.getAttribute('data-src') || '';
              if (src.includes('youtube.com/embed/') || 
                  src.includes('youtu.be/') || 
                  src.includes('youtube-nocookie.com/embed/') ||
                  src.includes('youtube.com/watch')) {
                hasNewYouTubeIframe = true;
              }
            }
            const iframes = element.querySelectorAll?.('iframe') || [];
            iframes.forEach(iframe => {
              const src = iframe.src || iframe.getAttribute('data-src') || '';
              if (src.includes('youtube.com/embed/') || 
                  src.includes('youtu.be/') || 
                  src.includes('youtube-nocookie.com/embed/') ||
                  src.includes('youtube.com/watch')) {
                hasNewYouTubeIframe = true;
              }
            });
            if (element.hasAttribute && (
                element.hasAttribute('data-embed') ||
                element.className?.includes('embedly') ||
                element.classList?.contains('embedly-card') ||
                element.classList?.contains('w-embed')
            )) {
              hasNewEmbedContainer = true;
              const iframe = element.querySelector('iframe');
              if (iframe) {
                const src = iframe.src || iframe.getAttribute('data-src') || '';
                if (src.includes('youtube')) {
                  hasNewYouTubeIframe = true;
                }
              }
            }
            if (element.classList?.contains('ytp-large-play-button') || 
                element.querySelector?.('.ytp-large-play-button')) {
              setupPlayButtonTracking();
            }
          }
        });
      });
      if (hasNewEmbedContainer) {
        console.log('🎥 New embed container detected via MutationObserver, re-initializing...');
        setupEmbedlyContainerTracking();
      }
      if (hasNewYouTubeIframe) {
        console.log('🎥 New YouTube iframe detected via MutationObserver, re-initializing...');
        setupEmbedlyContainerTracking();
        setupPlayButtonTracking();
        setTimeout(() => {
          initYouTubeTracking();
        }, 1000);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'data-src']
    });
  }
  window.initYouTubeTracking = initYouTubeTracking;
  window.testVideoTracking = function(videoId = 'DzYp5uqixz0') {
    console.log('🧪 Testing video tracking with video ID:', videoId);
    console.log('🧪 Tracker available:', !!window.oieTracker);
    if (!window.oieTracker) {
      console.error('❌ Tracker not available! Make sure the pixel is loaded.');
      return;
    }
    console.log('📤 Sending test video_play event...');
    window.oieTracker.track('video_play', {
      src: \`https://www.youtube.com/watch?v=\${videoId}\`,
      videoId: videoId,
      platform: 'youtube',
      triggeredBy: 'manual_test'
    });
    console.log('✅ Test video_play event sent!');
    setTimeout(() => {
      console.log('📤 Sending test video_watched event...');
      window.oieTracker.track('video_watched', {
        src: \`https://www.youtube.com/watch?v=\${videoId}\`,
        videoId: videoId,
        platform: 'youtube',
        watchedSeconds: 10,
        watchedPercent: 0,
        watchTime: 10,
        threshold: 'time',
        triggeredBy: 'manual_test'
      });
      console.log('✅ Test video_watched event sent!');
    }, 2000);
    console.log('🧪 Test complete! Check Supabase in 1-2 minutes.');
  };
  window.debugVideoTracking = function() {
    console.log('🔍 Video Tracking Debug Info:');
    console.log('  Tracker available:', !!window.oieTracker);
    console.log('  Tracker object:', window.oieTracker);
    const embedContainers = document.querySelectorAll('.w-embed, [data-embed], .embedly-card, [class*="embedly"], [class*="w-embed"]');
    console.log('  Embed containers found:', embedContainers.length);
    embedContainers.forEach((container, idx) => {
      console.log(\`  Container \${idx + 1}:\`, {
        className: container.className,
        id: container.id,
        tracked: container._oieEmbedTracked,
        html: container.outerHTML.substring(0, 200)
      });
    });
    const allIframes = document.querySelectorAll('iframe');
    console.log('  Total iframes:', allIframes.length);
    allIframes.forEach((iframe, idx) => {
      const src = iframe.src || iframe.getAttribute('data-src') || '';
      console.log(\`  Iframe \${idx + 1}:\`, src.substring(0, 100));
    });
    const playButtons = document.querySelectorAll('.ytp-large-play-button, [class*="ytp-play-button"]');
    console.log('  Play buttons found:', playButtons.length);
  };
})();`;

      return new Response(youtubeTrackingCode, {
        headers: { 
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=300, must-revalidate',
          'Access-Control-Allow-Origin': '*', // Allow cross-origin - fixes CORS error
          'X-Content-Type-Options': 'nosniff',
          'ETag': `"youtube-tracking-v1"`,
          'Vary': 'Accept-Encoding'
        }
      });
    }

    return new Response('Not Found', { status: 404 });
  },

  // Scheduled trigger - runs every hour to sync KV
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('🔄 Hourly KV sync started:', new Date().toISOString());
    
    try {
      await syncSupabaseToKV(env);
      console.log('✅ Hourly KV sync completed successfully');
    } catch (error: any) {
      console.error('❌ KV sync failed:', error.message);
    }
  }
};

/**
 * Handle incoming tracking events
 */
async function handleTrackEvents(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    // Validate origin
    if (!isOriginAllowed(request, env)) {
      const origin = request.headers.get('Origin') || 'unknown';
      console.error('❌ Origin not allowed:', origin);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Origin not allowed',
        origin: origin
      }), { 
        status: 403,
        headers: {
          'Content-Type': 'application/json',
          ...getCORSHeaders(request, env)
        }
      });
    }

    // Parse event batch
    const body = await request.json() as EventBatch;
    
    if (!body.events || !Array.isArray(body.events)) {
      console.error('❌ Invalid payload: events is not an array');
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Invalid payload: events must be an array' 
      }), { 
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...getCORSHeaders(request, env)
        }
      });
    }

    console.log('📥 Received', body.events.length, 'events. Types:', body.events.map(e => e.type).join(', '));

    // Enrich events with server-side data
    const enrichedEvents = body.events.map(event => enrichEvent(event, request));

    // Store events SYNCHRONOUSLY to see errors
    let storeSuccess = false;
    let storeError: string | null = null;
    
    try {
      await storeEvents(enrichedEvents, env, ctx);
      storeSuccess = true;
      console.log('✅ Events stored successfully in Supabase');
    } catch (error: any) {
      storeSuccess = false;
      storeError = error.message;
      console.error('❌ ERROR storing events:', error.message);
      console.error('❌ Error stack:', error.stack);
    }

    // Return response with storage status
    return new Response(JSON.stringify({ 
      success: true, 
      eventsReceived: body.events.length,
      eventsStored: storeSuccess,
      error: storeError || undefined
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCORSHeaders(request, env)
      }
    });
  } catch (error: any) {
    console.error('❌ Error handling events:', error);
    console.error('❌ Error stack:', error.stack);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message || 'Internal Server Error' 
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...getCORSHeaders(request, env)
      }
    });
  }
}

/**
 * Map old event type names to new ones
 */
function normalizeEventType(type: string): string {
  // Map old names to new names if needed
  const typeMap: Record<string, string> = {
    'email_identified': 'email_captured', // Old name -> new name
    'pageview': 'page_view' // Ensure underscore format
  };
  return typeMap[type] || type;
}

/**
 * Determine event category based on event type
 */
function getEventCategory(type: string): 'website' | 'email' | 'system' {
  const emailEvents = ['email_sent', 'email_bounced', 'email_replied', 'email_click'];
  const systemEvents = ['email_captured', 'identify', 'browser_emails_scanned'];
  if (emailEvents.includes(type)) return 'email';
  if (systemEvents.includes(type)) return 'system';
  return 'website';
}

/**
 * Enrich event with server-side data
 * Returns event formatted for Supabase schema
 */
function enrichEvent(event: TrackingEvent, request: Request): any {
  // Server-side enrichment with ALL available data
  const ip = request.headers.get('CF-Connecting-IP');
  const country = request.headers.get('CF-IPCountry');
  const userAgent = request.headers.get('User-Agent');
  const acceptLanguage = request.headers.get('Accept-Language');
  const referer = request.headers.get('Referer');
  
  // Parse URL for additional context
  const url = new URL(event.url);
  const urlParams = Object.fromEntries(Array.from(url.searchParams.entries()));
  
  // Company identifier (IP-based, without reverse lookup)
  // Use last 2 octets of IP as company identifier (same subnet = likely same company)
  const companyIdentifier = ip ? hashString(ip.split('.').slice(0, 2).join('.')) : null;

  // Map to Supabase schema
  const normalizedType = normalizeEventType(event.type);
  return {
    // Event identification
    category: getEventCategory(normalizedType),
    type: normalizedType,
    
    // Session and lead IDs will be set by storeEvents
    session_id: null, // Will be set by storeEvents
    lead_id: null, // Will be set by storeEvents
    
    // Page context
    url: event.url,
    referrer: event.referrer,
    referer_header: referer,
    
    // Event data (store original sessionId for aggregation)
    data: {
      ...(event.data || {}),
      _originalSessionId: event.sessionId // Store original string sessionId for session aggregation
    },
    
    // IP & Geo
    ip_address: ip,
    company_identifier: companyIdentifier,
    country,
    city: request.cf?.city || null,
    region: request.cf?.region || null,
    continent: request.cf?.continent || null,
    postal_code: request.cf?.postalCode || null,
    metro_code: request.cf?.metroCode || null,
    latitude: request.cf?.latitude?.toString() || null,
    longitude: request.cf?.longitude?.toString() || null,
    timezone: request.cf?.timezone || null,
    
    // Network info
    colo: request.cf?.colo || null,
    asn: request.cf?.asn ? Number(request.cf.asn) : null,
    organization_identifier: request.cf?.asOrganization || null,
    
    // Request headers
    user_agent: userAgent || null,
    default_language: acceptLanguage || null,
    
    // Device type from Cloudflare
    device_type: request.cf?.deviceType || null,
    
    // URL parameters (stored as TEXT - JSON string)
    url_parms: urlParams && Object.keys(urlParams).length > 0 ? JSON.stringify(urlParams) : null,
    utm_source: urlParams.utm_source || null,
    utm_medium: urlParams.utm_medium || null,
    utm_campaign: urlParams.utm_campaign || null,
    utm_term: urlParams.utm_term || null,
    utm_content: urlParams.utm_content || null,
    gclid: urlParams.gclid || null,
    fbclid: urlParams.fbclid || null,
    
    // Device hints (from Cloudflare)
    device_type: request.cf?.deviceType || null,
    is_eu_country: request.cf?.isEUCountry || false,
    
    // TLS/Security
    tls_version: request.cf?.tlsVersion || null,
    tls_cipher: request.cf?.tlsCipher || null,
    http_protocol: request.cf?.httpProtocol || null,
    
    // Foreign keys (set from event data if available - UUID or null)
    campaign_id: event.data?.campaign_id && isValidUUID(event.data.campaign_id) ? event.data.campaign_id : null,
    message_id: event.data?.message_id && isValidUUID(event.data.message_id) ? event.data.message_id : null,
    
    // Timestamps
    created_at: new Date(event.timestamp).toISOString(),
    updated_at: new Date().toISOString(),
    
    // Keep original fields for reference during migration
    _originalSessionId: event.sessionId,
    _originalVisitorId: event.visitorId,
    _originalTimestamp: event.timestamp
  };
}

// Helper function to hash strings for privacy
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Sync Supabase leads to Cloudflare KV (runs hourly via cron)
 */
async function syncSupabaseToKV(env: Env): Promise<void> {
  console.log('📊 Starting Supabase → KV sync...');
  
  try {
    const supabase = new SupabaseClient(env);
    
    // Get leads updated in last 10 minutes or with recent events
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    
    // Query leads updated recently (using proper PostgREST syntax)
    const leadsResponse = await supabase.request(
      'GET',
      `/lead?tracking_id=not.is.null&updated_at=gte.${encodeURIComponent(tenMinutesAgo)}&select=*&order=updated_at.desc`
    );
    let leads = leadsResponse || [];
    
    // Also get leads with recent events
    try {
      const recentEventsResponse = await supabase.request(
        'GET',
        `/event?created_at=gte.${encodeURIComponent(tenMinutesAgo)}&select=lead_id`
      );
      const recentEvents = recentEventsResponse || [];
      
      // Extract unique lead IDs from events
      const leadIdsFromEvents = [...new Set(recentEvents.map((e: any) => e.lead_id).filter(Boolean))];
      
      // Get leads from events if not already in list
      if (leadIdsFromEvents.length > 0) {
        // PostgREST in operator syntax
        const leadIdsParam = leadIdsFromEvents.map(id => `"${id}"`).join(',');
        const additionalLeadsResponse = await supabase.request(
          'GET',
          `/lead?id=in.(${leadIdsParam})&tracking_id=not.is.null&select=*`
        );
        const additionalLeads = additionalLeadsResponse || [];
        
        // Merge and deduplicate
        const existingIds = new Set(leads.map((l: any) => l.id));
        const newLeads = additionalLeads.filter((l: any) => !existingIds.has(l.id));
        leads = [...leads, ...newLeads];
      }
    } catch (error) {
      console.warn('Could not fetch leads from recent events:', error);
      // Continue with just the updated leads
    }
    
    if (!leads || leads.length === 0) {
      console.log('ℹ️ No new leads to sync');
      return;
    }
    
    console.log(`📦 Found ${leads.length} leads to sync`);
    
    // Transform and upload to KV
    let synced = 0;
    for (const lead of leads) {
      const personalizationData = {
        trackingId: lead.tracking_id,
        firstName: lead.first_name || '',
        lastName: lead.last_name || '',
        personName: lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}` : '',
        email: lead.work_email || lead.personal_email,
        company: lead.company_name,
        companyName: lead.company_name,
        domain: lead.company_website || (lead.work_email || lead.personal_email ? (lead.work_email || lead.personal_email).split('@')[1] : ''),
        companyWebsite: lead.company_website,
        companySize: lead.company_headcount,
        revenue: lead.company_revenue,
        industry: lead.company_industry,
        jobTitle: lead.job_title,
        seniority: lead.job_seniority,
        department: lead.job_department,
        phone: lead.phone,
        linkedin: lead.linkedin_url,
        companyLinkedin: lead.company_linkedin,
        companyDescription: lead.company_description,
        isFirstVisit: true,
        intentScore: 0,
        engagementLevel: 'new',
        syncedAt: new Date().toISOString()
      };
      
      // Store in KV with 90-day expiration
      if (lead.tracking_id) {
      await env.IDENTITY_STORE.put(
          lead.tracking_id,
        JSON.stringify(personalizationData),
        { expirationTtl: 90 * 24 * 60 * 60 }
      );
      synced++;
      }
    }
    
    console.log(`✅ Synced ${synced} leads to KV`);
    
  } catch (error: any) {
    console.error('❌ KV sync error:', error.message);
    throw error;
  }
}

/**
 * Store events using web_visitor architecture
 * Key decision: Is this visitor anonymous or identified?
 */
async function storeEvents(enrichedEvents: any[], env: Env, ctx?: ExecutionContext): Promise<void> {
  console.log('🔄 storeEvents called with', enrichedEvents.length, 'events');
  console.log('Event types:', enrichedEvents.map(e => e.type).join(', '));
  
  try {
    const supabase = new SupabaseClient(env);
    
    // Extract visitor information from events
    const firstEvent = enrichedEvents[0];
    const visitorId = firstEvent._originalVisitorId || `visitor-${Date.now()}`;
    const trackingId = firstEvent.data?.tracking_id || null;
    const deviceFingerprint = firstEvent.data?.deviceFingerprint || null;
    const browserId = firstEvent.data?.browserId || null;
    
    // Try to extract email and hashes from any event in the batch
    let email: string | null = null;
    let emailHashes: { sha256?: string; sha1?: string; md5?: string } = {};
    for (const event of enrichedEvents) {
      // Check for plain text email
      if (event.data?.email && typeof event.data.email === 'string' && event.data.email.includes('@')) {
        email = event.data.email;
        emailHashes = {
          sha256: event.data.emailHash || event.data.sha256 || null,
          sha1: event.data.sha1 || null,
          md5: event.data.md5 || null
        };
        break;
      }
      // Check for email in browser_emails_scanned event
      if (event.type === 'browser_emails_scanned' && event.data?.emails && Array.isArray(event.data.emails)) {
        const firstEmail = event.data.emails[0];
        if (firstEmail?.email && firstEmail.email.includes('@')) {
          email = firstEmail.email;
          emailHashes = {
            sha256: firstEmail.sha256 || firstEmail.hash || null,
            sha1: firstEmail.sha1 || null,
            md5: firstEmail.md5 || null
          };
          break;
        }
      }
    }

    // DECISION POINT: Is this visitor identified?
    let isIdentified = false;
    let webVisitorId: string | null = null;
    let leadId: string | null = null;

    // Check if we have a tracking_id (from email campaign)
    if (trackingId) {
      // Try to find existing lead with this tracking_id
      try {
        leadId = await supabase.getOrCreateLead(trackingId, email);
        isIdentified = true;
        console.log(`✅ Visitor identified via tracking_id: ${trackingId} → lead ${leadId}`);
      } catch (error) {
        console.warn('⚠️ Could not find/create lead by tracking_id, treating as anonymous');
      }
    }

    // Check if we have an email and should identify them
    if (!isIdentified && email) {
      // Check if this visitor was previously identified
      const identificationStatus = await supabase.checkVisitorIdentification(visitorId);
      
      if (identificationStatus.isIdentified && identificationStatus.leadId) {
        // Already identified!
        leadId = identificationStatus.leadId;
        isIdentified = true;
        console.log(`✅ Visitor already identified: ${visitorId} → lead ${leadId}`);
      } else {
        // New identification event!
        try {
          // First create web_visitor if it doesn't exist
          webVisitorId = await supabase.getOrCreateWebVisitor(visitorId, deviceFingerprint, browserId);
          
          // Now identify them
          leadId = await supabase.identifyVisitor(
            visitorId,
            email,
            firstEvent.data?.firstName || null,
            firstEvent.data?.lastName || null,
            'email_capture'
          );
          isIdentified = true;
          console.log(`✅ Visitor newly identified: ${visitorId} → lead ${leadId}`);
        } catch (error: any) {
          console.error('❌ Failed to identify visitor:', error);
          // Fall back to anonymous tracking
        }
      }
    }

    // If still not identified, track as anonymous visitor
    if (!isIdentified) {
      webVisitorId = await supabase.getOrCreateWebVisitor(visitorId, deviceFingerprint, browserId);
      console.log(`📊 Tracking as anonymous visitor: ${visitorId} → web_visitor ${webVisitorId}`);
      
      // Enrich web_visitor with data from first event
      const enrichmentData: any = {
        first_page: firstEvent.url,
        first_referrer: firstEvent.referrer || null,
        country: firstEvent.country || null,
        city: firstEvent.city || null,
        region: firstEvent.region || null,
        timezone: firstEvent.data?.timezone || null,
        utm_source: firstEvent.utm_source || null,
        utm_medium: firstEvent.utm_medium || null,
        utm_campaign: firstEvent.utm_campaign || null,
        utm_term: firstEvent.utm_term || null,
        utm_content: firstEvent.utm_content || null,
        gclid: firstEvent.gclid || null,
        fbclid: firstEvent.fbclid || null
      };
      
      // Update web_visitor with enrichment data
      await supabase.updateWebVisitorEnrichment(webVisitorId, enrichmentData).catch(err => {
        console.warn('⚠️ Failed to enrich web_visitor:', err);
      });
      
      // If we have email hashes, store them for later de-anonymization
      if (email && (emailHashes.sha256 || emailHashes.sha1 || emailHashes.md5)) {
        const emailDomain = email.split('@')[1];
        await supabase.updateWebVisitorEmailHashes(
          webVisitorId, 
          emailHashes.sha256 || '', 
          emailHashes.sha1 || null, 
          emailHashes.md5 || null, 
          emailDomain
        );
      }
    }

    // Create session (belongs to either web_visitor or lead)
    let sessionId: string;
    try {
      // Prepare session enrichment data from first event
      const sessionEnrichment = {
        first_page: firstEvent.url,
        country: firstEvent.country || null,
        city: firstEvent.city || null,
        region: firstEvent.region || null,
        device: firstEvent.device_type || null,
        browser: firstEvent.data?.userAgent?.split(' ')[0] || null,
        operating_system: firstEvent.data?.platform || null
      };
      
      sessionId = await supabase.getOrCreateSession(
        firstEvent._originalSessionId,
        isIdentified ? null : webVisitorId,
        isIdentified ? leadId : null,
        sessionEnrichment
      );
      console.log(`✅ Session created: ${sessionId}`);
    } catch (error: any) {
      console.error('❌ Failed to create session:', error);
      sessionId = await supabase.getOrCreateSession(
        `fallback-${Date.now()}`,
        isIdentified ? null : webVisitorId,
        isIdentified ? leadId : null
      );
    }

    // Prepare all events with proper ownership
    const eventsToInsert = enrichedEvents.map(event => {
      const eventForInsert: any = {
        ...event,
        session_id: sessionId,
        web_visitor_id: isIdentified ? null : webVisitorId,
        lead_id: isIdentified ? leadId : null,
        // Remove helper fields
        _originalSessionId: undefined,
        _originalVisitorId: undefined,
        _originalTimestamp: undefined
      };
      delete eventForInsert._originalSessionId;
      delete eventForInsert._originalVisitorId;
      delete eventForInsert._originalTimestamp;
      
      return eventForInsert;
    });

    // Batch insert ALL events at once
    console.log('🚀 Inserting', eventsToInsert.length, 'events into Supabase...');
    await supabase.insertEvents(eventsToInsert);
    console.log(`✅ Successfully stored ${eventsToInsert.length} events`);

    // Update aggregates for anonymous visitors (after all events inserted)
    if (!isIdentified && webVisitorId && ctx) {
      // Don't await - update in background
      ctx.waitUntil(
        supabase.updateWebVisitorAggregates(webVisitorId).catch(err => {
          console.warn('⚠️ Failed to update aggregates:', err);
        })
      );
    }
    
  } catch (error: any) {
    console.error('❌ Failed to store events:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error;
  }
}


/**
 * Handle identity lookup (resolve short ID to full profile)
 * Uses lazy loading: KV first, then Supabase, then cache to KV
 */
async function handleIdentityLookup(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const identityId = url.searchParams.get('i');

    if (!identityId) {
      return new Response('Missing identity parameter', { status: 400 });
    }

    // Try KV first (fast path)
    let identity = await env.IDENTITY_STORE.get(identityId, 'json');

    if (!identity) {
      // Not in KV, look up in Supabase
      console.log('Identity not in KV, checking Supabase...', identityId);
      identity = await lookupIdentityInSupabase(identityId, env);
      
      if (identity) {
        // Cache in KV for future requests (90 days)
        await env.IDENTITY_STORE.put(identityId, JSON.stringify(identity), {
          expirationTtl: 90 * 24 * 60 * 60 // 90 days
        });
        console.log('Cached identity in KV:', identityId);
      } else {
        return new Response('Identity not found', { status: 404 });
      }
    }

    return new Response(JSON.stringify(identity), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Identity lookup error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Lookup identity in Supabase - Query lead table directly
 */
async function lookupIdentityInSupabase(shortId: string, env: Env): Promise<any> {
  console.log('📊 Looking up identity in Supabase:', shortId);
  try {
    const supabase = new SupabaseClient(env);
    
    const leads = await supabase.request(
      'GET',
      `/lead?tracking_id=eq.${shortId}&select=*&limit=1`
    );
    
    if (leads && leads.length > 0) {
      const lead = leads[0];
      return {
        // Identity data
        trackingId: lead.tracking_id,
        email: lead.work_email || lead.personal_email,
        firstName: lead.first_name,
        lastName: lead.last_name,
        personName: lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}` : null,
        
        // Contact
        phone: lead.phone,
        linkedin: lead.linkedin_url,
        
        // Company
        company: lead.company_name,
        companyName: lead.company_name,
        companyDescription: lead.company_description,
        companySize: lead.company_headcount,
        revenue: lead.company_revenue,
        industry: lead.company_industry,
        department: lead.job_department,
        companyWebsite: lead.company_website,
        companyLinkedin: lead.company_linkedin,
        
        // Job
        jobTitle: lead.job_title,
        seniority: lead.job_seniority,
        
        // Computed domain
        domain: lead.company_website || (lead.work_email || lead.personal_email ? (lead.work_email || lead.personal_email).split('@')[1] : null)
      };
    }
    
    return null;
  } catch (error) {
    console.error('Supabase lookup error:', error);
    return null;
  }
}

/**
 * Lookup web_visitor in Supabase by visitor_id
 */
async function lookupWebVisitorInSupabase(visitorId: string, env: Env): Promise<any> {
  console.log('📊 Looking up web_visitor in Supabase:', visitorId);
  try {
    const supabase = new SupabaseClient(env);
    
    const visitors = await supabase.request(
      'GET',
      `/web_visitor?visitor_id=eq.${encodeURIComponent(visitorId)}&select=*&limit=1`
    );
    
    if (visitors && visitors.length > 0) {
      return visitors[0];
    }
    
    return null;
  } catch (error) {
    console.error('Web visitor lookup error:', error);
    return null;
  }
}

/**
 * Lookup lead by UUID in Supabase
 */
async function lookupLeadById(leadId: string, env: Env): Promise<any> {
  console.log('📊 Looking up lead by ID in Supabase:', leadId);
  try {
    const supabase = new SupabaseClient(env);
    
    const leads = await supabase.request(
      'GET',
      `/lead?id=eq.${leadId}&select=*&limit=1`
    );
    
    if (leads && leads.length > 0) {
      const lead = leads[0];
      return {
        firstName: lead.first_name,
        lastName: lead.last_name,
        personName: lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}` : null,
        email: lead.work_email || lead.personal_email,
        phone: lead.phone,
        linkedin: lead.linkedin_url,
        company: lead.company_name,
        companyName: lead.company_name,
        companyDescription: lead.company_description,
        companySize: lead.company_headcount,
        revenue: lead.company_revenue,
        industry: lead.company_industry,
        department: lead.job_department,
        companyWebsite: lead.company_website,
        companyLinkedin: lead.company_linkedin,
        jobTitle: lead.job_title,
        seniority: lead.job_seniority,
        domain: lead.company_website || (lead.work_email || lead.personal_email ? (lead.work_email || lead.personal_email).split('@')[1] : null)
      };
    }
    
    return null;
  } catch (error) {
    console.error('Lead by ID lookup error:', error);
    return null;
  }
}

/**
 * Handle personalization data fetch
 * First visit: Uses leads table (name, company, enrichment data)
 * Return visits: Uses lead_profiles (intent scores, behavior)
 */
async function handlePersonalization(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const visitorId = url.searchParams.get('vid');

    if (!visitorId) {
      return new Response('Missing visitor ID', { status: 400 });
    }

    // Try IDENTITY_STORE first (where we synced lead data)
    let personalization = await env.IDENTITY_STORE.get(visitorId, 'json');

    if (!personalization) {
      // Try PERSONALIZATION namespace (for computed behavioral data)
      personalization = await env.PERSONALIZATION.get(visitorId, 'json');
    }

    if (!personalization) {
      // Try to find in Supabase - check both lead and web_visitor
      const identity = await lookupIdentityInSupabase(visitorId, env);
      
      if (identity) {
        // Found as identified lead
        personalization = {
          personalized: true,
          
          // Basic identity
          firstName: identity.firstName,
          lastName: identity.lastName,
          personName: identity.personName,
          email: identity.email,
          
          // Company data
          company: identity.company || identity.companyName,
          companyName: identity.companyName,
          companyDescription: identity.companyDescription,
          companySize: identity.companySize,
          revenue: identity.revenue,
          industry: identity.industry,
          department: identity.department,
          companyWebsite: identity.companyWebsite,
          companyLinkedin: identity.companyLinkedin,
          domain: identity.domain,
          
          // Job data
          jobTitle: identity.jobTitle,
          seniority: identity.seniority,
          
          // Contact data
          phone: identity.phone,
          linkedin: identity.linkedin,
          
          // Campaign attribution
          campaignId: identity.campaignId,
          campaignName: identity.campaignName,
          
          // Behavior (not available yet on first visit)
          intentScore: 0,
          engagementLevel: 'new',
          isFirstVisit: true,
          totalVisits: 0,
          totalPageviews: 0
        };
      } else {
        // Try to find as web_visitor (anonymous or identified)
        const webVisitorData = await lookupWebVisitorInSupabase(visitorId, env);
        
        if (webVisitorData && webVisitorData.is_identified && webVisitorData.lead_id) {
          // They're identified but we need lead data
          const leadData = await lookupLeadById(webVisitorData.lead_id, env);
          if (leadData) {
            personalization = {
              personalized: true,
              ...leadData,
              intentScore: webVisitorData.intent_score || 0,
              engagementLevel: webVisitorData.engagement_level || 'new',
              totalVisits: webVisitorData.total_sessions || 0,
              totalPageviews: webVisitorData.total_pageviews || 0
            };
          }
        } else if (webVisitorData && !webVisitorData.is_identified) {
          // Anonymous visitor - no personalization for privacy
          return new Response(JSON.stringify({ personalized: false }), {
            headers: { 
              'Content-Type': 'application/json',
              ...getCORSHeaders(request, env)
            }
          });
        } else {
          // Not found anywhere
          return new Response(JSON.stringify({ personalized: false }), {
            headers: { 
              'Content-Type': 'application/json',
              ...getCORSHeaders(request, env)
            }
          });
        }
      }
    }

    return new Response(JSON.stringify({
      personalized: true,
      ...(personalization as Record<string, any>)
    }), {
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Short cache for first visits
        ...getCORSHeaders(request, env)
      }
    });
  } catch (error) {
    console.error('Personalization error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Handle redirect from short URL
 */
async function handleRedirect(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const identityId = url.searchParams.get('i');
    const destination = url.searchParams.get('to') || '/';

    if (!identityId) {
      return Response.redirect(destination, 302);
    }

    // Track the click event (as a proper TrackingEvent)
    const clickEvent: TrackingEvent = {
      type: 'email_click',
      timestamp: Date.now(),
      sessionId: `email-click-${Date.now()}`, // Generate session ID for email clicks
      visitorId: identityId, // Use identity ID as visitor ID
      url: destination,
      referrer: request.headers.get('Referer') || '',
      data: {
      destination,
        tracking_id: identityId
      }
    };

    // Enrich and store click asynchronously (don't wait)
    const enrichedClick = enrichEvent(clickEvent, request);
    storeEvents([enrichedClick], env, ctx).catch(err => {
      console.error('Failed to store email click:', err);
    });

    // Redirect with identity parameter
    const destinationUrl = new URL(destination, url.origin);
    destinationUrl.searchParams.set('i', identityId);

    return Response.redirect(destinationUrl.toString(), 302);
  } catch (error) {
    console.error('Redirect error:', error);
    return Response.redirect('/', 302);
  }
}

/**
 * CORS handling
 */
function handleCORS(request: Request, env: Env): Response {
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders(request, env)
  });
}

function getCORSHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || [];

  if (isOriginAllowed(request, env)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    };
  }

  return {};
}

function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin') || '';
  const allowedOrigins = env.ALLOWED_ORIGINS?.split(',') || [];
  
  // In development, allow all origins
  if (env.ENVIRONMENT === 'development') {
    return true;
  }

  // Always allow Webflow canvas/preview domains (for testing in Webflow editor)
  if (origin.includes('.canvas.webflow.com') || origin.includes('.preview.webflow.com')) {
    return true;
  }

  // Check against explicitly allowed origins
  return allowedOrigins.some(allowed => {
    const trimmed = allowed.trim();
    // Support wildcard patterns like *.example.com
    if (trimmed.includes('*')) {
      const pattern = trimmed.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(origin);
    }
    return origin === trimmed;
  });
}

