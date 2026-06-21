function threadIdFromPayload(data) {
  if (!data) return null;
  if (data.tag) {
    const m = String(data.tag).match(/^thread-([0-9a-f-]{36})$/i);
    if (m) return m[1];
  }
  const url = data.url;
  if (!url) return null;
  try {
    const u = new URL(url);
    const hash = u.hash.replace(/^#/, '');
    const hm = hash.match(/^thread-([0-9a-f-]{36})$/i);
    if (hm) return hm[1];
    const q = u.searchParams.get('thread');
    if (q && /^[0-9a-f-]{36}$/i.test(q)) return q;
  } catch {
    /* ignore */
  }
  return null;
}

function notifyOpenClients(data) {
  const threadId = threadIdFromPayload(data);
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const client of list) {
      client.postMessage({
        type: 'kototoi-open-thread',
        url: data.url,
        tag: data.tag,
        threadId,
        title: data.title,
        body: data.body,
      });
    }
  });
}

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title ?? 'kototoi', {
        body: data.body ?? '',
        data: { url: data.url, tag: data.tag },
        tag: data.tag,
      }),
      notifyOpenClients(data),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url;
  const tag = event.notification.data?.tag;
  if (!url) return;
  const threadId = threadIdFromPayload({ url, tag });
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        try {
          const target = new URL(url);
          const current = new URL(client.url);
          if (target.origin === current.origin && target.pathname === current.pathname) {
            client.postMessage({
              type: 'kototoi-open-thread',
              url,
              tag,
              threadId,
            });
            if ('focus' in client) return client.focus();
          }
        } catch {
          /* try next */
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});