const SCHEDULE_URL = "http://www.ai-janival-es-krisszel.hu/schedule.json";
const ALARM_NAME = "fbs-live-check";
const CHECK_INTERVAL_MINUTES = 5;

const UPDATE_ALARM = "fbs-update-check";
const UPDATE_CHECK_INTERVAL_MINUTES = 6 * 60; // 6 óránként
const GITHUB_RELEASES_API = "https://api.github.com/repos/arlinamid/ai-janival-es-krisszel-plugin/releases/latest";
const UPDATE_STORAGE_KEY = "fbs_update_available";

const WEEKDAYS = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6
};

// Esemény időtartamok napok szerint (ms)
// Szerda: 19:00–22:00 = 3 óra | Vasárnap: 9:00–17:00 = 8 óra
const EVENT_DURATION_MS = {
  0: 8 * 60 * 60 * 1000,
  3: 3 * 60 * 60 * 1000
};
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

function isLiveNow(schedule) {
  if (!schedule) return false;
  const now = Date.now();
  const skip = new Set(schedule.skip || []);

  for (const entry of schedule.recurring || []) {
    const wd = WEEKDAYS[String(entry.weekday || "").toLowerCase()];
    if (wd === undefined || !entry.time || !entry.meetUrl) continue;
    const [h, m] = entry.time.split(":").map(Number);
    if (isNaN(h) || isNaN(m)) continue;
    const durationMs = EVENT_DURATION_MS[wd] ?? DEFAULT_DURATION_MS;

    // Ellenőrzés mai és tegnapi napra (hosszú esemenyek átnyúlhatnak)
    for (const dayOffset of [0, -1]) {
      const d = new Date();
      d.setDate(d.getDate() + dayOffset);
      if (d.getDay() !== wd) continue;
      d.setHours(h, m, 0, 0);
      const startsAt = d.getTime();
      const endsAt = startsAt + durationMs;
      const dateStr = new Date(startsAt).toISOString().slice(0, 10);
      if (!skip.has(dateStr) && now >= startsAt && now < endsAt) return true;
    }
  }

  for (const entry of schedule.events || []) {
    if (!entry.datetime || !entry.meetUrl) continue;
    const startsAt = new Date(entry.datetime).getTime();
    if (isNaN(startsAt)) continue;
    const durationMs = (entry.durationHours || 2) * 60 * 60 * 1000;
    if (now >= startsAt && now < startsAt + durationMs) return true;
  }

  return false;
}

async function updateBadge() {
  try {
    const res = await fetch(`${SCHEDULE_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const schedule = await res.json();

    if (isLiveNow(schedule)) {
      await chrome.action.setBadgeText({ text: "LIVE" });
      await chrome.action.setBadgeBackgroundColor({ color: "#cc0000" });
    } else {
      await chrome.action.setBadgeText({ text: "" });
    }
  } catch (err) {
    console.warn("[FBS] Badge frissítés sikertelen:", err);
  }
}

async function checkForUpdates() {
  try {
    const current = chrome.runtime.getManifest().version;
    const res = await fetch(GITHUB_RELEASES_API, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!res.ok) return;
    const data = await res.json();
    const latest = (data.tag_name || "").replace(/^v/, "");
    if (!latest) return;

    const toNum = (v) => v.split(".").map((n) => parseInt(n, 10) || 0);
    const [lA, lB, lC] = toNum(latest);
    const [cA, cB, cC] = toNum(current);
    const isNewer = lA > cA || (lA === cA && lB > cB) || (lA === cA && lB === cB && lC > cC);

    if (isNewer) {
      await chrome.storage.local.set({
        [UPDATE_STORAGE_KEY]: {
          version: latest,
          url: data.html_url || `https://github.com/arlinamid/ai-janival-es-krisszel-plugin/releases/latest`,
          checkedAt: Date.now()
        }
      });
    } else {
      await chrome.storage.local.remove(UPDATE_STORAGE_KEY);
    }
  } catch (err) {
    console.warn("[FBS] Update check failed:", err);
  }
}

function setupAlarm() {
  chrome.alarms.get(ALARM_NAME, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, {
        delayInMinutes: 0,
        periodInMinutes: CHECK_INTERVAL_MINUTES
      });
    }
  });
  chrome.alarms.get(UPDATE_ALARM, (alarm) => {
    if (!alarm) {
      chrome.alarms.create(UPDATE_ALARM, {
        delayInMinutes: 1,
        periodInMinutes: UPDATE_CHECK_INTERVAL_MINUTES
      });
    }
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch (error) {
    console.error("Failed to configure side panel behavior:", error);
  }
  setupAlarm();
  updateBadge();
  checkForUpdates();
});

chrome.runtime.onStartup.addListener(() => {
  setupAlarm();
  updateBadge();
  checkForUpdates();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) updateBadge();
  if (alarm.name === UPDATE_ALARM) checkForUpdates();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  // Relay fetch through background to bypass Firefox CORS restrictions on extension pages.
  // Uses XHR which respects host_permissions cross-origin bypass in Firefox extensions.
  if (message?.type === "FETCH_JSON") {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `${message.url}?t=${Date.now()}`);
    xhr.responseType = "json";
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        sendResponse({ ok: true, data: xhr.response });
      } else {
        sendResponse({ ok: false, error: `HTTP ${xhr.status}` });
      }
    };
    xhr.onerror = () => {
      // XHR fallback to fetch (Chrome service worker may not support XHR)
      fetch(`${message.url}?t=${Date.now()}`, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then((data) => sendResponse({ ok: true, data }))
        .catch((err) => sendResponse({ ok: false, error: String(err) }));
    };
    xhr.send();
    return true;
  }

  if (message?.type === "openSidePanel") {
    const target = sender.tab?.id
      ? { tabId: sender.tab.id }
      : sender.tab?.windowId
        ? { windowId: sender.tab.windowId }
        : null;

    if (!target || !chrome.sidePanel?.open) {
      // Firefox fallback: sidebar_action API
      if (typeof browser !== "undefined" && browser.sidebarAction?.open) {
        browser.sidebarAction.open()
          .then(() => sendResponse({ ok: true }))
          .catch((err) => sendResponse({ ok: false, error: String(err) }));
        return true;
      }
      sendResponse({ ok: false, error: "Side panel open API is not available." });
      return false;
    }

    chrome.sidePanel
      .open(target)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error("Side panel open failed:", error);
        sendResponse({ ok: false, error: error.message || String(error) });
      });

    return true;
  }

  if (message?.type === "refreshBadge") {
    updateBadge();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type !== "fetchSchedule") return false;

  fetch(message.url, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => {
      console.error("Schedule fetch failed:", error);
      sendResponse({ ok: false, error: error.message || String(error) });
    });

  return true;
});
