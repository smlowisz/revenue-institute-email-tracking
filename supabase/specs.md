Events table changes:

HIGHLIGHTS:
1. New enums for event_type and event_category on event table
2. Every visitor gets a lead record created so we can track past history after identification
3. we need to capture every cookie/hash possible to help identify each person faster - not waiting for them to provide emails 
4. combine lead records with matching hash emails and other digital fingerprint data whether identified or not
5. 


These are the event types as an enum. Each one requires an associated event_category as well. These are website, email, and system. 

  'page_view' (category = website),
  'click' (category = website).
  'scroll_depth' (category = website).
  'form_start',(category = website).
  'form_submit' (category = website).
  'video_play' (category = website).
  'video_pause' (category = website),
  'video_watched' (category = website),
  'video_progress' (category = website),
  'video_complete' (category = website),
  'focus_lost' (category = website),
  'focus_gained' (category = website),
  'text_copied'(category = website),
  'text_pasted' (category = website),
  'rage_click' (category = website),
  'page_exit' (category = website),
  'device_switched' (category = website),
  'email_submiitted' (category = website) -> formerly "email captured",
  'email_captured' (category = system) ->  formerly email identified,
  'identify' (category = system),
  'email_sent' (category = email),
  'email_bounced' (category = email),
  'email_replied' (category = email),
  'email_click' (category = email),
  'browser_emails_scanned' (category = system)

  GET RID OF KEY_PRESS, smartlead side opens and smartlead clicks - we do not track those for higher deliverability.  

On event table, the new fields were capturing are using this schema: 

rename emailId to tracking_id


LEAD TABLE SCHEMA:

CREATE TABLE lead (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT,
  last_name TEXT,
  work_email TEXT, 
  personal_email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  job_title TEXT,
  job_seniority TEXT,
  job_department TEXT,
  company_name TEXT,
  company_website TEXT,
  company_linkedin TEXT,
  company_description TEXT,
  company_headcount headcount, --formerly companysize
  company_revenue TEXT,
  company_industry TEXT,
  company_address TEXT,
  personal_address TEXT,
  email_status email_status,
  tracking_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


SESSIONS SCHEMA:

CREATE TABLE session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID, --combine all visitor/lead/person tracking into one lead id record, but that lead might not have other data associated if they're anonymous. that's okay. the only thing we will keep is tracking_id for leads, as those are short for utm's
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration integer,
  active_time integer,
  first_page TEXT, --formerly entryUrl
  last_page TEXT, --formerly exitUrl
  pageviews integer,
  clicks integer,
  max_scroll_depth integer,
  forms_started integer,
  forms_submitted integer,
  videos_watched integer,
  device TEXT,
  browser TEXT,
  operating_system TEXT, --formerly os
  country TEXT,
  city TEXT,
  region TEXT,
  engagement_score FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

EVENT SCHEMA

CREATE TABLE event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category event_category NOT NULL,
  type event_type NOT NULL,
  session_id UUID,
  lead_id UUID, -- id of lead record
  url TEXT,
  referrer TEXT,
  data JSON,
  ip_address TEXT,
  country TEXT,
  userAgent TEXT,
  colo TEXT,
  asn NUMERIC,
  city TEXT,
  region TEXT,
  timezone TEXT,
  company_identifier TEXT,
  organization_identifier TEXT,
  continent TEXT,
  postal_code TEXT,
  metro_code TEXT,
  latitude TEXT,
  longitude TEXT,
  default_language TEXT,
  referer_header TEXT,
  url_parms TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  gclid TEXT,
  fbclid TEXT,
  deviceType TEXT,
  is_eu_country BOOLEAN,
  tls_version TEXT,
  tls_cipher TEXT,
  http_protocol TEXT,

  -- FK columns
  campaign_id UUID,
  message_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_lead
    FOREIGN KEY (lead_id)
    REFERENCES lead(id)
    ON DELETE CASCADE,

  CONSTRAINT fk_campaign
    FOREIGN KEY (campaign_id)
    REFERENCES campaign(id)
    ON DELETE NO ACTION,

  CONSTRAINT fk_message
    FOREIGN KEY (message_id)
    REFERENCES campaign_message(id)
    ON DELETE NO ACTION
);

CAMPAIGN_MEMBER SCHEMA
CREATE TABLE campaign_member (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID, --combine all visitor/lead/person tracking into one lead id record, but that lead might not have other data associated if 
  campaign_id UUID,
  member_status campaign_member_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);



CAMPAIGN_MESSAGE SCHEMA

create table public.campaign_message (
  id uuid not null default gen_random_uuid (),
  campaign_id text not null,
  smartlead_id text not null,
  sequence_step numeric not null,
  variant_id numeric not null,
  email_subject text not null,
  email_body text not null,
  word_count numeric null,
  link_count numeric null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint campaign_message_pkey primary key (id)
) TABLESPACE pg_default;


CAMPAIGN SCHEMA:
create table public.campaign (
  id uuid not null default gen_random_uuid (),
  campaign_name text not null,
  smartlead_id text not null,
  status public.campaign_status not null default 'drafted'::campaign_status,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint campaign_pkey primary key (id)
) TABLESPACE pg_default;

SESSION IDENTITY SCHEMA
CREATE TABLE session_id_map ( --formerly session_identity_map
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  original_visitor_id TEXT,
  identified_visitor_id TEXT,
  email TEXT,
  email_hash TEXT,
  identified_at TIMESTAMPTZ,
  id_method TEXT,
  event_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

