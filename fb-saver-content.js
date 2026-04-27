const FBS_POSTS_KEY = "fbs.posts";
const FBS_CATS_KEY = "fbs.cats";
const DEFAULT_CATEGORY = "Általános";
const TARGET_GROUP_SLUG = "ai.janival.es.krisszel";
const TARGET_GROUP_SLUGS = [TARGET_GROUP_SLUG, "1958540048391976"];

const SVG_STAR = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
  <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
</svg>`;

const SVG_OK = `<svg viewBox="0 0 24 24" width="20" height="20">
  <circle cx="12" cy="12" r="11" fill="#42b883"/>
  <polyline points="7,12.5 10.5,16 17,9" fill="none" stroke="white"
    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

function storageGet(keys) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(keys, resolve);
    } catch {
      resolve({});
    }
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set(values, resolve);
    } catch {
      resolve();
    }
  });
}

function normalizePostMap(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.filter((post) => post?.id).map((post) => [String(post.id), post])
    );
  }

  return value && typeof value === "object" ? value : {};
}

async function getPostMap() {
  const result = await storageGet(FBS_POSTS_KEY);
  return normalizePostMap(result[FBS_POSTS_KEY]);
}

async function getCategories() {
  const result = await storageGet(FBS_CATS_KEY);
  const cats = Array.isArray(result[FBS_CATS_KEY]) ? result[FBS_CATS_KEY] : [];

  if (!cats.some((cat) => cat.name === DEFAULT_CATEGORY)) {
    const next = [{ name: DEFAULT_CATEGORY, createdAt: new Date().toISOString() }, ...cats];
    await storageSet({ [FBS_CATS_KEY]: next });
    return next;
  }

  return cats;
}

async function saveCategory(name) {
  const cats = await getCategories();

  if (!cats.some((cat) => cat.name.toLowerCase() === name.toLowerCase())) {
    await storageSet({
      [FBS_CATS_KEY]: [...cats, { name, createdAt: new Date().toISOString() }]
    });
  }
}

async function savePost(post) {
  const posts = await getPostMap();

  posts[post.id] = {
    ...post,
    savedAt: post.savedAt || new Date().toISOString()
  };

  await storageSet({ [FBS_POSTS_KEY]: posts });
}

async function deletePost(postId) {
  const posts = await getPostMap();
  delete posts[postId];
  await storageSet({ [FBS_POSTS_KEY]: posts });
}

function validateCategoryName(raw, existingNames = []) {
  const name = (raw || "").trim();

  if (!name) {
    return "A kategória neve nem lehet üres.";
  }

  if (name.length > 40) {
    return "A kategória neve max. 40 karakter lehet.";
  }

  if (!/[\p{L}\p{N}]/u.test(name)) {
    return "A kategória neve legalább egy betűt vagy számot tartalmazzon.";
  }

  const lower = name.toLowerCase();

  if (lower === "all") {
    return `A(z) "${name}" név foglalt.`;
  }

  if (existingNames.some((existing) => existing.toLowerCase() === lower)) {
    return `Már létezik "${name}" nevű kategória.`;
  }

  return null;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char];
  });
}

function extractPostId(href) {
  let match;
  match = href.match(/\/permalink\/(\d+)/);
  if (match) return match[1];
  match = href.match(/\/posts\/(\d+)/);
  if (match) return match[1];
  match = href.match(/story_fbid=(\d+)/);
  if (match) return match[1];
  match = href.match(/set=gm\.(\d+)/);
  if (match) return match[1];
  match = href.match(/set=pcb\.(\d+)/);
  if (match) return match[1];
  match = href.match(/post_insights\/(\d+)/);
  if (match) return match[1];
  match = href.match(/\/reel\/(\d+)/);
  if (match) return match[1];
  match = href.match(/\/videos\/(\d+)/);
  if (match) return match[1];
  match = href.match(/[?&]v=(\d+)/);
  if (match) return match[1];
  match = href.match(/\/stories\/\d+\/([A-Za-z0-9_-]+)/);
  if (match) return `s_${match[1]}`;
  return null;
}

function extractPostIdFromMedia(container) {
  const media = container.querySelectorAll('img[src*="fbcdn.net"], video[poster*="fbcdn.net"]');

  for (const item of media) {
    const source = item.getAttribute("src") || item.getAttribute("poster") || "";
    let match = source.match(/\/(\d{8,})_(\d{10,})_\d{8,}_n\./);
    if (match) return match[2];
    match = source.match(/\/emg1\/v\/t\d+\/(\d{15,})/);
    if (match) return `e_${match[1]}`;
  }

  return null;
}

