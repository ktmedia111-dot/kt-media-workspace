
(() => {
  "use strict";

  const config = window.KT_SUPABASE_CONFIG || {};
  const client = window.supabase?.createClient(
    config.url,
    config.publishableKey
  );

  const $ = (selector) => document.querySelector(selector);

  let user = null;
  let profile = null;
  let jobs = [];
  let teamMembers = [];
  let notifications = [];
  let notificationChannel = null;
  let page = "dashboard";
  let authMode = "login";
  let calendarDate = new Date();


  // Web Push bildirimleri
  const VAPID_PUBLIC_KEY = "BNIDnBKxPqkTTmVODBfKUWS5Nr4sMM4uCCFz_Xd4kAHh2v-2vwTE9XJ-RXnLH8-9fKPvIsqjAfIsKcNpmBxWDQ8";

  function urlBase64ToUint8Array(value) {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
  }

  async function enablePushNotifications() {
    if (!user) return toast("Önce giriş yapmalısınız.");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return toast("Bu tarayıcı Web Push desteklemiyor.");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return toast("Bildirim izni verilmedi.");
      const registration = await navigator.serviceWorker.register("./service-worker.js");
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
      const { error } = await client.from("push_subscriptions").upsert({ user_id: user.id, endpoint: subscription.endpoint, subscription: subscription.toJSON(), updated_at: new Date().toISOString() }, { onConflict: "user_id,endpoint" });
      if (error) throw error;
      toast("Bu cihazda bildirimler etkinleştirildi.");
    } catch (error) { console.error("Push kurulumu:", error); toast("Bildirim kurulamadı: " + error.message); }
  }

  async function sendPushForJob(jobId) {
    try { const { error } = await client.functions.invoke("send-job-push", { body: { job_id: jobId } }); if (error) console.error("Push gönderimi:", error); }
    catch (error) { console.error("Push gönderimi:", error); }
  }

  const pageTitles = {
    dashboard: "Genel Bakış",
    calendar: "Takvim",
    jobs: "Çekim İşleri",
    editing: "Montaj Süreci",
    delivery: "Teslim Takibi",
    archive: "Arşiv",
    team: "Ekip Yönetimi",
    finance: "Finans"
  };

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);

  const isAdmin = () =>
    profile?.role === "admin" && profile?.approved === true;

  function toast(message) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    setTimeout(() => el.classList.remove("show"), 3500);
  }


  function mountNotificationUI() {
    if ($("#notificationArea")) return;
    const logout = $("#logoutBtn");
    if (!logout) return;

    logout.insertAdjacentHTML("beforebegin", `
      <div id="notificationArea" style="position:relative;display:inline-flex;align-items:center;margin-right:12px;z-index:1000">
        <button id="notificationToggle" type="button" aria-label="Bildirimler" title="Bildirimler" style="position:relative;width:42px;height:42px;border:1px solid #e8e5df;border-radius:12px;background:#fff;color:#282828;font-size:21px;cursor:pointer">
          ♧<span id="notificationBadge" style="display:none;position:absolute;top:-5px;right:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:12px;background:#d94b42;color:#fff;font-size:11px;line-height:18px;font-weight:700"></span>
        </button>
        <div id="notificationPanel" style="display:none;position:absolute;right:0;top:50px;width:min(360px,calc(100vw - 32px));max-height:440px;overflow:auto;background:#fff;border:1px solid #e8e5df;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.14);padding:14px;color:#282828">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
            <strong style="font-size:15px">Bildirimler</strong>
            <button id="notificationMarkAll" type="button" style="border:0;background:transparent;color:#92733f;font-size:12px;cursor:pointer">Tümünü okundu yap</button>
          </div>
          <button id="enablePushButton" type="button" style="width:100%;padding:10px;margin:0 0 10px;border:1px solid #e8e5df;border-radius:9px;background:#faf9f6;color:#282828;font-weight:700;cursor:pointer">Bu cihazda bildirimleri aç</button>
          <div id="notificationList"><div style="padding:18px 4px;color:#858585;font-size:13px">Bildirimler yükleniyor...</div></div>
          ${isAdmin() ? `
            <div style="border-top:1px solid #eee;margin-top:12px;padding-top:12px">
              <button id="notificationTrackingToggle" type="button" style="width:100%;padding:9px 10px;border:1px solid #e8e5df;border-radius:9px;background:#faf9f6;color:#282828;font-weight:700;cursor:pointer">Personel okundu takibi</button>
              <div id="notificationTracking" style="display:none;margin-top:10px"><div style="color:#888;font-size:12px">Takip bilgileri yükleniyor...</div></div>
            </div>
          ` : ""}
        </div>
      </div>
    `);

    $("#enablePushButton").addEventListener("click", enablePushNotifications);

    $("#notificationToggle").addEventListener("click", async () => {
      const panel = $("#notificationPanel");
      const opening = panel.style.display === "none";
      panel.style.display = opening ? "block" : "none";
      if (opening) await loadNotifications();
    });

    $("#notificationList").addEventListener("click", async event => {
      const item = event.target.closest("[data-notification-id]");
      if (!item) return;
      await markNotificationRead(item.dataset.notificationId);
      $("#notificationPanel").style.display = "none";
      page = "jobs";
      await render();
      focusJob(item.dataset.jobId);
    });

    $("#notificationMarkAll").addEventListener("click", markAllNotificationsRead);
    const trackingToggle = $("#notificationTrackingToggle");
    if (trackingToggle) trackingToggle.addEventListener("click", async () => {
      const panel = $("#notificationTracking");
      const opening = panel.style.display === "none";
      panel.style.display = opening ? "block" : "none";
      if (opening) await loadAdminNotificationTracking();
    });
    document.addEventListener("click", event => {
      const area = $("#notificationArea");
      if (area && !area.contains(event.target)) $("#notificationPanel").style.display = "none";
    });
  }

  function renderNotifications() {
    const unread = notifications.filter(item => !item.read_at).length;
    const badge = $("#notificationBadge");
    if (badge) {
      badge.textContent = unread > 99 ? "99+" : String(unread);
      badge.style.display = unread ? "block" : "none";
    }

    const list = $("#notificationList");
    if (!list) return;
    if (!notifications.length) {
      list.innerHTML = `<div style="padding:18px 4px;color:#858585;font-size:13px">Henüz bildirimin yok.</div>`;
      return;
    }

    list.innerHTML = notifications.map(item => `
      <button type="button" data-notification-id="${escapeHTML(item.id)}" data-job-id="${escapeHTML(item.job_id || "")}" style="display:block;width:100%;text-align:left;padding:12px 10px;margin:0 0 7px;border:1px solid ${item.read_at ? '#eee' : '#e7d8b8'};border-radius:10px;background:${item.read_at ? '#fff' : '#fbf7ef'};cursor:pointer">
        <span style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:#282828">
          ${item.read_at ? '' : '<span style="width:7px;height:7px;border-radius:50%;background:#c59a50;display:inline-block"></span>'}
          ${escapeHTML(item.title)}
        </span>
        <span style="display:block;margin-top:5px;color:#656565;font-size:12px;line-height:1.45">${escapeHTML(item.body)}</span>
        <span style="display:block;margin-top:6px;color:#999;font-size:10px">${new Date(item.created_at).toLocaleString('tr-TR')}</span>
      </button>
    `).join("");
  }

  async function loadNotifications() {
    if (!user) return;
    const { data, error } = await client
      .from("notifications")
      .select("id,title,body,created_at,read_at,job_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) {
      const list = $("#notificationList");
      if (list) list.innerHTML = `<div style="padding:12px 4px;color:#b33;font-size:12px">Bildirimler alınamadı. Supabase SQL adımını kontrol edin.</div>`;
      console.error("Bildirimler alınamadı:", error.message);
      return;
    }
    notifications = data || [];
    renderNotifications();
  }

  async function loadAdminNotificationTracking() {
    const panel = $("#notificationTracking");
    if (!panel || !isAdmin()) return;
    panel.innerHTML = `<div style="padding:8px 2px;color:#888;font-size:12px">Takip bilgileri yükleniyor...</div>`;

    const { data: rows, error } = await client
      .from("notifications")
      .select("id,user_id,job_id,title,body,created_at,read_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      panel.innerHTML = `<div style="padding:8px 2px;color:#b33;font-size:12px">Takip bilgileri alınamadı. Supabase yönetici okuma iznini kontrol edin: ${escapeHTML(error.message)}</div>`;
      console.error("Yönetici bildirim takibi:", error.message);
      return;
    }

    const ids = [...new Set((rows || []).map(row => row.user_id))];
    let people = [];
    if (ids.length) {
      const result = await client.from("profiles").select("id,display_name").in("id", ids);
      if (result.error) {
        panel.innerHTML = `<div style="padding:8px 2px;color:#b33;font-size:12px">Personel adları alınamadı: ${escapeHTML(result.error.message)}</div>`;
        return;
      }
      people = result.data || [];
    }
    const names = Object.fromEntries(people.map(person => [person.id, person.display_name || "İsimsiz personel"]));

    if (!rows || !rows.length) {
      panel.innerHTML = `<div style="padding:10px 2px;color:#888;font-size:12px">Henüz personele gönderilmiş bildirim yok.</div>`;
      return;
    }

    panel.innerHTML = rows.map(row => `
      <div style="padding:10px 2px;border-bottom:1px solid #f0eee9">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <strong style="font-size:12px;color:#292929">${escapeHTML(names[row.user_id] || "Bilinmeyen personel")}</strong>
          <span style="white-space:nowrap;font-size:10px;font-weight:700;color:${row.read_at ? '#23845b' : '#b7791f'}">${row.read_at ? '✓ OKUNDU' : '● BEKLİYOR'}</span>
        </div>
        <div style="margin-top:4px;font-size:11px;color:#555">${escapeHTML(row.title)}</div>
        <div style="margin-top:3px;font-size:10px;color:#999">Gönderim: ${new Date(row.created_at).toLocaleString('tr-TR')}${row.read_at ? ` · Okunma: ${new Date(row.read_at).toLocaleString('tr-TR')}` : ''}</div>
      </div>
    `).join("");
  }

  async function markNotificationRead(id) {
    const { error } = await client.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      toast("Bildirim okunamadı: " + error.message);
      return;
    }
    await loadNotifications();
  }

  async function markAllNotificationsRead() {
    const { error } = await client.from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    if (error) {
      toast("Bildirimler güncellenemedi: " + error.message);
      return;
    }
    await loadNotifications();
    toast("Tüm bildirimler okundu.");
  }

  function subscribeToNotifications() {
    if (notificationChannel || !user) return;
    notificationChannel = client.channel(`notifications-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${user.id}`
      }, async payload => {
        await loadNotifications();
        toast(payload.new?.title || "Yeni iş atandı.");
      })
      .subscribe();
  }

  function showAuthMessage(message) {
    $("#authMessage").textContent = message;
  }

  function formatDate(date) {
    if (!date) return "Tarih yok";
    return new Date(date + "T12:00:00").toLocaleDateString("tr-TR");
  }

  function todayString() {
    const d = new Date();
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000)
      .toISOString().slice(0, 10);
  }

  function statusClass(status) {
    if (status === "Teslim Edildi") return "green";
    if (status === "Montajda") return "blue";
    if (status === "Teslime Hazır") return "orange";
    return "neutral";
  }

  function focusJob(jobId) {
    if (!jobId) return;
    const job = jobs.find(item => String(item.id) === String(jobId));
    const row = document.querySelector(`[data-job-row="${CSS.escape(String(jobId))}"]`);
    if (!job) {
      toast("Bildirime ait iş bulunamadı. İş numarası: " + jobId);
      return;
    }
    if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
      row.style.outline = "3px solid #c59a50";
      row.style.background = "#fff8e8";
      setTimeout(() => { row.style.outline = ""; row.style.background = ""; }, 5000);
    }
    let dialog = document.getElementById("assignedJobDetailDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "assignedJobDetailDialog";
      dialog.style.cssText = "width:min(560px,calc(100vw - 28px));max-width:560px;border:1px solid #e8e1d5;border-radius:18px;padding:0;box-shadow:0 24px 80px rgba(0,0,0,.25);color:#282828";
      document.body.appendChild(dialog);
    }
    dialog.innerHTML = `
      <div style="padding:22px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">
          <div><p style="margin:0 0 7px;color:#b08b4e;font-size:11px;font-weight:800;letter-spacing:2px">KT MEDIA · İŞ DETAYI</p><h2 style="margin:0;font-size:23px;line-height:1.25">${escapeHTML(job.title || "İsimsiz iş")}</h2></div>
          <button type="button" id="closeAssignedJobDetail" aria-label="Kapat" style="width:36px;height:36px;border:1px solid #e8e5df;border-radius:10px;background:#fff;font-size:20px;cursor:pointer">×</button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px">
          <div style="padding:12px;background:#faf8f4;border-radius:10px"><small style="display:block;color:#888;margin-bottom:5px">İş türü</small><b>${escapeHTML(job.job_type || "-")}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px"><small style="display:block;color:#888;margin-bottom:5px">Durum</small><b>${escapeHTML(job.status || "-")}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px"><small style="display:block;color:#888;margin-bottom:5px">Çekim tarihi</small><b>${escapeHTML(formatDate(job.work_date))}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px"><small style="display:block;color:#888;margin-bottom:5px">Teslim tarihi</small><b>${escapeHTML(formatDate(job.delivery_date))}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px;grid-column:1/-1"><small style="display:block;color:#888;margin-bottom:5px">Lokasyon</small><b>${escapeHTML(job.location || "-")}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px;grid-column:1/-1"><small style="display:block;color:#888;margin-bottom:5px">Operasyon ataması</small><b>${escapeHTML(job.assigned_to || "-")}</b></div>
          <div style="padding:12px;background:#faf8f4;border-radius:10px;grid-column:1/-1"><small style="display:block;color:#888;margin-bottom:5px">Notlar</small><div style="white-space:pre-wrap;line-height:1.5">${escapeHTML(job.notes || "Not eklenmemiş.")}</div></div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:18px"><button type="button" id="goToAssignedJobList" style="padding:11px 16px;border:0;border-radius:10px;background:#262626;color:#fff;font-weight:700;cursor:pointer">İş listesine dön</button></div>
      </div>`;
    const closeDialog = () => dialog.close();
    dialog.querySelector("#closeAssignedJobDetail").addEventListener("click", closeDialog);
    dialog.querySelector("#goToAssignedJobList").addEventListener("click", closeDialog);
    if (!dialog.open) dialog.showModal();
  }

  function jobRows(list) {
    if (!list.length) {
      return `<div class="empty">Henüz kayıtlı iş bulunmuyor.</div>`;
    }

    return `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>İş / Müşteri</th>
              <th>Tür</th>
              <th>Çekim Tarihi</th>
              <th>Teslim Tarihi</th>
              <th>Lokasyon</th>
              <th>Operasyon Ataması</th>
              <th>Durum</th>
              ${isAdmin() ? "<th>İşlem</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${list.map(job => `
              <tr id="job-row-${escapeHTML(job.id)}" data-job-row="${escapeHTML(job.id)}">
                <td><b>${escapeHTML(job.title)}</b></td>
                <td>${escapeHTML(job.job_type)}</td>
                <td>${formatDate(job.work_date)}</td>
                <td>${formatDate(job.delivery_date)}</td>
                <td>${escapeHTML(job.location || "-")}</td>
                <td>${job.assigned_to ? job.assigned_to.split(",").map(name => `<span class="assignment-chip">${escapeHTML(name.trim())}</span>`).join(" ") : `<span class="muted">Atanmadı</span>`}</td>
                <td>
                  <span class="status ${statusClass(job.status)}">
                    ${escapeHTML(job.status)}
                  </span>
                </td>
                ${isAdmin() ? `
                  <td>
                    <button class="btn ghost" data-status="${job.id}">
                      Durum değiştir
                    </button>
                    <button class="btn ghost" data-delete-job="${job.id}">
                      İşi sil
                    </button>
                  </td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function stat(label, value, note, icon) {
    return `
      <div class="stat">
        <div class="stat-top">
          <span>${label}</span>
          <span class="stat-icon">${icon}</span>
        </div>
        <strong>${value}</strong>
        <small>${note}</small>
      </div>
    `;
  }

  function renderDashboard() {
    const today = todayString();
    const active = jobs.filter(j =>
      j.status !== "Teslim Edildi"
    );
    const shoots = jobs.filter(j =>
      j.work_date === today
    );
    const editing = jobs.filter(j =>
      j.status === "Montajda"
    );

    return `
      <div class="welcome">
        <div>
          <p class="eyebrow">KT MEDIA PRODÜKSİYON</p>
          <h1>Merhaba, ${escapeHTML(profile.display_name || user.email)} 👋</h1>
          <p class="muted">Bugünün iş akışına genel bakış.</p>
        </div>
        <button class="btn primary" id="dashboardNewJob">＋ Yeni iş oluştur</button>
      </div>

      <div class="stats-grid">
        ${stat("Toplam iş", jobs.length, "Tüm kayıtlar", "▣")}
        ${stat("Aktif işler", active.length, "Devam eden süreçler", "◷")}
        ${stat("Bugünkü çekim", shoots.length, "Bugün planlanan", "▦")}
        ${stat("Montajda", editing.length, "Kurgu aşamasındaki işler", "◫")}
      </div>

      <div class="dashboard-grid">
        <section class="panel">
          <div class="panel-heading">
            <h3>Son iş hareketleri</h3>
            <span>${jobs.length} kayıt</span>
          </div>
          ${jobRows([...jobs].slice(0, 8))}
        </section>

        <section class="panel">
          <div class="panel-heading"><h3>Hızlı erişim</h3></div>
          <div class="quick-grid">
            ${quickLink("calendar", "▦ Takvim", "Çekim tarihlerini görüntüle")}
            ${quickLink("editing", "◫ Montaj", "Montaj aşamasındaki işler")}
            ${quickLink("delivery", "⇧ Teslim", "Teslim edilecek işler")}
            ${quickLink("archive", "▤ Arşiv", "Tamamlanan işleri incele")}
          </div>
        </section>
      </div>
    `;
  }

  function quickLink(target, title, description) {
    return `
      <button class="quick-link" data-goto="${target}">
        <b>${title}</b>
        <small>${description}</small>
      </button>
    `;
  }

  function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    const start = (firstDay + 6) % 7;

    let cells = "";
    for (let i = 0; i < start; i++) {
      cells += `<div class="calendar-cell muted"></div>`;
    }

    for (let day = 1; day <= days; day++) {
      const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayJobs = jobs.filter(j => j.work_date === date);

      cells += `
        <div class="calendar-cell">
          <b>${day}</b>
          ${dayJobs.map(j => `
            <div class="calendar-event" title="${escapeHTML(j.title)}">
              ${escapeHTML(j.title)}
            </div>
          `).join("")}
        </div>
      `;
    }

    return `
      <section class="panel">
        <div class="panel-heading">
          <button class="btn ghost" id="prevMonth">←</button>
          <h3>${calendarDate.toLocaleDateString("tr-TR", {
            month: "long", year: "numeric"
          })}</h3>
          <button class="btn ghost" id="nextMonth">→</button>
        </div>
        <div class="calendar-grid">
          ${["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"]
            .map(d => `<b class="calendar-weekday">${d}</b>`).join("")}
          ${cells}
        </div>
      </section>
      <section class="panel">
        <h3>Yaklaşan çekimler</h3>
        ${jobRows([...jobs].sort((a,b) =>
          (a.work_date || "").localeCompare(b.work_date || "")
        ))}
      </section>
    `;
  }

  function renderJobs() {
    return `
      <div class="section-heading">
        <div>
          <h2>Çekim işleri</h2>
          <p class="muted">Tüm planlanan ve devam eden işler.</p>
        </div>
        <button class="btn primary" id="jobsNewJob">＋ Yeni İş</button>
      </div>
      ${jobRows(jobs)}
    `;
  }

  function renderStage(status, title, description) {
    const list = jobs.filter(j => j.status === status);
    return `
      <div class="section-heading">
        <div>
          <h2>${title}</h2>
          <p class="muted">${description}</p>
        </div>
      </div>
      ${jobRows(list)}
    `;
  }

  async function renderTeam() {
    if (!isAdmin()) {
      return `<section class="panel">Bu alan yalnızca yöneticilere açıktır.</section>`;
    }

    const { data, error } = await client
      .from("profiles")
      .select("id,display_name,role,approved,created_at")
      .order("created_at", { ascending: false });

    if (error) return `<section class="panel">Ekip listesi alınamadı: ${escapeHTML(error.message)}</section>`;

    return `
      <section class="panel">
        <h2>Ekip Yönetimi</h2>
        <p class="muted">Yeni ekip hesaplarını buradan kontrol edebilirsin.</p>
        ${data.map(person => `
          <div class="team-row">
            <div>
              <b>${escapeHTML(person.display_name || "İsimsiz kullanıcı")}</b>
              <small>${escapeHTML(person.role || "Ekip üyesi")}</small>
            </div>
            <span>${person.approved ? "Onaylı" : "Onay bekliyor"}</span>
            ${person.approved ? "" : `
              <button class="btn primary" data-approve="${person.id}">
                Onayla
              </button>
            `}
          </div>
        `).join("")}
      </section>
    `;
  }

  async function render() {
    $("#pageTitle").textContent = pageTitles[page] || "Genel Bakış";

    let html = "";

    if (page === "dashboard") html = renderDashboard();
    if (page === "calendar") html = renderCalendar();
    if (page === "jobs") html = renderJobs();
    if (page === "editing") {
      html = renderStage("Montajda", "Montaj Süreci", "Kurgu aşamasındaki işler.");
    }
    if (page === "delivery") {
      html = renderStage("Teslime Hazır", "Teslim Takibi", "Teslime hazır işler.");
    }
    if (page === "archive") {
      html = renderStage("Teslim Edildi", "Arşiv", "Tamamlanmış işler.");
    }
    if (page === "team") html = await renderTeam();
    if (page === "finance") {
      html = isAdmin()
        ? `<section class="panel"><h2>Finans</h2><p class="muted">Finans modülü sonraki aşamada mevcut finance_entries tablosunun kolonlarına göre bağlanacak.</p></section>`
        : `<section class="panel">Bu alan yalnızca yöneticilere açıktır.</section>`;
    }

    $("#content").innerHTML = html;

    document.querySelectorAll(".nav-item").forEach(button => {
      button.classList.toggle("active", button.dataset.page === page);
    });

    bindPageEvents();
  }

  async function loadTeamMembers() {
    if (!isAdmin()) return;
    const { data, error } = await client
      .from("profiles")
      .select("display_name")
      .eq("approved", true)
      .order("display_name", { ascending: true });
    if (error) throw error;
    teamMembers = (data || []).map(person => person.display_name).filter(Boolean);
  }

  async function loadJobs() {
    const { data, error } = await client
      .from("jobs")
      .select("*")
      .order("work_date", { ascending: true });

    if (error) throw error;
    jobs = data || [];
  }

  async function loadProfile() {
    const { data, error } = await client
      .from("profiles")
      .select("id,display_name,role,approved")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const displayName =
        user.user_metadata?.display_name ||
        user.email.split("@")[0];

      const { error: insertError } = await client
        .from("profiles")
        .insert({
          id: user.id,
          display_name: displayName,
          role: "member",
          approved: false
        });

      if (insertError) throw insertError;

      throw new Error("Hesabınız yönetici onayı bekliyor.");
    }

    profile = data;

    if (profile.approved !== true) {
      await client.auth.signOut();
      throw new Error("Hesabınız henüz yönetici tarafından onaylanmadı.");
    }
  }

  async function startApp() {
    await loadProfile();

    $("#authScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");

    $("#userName").textContent =
      profile.display_name || user.email;
    $("#userRole").textContent =
      isAdmin() ? "Yönetici" : "Ekip üyesi";
    $("#avatar").textContent =
      (profile.display_name || "KT").slice(0, 2).toUpperCase();

    document.querySelectorAll(".admin-only").forEach(el => {
      el.classList.toggle("hidden", !isAdmin());
    });

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(console.error);
    await loadTeamMembers();
    await loadJobs();
    mountNotificationUI();
    await loadNotifications();
    subscribeToNotifications();
    const requestedJobId = new URLSearchParams(location.search).get("job_id");
    if (requestedJobId) page = "jobs";
    await render();
    if (requestedJobId) focusJob(requestedJobId);
  }

  async function authSubmit(event) {
    event.preventDefault();

    const email = $("#email").value.trim();
    const password = $("#password").value;
    const displayName = $("#displayName").value.trim();

    try {
      showAuthMessage("İşlem yapılıyor...");

      if (authMode === "login") {
        const { error } = await client.auth.signInWithPassword({
          email,
          password
        });
        if (error) throw error;
      } else {
        if (!displayName) throw new Error("Ad soyad girin.");

        const { error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName }
          }
        });

        if (error) throw error;

        showAuthMessage(
          "Kayıt oluşturuldu. Yönetici onayı sonrasında giriş yapabilirsiniz."
        );
        return;
      }

      const { data } = await client.auth.getUser();
      user = data.user;
      await startApp();
    } catch (error) {
      showAuthMessage(error.message || "Bir hata oluştu.");
    }
  }

  function setAuthMode(mode) {
    authMode = mode;
    document.querySelectorAll("[data-auth]").forEach(button => {
      button.classList.toggle("active", button.dataset.auth === mode);
    });

    $("#nameField").classList.toggle("hidden", mode !== "signup");
    $("#authSubmit").textContent =
      mode === "login" ? "Giriş yap" : "Ekip kaydı";
    showAuthMessage("");
  }

  function openJobDialog() {
    if (!isAdmin()) {
      toast("Yeni iş ekleme yetkiniz bulunmuyor.");
      return;
    }

    $("#jobForm").reset();
    const assignment = $("#jobAssignees");
    assignment.innerHTML = teamMembers.map(name => `<option value="${escapeHTML(name)}">${escapeHTML(name)}</option>`).join("");
    $("#jobDialog").showModal();
  }

  async function saveJob(event) {
    event.preventDefault();

    if (!isAdmin()) {
      toast("Bu işlem yalnızca yönetici tarafından yapılabilir.");
      return;
    }

    const form = new FormData($("#jobForm"));
    const workDate = form.get("work_date");

    if (!workDate) {
      toast("Çekim tarihi seçmelisiniz.");
      return;
    }

    const delivery = new Date(workDate + "T12:00:00");
    delivery.setDate(delivery.getDate() + 20);
    const deliveryDate = [
      delivery.getFullYear(),
      String(delivery.getMonth() + 1).padStart(2, "0"),
      String(delivery.getDate()).padStart(2, "0")
    ].join("-");

    const record = {
      title: form.get("title").trim(),
      job_type: form.get("job_type"),
      location: form.get("location").trim(),
      assigned_to: Array.from($("#jobAssignees").selectedOptions).map(option => option.value).join(", "),
      work_date: workDate,
      delivery_date: deliveryDate,
      status: form.get("status"),
      notes: form.get("notes").trim(),
      created_by: user.id
    };

    try {
      const { data: insertedJob, error } = await client.from("jobs").insert(record).select("id").single();
      if (error) throw error;

      if (record.assigned_to) await sendPushForJob(insertedJob.id);
      $("#jobDialog").close();
      await loadJobs();
      await render();
      toast("Yeni iş başarıyla kaydedildi.");
    } catch (error) {
      toast("Kayıt hatası: " + error.message);
    }
  }

  async function deleteJob(id) {
    // Güvenlik: Silme işlemi yalnızca onaylı yönetici hesabına açıktır.
    if (!isAdmin()) {
      toast("Bu işlem için yönetici yetkisi gerekiyor.");
      return;
    }

    const job = jobs.find(item => String(item.id) === String(id));
    if (!job) {
      toast("Silinecek iş kaydı bulunamadı.");
      return;
    }

    if (!confirm(`"${job.title}" işi kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`)) return;

    const { error } = await client
      .from("jobs")
      .delete()
      .eq("id", id);

    if (error) {
      toast("İş silinemedi: " + error.message);
      return;
    }

    await loadJobs();
    await render();
    toast("İş kaydı silindi.");
  }

  async function changeStatus(id) {
    const job = jobs.find(item => String(item.id) === String(id));
    if (!job) return;

    const statuses = [
      "Planlandı",
      "Çekim Tamamlandı",
      "Montajda",
      "Teslime Hazır",
      "Teslim Edildi"
    ];

    const next = statuses[(statuses.indexOf(job.status) + 1) % statuses.length];

    if (!confirm(`"${job.title}" işi "${next}" olarak güncellensin mi?`)) return;

    const { error } = await client
      .from("jobs")
      .update({ status: next })
      .eq("id", id);

    if (error) {
      toast("Durum güncellenemedi: " + error.message);
      return;
    }

    await loadJobs();
    await render();
    toast("İş durumu güncellendi.");
  }

  async function approveMember(id) {
    if (!isAdmin()) return;

    if (!confirm("Bu ekip üyesinin hesabını onaylamak istiyor musunuz?")) return;

    const { error } = await client
      .from("profiles")
      .update({ approved: true })
      .eq("id", id);

    if (error) {
      toast("Onay işlemi başarısız: " + error.message);
      return;
    }

    await render();
    toast("Ekip üyesi onaylandı.");
  }

  function bindPageEvents() {
    $("#dashboardNewJob")?.addEventListener("click", openJobDialog);
    $("#jobsNewJob")?.addEventListener("click", openJobDialog);

    $("#prevMonth")?.addEventListener("click", async () => {
      calendarDate.setMonth(calendarDate.getMonth() - 1);
      await render();
    });

    $("#nextMonth")?.addEventListener("click", async () => {
      calendarDate.setMonth(calendarDate.getMonth() + 1);
      await render();
    });

    document.querySelectorAll("[data-goto]").forEach(button => {
      button.addEventListener("click", async () => {
        page = button.dataset.goto;
        await render();
      });
    });

    document.querySelectorAll("[data-status]").forEach(button => {
      button.addEventListener("click", () => changeStatus(button.dataset.status));
    });

    document.querySelectorAll("[data-delete-job]").forEach(button => {
      button.addEventListener("click", () => deleteJob(button.dataset.deleteJob));
    });

    document.querySelectorAll("[data-approve]").forEach(button => {
      button.addEventListener("click", () => approveMember(button.dataset.approve));
    });
  }

  function bindEvents() {
    $("#authForm").addEventListener("submit", authSubmit);
    $("#jobForm").addEventListener("submit", saveJob);

    document.querySelectorAll("[data-auth]").forEach(button => {
      button.addEventListener("click", () => setAuthMode(button.dataset.auth));
    });

    document.querySelectorAll("[data-close]").forEach(button => {
      button.addEventListener("click", () => $("#jobDialog").close());
    });

    $("#newJobBtn").addEventListener("click", openJobDialog);

    $("#logoutBtn").addEventListener("click", async () => {
      await client.auth.signOut();
      location.reload();
    });

    $("#nav").addEventListener("click", async event => {
      const button = event.target.closest("[data-page]");
      if (!button) return;

      const target = button.dataset.page;
      if (target === "finance" && !isAdmin()) return;

      page = target;
      await render();
    });

    $("#globalSearch").addEventListener("input", event => {
      const query = event.target.value.toLocaleLowerCase("tr");
      const filtered = jobs.filter(job =>
        [job.title, job.job_type, job.location, job.status]
          .some(value => String(value || "")
            .toLocaleLowerCase("tr").includes(query))
      );

      if (query) {
        page = "jobs";
        $("#pageTitle").textContent = "Arama Sonuçları";
        $("#content").innerHTML = jobRows(filtered);
      } else {
        render();
      }
    });
  }

  async function init() {
    if (!client) {
      showAuthMessage(
        "Supabase bağlantısı bulunamadı. supabase-config.js dosyasını kontrol edin."
      );
      return;
    }

    if (!config.url || !config.publishableKey) {
      showAuthMessage(
        "Supabase URL ve Publishable Key bilgileri eksik."
      );
      return;
    }

    bindEvents();

    const { data, error } = await client.auth.getSession();
    if (error) {
      showAuthMessage(error.message);
      return;
    }

    if (data.session?.user) {
      user = data.session.user;
      try {
        await startApp();
      } catch (error) {
        showAuthMessage(error.message);
      }
    }
  }

  init();
})();
