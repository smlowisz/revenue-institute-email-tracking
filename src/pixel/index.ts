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

    // 3. Scan browser storage for emails (for de-anonymization)
    this.scanBrowserForEmails();

    // 4. Update page history for backtracking detection
    this.updatePageHistory();

    // 5. Set up event listeners
    this.attachEventListeners();

    // 6. Track initial pageview
    this.trackPageview();

    // 7. Start active time tracking
    this.startActiveTimeTracking();

    // 8. Start reading time tracking
    this.startReadingTimeTracking();

    // 9. Set up beacon on page unload
    this.setupUnloadBeacon();

    // 10. Auto-load YouTube tracking integration
    this.loadYouTubeTracking();

    // 11. Periodic browser storage scan (every 30 seconds to catch updates)
    setInterval(() => {
      this.scanBrowserForEmails();
    }, 30000);

    this.log('Tracker initialized', { visitorId: this.visitorId, sessionId: this.sessionId });
  }

  private checkUrlForIdentity(): void {
    const urlParams = new URLSearchParams(window.location.search);
    const identityValue = urlParams.get(this.config.identityParam!);

    if (identityValue) {
      this.visitorId = identityValue;
      this.saveVisitorId(identityValue);
      this.log('Identity captured from URL', identityValue);
      
      // Track device switching (#19)
      this.trackDeviceSwitching(identityValue);
      
      // Clean URL (optional - remove the tracking param)
      // this.cleanUrl();
    }
  }

  // Device switching detection
  private trackDeviceSwitching(visitorId: string): void {
    try {
      const deviceHistory = JSON.parse(localStorage.getItem('_oie_devices') || '[]');
      const currentDevice = {
        fingerprint: this.generateDeviceFingerprint(),
        browserId: this.getBrowserId(),
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        timestamp: Date.now()
      };
      
      // Check if this is a new device for this visitor
      const isNewDevice = !deviceHistory.some((d: any) => d.fingerprint === currentDevice.fingerprint);
      
      if (isNewDevice) {
        deviceHistory.push(currentDevice);
        localStorage.setItem('_oie_devices', JSON.stringify(deviceHistory));
        
        // Track device switch event
        if (deviceHistory.length > 1) {
          this.trackEvent('device_switched', {
            previousDeviceCount: deviceHistory.length - 1,
            newDevice: currentDevice.fingerprint,
            allDevices: deviceHistory.map((d: any) => d.fingerprint)
          });
        }
      }
    } catch (e) {
      // Ignore
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

    // Click tracking - ALL mouse clicks (not just links/buttons)
    document.addEventListener('click', (e) => {
      this.trackClick(e);
    }, { passive: true });

    // Keyboard event tracking
    document.addEventListener('keydown', (e) => {
      // Key press tracking removed - not needed for higher deliverability
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
        // Re-scan browser storage after email input (storage might have updated)
        setTimeout(() => this.scanBrowserForEmails(), 1000);
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

    // Copy/paste events (detailed tracking)
    document.addEventListener('copy', (e) => {
      const selection = window.getSelection()?.toString() || '';
      this.trackEvent('text_copied', {
        textLength: selection.length,
        textPreview: selection.substring(0, 100), // First 100 chars
        page: window.location.pathname
      });
    });

    document.addEventListener('paste', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        this.trackEvent('text_pasted', {
          fieldName: (target as HTMLInputElement).name || (target as HTMLInputElement).id,
          page: window.location.pathname
        });
      }
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

    // Determine default channel source (if no UTM)
    const defaultChannel = this.getDefaultChannelSource();

    // Generate device fingerprint for cross-device tracking
    const deviceFingerprint = this.generateDeviceFingerprint();
    
    // Get browser ID for cross-tab tracking
    const browserId = this.getBrowserId();

    // Get visit count from localStorage
    const visitCount = this.getVisitCount();
    
    // Track reading/engagement start time
    this.pageStartTime = Date.now();

    this.trackEvent('page_view', {
      // Page info
      title: document.title,
      path: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
      fullUrl: window.location.href,
      
      // Referrer & Source
      referrer: document.referrer,
      referrerDomain: document.referrer ? new URL(document.referrer).hostname : null,
      defaultChannelSource: defaultChannel,
      
      // UTM & Campaign tracking (all parameters)
      ...utmParams,
      hasUtm: Object.keys(utmParams).length > 0,
      allUrlParams: Object.fromEntries(Array.from(urlParams.entries())), // ALL query params
      
      // Visit tracking
      visitNumber: visitCount,
      isFirstVisit: visitCount === 1,
      isReturnVisitor: visitCount > 1,
      
      // Cross-device tracking (sent to worker for web_visitor table)
      deviceFingerprint,
      browserId, // Persistent browser ID
      
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
      
      // Network context (without external APIs)
      connectionType: (navigator as any).connection?.effectiveType, // 4g, 3g, 2g, slow-2g
      connectionDownlink: (navigator as any).connection?.downlink, // Mbps
      connectionRtt: (navigator as any).connection?.rtt, // Round-trip time
      
      // Location & Time
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      localTime: new Date().toISOString(),
      localHour: new Date().getHours(),
      localDayOfWeek: new Date().getDay(), // 0-6
      isWeekend: [0, 6].includes(new Date().getDay()),
      isBusinessHours: this.isBusinessHours(),
      
      // Page performance
      loadTime: performance.timing ? (performance.timing.loadEventEnd - performance.timing.navigationStart) : null,
      domContentLoaded: performance.timing ? (performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart) : null,
      
      // Previous page (backtracking detection)
      previousPage: this.getPreviousPage(),
      isBacktracking: this.isBacktrackingBehavior()
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
    
    // Track ALL clicks (not just links/buttons)
    const element = target.closest('a') || target.closest('button') || target;
    const isLinkOrButton = tagName === 'a' || tagName === 'button' || target.closest('a') || target.closest('button');
    
    this.trackEvent('click', {
      elementType: element.tagName.toLowerCase(),
      elementId: element.id || null,
      elementClass: element.className || null,
      elementText: element.textContent?.substring(0, 100) || null,
      href: (element as HTMLAnchorElement).href || null,
      x: e.clientX,
      y: e.clientY,
      button: e.button, // 0=left, 1=middle, 2=right
      isLinkOrButton: isLinkOrButton,
      // Additional context
      targetTag: tagName,
      targetId: target.id || null,
      targetClass: target.className || null
    });
  }

  // Key press tracking removed - not needed for higher deliverability

  private async trackFormSubmit(e: Event): Promise<void> {
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const data: Record<string, any> = {};
    let emailFound = '';
    let emailHash: string | null = null;

    // Capture form fields (hash emails)
    for (const [key, value] of Array.from(formData.entries())) {
      if (key.toLowerCase().includes('email') && typeof value === 'string' && value.includes('@')) {
        emailFound = value;
        // Hash email for privacy and de-anonymization
        const hashes = await this.hashEmail(value);
        data[`${key}_sha256`] = hashes.sha256;
        data[`${key}_sha1`] = hashes.sha1;
        data[`${key}_md5`] = hashes.md5;
        
        // Store hash for event (reuse instead of hashing again)
        emailHash = hashes.sha256;
        
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
      hasEmail: !!emailFound,
      emailHash: emailHash,  // Include email hash for de-anonymization
      emailDomain: emailFound ? emailFound.split('@')[1] : null
    });

    // If email was captured, potentially identify this visitor
    if (emailFound) {
        this.trackEvent('email_submitted', {
        formId: form.id || 'unknown',
        previouslyAnonymous: this.visitorId === null
      });
      
      // Re-scan browser storage after form submit (storage might have updated)
      setTimeout(() => this.scanBrowserForEmails(), 1000);
    }
  }

  private async hashEmail(email: string): Promise<{ sha256: string; sha1: string; md5: string }> {
    const normalized = email.toLowerCase().trim();
    const encoder = new TextEncoder();
    const data = encoder.encode(normalized);

    const sha256Buffer = await crypto.subtle.digest('SHA-256', data);
    const sha1Buffer = await crypto.subtle.digest('SHA-1', data);
    const md5Hash = this.md5(normalized); // Use simple MD5 implementation
    
    return {
      sha256: this.bufferToHex(sha256Buffer),
      sha1: this.bufferToHex(sha1Buffer),
      md5: md5Hash
    };
  }

  // Simple MD5 implementation (for browser compatibility)
  private md5(str: string): string {
    function rotateLeft(value: number, shift: number): number {
      return (value << shift) | (value >>> (32 - shift));
    }
    
    function addUnsigned(x: number, y: number): number {
      const lsw = (x & 0xFFFF) + (y & 0xFFFF);
      const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
      return (msw << 16) | (lsw & 0xFFFF);
    }
    
    function F(x: number, y: number, z: number): number { return (x & y) | ((~x) & z); }
    function G(x: number, y: number, z: number): number { return (x & z) | (y & (~z)); }
    function H(x: number, y: number, z: number): number { return x ^ y ^ z; }
    function I(x: number, y: number, z: number): number { return y ^ (x | (~z)); }
    
    function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
      a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    
    function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
      a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    
    function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
      a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    
    function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
      a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac));
      return addUnsigned(rotateLeft(a, s), b);
    }
    
    function convertToWordArray(str: string): number[] {
      const wordArray: number[] = [];
      for (let i = 0; i < str.length * 8; i += 8) {
        wordArray[i >> 5] |= (str.charCodeAt(i / 8) & 0xFF) << (i % 32);
      }
      return wordArray;
    }
    
    function wordToHex(value: number): string {
      let hex = '';
      for (let i = 0; i < 4; i++) {
        const byte = (value >>> (i * 8)) & 0xFF;
        hex += byte.toString(16).padStart(2, '0');
      }
      return hex;
    }
    
    const x = convertToWordArray(str);
    const len = str.length * 8;
    
    x[len >> 5] |= 0x80 << (len % 32);
    x[(((len + 64) >>> 9) << 4) + 14] = len;
    
    let a = 0x67452301;
    let b = 0xEFCDAB89;
    let c = 0x98BADCFE;
    let d = 0x10325476;
    
    for (let i = 0; i < x.length; i += 16) {
      const oldA = a, oldB = b, oldC = c, oldD = d;
      
      a = FF(a, b, c, d, x[i + 0], 7, 0xD76AA478);
      d = FF(d, a, b, c, x[i + 1], 12, 0xE8C7B756);
      c = FF(c, d, a, b, x[i + 2], 17, 0x242070DB);
      b = FF(b, c, d, a, x[i + 3], 22, 0xC1BDCEEE);
      a = FF(a, b, c, d, x[i + 4], 7, 0xF57C0FAF);
      d = FF(d, a, b, c, x[i + 5], 12, 0x4787C62A);
      c = FF(c, d, a, b, x[i + 6], 17, 0xA8304613);
      b = FF(b, c, d, a, x[i + 7], 22, 0xFD469501);
      a = FF(a, b, c, d, x[i + 8], 7, 0x698098D8);
      d = FF(d, a, b, c, x[i + 9], 12, 0x8B44F7AF);
      c = FF(c, d, a, b, x[i + 10], 17, 0xFFFF5BB1);
      b = FF(b, c, d, a, x[i + 11], 22, 0x895CD7BE);
      a = FF(a, b, c, d, x[i + 12], 7, 0x6B901122);
      d = FF(d, a, b, c, x[i + 13], 12, 0xFD987193);
      c = FF(c, d, a, b, x[i + 14], 17, 0xA679438E);
      b = FF(b, c, d, a, x[i + 15], 22, 0x49B40821);
      
      a = GG(a, b, c, d, x[i + 1], 5, 0xF61E2562);
      d = GG(d, a, b, c, x[i + 6], 9, 0xC040B340);
      c = GG(c, d, a, b, x[i + 11], 14, 0x265E5A51);
      b = GG(b, c, d, a, x[i + 0], 20, 0xE9B6C7AA);
      a = GG(a, b, c, d, x[i + 5], 5, 0xD62F105D);
      d = GG(d, a, b, c, x[i + 10], 9, 0x02441453);
      c = GG(c, d, a, b, x[i + 15], 14, 0xD8A1E681);
      b = GG(b, c, d, a, x[i + 4], 20, 0xE7D3FBC8);
      a = GG(a, b, c, d, x[i + 9], 5, 0x21E1CDE6);
      d = GG(d, a, b, c, x[i + 14], 9, 0xC33707D6);
      c = GG(c, d, a, b, x[i + 3], 14, 0xF4D50D87);
      b = GG(b, c, d, a, x[i + 8], 20, 0x455A14ED);
      a = GG(a, b, c, d, x[i + 13], 5, 0xA9E3E905);
      d = GG(d, a, b, c, x[i + 2], 9, 0xFCEFA3F8);
      c = GG(c, d, a, b, x[i + 7], 14, 0x676F02D9);
      b = GG(b, c, d, a, x[i + 12], 20, 0x8D2A4C8A);
      
      a = HH(a, b, c, d, x[i + 5], 4, 0xFFFA3942);
      d = HH(d, a, b, c, x[i + 8], 11, 0x8771F681);
      c = HH(c, d, a, b, x[i + 11], 16, 0x6D9D6122);
      b = HH(b, c, d, a, x[i + 14], 23, 0xFDE5380C);
      a = HH(a, b, c, d, x[i + 1], 4, 0xA4BEEA44);
      d = HH(d, a, b, c, x[i + 4], 11, 0x4BDECFA9);
      c = HH(c, d, a, b, x[i + 7], 16, 0xF6BB4B60);
      b = HH(b, c, d, a, x[i + 10], 23, 0xBEBFBC70);
      a = HH(a, b, c, d, x[i + 13], 4, 0x289B7EC6);
      d = HH(d, a, b, c, x[i + 0], 11, 0xEAA127FA);
      c = HH(c, d, a, b, x[i + 3], 16, 0xD4EF3085);
      b = HH(b, c, d, a, x[i + 6], 23, 0x04881D05);
      a = HH(a, b, c, d, x[i + 9], 4, 0xD9D4D039);
      d = HH(d, a, b, c, x[i + 12], 11, 0xE6DB99E5);
      c = HH(c, d, a, b, x[i + 15], 16, 0x1FA27CF8);
      b = HH(b, c, d, a, x[i + 2], 23, 0xC4AC5665);
      
      a = II(a, b, c, d, x[i + 0], 6, 0xF4292244);
      d = II(d, a, b, c, x[i + 7], 10, 0x432AFF97);
      c = II(c, d, a, b, x[i + 14], 15, 0xAB9423A7);
      b = II(b, c, d, a, x[i + 5], 21, 0xFC93A039);
      a = II(a, b, c, d, x[i + 12], 6, 0x655B59C3);
      d = II(d, a, b, c, x[i + 3], 10, 0x8F0CCC92);
      c = II(c, d, a, b, x[i + 10], 15, 0xFFEFF47D);
      b = II(b, c, d, a, x[i + 1], 21, 0x85845DD1);
      a = II(a, b, c, d, x[i + 8], 6, 0x6FA87E4F);
      d = II(d, a, b, c, x[i + 15], 10, 0xFE2CE6E0);
      c = II(c, d, a, b, x[i + 6], 15, 0xA3014314);
      b = II(b, c, d, a, x[i + 13], 21, 0x4E0811A1);
      a = II(a, b, c, d, x[i + 4], 6, 0xF7537E82);
      d = II(d, a, b, c, x[i + 11], 10, 0xBD3AF235);
      c = II(c, d, a, b, x[i + 2], 15, 0x2AD7D2BB);
      b = II(b, c, d, a, x[i + 9], 21, 0xEB86D391);
      
      a = addUnsigned(a, oldA);
      b = addUnsigned(b, oldB);
      c = addUnsigned(c, oldC);
      d = addUnsigned(d, oldD);
    }
    
    return wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d);
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private setupVideoTracking(): void {
    // Track existing videos
    const existingVideos = document.querySelectorAll('video');
    this.log('🎥 Found', existingVideos.length, 'video elements on page');
    
    existingVideos.forEach((video, index) => {
      this.log(`🎥 Attaching tracking to video ${index + 1}:`, video.src || video.currentSrc || 'no src');
      this.attachVideoTracking(video);
    });

    // Also try after DOM is fully loaded (in case videos load late)
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        const lateVideos = document.querySelectorAll('video');
        this.log('🎥 Found', lateVideos.length, 'video elements after DOMContentLoaded');
        lateVideos.forEach((video, index) => {
          if (!(video as any)._oieTracked) {
            this.log(`🎥 Attaching tracking to late-loaded video ${index + 1}:`, video.src || video.currentSrc || 'no src');
            this.attachVideoTracking(video);
          }
        });
      });
    }

    // Watch for dynamically added videos
    if (typeof MutationObserver !== 'undefined') {
      const videoObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === 1) { // Element node
              const element = node as HTMLElement;
              // Check if the added node is a video
              if (element.tagName === 'VIDEO') {
                const videoElement = element as HTMLVideoElement;
                this.log('🎥 New video element detected via MutationObserver:', videoElement.src || videoElement.currentSrc || 'no src');
                this.attachVideoTracking(videoElement);
              }
              // Check if the added node contains videos
              const videos = element.querySelectorAll?.('video');
              if (videos && videos.length > 0) {
                this.log('🎥 Found', videos.length, 'video(s) in new element');
                videos.forEach(video => {
                  if (!(video as any)._oieTracked) {
                    this.attachVideoTracking(video);
                  }
                });
              }
            }
          });
        });
      });

      // Start observing the document body for added video elements
      videoObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      this.log('🎥 MutationObserver set up to watch for new videos');
    }
  }

  private attachVideoTracking(video: HTMLVideoElement): void {
    // Skip if already tracking this video
    if ((video as any)._oieTracked) {
      this.log('🎥 Video already tracked, skipping:', video.src || video.currentSrc || 'no src');
      return;
    }
    (video as any)._oieTracked = true;

    let tracked25 = false, tracked50 = false, tracked75 = false, tracked100 = false;
    let trackedWatched = false;
    let playStartTime: number | null = null;

    const getVideoInfo = () => ({
      src: video.src || video.currentSrc || null,
      duration: isFinite(video.duration) ? video.duration : null,
      videoId: video.id || null,
      videoClass: video.className || null
    });

    // Wait for video metadata to be loaded (duration might not be available immediately)
    const setupTracking = () => {
      this.log('🎥 Setting up event listeners for video:', video.src || video.currentSrc || video.id || 'unnamed');
      
      video.addEventListener('play', () => {
        this.log('🎥 Video play event detected');
        playStartTime = Date.now();
        this.trackEvent('video_play', getVideoInfo());
      }, { passive: true });

      video.addEventListener('pause', () => {
        this.log('🎥 Video pause event detected at', video.currentTime, 'seconds');
        this.trackEvent('video_pause', {
          ...getVideoInfo(),
          currentTime: isFinite(video.currentTime) ? video.currentTime : null
        });
      }, { passive: true });

      video.addEventListener('timeupdate', () => {
        // Skip if duration is invalid
        if (!isFinite(video.duration) || video.duration <= 0 || !isFinite(video.currentTime)) {
          return;
        }

        const percent = (video.currentTime / video.duration) * 100;
        
        // Track "video_watched" event - fires when user has watched at least 10 seconds OR 25% of video
        if (!trackedWatched && playStartTime !== null) {
          const watchedSeconds = video.currentTime;
          const watchedTime = Date.now() - playStartTime;
          
          // Fire "video_watched" if: watched 10+ seconds OR reached 25% completion
          if (watchedSeconds >= 10 || percent >= 25) {
            trackedWatched = true;
            this.log('🎥 Video watched event triggered');
            this.trackEvent('video_watched', {
              ...getVideoInfo(),
              watchedSeconds: watchedSeconds,
              watchedPercent: Math.round(percent),
              watchTime: Math.round(watchedTime / 1000), // seconds since play started
              threshold: watchedSeconds >= 10 ? 'time' : 'percentage'
            });
          }
        }
        
        if (percent >= 25 && !tracked25) {
          tracked25 = true;
          this.log('🎥 Video progress: 25%');
          this.trackEvent('video_progress', {
            ...getVideoInfo(),
            progress: 25,
            currentTime: video.currentTime
          });
        }
        if (percent >= 50 && !tracked50) {
          tracked50 = true;
          this.log('🎥 Video progress: 50%');
          this.trackEvent('video_progress', {
            ...getVideoInfo(),
            progress: 50,
            currentTime: video.currentTime
          });
        }
        if (percent >= 75 && !tracked75) {
          tracked75 = true;
          this.log('🎥 Video progress: 75%');
          this.trackEvent('video_progress', {
            ...getVideoInfo(),
            progress: 75,
            currentTime: video.currentTime
          });
        }
        if (percent >= 100 && !tracked100) {
          tracked100 = true;
          this.log('🎥 Video progress: 100%');
          this.trackEvent('video_complete', {
            ...getVideoInfo(),
            duration: video.duration
          });
        }
      }, { passive: true });

      // Track video ended event (alternative to 100% completion)
      video.addEventListener('ended', () => {
        if (!tracked100) {
          tracked100 = true;
          this.log('🎥 Video ended event detected');
          this.trackEvent('video_complete', {
            ...getVideoInfo(),
            duration: video.duration
          });
        }
      }, { passive: true });

      // Track when video metadata is loaded (duration available)
      video.addEventListener('loadedmetadata', () => {
        this.log('🎥 Video metadata loaded. Duration:', video.duration, 'seconds');
      }, { passive: true });
    };

    // If video is already loaded, set up tracking immediately
    if (video.readyState >= 1) { // HAVE_METADATA or higher
      setupTracking();
    } else {
      // Wait for metadata to load
      video.addEventListener('loadedmetadata', setupTracking, { once: true, passive: true });
      // Also set up tracking on canplay (video can start playing)
      video.addEventListener('canplay', setupTracking, { once: true, passive: true });
    }
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

  // Reading time tracking (scroll speed = reading speed)
  private startReadingTimeTracking(): void {
    let lastScrollPosition = 0;
    let lastScrollTime = Date.now();
    let readingTime = 0; // Time spent reading (slow scrolling or stationary)
    let scanningTime = 0; // Time spent fast scrolling
    
    setInterval(() => {
      if (document.hidden || !this.isActive) return;
      
      const currentScroll = window.pageYOffset || document.documentElement.scrollTop;
      const scrollDelta = Math.abs(currentScroll - lastScrollPosition);
      const timeDelta = Date.now() - lastScrollTime;
      
      if (scrollDelta < 50 && timeDelta >= 1000) {
        // Stationary for 1 second = reading
        readingTime += 1;
      } else if (scrollDelta > 300) {
        // Fast scroll = scanning
        scanningTime += 1;
      } else if (scrollDelta > 0 && scrollDelta < 300) {
        // Slow scroll = reading while scrolling
        readingTime += 1;
      }
      
      lastScrollPosition = currentScroll;
      lastScrollTime = Date.now();
      
      // Store for page_exit event
      (window as any)._oie_reading_time = readingTime;
      (window as any)._oie_scanning_time = scanningTime;
    }, 1000);
  }

  private setupUnloadBeacon(): void {
    window.addEventListener('beforeunload', () => {
      const totalTime = Math.round((Date.now() - this.pageStartTime) / 1000);
      const readingTime = (window as any)._oie_reading_time || 0;
      const scanningTime = (window as any)._oie_scanning_time || 0;
      
      this.trackEvent('page_exit', {
        activeTime: this.activeTime,
        totalTime,
        maxScrollDepth: this.maxScrollDepth,
        
        // Reading quality metrics (#3)
        readingTime,  // Slow scroll or stationary
        scanningTime, // Fast scrolling
        readingRatio: totalTime > 0 ? readingTime / totalTime : 0,
        engagementQuality: readingTime > scanningTime ? 'high' : 'low',
        
        // Content depth (#5)
        pagesThisSession: this.getPageCountThisSession(),
        timePerPage: this.getAverageTimePerPage(),
        
        // Device context
        deviceFingerprint: this.generateDeviceFingerprint(),
        browserId: this.getBrowserId()
      });
      this.flush(true); // Force send with beacon
    });
  }

  private getPageCountThisSession(): number {
    try {
      const history = JSON.parse(sessionStorage.getItem('_oie_page_history') || '[]');
      return history.length;
    } catch (e) {
      return 1;
    }
  }

  private getAverageTimePerPage(): number {
    const pageCount = this.getPageCountThisSession();
    const totalTime = Math.round((Date.now() - this.sessionStartTime) / 1000);
    return pageCount > 0 ? Math.round(totalTime / pageCount) : totalTime;
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

  // Visit count tracking
  private getVisitCount(): number {
    try {
      const visits = localStorage.getItem('_oie_visit_count');
      const currentCount = visits ? parseInt(visits) : 0;
      const newCount = currentCount + 1;
      localStorage.setItem('_oie_visit_count', newCount.toString());
      localStorage.setItem('_oie_last_visit', Date.now().toString());
      return newCount;
    } catch (e) {
      return 1;
    }
  }

  // Default channel source (when no UTM)
  private getDefaultChannelSource(): string {
    const referrer = document.referrer;
    if (!referrer) return 'direct';
    
    const domain = new URL(referrer).hostname.toLowerCase();
    
    // Search engines
    if (domain.includes('google.')) return 'organic_search_google';
    if (domain.includes('bing.')) return 'organic_search_bing';
    if (domain.includes('yahoo.')) return 'organic_search_yahoo';
    if (domain.includes('duckduckgo.')) return 'organic_search_duckduckgo';
    
    // Social media
    if (domain.includes('facebook.') || domain.includes('fb.')) return 'social_facebook';
    if (domain.includes('linkedin.')) return 'social_linkedin';
    if (domain.includes('twitter.') || domain.includes('t.co')) return 'social_twitter';
    if (domain.includes('instagram.')) return 'social_instagram';
    
    // If from same domain
    if (domain === window.location.hostname) return 'internal';
    
    // Otherwise it's a referral
    return `referral_${domain}`;
  }

  // Device fingerprint (cross-device/browser tracking)
  private generateDeviceFingerprint(): string {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage,
      navigator.platform
    ];
    
    const fingerprint = components.join('|');
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      const char = fingerprint.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  // Persistent browser ID (cross-tab tracking)
  private getBrowserId(): string {
    try {
      let browserId = localStorage.getItem('_oie_browser_id');
      if (!browserId) {
        browserId = this.generateSessionId() + '-' + Date.now();
        localStorage.setItem('_oie_browser_id', browserId);
      }
      return browserId;
    } catch (e) {
      return 'unknown';
    }
  }

  // Business hours detection
  private isBusinessHours(): boolean {
    const hour = new Date().getHours();
    const day = new Date().getDay();
    // Monday-Friday, 9am-5pm local time
    return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
  }

  // Previous page tracking (backtracking detection)
  private getPreviousPage(): string | null {
    try {
      return sessionStorage.getItem('_oie_previous_page');
    } catch (e) {
      return null;
    }
  }

  private savePreviousPage(url: string): void {
    try {
      sessionStorage.setItem('_oie_previous_page', url);
    } catch (e) {
      // Ignore
    }
  }

  // Backtracking behavior detection
  private isBacktrackingBehavior(): boolean {
    const previous = this.getPreviousPage();
    const current = window.location.pathname;
    
    if (!previous) return false;
    
    // Check if returning to a previously visited page in this session
    try {
      const history = JSON.parse(sessionStorage.getItem('_oie_page_history') || '[]');
      return history.includes(current) && history[history.length - 1] !== current;
    } catch (e) {
      return false;
    }
  }

  private updatePageHistory(): void {
    try {
      const history = JSON.parse(sessionStorage.getItem('_oie_page_history') || '[]');
      history.push(window.location.pathname);
      // Keep last 20 pages
      if (history.length > 20) history.shift();
      sessionStorage.setItem('_oie_page_history', JSON.stringify(history));
      sessionStorage.setItem('_oie_previous_page', window.location.pathname);
    } catch (e) {
      // Ignore
    }
  }

  // Email capture for de-anonymization
  private async captureEmailForIdentity(email: string): Promise<void> {
    if (!email || !email.includes('@')) return;
    
    const hashes = await this.hashEmail(email);
    this.storeEmailHash(hashes.sha256, email);
    
    // Track that we captured an email (for de-anonymization)
    this.trackEvent('email_captured', {
      emailHash: hashes.sha256,
      emailDomain: email.split('@')[1],
      wasAnonymous: this.visitorId === null,
      sessionId: this.sessionId
    });
  }

  private storeEmailHash(hash: string, email: string): void {
    try {
      // Store email hash for later de-anonymization
      localStorage.setItem('_oie_email_hash', hash);
      localStorage.setItem('_oie_email_domain', email.split('@')[1]);
    } catch (e) {
      console.log('Failed to store email hash', e);
    }
  }

  /**
   * Comprehensive email scanning from browser storage
   * Scans localStorage, sessionStorage, cookies, and URL params
   * Sends all found emails (hashed) for de-anonymization
   */
  private async scanBrowserForEmails(): Promise<void> {
    try {
      const foundEmails = new Set<string>();
      const emailSources: Array<{ source: string; email: string }> = [];

      // 1. Scan localStorage
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            const value = localStorage.getItem(key);
            if (value) {
              const emails = this.extractEmails(value);
              emails.forEach(email => {
                foundEmails.add(email.toLowerCase().trim());
                emailSources.push({ source: `localStorage.${key}`, email });
              });
            }
          }
        }
      } catch (e) {
        this.log('Failed to scan localStorage', e);
      }

      // 2. Scan sessionStorage
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) {
            const value = sessionStorage.getItem(key);
            if (value) {
              const emails = this.extractEmails(value);
              emails.forEach(email => {
                foundEmails.add(email.toLowerCase().trim());
                emailSources.push({ source: `sessionStorage.${key}`, email });
              });
            }
          }
        }
      } catch (e) {
        this.log('Failed to scan sessionStorage', e);
      }

      // 3. Scan cookies
      try {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [key, value] = cookie.split('=').map(s => s.trim());
          if (value) {
            const emails = this.extractEmails(value);
            emails.forEach(email => {
              foundEmails.add(email.toLowerCase().trim());
              emailSources.push({ source: `cookie.${key}`, email });
            });
          }
        }
      } catch (e) {
        this.log('Failed to scan cookies', e);
      }

      // 4. Scan URL parameters
      try {
        const urlParams = new URLSearchParams(window.location.search);
        for (const [key, value] of urlParams.entries()) {
          const emails = this.extractEmails(value);
          emails.forEach(email => {
            foundEmails.add(email.toLowerCase().trim());
            emailSources.push({ source: `url.${key}`, email });
          });
        }
      } catch (e) {
        this.log('Failed to scan URL params', e);
      }

      // 5. Hash and send all found emails
      if (foundEmails.size > 0) {
        const emailHashes: Array<{ email: string; hash: string; sources: string[] }> = [];
        
        for (const email of foundEmails) {
          if (this.isValidEmail(email)) {
            const hashes = await this.hashEmail(email);
            const sources = emailSources
              .filter(s => s.email.toLowerCase().trim() === email)
              .map(s => s.source);
            
            emailHashes.push({
              email, // Send plain text too (as requested)
              sha256: hashes.sha256,
              sha1: hashes.sha1,
              md5: hashes.md5,
              sources
            });
          }
        }

        if (emailHashes.length > 0) {
          this.trackEvent('browser_emails_scanned', {
            emailCount: emailHashes.length,
            emails: emailHashes, // Includes both plain text and hashes
            scannedSources: ['localStorage', 'sessionStorage', 'cookies', 'url']
          });

          this.log(`Found ${emailHashes.length} email(s) in browser storage`, emailHashes);
        }
      }
    } catch (error) {
      this.log('Error scanning browser for emails', error);
    }
  }

  /**
   * Extract email addresses from text (supports multiple formats)
   */
  private extractEmails(text: string): string[] {
    if (!text || typeof text !== 'string') return [];
    
    const emails: string[] = [];
    
    // Standard email regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = text.match(emailRegex);
    
    if (matches) {
      emails.push(...matches);
    }

    // Also check for JSON-encoded emails
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object') {
        const jsonString = JSON.stringify(parsed);
        const jsonMatches = jsonString.match(emailRegex);
        if (jsonMatches) {
          emails.push(...jsonMatches);
        }
      }
    } catch (e) {
      // Not JSON, ignore
    }

    // Check for URL-encoded emails
    try {
      const decoded = decodeURIComponent(text);
      const decodedMatches = decoded.match(emailRegex);
      if (decodedMatches) {
        emails.push(...decodedMatches);
      }
    } catch (e) {
      // Not URL encoded, ignore
    }

    return [...new Set(emails)]; // Remove duplicates
  }

  /**
   * Validate email format
   */
  private isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email.trim());
  }

  // Company domain extraction (from email)
  private getCompanyDomain(): string | null {
    try {
      return localStorage.getItem('_oie_email_domain');
    } catch (e) {
      return null;
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

  // Auto-load YouTube tracking integration script
  private loadYouTubeTracking(): void {
    // Get the base URL from the endpoint config
    const endpointUrl = new URL(this.config.endpoint);
    const baseUrl = `${endpointUrl.protocol}//${endpointUrl.host}`;
    const youtubeScriptUrl = `${baseUrl}/youtube-tracking-integration.js`;

    // Check if script is already loaded
    const existingScript = document.querySelector(`script[src="${youtubeScriptUrl}"]`);
    if (existingScript) {
      this.log('YouTube tracking script already loaded');
      return;
    }

    // Load the YouTube tracking script
    const script = document.createElement('script');
    script.src = youtubeScriptUrl;
    script.async = true;
    script.onload = () => {
      this.log('✅ YouTube tracking script loaded successfully');
      // Script auto-initializes via tryInitialize() function
    };
    script.onerror = () => {
      console.warn('[OutboundIntentTracker] Failed to load YouTube tracking script');
    };

    // Add to page
    const firstScript = document.getElementsByTagName('script')[0];
    if (firstScript && firstScript.parentNode) {
      firstScript.parentNode.insertBefore(script, firstScript);
    } else {
      document.head.appendChild(script);
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

