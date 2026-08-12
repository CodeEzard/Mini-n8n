import { adminGraphQLRequest, parseResponseSafely } from './_utils/graphql';

export default async function sendNotification(req: any, res: any) {
  if (!res || typeof res.status !== 'function') {
    console.error('Invalid response object in sendNotification');
    return;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({ status: 'ok' });
  }

  if (req.method !== 'POST') {
    return res.status(400).json({
      message: 'Method Not Allowed: Event Trigger requires POST',
      code: 'METHOD_NOT_ALLOWED',
      extensions: { code: 'METHOD_NOT_ALLOWED' },
    });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    // Hasura Event Trigger payload format
    const newRecord = body?.event?.data?.new || body || {};
    const notificationId = newRecord.id;
    const channel = newRecord.channel || 'slack';
    const recipient = newRecord.recipient || '#general';
    const message = newRecord.message || '';
    const payload = newRecord.payload || {};

    if (!notificationId && !message) {
      return res.status(400).json({
        message: 'Invalid event payload: missing notificationId and message',
        code: 'INVALID_PAYLOAD',
        extensions: { code: 'INVALID_PAYLOAD' },
      });
    }

    console.log(`[Event Trigger: sendNotification] Processing ${channel} notification for ${recipient}: "${message}"`);

    // External delivery: Check for Slack webhook or email configurations
    const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (channel === 'slack' && slackWebhookUrl) {
      try {
        const slackRes = await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: message,
            channel: recipient,
            attachments: payload ? [{ text: JSON.stringify(payload, null, 2) }] : undefined,
          }),
        });
        const parsed = await parseResponseSafely<any>(slackRes, 'Slack Webhook');
        if (!parsed.ok) {
          console.warn('Slack webhook delivery warning:', parsed.errorText);
        }
      } catch (slackErr) {
        console.warn('Slack webhook delivery network error:', slackErr);
      }
    }

    // Mark notification as delivered in database using Hasura Admin Secret
    if (notificationId) {
      const now = new Date().toISOString();
      const updateMutation = `
        mutation MarkNotificationDelivered($id: uuid!, $now: timestamptz!) {
          update_notification_requests_by_pk(
            pk_columns: { id: $id }
            _set: {
              status: "delivered"
              delivered_at: $now
            }
          ) {
            id
            status
            delivered_at
          }
        }
      `;

      try {
        await adminGraphQLRequest(updateMutation, {
          id: notificationId,
          now,
        });
      } catch (dbErr) {
        console.error(`Failed to update notification status in DB for ${notificationId}:`, dbErr);
      }
    }

    return res.status(200).json({
      success: true,
      notification_id: notificationId,
      status: 'delivered',
      channel,
      recipient,
    });
  } catch (error: any) {
    console.error('sendNotification error:', error);
    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Error processing notification event trigger');
    return res.status(500).json({
      message: errorMessage,
      code: 'SEND_NOTIFICATION_ERROR',
      extensions: {
        code: 'SEND_NOTIFICATION_ERROR',
        details: String(errorMessage),
      },
    });
  }
}
