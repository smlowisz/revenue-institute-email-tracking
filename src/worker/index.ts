/**
 * Outbound Intent Engine - Cloudflare Worker
 * Edge worker for event ingestion, validation, and forwarding to BigQuery
 */

import { PIXEL_CODE_BASE64 } from './pixel-bundle';

export interface Env {
  IDENTITY_STORE: KVNamespace;
  PERSONALIZATION: KVNamespace;
  BIGQUERY_PROJECT_ID: string;
  BIGQUERY_DATASET: string;
  BIGQUERY_CREDENTIALS: string;
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

    if (url.pathname === '/pixel.js') {
      // Serve the tracking pixel directly (decode from base64)
      const pixelCode = atob(PIXEL_CODE_BASE64);
      return new Response(pixelCode, {
        headers: { 
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
          'Access-Control-Allow-Origin': '*', // Allow cross-origin
          'X-Content-Type-Options': 'nosniff'
        }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

/**
 * Handle incoming tracking events
 */
async function handleTrackEvents(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    // Validate origin
    if (!isOriginAllowed(request, env)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Parse event batch
    const body = await request.json() as EventBatch;
    
    if (!body.events || !Array.isArray(body.events)) {
      return new Response('Invalid payload', { status: 400 });
    }

    // Enrich events with server-side data
    const enrichedEvents = body.events.map(event => enrichEvent(event, request));

    // Store events SYNCHRONOUSLY to see errors
    try {
      await storeEvents(enrichedEvents, env);
      console.log('✅ Events stored successfully');
    } catch (error: any) {
      console.error('❌ ERROR storing events:', error.message);
      // Still return success to client, but log the error
    }

    // Return success
    return new Response(JSON.stringify({ 
      success: true, 
      eventsReceived: body.events.length 
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...getCORSHeaders(request, env)
      }
    });
  } catch (error) {
    console.error('Error handling events:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

/**
 * Enrich event with server-side data
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
  const urlParams = Object.fromEntries(url.searchParams.entries());

  return {
    ...event,
    
    // Server timestamps
    serverTimestamp: Date.now(),
    
    // IP & Geo
    ip,
    ipHash: ip ? hashString(ip) : null, // Hashed IP for privacy
    country,
    city: request.cf?.city,
    region: request.cf?.region,
    continent: request.cf?.continent,
    postalCode: request.cf?.postalCode,
    metroCode: request.cf?.metroCode,
    latitude: request.cf?.latitude,
    longitude: request.cf?.longitude,
    timezone: request.cf?.timezone,
    
    // Network info
    colo: request.cf?.colo, // Cloudflare datacenter
    asn: request.cf?.asn, // Autonomous System Number
    asOrganization: request.cf?.asOrganization, // ISP/Company
    
    // Request headers
    userAgent,
    acceptLanguage,
    refererHeader: referer,
    
    // URL breakdown
    urlParams, // All query parameters
    utmSource: urlParams.utm_source || null,
    utmMedium: urlParams.utm_medium || null,
    utmCampaign: urlParams.utm_campaign || null,
    utmTerm: urlParams.utm_term || null,
    utmContent: urlParams.utm_content || null,
    gclid: urlParams.gclid || null,
    fbclid: urlParams.fbclid || null,
    
    // Device hints (from Cloudflare)
    deviceType: request.cf?.deviceType, // desktop, mobile, tablet
    isEUCountry: request.cf?.isEUCountry,
    
    // TLS/Security
    tlsVersion: request.cf?.tlsVersion,
    tlsCipher: request.cf?.tlsCipher,
    httpProtocol: request.cf?.httpProtocol
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
 * Store events in BigQuery
 */
async function storeEvents(events: any[], env: Env): Promise<void> {
  console.log('🔄 storeEvents called with', events.length, 'events');
  console.log('Event types:', events.map(e => e.type).join(', '));
  
  try {
    // Get BigQuery credentials
    console.log('📋 Parsing credentials...');
    const credentials = JSON.parse(env.BIGQUERY_CREDENTIALS);
    const projectId = env.BIGQUERY_PROJECT_ID;
    const dataset = env.BIGQUERY_DATASET;
    console.log('✅ Credentials parsed. Project:', projectId, 'Dataset:', dataset);

    // Create JWT token for BigQuery API authentication
    console.log('🔑 Creating BigQuery token...');
    const token = await createBigQueryToken(credentials);
    console.log('✅ Token created');

    // Insert rows into BigQuery
    const tableId = 'events';
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/datasets/${dataset}/tables/${tableId}/insertAll`;
    console.log('📊 BigQuery URL:', url);

    const rows = events.map((event, index) => {
      // Convert data field to JSON string if it exists
      const eventForBQ = {
        ...event,
        data: event.data ? JSON.stringify(event.data) : null
      };
      
      return {
        insertId: `${event.sessionId}-${event.timestamp}-${index}`,
        json: eventForBQ
      };
    });
    console.log('📦 Prepared', rows.length, 'rows for insertion');

    console.log('🚀 Sending to BigQuery...');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        rows,
        skipInvalidRows: false,
        ignoreUnknownValues: false
      })
    });
    
    console.log('📬 BigQuery response status:', response.status, response.statusText);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ BigQuery insertion failed:', {
        status: response.status,
        statusText: response.statusText,
        error,
        projectId,
        dataset,
        tableId
      });
      throw new Error(`BigQuery error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    
    if (result.insertErrors) {
      console.error('❌ BigQuery insert errors:', JSON.stringify(result.insertErrors, null, 2));
    } else {
      console.log(`✅ Successfully stored ${events.length} events in BigQuery`);
    }
  } catch (error: any) {
    console.error('❌ Failed to store events:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    // In production, you might want to queue failed events for retry
  }
}

/**
 * Create JWT token for BigQuery API
 */
async function createBigQueryToken(credentials: any): Promise<string> {
  const header = {
    alg: 'RS256',
    typ: 'JWT',
    kid: credentials.private_key_id
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/bigquery.insertdata',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  // Base64url encode header and payload
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Sign with private key
  const privateKey = await importPrivateKey(credentials.private_key);
  const signature = await signToken(unsignedToken, privateKey);
  const encodedSignature = base64urlEncode(signature);

  const jwt = `${unsignedToken}.${encodedSignature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
  });

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Remove PEM header/footer and decode
  const pemContents = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  );
}

async function signToken(data: string, key: CryptoKey): Promise<string> {
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    encoder.encode(data)
  );
  return String.fromCharCode(...new Uint8Array(signature));
}

function base64urlEncode(data: string): string {
  const base64 = btoa(data);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Handle identity lookup (resolve short ID to full profile)
 * Uses lazy loading: KV first, then BigQuery, then cache to KV
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
      // Not in KV, look up in BigQuery
      console.log('Identity not in KV, checking BigQuery...', identityId);
      identity = await lookupIdentityInBigQuery(identityId, env);
      
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
 * Lookup identity in BigQuery identity_map table
 */
async function lookupIdentityInBigQuery(shortId: string, env: Env): Promise<any> {
  try {
    const token = await createBigQueryToken(JSON.parse(env.BIGQUERY_CREDENTIALS));
    const projectId = env.BIGQUERY_PROJECT_ID;
    const dataset = env.BIGQUERY_DATASET;
    
    const query = `
      SELECT 
        shortId,
        email,
        firstName,
        lastName,
        company,
        campaignId,
        campaignName
      FROM \`${projectId}.${dataset}.identity_map\`
      WHERE shortId = @shortId
      LIMIT 1
    `;
    
    const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${projectId}/queries`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        useLegacySql: false,
        parameterMode: 'NAMED',
        queryParameters: [
          {
            name: 'shortId',
            parameterType: { type: 'STRING' },
            parameterValue: { value: shortId }
          }
        ]
      })
    });
    
    if (!response.ok) {
      console.error('BigQuery lookup failed:', await response.text());
      return null;
    }
    
    const result = await response.json();
    
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0].f;
      return {
        shortId: row[0].v,
        email: row[1].v,
        firstName: row[2].v,
        lastName: row[3].v,
        company: row[4].v,
        campaignId: row[5].v,
        campaignName: row[6].v
      };
    }
    
    return null;
  } catch (error) {
    console.error('BigQuery lookup error:', error);
    return null;
  }
}

/**
 * Handle personalization data fetch
 * First visit: Uses identity_map (name, company from leads table)
 * Return visits: Uses lead_profiles (intent scores, behavior)
 */
async function handlePersonalization(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const visitorId = url.searchParams.get('vid');

    if (!visitorId) {
      return new Response('Missing visitor ID', { status: 400 });
    }

    // Try KV first for computed personalization (return visitors with scores)
    let personalization = await env.PERSONALIZATION.get(visitorId, 'json');

    if (!personalization) {
      // Not in KV, check if this is a known lead from identity_map
      const identity = await lookupIdentityInBigQuery(visitorId, env);
      
      if (identity) {
        // First visit - use data from leads table via identity_map
        personalization = {
          personalized: true,
          firstName: identity.firstName,
          lastName: identity.lastName,
          company: identity.company,
          email: identity.email,
          // No behavior data yet
          intentScore: 0,
          engagementLevel: 'new',
          viewedPricing: false,
          submittedForm: false,
          isFirstVisit: true
        };
      } else {
        // Unknown visitor
        return new Response(JSON.stringify({ personalized: false }), {
          headers: { 
            'Content-Type': 'application/json',
            ...getCORSHeaders(request, env)
          }
        });
      }
    }

    return new Response(JSON.stringify({
      personalized: true,
      ...personalization
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

    // Track the click
    const clickEvent = {
      type: 'email_click',
      timestamp: Date.now(),
      identityId,
      destination,
      ip: request.headers.get('CF-Connecting-IP'),
      userAgent: request.headers.get('User-Agent'),
      country: request.headers.get('CF-IPCountry')
    };

    // Store click asynchronously
    await storeEvents([clickEvent], env);

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

  return allowedOrigins.some(allowed => origin === allowed.trim());
}