function canonicalPostUrl(postId) {
  if (!postId || !/^\d+$/.test(postId)) {
    return null;
  }

  return `https://www.facebook.com/groups/${TARGET_GROUP_SLUG}/posts/${postId}/`;
}

function isOnTargetGroupPage() {
  const path = location.pathname || "";
  return TARGET_GROUP_SLUGS.some(
    (slug) => path === `/groups/${slug}` || path.startsWith(`/groups/${slug}/`)
  );
}

function findPostContainer(moreButton) {
  let element = moreButton.parentElement;

  for (let index = 0; index < 16 && element; index += 1) {
    if (element.querySelector?.('[data-ad-rendering-role="story_message"]')) {
      return element;
    }

    element = element.parentElement;
  }

  return moreButton.closest('[role="article"]') || moreButton.parentElement;
}

function extractPostData(container, postId, postUrl) {
  const author =
    cleanText(
      container.querySelector("h2 strong span, h3 strong span, strong a span")?.textContent
    ) || "";
  const story = container.querySelector('[data-ad-rendering-role="story_message"]');
  const snippet = cleanText(story?.innerText || container.innerText).slice(0, 280);
  const firstLine = snippet
    .split(/[.!?]\s|\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 8);
  const title = [author, firstLine || `Facebook poszt ${postId}`]
    .filter(Boolean)
    .join(": ")
    .slice(0, 160);

  return { id: postId, url: postUrl, title, author, snippet, category: DEFAULT_CATEGORY };
}

function applyStarState(button, saved) {
  button.classList.toggle("fbs-saved", saved);
  button.innerHTML = saved ? SVG_OK : SVG_STAR;
  button.title = saved ? "Mentés törlése" : "Poszt mentése az AI-Jani-Krisz sidebarba";
}

async function refreshStarButtons() {
  const posts = await getPostMap();

  document.querySelectorAll(".fbs-star-button").forEach((button) => {
    applyStarState(button, Boolean(posts[button.dataset.postId]));
  });
}

function closeSaveDialog() {
  document.getElementById("fbs-save-dialog")?.remove();
}

async function showSaveDialog(anchor, draft) {
  closeSaveDialog();

  const cats = await getCategories();
  const dialog = document.createElement("div");
  const rect = anchor.getBoundingClientRect();
  const top = Math.min(rect.bottom + 8, window.innerHeight - 260);
  const left = Math.max(12, Math.min(rect.left - 260, window.innerWidth - 336));

  dialog.id = "fbs-save-dialog";
  dialog.style.top = `${Math.max(12, top)}px`;
  dialog.style.left = `${left}px`;
  dialog.innerHTML = `
    <label>
      <span>Cím</span>
      <input id="fbs-save-title" value="${escapeHtml(draft.title)}" />
    </label>
    <label>
      <span>Részlet</span>
      <textarea id="fbs-save-snippet" rows="4">${escapeHtml(draft.snippet)}</textarea>
    </label>
    <label>
      <span>Kategória</span>
      <select id="fbs-save-cat">
        ${cats
          .map(
            (cat) =>
              `<option value="${escapeHtml(cat.name)}" ${
                cat.name === draft.category ? "selected" : ""
              }>${escapeHtml(cat.name)}</option>`
          )
          .join("")}
        <option value="__new">+ Új kategória...</option>
      </select>
    </label>
    <input id="fbs-new-cat-name" placeholder="Új kategória neve" hidden />
    <div class="fbs-save-actions">
      <button type="button" id="fbs-save-cancel">Mégse</button>
      <button type="button" id="fbs-save-confirm">Mentés</button>
    </div>
  `;

  document.body.appendChild(dialog);

  const categorySelect = dialog.querySelector("#fbs-save-cat");
  const newCategoryInput = dialog.querySelector("#fbs-new-cat-name");

  categorySelect.addEventListener("change", () => {
    newCategoryInput.hidden = categorySelect.value !== "__new";
    if (!newCategoryInput.hidden) {
      newCategoryInput.focus();
    }
  });

  dialog.querySelector("#fbs-save-cancel").addEventListener("click", closeSaveDialog);
  dialog.querySelector("#fbs-save-confirm").addEventListener("click", async () => {
    let category = categorySelect.value;

    if (category === "__new") {
      category = newCategoryInput.value.trim();
      const error = validateCategoryName(
        category,
        cats.map((cat) => cat.name)
      );

      if (error) {
        alert(error);
        return;
      }

      await saveCategory(category);
    }

    await savePost({
      ...draft,
      title: dialog.querySelector("#fbs-save-title").value.trim() || draft.title,
      snippet: dialog.querySelector("#fbs-save-snippet").value.trim() || draft.snippet,
      category
    });
    applyStarState(anchor, true);
    closeSaveDialog();
  });

  setTimeout(() => {
    const closeOnOutsideClick = (event) => {
      if (!dialog.contains(event.target) && event.target !== anchor) {
        closeSaveDialog();
        document.removeEventListener("mousedown", closeOnOutsideClick, true);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick, true);
  }, 0);
}

function createStarButton(postId, postUrl, container) {
  const button = document.createElement("button");
  button.className = "fbs-star-button";
  button.type = "button";
  button.dataset.postId = postId;
  applyStarState(button, false);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    const posts = await getPostMap();

    if (posts[postId]) {
      await deletePost(postId);
      applyStarState(button, false);
      return;
    }

    showSaveDialog(button, extractPostData(container, postId, postUrl));
  });

  return button;
}

