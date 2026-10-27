/* BSCW Check — Service Worker para Alarma de Fin de Sesión en Reposo */

let scheduledAlarmTimeout = null;
let scheduledAlarmPayload = null;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function clearScheduledAlarm() {
  if (scheduledAlarmTimeout !== null) {
    clearTimeout(scheduledAlarmTimeout);
    scheduledAlarmTimeout = null;
  }
  scheduledAlarmPayload = null;
}

async function showSessionEndNotification(payload) {
  if (!payload || !self.registration || typeof self.registration.showNotification !== 'function') {
    return;
  }

  const title = payload.title || '⚠️ BSCW Check: ¡Sesión Finalizada!';
  const body =
    payload.body ||
    'Tu sesión corporativa ha terminado. Abre la app para registrar tu salida y evitar cierre automático.';
  const tag = payload.tag || `bscw-session-end-${payload.recordId || 'active'}`;

  try {
    await self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      requireInteraction: true,
      vibrate: [500, 150, 500, 150, 800, 200, 800, 200, 900],
      data: {
        recordId: payload.recordId || '',
        expectedEndTimeFormatted: payload.expectedEndTimeFormatted || '',
      },
      actions: [
        { action: 'checkout', title: 'Registrar Salida' },
        { action: 'snooze_5m', title: 'Posponer +5 min' },
      ],
    });
  } catch {
    try {
      await self.registration.showNotification(title, {
        body,
        tag,
      });
    } catch {
      // Ignore if notification permission is revoked
    }
  }

  // Notify any open/backgrounded clients to wake their audio loop if possible
  try {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      client.postMessage({
        type: 'SW_ALARM_FIRED',
        recordId: payload.recordId || '',
      });
    }
  } catch {
    // Ignore client broadcast errors
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'SCHEDULE_SESSION_ALARM') {
    clearScheduledAlarm();
    const targetMs = Number(data.targetAlarmMs || 0);
    const autoLockMs = Number(data.autoLockDeadlineMs || 0);
    const now = Date.now();

    if (!targetMs || (autoLockMs > 0 && now >= autoLockMs)) {
      return;
    }

    scheduledAlarmPayload = {
      recordId: data.recordId || '',
      title: data.title || '⚠️ BSCW Check: ¡Sesión Finalizada!',
      body: data.body || 'Ha concluido el tiempo de tu sesión. Registra tu salida ahora.',
      tag: `bscw-checkout-alarm-${data.recordId || 'active'}`,
      expectedEndTimeFormatted: data.expectedEndTimeFormatted || '',
    };

    const delayMs = Math.max(0, targetMs - now);
    // Cap timeout safely within 32-bit signed integer (~24 days; sessions max 8h)
    const safeDelayMs = Math.min(delayMs, 12 * 60 * 60 * 1000);

    scheduledAlarmTimeout = setTimeout(() => {
      const payloadToShow = scheduledAlarmPayload;
      scheduledAlarmTimeout = null;
      if (payloadToShow) {
        showSessionEndNotification(payloadToShow);
      }
    }, safeDelayMs);
  } else if (data.type === 'SHOW_ALARM_NOTIFICATION') {
    showSessionEndNotification({
      recordId: data.recordId || '',
      title: data.title,
      body: data.body,
      tag: `bscw-checkout-alarm-${data.recordId || 'active'}`,
      expectedEndTimeFormatted: data.expectedEndTimeFormatted || '',
    });
  } else if (data.type === 'CANCEL_SESSION_ALARM') {
    clearScheduledAlarm();
    if (self.registration && typeof self.registration.getNotifications === 'function') {
      self.registration
        .getNotifications()
        .then((list) => {
          list.forEach((n) => {
            if (n.tag && String(n.tag).startsWith('bscw-checkout-alarm-')) {
              n.close();
            }
          });
        })
        .catch(() => {});
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action || 'open';
  const recordId = (event.notification && event.notification.data && event.notification.data.recordId) || '';
  event.notification.close();

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        try {
          if ('focus' in client) {
            await client.focus();
          }
          client.postMessage({
            type: 'ALARM_NOTIFICATION_ACTION',
            action,
            recordId,
          });
          return;
        } catch {
          // Try next client
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow('/');
      }
    })()
  );
});
