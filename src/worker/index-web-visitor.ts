/**
 * Cloudflare Worker - Updated for web_visitor Architecture
 * 
 * Key Changes:
 * 1. Anonymous visitors go to web_visitor table
 * 2. Identified visitors go to lead table
 * 3. Events/sessions link to either web_visitor_id OR lead_id
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
      return handleRedirect(request, env, ctx);
    }

    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/pixel.js') {
      const pixelCode = atob(PIXEL_CODE_BASE64);
      return new Response(pixelCode, {
        headers: { 
          'Content-Type': 'application/javascript',
          'Cache-Control': 'public, max-age=300, must-revalidate',
          'Access-Control-Allow-Origin': '*',
          'X-Content-Type-Options': 'nosniff',
          'ETag': `"pixel-v${Date.now()}"`,
          'Vary': 'Accept-Encoding'
        }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};

/**
 * Handle incoming tracking events - Updated for web_visitor architecture
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

    // Store events using new architecture
    let storeSuccess = false;
    let storeError: string | null = null;
    
    try {
      await storeEventsWebVisitor(enrichedEvents, env, ctx);
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
 * Store events using web_visitor architecture
 * Key decision: Is this visitor anonymous or identified?
 */
async function storeEventsWebVisitor(enrichedEvents: any[], env: Env, ctx: ExecutionContext): Promise<void> {
  console.log('🔄 storeEventsWebVisitor called with', enrichedEvents.length, 'events');
  
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
      sessionId = await supabase.getOrCreateSession(
        firstEvent._originalSessionId,
        isIdentified ? null : webVisitorId,
        isIdentified ? leadId : null
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
    if (!isIdentified && webVisitorId) {
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
 * Enrich event with server-side data (unchanged)
 */
function enrichEvent(event: TrackingEvent, request: Request): any {
  const ip = request.headers.get('CF-Connecting-IP');
  const country = request.headers.get('CF-IPCountry');
  const userAgent = request.headers.get('User-Agent');
  const acceptLanguage = request.headers.get('Accept-Language');
  const referer = request.headers.get('Referer');
  
  const url = new URL(event.url);
  const urlParams = Object.fromEntries(Array.from(url.searchParams.entries()));
  
  const companyIdentifier = ip ? hashString(ip.split('.').slice(0, 2).join('.')) : null;

  const normalizedType = normalizeEventType(event.type);
  return {
    category: getEventCategory(normalizedType),
    type: normalizedType,
    session_id: null,
    web_visitor_id: null,
    lead_id: null,
    url: event.url,
    referrer: event.referrer,
    referer_header: referer,
    data: {
      ...(event.data || {}),
      _originalSessionId: event.sessionId
    },
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
    colo: request.cf?.colo || null,
    asn: request.cf?.asn ? Number(request.cf.asn) : null,
    organization_identifier: request.cf?.asOrganization || null,
    user_agent: userAgent || null,
    default_language: acceptLanguage || null,
    url_parms: urlParams && Object.keys(urlParams).length > 0 ? JSON.stringify(urlParams) : null,
    utm_source: urlParams.utm_source || null,
    utm_medium: urlParams.utm_medium || null,
    utm_campaign: urlParams.utm_campaign || null,
    utm_term: urlParams.utm_term || null,
    utm_content: urlParams.utm_content || null,
    gclid: urlParams.gclid || null,
    fbclid: urlParams.fbclid || null,
    device_type: request.cf?.deviceType || null,
    is_eu_country: request.cf?.isEUCountry || false,
    tls_version: request.cf?.tlsVersion || null,
    tls_cipher: request.cf?.tlsCipher || null,
    http_protocol: request.cf?.httpProtocol || null,
    campaign_id: event.data?.campaign_id && isValidUUID(event.data.campaign_id) ? event.data.campaign_id : null,
    message_id: event.data?.message_id && isValidUUID(event.data.message_id) ? event.data.message_id : null,
    created_at: new Date(event.timestamp).toISOString(),
    updated_at: new Date().toISOString(),
    _originalSessionId: event.sessionId,
    _originalVisitorId: event.visitorId,
    _originalTimestamp: event.timestamp
  };
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

function normalizeEventType(type: string): string {
  const typeMap: Record<string, string> = {
    'email_identified': 'email_captured',
    'pageview': 'page_view'
  };
  return typeMap[type] || type;
}

function getEventCategory(type: string): 'website' | 'email' | 'system' {
  const emailEvents = ['email_sent', 'email_bounced', 'email_replied', 'email_click'];
  const systemEvents = ['email_captured', 'identify', 'browser_emails_scanned'];
  if (emailEvents.includes(type)) return 'email';
  if (systemEvents.includes(type)) return 'system';
  return 'website';
}

async function handleIdentityLookup(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const identityId = url.searchParams.get('i');

    if (!identityId) {
      return new Response('Missing identity parameter', { status: 400 });
    }

    let identity = await env.IDENTITY_STORE.get(identityId, 'json');

    if (!identity) {
      console.log('Identity not in KV, checking Supabase...', identityId);
      identity = await lookupIdentityInSupabase(identityId, env);
      
      if (identity) {
        await env.IDENTITY_STORE.put(identityId, JSON.stringify(identity), {
          expirationTtl: 90 * 24 * 60 * 60
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

async function lookupIdentityInSupabase(trackingId: string, env: Env): Promise<any> {
  console.log('📊 Looking up identity in Supabase:', trackingId);
  try {
    const supabase = new SupabaseClient(env);
    
    const leads = await supabase.request(
      'GET',
      `/lead?tracking_id=eq.${trackingId}&select=*&limit=1`
    );
    
    if (leads && leads.length > 0) {
      const lead = leads[0];
      return {
        trackingId: lead.tracking_id,
        email: lead.work_email || lead.personal_email,
        firstName: lead.first_name,
        lastName: lead.last_name,
        personName: lead.first_name && lead.last_name ? `${lead.first_name} ${lead.last_name}` : null,
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
    console.error('Supabase lookup error:', error);
    return null;
  }
}

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

async function handlePersonalization(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const visitorId = url.searchParams.get('vid');

    if (!visitorId) {
      return new Response('Missing visitor ID', { status: 400 });
    }

    // Try KV caches first (fastest)
    let personalization = await env.IDENTITY_STORE.get(visitorId, 'json');

    if (!personalization) {
      personalization = await env.PERSONALIZATION.get(visitorId, 'json');
    }

    if (!personalization) {
      // Try to find in Supabase - check both lead and web_visitor
      const identity = await lookupIdentityInSupabase(visitorId, env);
      
      if (identity) {
        // Found as identified lead
        personalization = {
          personalized: true,
          firstName: identity.firstName,
          lastName: identity.lastName,
          personName: identity.personName,
          email: identity.email,
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
          jobTitle: identity.jobTitle,
          seniority: identity.seniority,
          phone: identity.phone,
          linkedin: identity.linkedin,
          campaignId: identity.campaignId,
          campaignName: identity.campaignName,
          intentScore: identity.intentScore || 0,
          engagementLevel: identity.engagementLevel || 'new',
          isFirstVisit: identity.isFirstVisit !== false,
          totalVisits: identity.totalVisits || 0,
          totalPageviews: identity.totalPageviews || 0
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
        'Cache-Control': 'public, max-age=60',
        ...getCORSHeaders(request, env)
      }
    });
  } catch (error) {
    console.error('Personalization error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function handleRedirect(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  try {
    const url = new URL(request.url);
    const identityId = url.searchParams.get('i');
    const destination = url.searchParams.get('to') || '/';

    if (!identityId) {
      return Response.redirect(destination, 302);
    }

    const clickEvent: TrackingEvent = {
      type: 'email_click',
      timestamp: Date.now(),
      sessionId: `email-click-${Date.now()}`,
      visitorId: identityId,
      url: destination,
      referrer: request.headers.get('Referer') || '',
      data: {
        destination,
        tracking_id: identityId
      }
    };

    const enrichedClick = enrichEvent(clickEvent, request);
    // Store email click event in background
    ctx.waitUntil(
      storeEventsWebVisitor([enrichedClick], env, ctx).catch(err => {
        console.error('Failed to store email click:', err);
      })
    );

    const destinationUrl = new URL(destination, url.origin);
    destinationUrl.searchParams.set('i', identityId);

    return Response.redirect(destinationUrl.toString(), 302);
  } catch (error) {
    console.error('Redirect error:', error);
    return Response.redirect('/', 302);
  }
}

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
  
  if (env.ENVIRONMENT === 'development') {
    return true;
  }

  if (origin.includes('.canvas.webflow.com') || origin.includes('.preview.webflow.com')) {
    return true;
  }

  return allowedOrigins.some(allowed => {
    const trimmed = allowed.trim();
    if (trimmed.includes('*')) {
      const pattern = trimmed.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(origin);
    }
    return origin === trimmed;
  });
}
