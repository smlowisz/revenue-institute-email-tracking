/**
 * Outbound Intent Engine - Tracking Pixel
 * Lightweight client-side tracker for visitor behavior
 * Target: <12KB minified
 */

interface TrackerConfig {
  endpoint: string;
  identityParam?: string;
  cookieName?: string;
  localStorageKey?: string;
  sessionTimeout?: number;
  debug?: boolean;
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

class OutboundIntentTracker {
  private config: TrackerConfig;
  private visitorId: string | null = null;
  private sessionId: string;
  private sessionStartTime: number;
  private lastActivityTime: number;
  private eventQueue: TrackingEvent[] = [];
  private scrollDepth: number = 0;
  private maxScrollDepth: number = 0;
  private pageStartTime: number;
  private isActive: boolean = true;
  private activeTime: number = 0;
  private activeTimeInterval: any = null;

  constructor(config: TrackerConfig) {
    this.config = {
      identityParam: 'i',
      cookieName: '_oie_vid',
      localStorageKey: '_oie_visitor',
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      debug: false,
      ...config
    };

    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();
    this.pageStartTime = Date.now();
    this.sessionId = this.generateSessionId();

    this.initialize();
  }

  private initialize(): void {
    // 1. Check for identity parameter in URL
    this.checkUrlForIdentity();

    // 2. Load existing visitor ID
    this.loadVisitorId();

    // 3. Set up event listeners
    this.attachEventListeners();

    // 4. Track initial pageview
    this.trackPageview();

    // 5. Start active time tracking
    this.startActiveTimeTracking();

    // 6. Set up beacon on page unload
    this.setupUnloadBeacon();

    this.log('Tracker initialized', { visitorId: this.visitorId, sessionId: this.sessionId });
  }

  private checkUrlForIdentity(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const identityValue = urlParams.get(this.config.identityParam!);

    if (identityValue) {
      this.visitorId = identityValue;
      this.saveVisitorId(identityValue);
      this.log('Identity captured from URL', identityValue);
      
      // Clean URL (optional - remove the tracking param)
      // this.cleanUrl();
    }
  }

  private loadVisitorId(): void {
    if (this.visitorId) return; // Already set from URL

    // Try localStorage first
    try {
      const stored = localStorage.getItem(this.config.localStorageKey!);
      if (stored) {
        const data = JSON.parse(stored);
        if (Date.now() - data.timestamp < 90 * 24 * 60 * 60 * 1000) { // 90 days
          this.visitorId = data.visitorId;
          this.log('Visitor ID loaded from localStorage', this.visitorId);
          return;
        }
      }
    } catch (e) {
      this.log('localStorage not available', e);
    }

    // Fallback to cookie
    const cookieValue = this.getCookie(this.config.cookieName!);
    if (cookieValue) {
      this.visitorId = cookieValue;
      this.log('Visitor ID loaded from cookie', this.visitorId);
    }
  }

  private saveVisitorId(visitorId: string): void {
    // Save to localStorage
    try {
      localStorage.setItem(this.config.localStorageKey!, JSON.stringify({
        visitorId,
        timestamp: Date.now()
      }));
    } catch (e) {
      this.log('Failed to save to localStorage', e);
    }

    // Save to cookie (90 days)
    this.setCookie(this.config.cookieName!, visitorId, 90);
  }

