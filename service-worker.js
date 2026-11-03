self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) { data = { title: "KT Media", body: event.data ? event.data.text() : "Yeni iş atandı." }; }
  event.waitUntil(self.registration.showNotification(data.title || "KT Media", { body: data.body || "Yeni iş atandı.", icon: "./icon-192.png", data: { url: data.url || "./", job_id: data.job_id || null }, tag: data.tag || "kt-media-job" }));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./", self.location.origin);
  const jobId = event.notification.data?.job_id;
  if (jobId) targetUrl.searchParams.set("job_id", jobId);
  const target = targetUrl.href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const client of list) { if (client.url.startsWith(self.location.origin) && "focus" in client) { client.navigate(target); return client.focus(); } }
    return clients.openWindow(target);
  }));
});