function resolvePostFromContainer(container) {
  const anchors = [...container.querySelectorAll("a[href]")];

  for (const anchor of anchors) {
    const href = anchor.href || "";
    const postId = extractPostId(href);

    if (postId) {
      return {
        postId,
        postUrl: canonicalPostUrl(postId) || href
      };
    }
  }

  const mediaId = extractPostIdFromMedia(container);

  if (mediaId) {
    return {
      postId: mediaId,
      postUrl: canonicalPostUrl(mediaId) || location.href.split("#")[0]
    };
  }

  return null;
}

function processArticles() {
  injectSidebarButton();

  if (!isOnTargetGroupPage()) {
    return;
  }

  const seen = new Set();

  document.querySelectorAll('[aria-haspopup="menu"]').forEach((moreButton) => {
    if (moreButton.dataset.fbsProcessed === "1") {
      return;
    }

    const label = moreButton.getAttribute("aria-label") || "";
    const isPostActionButton =
      label.includes("bejegyzéssel kapcsolatos") ||
      label.includes("Actions for this post") ||
      label.includes("More");

    if (!isPostActionButton) {
      return;
    }

    const container = findPostContainer(moreButton);

    if (!container) {
      return;
    }

    const resolved = resolvePostFromContainer(container);

    if (!resolved || seen.has(resolved.postId)) {
      return;
    }

    seen.add(resolved.postId);
    moreButton.dataset.fbsProcessed = "1";

    const star = createStarButton(resolved.postId, resolved.postUrl, container);
    // A "..." gomb DOM-struktúrája: L0=moreButton, L1=wrapper, L2=moreBtnBox, L3=flexRow.
    // L3-ba kell szúrni, különben a csillag a "..."-on belülre kerül és nem látszik.
    const moreBtnBox = moreButton.parentElement?.parentElement;
    const flexRow = moreBtnBox?.parentElement;
    if (flexRow && moreBtnBox) {
      flexRow.insertBefore(star, moreBtnBox);
    } else {
      (moreButton.parentElement || moreButton).insertBefore(star, moreButton);
    }
  });

  refreshStarButtons();
}

function injectSidebarButton() {
  if (document.getElementById("fbs-open-sidepanel")) {
    return;
  }

  const button = document.createElement("button");
  button.id = "fbs-open-sidepanel";
  button.type = "button";
  button.title = "AI - Janival és Krisszel sidebar";
  button.innerHTML = `<img src="${chrome.runtime.getURL("profile_image.jpg")}" alt="" />`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    chrome.runtime.sendMessage({ type: "openSidePanel" });
  });

  document.body.appendChild(button);
}

function debounceProcess() {
  clearTimeout(debounceProcess.timer);
  debounceProcess.timer = setTimeout(processArticles, 500);
}

chrome.storage?.onChanged?.addListener((changes, area) => {
  if (area === "local" && changes[FBS_POSTS_KEY]) {
    refreshStarButtons();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSaveDialog();
  }
});

const observer = new MutationObserver(debounceProcess);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("scroll", debounceProcess, { passive: true });
window.addEventListener("popstate", debounceProcess);

const originalPushState = history.pushState;
history.pushState = function pushState(...args) {
  const result = originalPushState.apply(this, args);
  debounceProcess();
  return result;
};

processArticles();
