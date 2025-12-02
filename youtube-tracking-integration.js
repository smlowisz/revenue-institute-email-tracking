/**
 * YouTube Video Tracking Integration
 * Tracks YouTube video events and sends them to Outbound Intent Engine
 * 
 * Usage:
 * 1. Load YouTube IFrame API: <script src="https://www.youtube.com/iframe_api"></script>
 * 2. Include this script after the tracking pixel
 * 3. Call initYouTubeTracking() after page load
 */

(function() {
  'use strict';

  // Track which videos have been initialized
  const trackedVideos = new Map();

  /**
   * Initialize YouTube tracking for all YouTube iframes on the page
   */
  function initYouTubeTracking() {
    // Wait for tracker to be available
    if (!window.oieTracker) {
      console.warn('⚠️ OutboundIntentTracker not found. YouTube tracking will not work.');
      return;
    }

    // Find all YouTube iframes
    const youtubeIframes = findYouTubeIframes();
    
    if (youtubeIframes.length === 0) {
      console.log('🎥 No YouTube iframes found on page');
      return;
    }

    console.log(`🎥 Found ${youtubeIframes.length} YouTube iframe(s)`);

    // Wait for YouTube API to be ready
    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
      // Load YouTube IFrame API if not already loaded
      loadYouTubeAPI(() => {
        initializePlayers(youtubeIframes);
      });
    } else {
      // API already loaded
      if (YT.ready) {
        YT.ready(() => {
          initializePlayers(youtubeIframes);
        });
      } else {
        initializePlayers(youtubeIframes);
      }
    }
  }

  /**
   * Find all YouTube iframes on the page
   */
  function findYouTubeIframes() {
    const iframes = document.querySelectorAll('iframe');
    const youtubeIframes = [];

    iframes.forEach((iframe, index) => {
      const src = iframe.src || '';
      
      // Check if it's a YouTube iframe
      if (src.includes('youtube.com/embed/') || 
          src.includes('youtu.be/') ||
          src.includes('youtube-nocookie.com/embed/')) {
        
        // Extract video ID
        const videoId = extractVideoId(src);
        
        if (videoId) {
          youtubeIframes.push({
            element: iframe,
            videoId: videoId,
            index: index,
            id: iframe.id || `youtube-player-${index}`
          });
        }
      }
    });

    return youtubeIframes;
  }

  /**
   * Extract YouTube video ID from URL
   */
  function extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/embed\/|youtu\.be\/|youtube-nocookie\.com\/embed\/)([^?&\/]+)/,
      /[?&]v=([^?&]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Load YouTube IFrame API
   */
  function loadYouTubeAPI(callback) {
    // Check if already loading
    if (window.onYouTubeIframeAPIReady) {
      const originalCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function() {
        originalCallback();
        if (callback) callback();
      };
      return;
    }

    // Set up callback
    window.onYouTubeIframeAPIReady = callback;

    // Load the API script
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
  }

  /**
   * Initialize YouTube players
   */
  function initializePlayers(youtubeIframes) {
    youtubeIframes.forEach((iframeInfo) => {
      // Skip if already tracked
      if (trackedVideos.has(iframeInfo.videoId)) {
        return;
      }

      try {
        // Create a unique ID for the player if it doesn't have one
        if (!iframeInfo.element.id) {
          iframeInfo.element.id = iframeInfo.id;
        }

        // Initialize player
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

  /**
   * Set up video tracking for a YouTube player
   */
  function setupVideoTracking(player, videoId) {
    const videoInfo = trackedVideos.get(videoId);
    if (!videoInfo) return;

    // Set play start time when tracking starts
    if (videoInfo.playStartTime === null) {
      videoInfo.playStartTime = Date.now();
    }

    // Set up progress tracking interval
    const progressInterval = setInterval(() => {
      try {
        if (player.getPlayerState() === YT.PlayerState.PLAYING) {
          const currentTime = player.getCurrentTime();
          const duration = player.getDuration();
          
          if (!duration || duration <= 0) return;

          const percent = (currentTime / duration) * 100;

          // Track "video_watched" event - fires when user has watched at least 10 seconds OR 25% of video
          if (!videoInfo.trackedWatched && videoInfo.playStartTime !== null) {
            const watchedTime = Date.now() - videoInfo.playStartTime;
            
            // Fire "video_watched" if: watched 10+ seconds OR reached 25% completion
            if (currentTime >= 10 || percent >= 25) {
              videoInfo.trackedWatched = true;
              console.log('🎥 YouTube video watched event triggered');
              trackVideoWatched(videoId, currentTime, percent, Math.round(watchedTime / 1000));
            }
          }

          // Track progress milestones
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
        // Player might be destroyed or unavailable
        clearInterval(progressInterval);
      }
    }, 1000); // Check every second

    // Store interval for cleanup
    videoInfo.progressInterval = progressInterval;
  }

  /**
   * Handle YouTube player state changes
   */
  function handleStateChange(event, videoId) {
    const player = event.target;
    const state = event.data;

    switch (state) {
      case YT.PlayerState.PLAYING:
        console.log('🎥 YouTube video play:', videoId);
        const videoInfo = trackedVideos.get(videoId);
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
        const videoInfo = trackedVideos.get(videoId);
        if (videoInfo && !videoInfo.tracked100) {
          videoInfo.tracked100 = true;
          const duration = player.getDuration();
          trackVideoComplete(videoId, duration);
        }
        break;
    }
  }

  /**
   * Track video play event
   */
  function trackVideoPlay(videoId) {
    if (window.oieTracker) {
      window.oieTracker.track('video_play', {
        src: `https://www.youtube.com/watch?v=${videoId}`,
        videoId: videoId,
        platform: 'youtube',
        videoType: 'youtube'
      });
    }
  }

  /**
   * Track video pause event
   */
  function trackVideoPause(videoId, currentTime) {
    if (window.oieTracker) {
      window.oieTracker.track('video_pause', {
        src: `https://www.youtube.com/watch?v=${videoId}`,
        videoId: videoId,
        platform: 'youtube',
        currentTime: currentTime
      });
    }
  }

  /**
   * Track video progress event
   */
  function trackVideoProgress(videoId, progress, currentTime, duration) {
    if (window.oieTracker) {
      window.oieTracker.track('video_progress', {
        src: `https://www.youtube.com/watch?v=${videoId}`,
        videoId: videoId,
        platform: 'youtube',
        progress: progress,
        currentTime: currentTime,
        duration: duration
      });
    }
  }

  /**
   * Track video complete event
   */
  function trackVideoComplete(videoId, duration) {
    if (window.oieTracker) {
      window.oieTracker.track('video_complete', {
        src: `https://www.youtube.com/watch?v=${videoId}`,
        videoId: videoId,
        platform: 'youtube',
        duration: duration
      });
    }
  }

  /**
   * Track video watched event (fires when user watches 10+ seconds OR 25% of video)
   */
  function trackVideoWatched(videoId, watchedSeconds, watchedPercent, watchTime) {
    if (window.oieTracker) {
      window.oieTracker.track('video_watched', {
        src: `https://www.youtube.com/watch?v=${videoId}`,
        videoId: videoId,
        platform: 'youtube',
        watchedSeconds: watchedSeconds,
        watchedPercent: Math.round(watchedPercent),
        watchTime: watchTime, // seconds since play started
        threshold: watchedSeconds >= 10 ? 'time' : 'percentage'
      });
    }
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(initYouTubeTracking, 1000); // Wait 1 second for iframes to load
    });
  } else {
    setTimeout(initYouTubeTracking, 1000);
  }

  // Also watch for dynamically added YouTube iframes
  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver((mutations) => {
      let hasNewYouTubeIframe = false;
      
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            const iframes = node.tagName === 'IFRAME' 
              ? [node] 
              : (node.querySelectorAll?.('iframe') || []);
            
            iframes.forEach(iframe => {
              const src = iframe.src || '';
              if (src.includes('youtube.com/embed/') || src.includes('youtu.be/')) {
                hasNewYouTubeIframe = true;
              }
            });
          }
        });
      });

      if (hasNewYouTubeIframe) {
        console.log('🎥 New YouTube iframe detected, re-initializing...');
        setTimeout(initYouTubeTracking, 500);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Expose function globally for manual initialization
  window.initYouTubeTracking = initYouTubeTracking;

})();

