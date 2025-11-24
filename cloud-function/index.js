/**
 * Cloud Function for BigQuery Event Insertion
 * Receives events from Cloudflare Worker and inserts into BigQuery
 * 
 * Deploy: gcloud functions deploy insertEvents --runtime nodejs20 --trigger-http --allow-unauthenticated
 */

const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

exports.insertEvents = async (req, res) => {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events)) {
      res.status(400).json({ error: 'Invalid payload' });
      return;
    }

    console.log(`📥 Received ${events.length} events`);

    // Insert into BigQuery
    const datasetId = 'outbound_sales';
    const tableId = 'events';

    const rows = events.map((event, index) => ({
      insertId: `${event.sessionId}-${event.timestamp}-${index}`,
      json: event
    }));

    await bigquery
      .dataset(datasetId)
      .table(tableId)
      .insert(rows, {
        skipInvalidRows: false,
        ignoreUnknownValues: false
      });

    console.log(`✅ Inserted ${events.length} events into BigQuery`);

    res.json({
      success: true,
      eventsInserted: events.length
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      error: 'Failed to insert events',
      message: error.message
    });
  }
};