  private generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private attachEventListeners(): void {
    // Scroll tracking
    let scrollTimeout: any;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.trackScroll();
      }, 150);
    }, { passive: true });

    // Click tracking
    document.addEventListener('click', (e) => {
      this.trackClick(e);
    }, { passive: true });

    // Form tracking
    document.addEventListener('submit', (e) => {
      this.trackFormSubmit(e);
    });

    // Form field focus (form start)
    document.addEventListener('focusin', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        this.trackEvent('form_start', {
          formId: (target.closest('form') as HTMLFormElement)?.id || 'unknown',
          fieldName: (target as HTMLInputElement).name || (target as HTMLInputElement).id
        });
      }
    });

    // Email field tracking (for de-anonymization)
    document.addEventListener('blur', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === 'INPUT' && 
          target.type === 'email' && 
          target.value && 
          target.value.includes('@')) {
        this.captureEmailForIdentity(target.value);
      }
    }, true);

    // Visibility change (tab focus/blur)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.isActive = false;
        this.trackEvent('focus_lost');
      } else {
        this.isActive = true;
        this.trackEvent('focus_gained');
      }
    });

    // Video tracking (for <video> elements)
    this.setupVideoTracking();

    // Copy events
    document.addEventListener('copy', () => {
      this.trackEvent('text_copied');
    });

    // Rage clicks detection
    this.setupRageClickDetection();
    
    // Track iframes (same-origin only)
    this.setupIframeTracking();
  }

  private trackPageview(): void {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Extract all UTM parameters
    const utmParams: Record<string, string> = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 
     'gclid', 'fbclid', 'msclkid', 'ref', 'source'].forEach(param => {
      const value = urlParams.get(param);
      if (value) utmParams[param] = value;
    });

    // Get all cookies (for fingerprinting)
    const cookies = document.cookie.split(';').reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && !key.startsWith('_oie')) { // Exclude our own cookies
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, string>);

    this.trackEvent('pageview', {
      // Page info
      title: document.title,
      path: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      fullUrl: window.location.href,
      
      // Referrer
      referrer: document.referrer,
      referrerDomain: document.referrer ? new URL(document.referrer).hostname : null,
      
      // UTM & Campaign tracking
      ...utmParams,
      hasUtm: Object.keys(utmParams).length > 0,
      
      // Device & Browser
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      colorDepth: window.screen.colorDepth,
      
      // Browser info
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: navigator.languages,
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      
      // Location & Time
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      
      // Page performance (if available)
      loadTime: performance.timing ? (performance.timing.loadEventEnd - performance.timing.navigationStart) : null,
      
      // Cookies (for fingerprinting)
      cookieCount: Object.keys(cookies).length,
      hasCookies: Object.keys(cookies).length > 0
    });
  }

  private trackScroll(): void {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    this.scrollDepth = Math.round(((scrollTop + windowHeight) / documentHeight) * 100);
    
    if (this.scrollDepth > this.maxScrollDepth) {
      this.maxScrollDepth = this.scrollDepth;
      
      // Track milestone scroll depths
      if ([25, 50, 75, 90, 100].includes(this.maxScrollDepth)) {
        this.trackEvent('scroll_depth', {
          depth: this.maxScrollDepth,
          pixelsScrolled: scrollTop
        });
      }
    }
  }

  private trackClick(e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    
    // Track links and buttons
    if (tagName === 'a' || tagName === 'button' || target.closest('a') || target.closest('button')) {
      const element = target.closest('a') || target.closest('button') || target;
      this.trackEvent('click', {
        elementType: element.tagName.toLowerCase(),
        elementId: element.id,
        elementClass: element.className,
        elementText: element.textContent?.substring(0, 100),
        href: (element as HTMLAnchorElement).href,
        x: e.clientX,
        y: e.clientY
      });
    }
  }

  private async trackFormSubmit(e: Event): Promise<void> {
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const data: Record<string, any> = {};
    let emailFound = '';

    // Capture form fields (hash emails)
    for (const [key, value] of formData.entries()) {
      if (key.toLowerCase().includes('email') && typeof value === 'string' && value.includes('@')) {
        emailFound = value;
        // Hash email for privacy and de-anonymization
        const hashes = await this.hashEmail(value);
        data[`${key}_sha256`] = hashes.sha256;
        data[`${key}_sha1`] = hashes.sha1;
        data[`${key}_md5`] = hashes.md5;
        
        // Store for de-anonymization
        this.storeEmailHash(hashes.sha256, value);
      } else {
        data[key] = typeof value === 'string' ? value.substring(0, 100) : value;
      }
    }

    this.trackEvent('form_submit', {
      formId: form.id || 'unknown',
      formAction: form.action,
      formMethod: form.method,
      fields: Object.keys(data),
      hasEmail: !!emailFound
    });

    // If email was captured, potentially identify this visitor
    if (emailFound) {
      this.trackEvent('email_captured', {
        formId: form.id || 'unknown',
        previouslyAnonymous: this.visitorId === null
      });
    }
  }

  private async hashEmail(email: string): Promise<{ sha256: string; sha1: string; md5: string }> {
    const normalized = email.toLowerCase().trim();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);

    const sha256Buffer = await crypto.subtle.digest('SHA-256', data);
    const sha1Buffer = await crypto.subtle.digest('SHA-1', data);
    
    return {
      sha256: this.bufferToHex(sha256Buffer),
      sha1: this.bufferToHex(sha1Buffer),
      md5: '' // MD5 not available in Web Crypto API, would need external library
    };
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private setupVideoTracking(): void {
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
      let tracked25 = false, tracked50 = false, tracked75 = false, tracked100 = false;

      video.addEventListener('play', () => {
        this.trackEvent('video_play', { src: video.src || video.currentSrc });
      });

      video.addEventListener('pause', () => {
        this.trackEvent('video_pause', { src: video.src || video.currentSrc, currentTime: video.currentTime });
      });

      video.addEventListener('timeupdate', () => {
        const percent = (video.currentTime / video.duration) * 100;
        if (percent >= 25 && !tracked25) {
          tracked25 = true;
          this.trackEvent('video_progress', { src: video.src || video.currentSrc, progress: 25 });
        }
        if (percent >= 50 && !tracked50) {
          tracked50 = true;
          this.trackEvent('video_progress', { src: video.src || video.currentSrc, progress: 50 });
        }
        if (percent >= 75 && !tracked75) {
          tracked75 = true;
          this.trackEvent('video_progress', { src: video.src || video.currentSrc, progress: 75 });
        }
        if (percent >= 100 && !tracked100) {
          tracked100 = true;
          this.trackEvent('video_complete', { src: video.src || video.currentSrc });
        }
      });
    });
  }

  private setupRageClickDetection(): void {
    let clicks: number[] = [];
    document.addEventListener('click', () => {
      const now = Date.now();
      clicks.push(now);
      clicks = clicks.filter(t => now - t < 2000); // Keep clicks within 2 seconds
      
      if (clicks.length >= 5) {
        this.trackEvent('rage_click');
        clicks = []; // Reset after detecting
      }
    });
  }

  private startActiveTimeTracking(): void {
    this.activeTimeInterval = setInterval(() => {
      if (this.isActive && !document.hidden) {
        this.activeTime += 1;
      }
    }, 1000);
  }

  private setupUnloadBeacon(): void {
    window.addEventListener('beforeunload', () => {
      this.trackEvent('page_exit', {
        activeTime: this.activeTime,
        totalTime: Math.round((Date.now() - this.pageStartTime) / 1000),
        maxScrollDepth: this.maxScrollDepth
      });
      this.flush(true); // Force send with beacon
    });
  }

  private trackEvent(type: string, data?: Record<string, any>): void {
    const event: TrackingEvent = {
      type,
      timestamp: Date.now(),
      sessionId: this.sessionId,
      visitorId: this.visitorId,
      url: window.location.href,
      referrer: document.referrer,
      data
    };

    this.eventQueue.push(event);
    this.lastActivityTime = Date.now();

    console.log('[OutboundIntentTracker] Event tracked:', type);

    // Send ALL events immediately - no batching, no delays
    // Use setTimeout(0) to ensure it happens after event is queued
    setTimeout(() => {
      if (this.eventQueue.length > 0) {
        this.flush();
      }
    }, 100); // 100ms delay to allow rapid events to batch slightly
  }

  private flush(useBeacon: boolean = false): void {
    if (this.eventQueue.length === 0) return;

    const events = [...this.eventQueue];
    this.eventQueue = [];

    const payload = JSON.stringify({
      events,
      meta: {
        sentAt: Date.now()
      }
    });

    // Always log event sending (regardless of debug mode) for troubleshooting
    console.log('[OutboundIntentTracker] Sending events:', events.map(e => e.type).join(', '));

    if (useBeacon && navigator.sendBeacon) {
      const sent = navigator.sendBeacon(this.config.endpoint, payload);
      console.log('[OutboundIntentTracker] Beacon sent:', sent, events.length, 'events');
    } else {
      fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: payload,
        keepalive: true
      }).then(res => {
        console.log('[OutboundIntentTracker] Fetch response:', res.status, events.length, 'events');
        return res.json();
      }).then(data => {
        console.log('[OutboundIntentTracker] Server response:', data);
      }).catch(err => {
        console.error('[OutboundIntentTracker] Failed to send events:', err);
        // Re-queue on failure
        this.eventQueue.push(...events);
      });
    }
  }

  private getCookie(name: string): string | null {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  }

  private setCookie(name: string, value: string, days: number): void {
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax; Secure`;
  }

  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[OutboundIntentTracker]', ...args);
    }
  }

  // Email capture for de-anonymization
  private async captureEmailForIdentity(email: string): Promise<void> {
    if (!email || !email.includes('@')) return;
    
    const hashes = await this.hashEmail(email);
    this.storeEmailHash(hashes.sha256, email);
    
    // Track that we captured an email (for de-anonymization)
    this.trackEvent('email_identified', {
      emailHash: hashes.sha256,
      wasAnonymous: this.visitorId === null,
      sessionId: this.sessionId
    });
  }

  private storeEmailHash(hash: string, email: string): void {
    try {
      // Store email hash for later de-anonymization
      localStorage.setItem('_oie_email_hash', hash);
      localStorage.setItem('_oie_email', email); // Store for reference (optional)
    } catch (e) {
      console.log('Failed to store email hash', e);
    }
  }

  // Track forms inside iframes (same-origin only)
  private setupIframeTracking(): void {
    try {
      // Check for iframes
      const iframes = document.querySelectorAll('iframe');
      
      iframes.forEach(iframe => {
        try {
          // Only works for same-origin iframes
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          
          if (iframeDoc) {
            // Track form submits in iframe
            iframeDoc.addEventListener('submit', (e) => {
              this.trackFormSubmit(e);
            });
            
            // Track clicks in iframe
            iframeDoc.addEventListener('click', (e) => {
              this.trackClick(e);
            });
            
            console.log('[OutboundIntentTracker] Tracking iframe:', iframe.src);
          }
        } catch (e) {
          // Cross-origin iframe - can't access
          console.log('[OutboundIntentTracker] Cannot track cross-origin iframe');
        }
      });
    } catch (e) {
      console.log('[OutboundIntentTracker] Iframe tracking not available');
    }
  }

  // Public API
  public identify(visitorId: string): void {
    this.visitorId = visitorId;
    this.saveVisitorId(visitorId);
    this.trackEvent('identify', { visitorId });
  }

  public track(eventName: string, properties?: Record<string, any>): void {
    this.trackEvent(eventName, properties);
  }
}

// Auto-initialize if config is provided
declare global {
  interface Window {
    OutboundIntentTracker: typeof OutboundIntentTracker;
    oieTracker?: OutboundIntentTracker;
    oieConfig?: TrackerConfig;
  }
}

// Expose class globally
window.OutboundIntentTracker = OutboundIntentTracker;

// Auto-init if config exists
if (window.oieConfig) {
  window.oieTracker = new OutboundIntentTracker(window.oieConfig);
}

export default OutboundIntentTracker;

