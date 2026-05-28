const _cfg = window.CINEMA_ATLAS_CONFIG || {};
const MAPBOX_ACCESS_TOKEN = _cfg.MAPBOX_ACCESS_TOKEN || "";
const TMDB_V3_API_KEY = _cfg.TMDB_V3_API_KEY || "";
const TMDB_READ_ACCESS_TOKEN = _cfg.TMDB_READ_ACCESS_TOKEN || "";
const INTRO_DURATION_MS = 5600;
const MAP_LANGUAGE = "en";

// ─── Supabase ────────────────────────────────────────────────────────
const SUPABASE_URL = _cfg.SUPABASE_URL || "";
const SUPABASE_ANON_KEY = _cfg.SUPABASE_ANON_KEY || "";

let sb = null;
let currentUser = null;

const initSupabase = () => {
  if (window.supabase?.createClient) {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
};

const isCloudAvailable = () => sb !== null && currentUser !== null;

const introOverlay = document.getElementById("introOverlay");
const mainInterface = document.getElementById("mainInterface");
const contentGrid = document.getElementById("contentGrid");
const tabButtons = [...document.querySelectorAll(".tab-button")];
const panels = {
  memory: document.getElementById("memoryPanel"),
  cinema: document.getElementById("cinemaPanel"),
}; 

const tokenNote = document.getElementById("tokenNote");
const selectedLocationText = document.getElementById("selectedLocationText");

const memoryForm = document.getElementById("memoryForm");
const memoryLocationInput = document.getElementById("memoryLocationInput");
const locateMemoryButton = document.getElementById("locateMemoryButton");
const memoryPhotoFile = document.getElementById("memoryPhotoFile");
const memoryCollection = document.getElementById("memoryCollection");
const memoryTimeline = document.getElementById("memoryTimeline");
const memoryObjectTypeInput = document.getElementById("memoryObjectType");
const memoryDiaryInput = document.getElementById("memoryDiary");
const memoryMusicInput = document.getElementById("memoryMusic");
const memoryEmotionInput = document.getElementById("memoryEmotion");
const memoryDateInput = document.getElementById("memoryDate");
const memorySubmitButton = memoryForm.querySelector("button[type='submit']");

const cinemaForm = document.getElementById("cinemaForm");
const movieSearchInput = document.getElementById("movieSearchInput");
const selectedMovieIdInput = document.getElementById("selectedMovieIdInput");
const movieSearchResults = document.getElementById("movieSearchResults");
const selectedMovieMeta = document.getElementById("selectedMovieMeta");
const movieLocationInput = document.getElementById("movieLocationInput");
const locateCinemaButton = document.getElementById("locateCinemaButton");
const cinemaStatus = document.getElementById("cinemaStatus");
const cinemaCollection = document.getElementById("cinemaCollection");

const memoryModal = document.getElementById("memoryModal");
const memoryVisual = document.getElementById("memoryVisual");
const memoryMeta = document.getElementById("memoryMeta");
const memoryTitle = document.getElementById("memoryTitle");
const memoryDiaryText = document.getElementById("memoryDiaryText");
const memoryEmotionText = document.getElementById("memoryEmotionText");
const memoryMusicLink = document.getElementById("memoryMusicLink");
const editMemoryButton = document.getElementById("editMemoryButton");
const deleteMemoryButton = document.getElementById("deleteMemoryButton");

const filmModal = document.getElementById("filmModal");
const filmVisual = document.getElementById("filmVisual");
const filmMeta = document.getElementById("filmMeta");
const filmTitle = document.getElementById("filmTitle");
const filmQuote = document.getElementById("filmQuote");
const filmEmotion = document.getElementById("filmEmotion");
const filmLinkedMemories = document.getElementById("filmLinkedMemories");
const filmLinkedGallery = document.getElementById("filmLinkedGallery");

const linkSection = document.getElementById("linkSection");
const linkHint = document.getElementById("linkHint");
const linkableMemories = document.getElementById("linkableMemories");
const linkedSection = document.getElementById("linkedSection");
const linkedMemories = document.getElementById("linkedMemories");

const overlapModal = document.getElementById("overlapModal");
const overlapVisuals = document.getElementById("overlapVisuals");
const overlapReality = document.getElementById("overlapReality");
const overlapCinema = document.getElementById("overlapCinema");
const overlapMeta = document.getElementById("overlapMeta");
const overlapTitle = document.getElementById("overlapTitle");
const overlapQuote = document.getElementById("overlapQuote");
const overlapDiary = document.getElementById("overlapDiary");
const overlapScene = document.getElementById("overlapScene");
const overlapMusicLink = document.getElementById("overlapMusicLink");
const overlapBlend = document.getElementById("overlapBlend");

let map = null;
let geocoderControl = null;
let draftMarker = null;
let activeMarkerElement = null;
let selectedPoint = null;
let editingMemoryId = null;

let memoryEntries = [];
let filmMemoryLinks = [];
let memoryTags = []; // master tag list
let filmNotes = {}; // movieId -> personal note string

// ─── Save functions (cloud + local fallback) ─────────────────────────

const saveMemories = async () => {
  try { localStorage.setItem("cinemaAtlasMemories", JSON.stringify(memoryEntries)); } catch {}
  if (!isCloudAvailable()) return;
  // Cloud sync is done per-operation (insert/update/delete), not bulk
};

const saveFilmLinks = async () => {
  try { localStorage.setItem("cinemaAtlasFilmLinks", JSON.stringify(filmMemoryLinks)); } catch {}
};

const saveTags = async () => {
  try { localStorage.setItem("cinemaAtlasTags", JSON.stringify(memoryTags)); } catch {}
};

const saveFilmNotes = async () => {
  try { localStorage.setItem("cinemaAtlasFilmNotes", JSON.stringify(filmNotes)); } catch {}
};

// ─── Cloud CRUD helpers ──────────────────────────────────────────────

const cloudSaveMemory = async (entry) => {
  if (!isCloudAvailable()) return;
  try {
    const row = {
      id: entry.id,
      user_id: currentUser.id,
      location_name: entry.locationName || "",
      coords: entry.coords || [0, 0],
      object_type: entry.objectType || "",
      diary: entry.diary || "",
      emotion: entry.emotion || "",
      music: entry.music || "",
      date: entry.date || null,
      tags: entry.tags || [],
      photo_urls: entry.photoUrls || [],
      updated_at: new Date().toISOString(),
    };
    await sb.from("memories").upsert(row, { onConflict: "id" });
  } catch (err) { console.warn("Cloud save memory failed:", err); }
};

const cloudDeleteMemory = async (memoryId) => {
  if (!isCloudAvailable()) return;
  try {
    // Delete photos from storage
    const entry = memoryEntries.find((m) => m.id === memoryId);
    if (entry?.photoUrls?.length) {
      const paths = entry.photoUrls
        .map((url) => { try { return new URL(url).pathname.split("/memory-photos/")[1]; } catch { return null; } })
        .filter(Boolean);
      if (paths.length) await sb.storage.from("memory-photos").remove(paths);
    }
    await sb.from("memories").delete().eq("id", memoryId);
  } catch (err) { console.warn("Cloud delete memory failed:", err); }
};

const cloudSaveLink = async (link) => {
  if (!isCloudAvailable()) return;
  try {
    await sb.from("film_memory_links").upsert({
      id: link.id,
      user_id: currentUser.id,
      movie_id: String(link.movieId),
      movie_title: link.movieTitle || "",
      memory_id: link.memoryId,
      location_city: link.locationCity || "",
      created_at: link.createdAt || new Date().toISOString(),
    }, { onConflict: "id" });
  } catch (err) { console.warn("Cloud save link failed:", err); }
};

const cloudDeleteLink = async (movieId, memoryId) => {
  if (!isCloudAvailable()) return;
  try {
    await sb.from("film_memory_links")
      .delete()
      .eq("movie_id", String(movieId))
      .eq("memory_id", memoryId);
  } catch (err) { console.warn("Cloud delete link failed:", err); }
};

const cloudSaveFilmNote = async (movieId, note) => {
  if (!isCloudAvailable()) return;
  try {
    await sb.from("film_notes").upsert({
      user_id: currentUser.id,
      movie_id: String(movieId),
      note,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,movie_id" });
  } catch (err) { console.warn("Cloud save film note failed:", err); }
};

const cloudSaveTag = async (tag) => {
  if (!isCloudAvailable()) return;
  try {
    await sb.from("user_tags").upsert({
      user_id: currentUser.id,
      tag,
    }, { onConflict: "user_id,tag" });
  } catch (err) { console.warn("Cloud save tag failed:", err); }
};

const uploadPhotoToStorage = async (file) => {
  if (!isCloudAvailable()) return null;
  try {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const { error } = await sb.storage.from("memory-photos").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) { console.warn("Photo upload error:", error); return null; }
    const { data } = sb.storage.from("memory-photos").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) { console.warn("Photo upload failed:", err); return null; }
};

// ─── Cloud load functions ────────────────────────────────────────────

const loadMemoriesFromCloud = async () => {
  if (!isCloudAvailable()) return null;
  try {
    const { data, error } = await sb.from("memories").select("*").order("created_at", { ascending: false });
    if (error) { console.warn("Cloud load memories error:", error); return null; }
    return (data || []).map((row) => ({
      id: row.id,
      locationName: row.location_name,
      coords: row.coords,
      objectType: row.object_type,
      diary: row.diary,
      emotion: row.emotion,
      music: row.music,
      date: row.date,
      tags: row.tags || [],
      photoData: "",
      photos: [],
      photoUrls: row.photo_urls || [],
    }));
  } catch (err) { console.warn("Cloud load memories failed:", err); return null; }
};

const loadLinksFromCloud = async () => {
  if (!isCloudAvailable()) return null;
  try {
    const { data, error } = await sb.from("film_memory_links").select("*");
    if (error) return null;
    return (data || []).map((row) => ({
      id: row.id,
      movieId: row.movie_id,
      movieTitle: row.movie_title,
      memoryId: row.memory_id,
      locationCity: row.location_city,
      createdAt: row.created_at,
    }));
  } catch { return null; }
};

const loadTagsFromCloud = async () => {
  if (!isCloudAvailable()) return null;
  try {
    const { data, error } = await sb.from("user_tags").select("tag");
    if (error) return null;
    return (data || []).map((row) => row.tag);
  } catch { return null; }
};

const loadFilmNotesFromCloud = async () => {
  if (!isCloudAvailable()) return null;
  try {
    const { data, error } = await sb.from("film_notes").select("movie_id, note");
    if (error) return null;
    const notes = {};
    (data || []).forEach((row) => { notes[row.movie_id] = row.note; });
    return notes;
  } catch { return null; }
};

// ─── Local load functions (fallback) ─────────────────────────────────

const loadTags = () => {
  try {
    const stored = localStorage.getItem("cinemaAtlasTags");
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const loadFilmNotes = () => {
  try {
    const stored = localStorage.getItem("cinemaAtlasFilmNotes");
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch { return {}; }
};

const loadFilmLinks = () => {
  try {
    const stored = localStorage.getItem("cinemaAtlasFilmLinks");
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

const loadMemories = () => {
  try {
    const stored = localStorage.getItem("cinemaAtlasMemories");
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
};

// ─── Auth UI ─────────────────────────────────────────────────────────

const injectAuthUI = () => {
  const existing = document.getElementById("authBar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.id = "authBar";
  bar.className = "auth-bar";

  if (currentUser) {
    const email = currentUser.email || "User";
    bar.innerHTML = `
      <span class="auth-email">${email}</span>
      <span class="auth-cloud-badge">Cloud sync on</span>
      <button class="auth-btn" id="logoutBtn">Sign out</button>
    `;
    bar.querySelector("#logoutBtn").addEventListener("click", async () => {
      await sb.auth.signOut();
      currentUser = null;
      injectAuthUI();
      // Reload from localStorage
      memoryEntries = loadMemories().map(annotateMemoryEntry);
      filmMemoryLinks = loadFilmLinks();
      memoryTags = loadTags();
      filmNotes = loadFilmNotes();
      renderMemoryCollection();
      renderTimeline();
    });
  } else if (sb) {
    bar.innerHTML = `
      <span class="auth-hint">Sign in to sync across devices</span>
      <button class="auth-btn" id="showLoginBtn">Sign in</button>
    `;
    bar.querySelector("#showLoginBtn").addEventListener("click", () => openAuthModal());
  } else {
    bar.innerHTML = `<span class="auth-hint">Offline mode — data saved locally</span>`;
  }

  const shell = document.querySelector(".page-shell") || document.body;
  shell.prepend(bar);
};

const openAuthModal = () => {
  let overlay = document.getElementById("authModalOverlay");
  if (overlay) { overlay.classList.add("is-open"); return; }

  overlay = document.createElement("div");
  overlay.id = "authModalOverlay";
  overlay.className = "modal-overlay is-open";
  overlay.innerHTML = `
    <div class="auth-modal-sheet">
      <button class="modal-close" id="authModalClose">Close</button>
      <div class="auth-modal-body">
        <p class="panel-kicker">Cinema Atlas</p>
        <h3 class="auth-modal-title">Sign in</h3>
        <p class="auth-modal-note">Your memories, synced across every device.</p>
        <div class="editorial-form" id="authForm">
          <label>Email
            <input type="email" id="authEmail" placeholder="you@example.com" />
          </label>
          <label>Password
            <input type="password" id="authPassword" placeholder="At least 6 characters" />
          </label>
          <p class="auth-error" id="authError"></p>
          <button type="button" class="line-button" id="authSignInBtn">Sign in</button>
          <button type="button" class="soft-button" id="authSignUpBtn">Create account</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.classList.add("modal-open");

  overlay.querySelector("#authModalClose").addEventListener("click", () => {
    overlay.classList.remove("is-open");
    document.body.classList.remove("modal-open");
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("is-open");
      document.body.classList.remove("modal-open");
    }
  });

  overlay.querySelector("#authSignInBtn").addEventListener("click", () => handleAuth("login"));
  overlay.querySelector("#authSignUpBtn").addEventListener("click", () => handleAuth("signup"));
  overlay.querySelector("#authPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAuth("login");
  });
};

const handleAuth = async (mode) => {
  const email = document.getElementById("authEmail")?.value?.trim();
  const password = document.getElementById("authPassword")?.value;
  const errorEl = document.getElementById("authError");

  if (!email || !password) {
    if (errorEl) errorEl.textContent = "Please fill in both fields.";
    return;
  }
  if (password.length < 6) {
    if (errorEl) errorEl.textContent = "Password needs at least 6 characters.";
    return;
  }

  if (errorEl) errorEl.textContent = "";

  let result;
  if (mode === "signup") {
    result = await sb.auth.signUp({ email, password });
  } else {
    result = await sb.auth.signInWithPassword({ email, password });
  }

  if (result.error) {
    if (errorEl) errorEl.textContent = result.error.message;
    return;
  }

  if (mode === "signup" && !result.data?.session) {
    if (errorEl) errorEl.textContent = "Check your email for a confirmation link, then sign in.";
    return;
  }

  currentUser = result.data?.user || null;

  // Close modal
  const overlay = document.getElementById("authModalOverlay");
  if (overlay) {
    overlay.classList.remove("is-open");
    document.body.classList.remove("modal-open");
  }

  // Sync: migrate local data to cloud if cloud is empty, then load from cloud
  await syncAfterLogin();
  injectAuthUI();
};

const syncAfterLogin = async () => {
  if (!isCloudAvailable()) return;

  // Load cloud data
  const cloudMemories = await loadMemoriesFromCloud();
  const cloudLinks = await loadLinksFromCloud();
  const cloudTags = await loadTagsFromCloud();
  const cloudNotes = await loadFilmNotesFromCloud();

  // If cloud has data, use it
  if (cloudMemories && cloudMemories.length > 0) {
    memoryEntries = cloudMemories.map(annotateMemoryEntry);
    filmMemoryLinks = cloudLinks || [];
    memoryTags = cloudTags || [];
    filmNotes = cloudNotes || {};
    // Also save to localStorage as cache
    saveMemories();
    saveFilmLinks();
    saveTags();
    saveFilmNotes();
  } else {
    // Cloud is empty — push local data up
    const localMemories = loadMemories().map(annotateMemoryEntry);
    const localLinks = loadFilmLinks();
    const localTags = loadTags();
    const localNotes = loadFilmNotes();

    for (const entry of localMemories) {
      await cloudSaveMemory(entry);
    }
    for (const link of localLinks) {
      await cloudSaveLink(link);
    }
    for (const tag of localTags) {
      await cloudSaveTag(tag);
    }
    for (const [movieId, note] of Object.entries(localNotes)) {
      await cloudSaveFilmNote(movieId, note);
    }

    memoryEntries = localMemories;
    filmMemoryLinks = localLinks;
    memoryTags = localTags;
    filmNotes = localNotes;
  }

  // Re-render everything
  memoryMarkers.forEach(({ marker }) => marker.remove());
  memoryMarkers.clear();
  memoryEntries.forEach((entry) => { if (map) addMemoryMarker(entry); });
  renderMemoryCollection();
  renderTimeline();
  refreshOverlapMarkers();
};

const memoryMarkers = new Map();
let filmMarkers = [];
const overlapMarkers = new Map();
let activeCinemaLocations = [];

const curatedFilmGeography = {
  "in the mood for love": [
    {
      city: "Hong Kong",
      coords: [114.1694, 22.3193],
      quote: "We will not be like them.",
      emotion: "Longing held in hallways, rain, and timing.",
      scene: "Narrow stairwells, shared corridors, and missed encounters in slow motion.",
    },
    {
      city: "Bangkok",
      coords: [100.5018, 13.7563],
      quote: "I thought we would be different.",
      emotion: "Distance measured through unfinished departures.",
      scene: "An emotional epilogue where memory echoes across hotel interiors.",
    },
  ],
  roma: [
    {
      city: "Mexico City",
      coords: [-99.1332, 19.4326],
      quote: "No matter what they tell you, we women are always alone.",
      emotion: "Domestic labor, class memory, and devotion in one frame.",
      scene: "Courtyard routines and political unrest colliding in domestic space.",
    },
    {
      city: "Veracruz",
      coords: [-96.1342, 19.1738],
      quote: "I did not want her to be born.",
      emotion: "Grief and tenderness on a moving shoreline.",
      scene: "A seaside rescue sequence that folds fear, love, and confession together.",
    },
  ],
  "lost in translation": [
    {
      city: "Tokyo",
      coords: [139.6917, 35.6895],
      quote: "The more you know who you are, the less things upset you.",
      emotion: "Urban loneliness and neon intimacy.",
      scene: "Hotel bars, karaoke rooms, and late-night taxi windows across Tokyo.",
    },
    {
      city: "Kyoto",
      coords: [135.7681, 35.0116],
      quote: "I just do not know what I am supposed to be.",
      emotion: "Stillness as an answer to emotional drift.",
      scene: "Temples and gardens reframing uncertainty through ritual calm.",
    },
  ],
  "perfect days": [
    {
      city: "Tokyo",
      coords: [139.6917, 35.6895],
      quote: "Next time is next time. Now is now.",
      emotion: "Tender repetition, solitude, and light between ordinary gestures.",
      scene: "Public toilets, cassette tapes, and trees filtering morning light.",
    },
  ],
  "chungking express": [
    {
      city: "Hong Kong",
      coords: [114.1694, 22.3193],
      quote: "We're all unlucky in love sometimes.",
      emotion: "Restless speed, romantic drift, and urban desire.",
      scene: "Midnight food stalls, escalators, and fluorescent chance encounters.",
    },
  ],
  "before sunset": [
    {
      city: "Paris",
      coords: [2.3522, 48.8566],
      quote: "Baby, you are gonna miss that plane.",
      emotion: "Conversation as geography, time as emotional pressure.",
      scene: "Bookshops, river boats, and apartment interiors unfolding in real time.",
    },
  ],
  "portrait of a lady on fire": [
    {
      city: "Brittany Coast",
      coords: [-3.4, 48.5],
      quote: "Do all lovers feel they are inventing something?",
      emotion: "Desire archived through sea wind and firelight.",
      scene: "Clifftops and candlelit rooms where gaze becomes narrative.",
    },
    {
      city: "Paris",
      coords: [2.3522, 48.8566],
      quote: "Do not regret. Remember.",
      emotion: "Memory as an enduring visual language.",
      scene: "A final performance memory carried back to the city.",
    },
  ],
};

let tmdbConfig = {
  imageBaseUrl: "https://image.tmdb.org/t/p/",
  posterSize: "w185",
  backdropSize: "w1280",
};

let searchAbortController = null;
let searchDebounceTimer = null;
let movieSearchItems = [];
let highlightedSearchIndex = -1;
let selectedMovieSummary = null;
let activeMovieDetails = null;

const hasValidMapboxToken = () =>
  typeof MAPBOX_ACCESS_TOKEN === "string" &&
  MAPBOX_ACCESS_TOKEN.trim() !== "" &&
  !MAPBOX_ACCESS_TOKEN.includes("YOUR_MAPBOX_ACCESS_TOKEN");

const hasValidTmdbCredentials = () => {
  const hasBearer =
    typeof TMDB_READ_ACCESS_TOKEN === "string" &&
    TMDB_READ_ACCESS_TOKEN.trim() !== "" &&
    !TMDB_READ_ACCESS_TOKEN.includes("YOUR_TMDB");
  const hasApiKey =
    typeof TMDB_V3_API_KEY === "string" &&
    TMDB_V3_API_KEY.trim() !== "" &&
    !TMDB_V3_API_KEY.includes("YOUR_TMDB");
  return hasBearer || hasApiKey;
};

const normalizeTitle = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const extractCityName = (value) => {
  if (!value) return "";
  const first = String(value).split(",")[0].trim();
  return first || String(value).trim();
};

const buildCityKey = (value) => normalizeTitle(extractCityName(value));

const annotateMemoryEntry = (entry) => ({
  ...entry,
  cityName: extractCityName(entry.locationName),
  cityKey: buildCityKey(entry.locationName),
  tags: entry.tags || [],
  photos: entry.photos || (entry.photoData ? [entry.photoData] : []),
  photoUrls: entry.photoUrls || [],
});

// Get the best available photo sources: prefer cloud URLs, fallback to base64
const getEntryPhotos = (entry) => {
  const urls = entry.photoUrls?.length ? entry.photoUrls : [];
  const base64 = entry.photos?.length ? entry.photos : (entry.photoData ? [entry.photoData] : []);
  // Merge: prefer cloud URLs, fill remaining with base64
  if (urls.length) return urls;
  return base64;
};

const getEntryThumb = (entry) => {
  const photos = getEntryPhotos(entry);
  return photos[0] || "";
};

const formatCoordinates = (coords) => `${coords[1].toFixed(3)}, ${coords[0].toFixed(3)}`;

const buildTmdbUrl = (path, params = {}) => {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    url.searchParams.set(key, String(value));
  });

  if (!TMDB_READ_ACCESS_TOKEN.trim() && TMDB_V3_API_KEY.trim()) {
    url.searchParams.set("api_key", TMDB_V3_API_KEY.trim());
  }

  return url.toString();
};

const fetchTmdb = async (path, params = {}, signal = undefined) => {
  if (!hasValidTmdbCredentials()) return null;

  const headers = { Accept: "application/json" };
  if (TMDB_READ_ACCESS_TOKEN.trim()) {
    headers.Authorization = `Bearer ${TMDB_READ_ACCESS_TOKEN.trim()}`;
  }

  let response;
  try {
    response = await fetch(buildTmdbUrl(path, params), { headers, signal });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  return response.json();
};

const buildTmdbImage = (path, size) => {
  if (!path) return "";
  return `${tmdbConfig.imageBaseUrl}${size}${path}`;
};

const setMapFeatureAvailability = (enabled) => {
  locateMemoryButton.disabled = !enabled;
  const memorySubmit = memoryForm.querySelector("button[type='submit']");
  if (memorySubmit) memorySubmit.disabled = !enabled;
};

const setCinemaFeatureAvailability = (enabled) => {
  movieSearchInput.disabled = !enabled;
  locateCinemaButton.disabled = !enabled;
  movieLocationInput.disabled = !enabled;
  const cinemaSubmit = cinemaForm.querySelector("button[type='submit']");
  if (cinemaSubmit) cinemaSubmit.disabled = !enabled;
};

const setActiveTab = (tab) => {
  contentGrid.dataset.mode = tab;

  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("is-active", key === tab);
  });

  // On mobile, show/hide map vs panel
  const mapColumn = document.querySelector(".map-column");
  const panelColumn = document.querySelector(".panel-column");
  if (mapColumn && panelColumn && window.innerWidth <= 760) {
    if (tab === "map") {
      mapColumn.classList.add("mobile-visible");
      mapColumn.classList.remove("mobile-hidden");
      panelColumn.classList.add("mobile-hidden");
      panelColumn.classList.remove("mobile-visible");
    } else {
      mapColumn.classList.remove("mobile-visible");
      mapColumn.classList.add("mobile-hidden");
      panelColumn.classList.remove("mobile-hidden");
      panelColumn.classList.add("mobile-visible");
    }
  }
};

const focusMarker = (element) => {
  if (activeMarkerElement) activeMarkerElement.classList.remove("is-active");
  if (!element) {
    activeMarkerElement = null;
    return;
  }
  element.classList.add("is-active");
  activeMarkerElement = element;
};

const openModal = (modal) => {
  modal.hidden = false;
  window.requestAnimationFrame(() => modal.classList.add("is-open"));
  document.body.classList.add("modal-open");
};

const closeModal = (modal) => {
  modal.classList.remove("is-open");
  window.setTimeout(() => {
    modal.hidden = true;
    const stillOpen = [...document.querySelectorAll(".modal-overlay")].some((item) => !item.hidden);
    if (!stillOpen) document.body.classList.remove("modal-open");
  }, 320);
};

const updateSelectedPoint = (name, coords, { moveMap = false } = {}) => {
  selectedPoint = { name, coords };
  selectedLocationText.textContent = name;
  memoryLocationInput.value = name;

  if (map && moveMap) {
    map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 4.2), essential: true });
    showMapOnMobile();
  }
};

const showMapOnMobile = () => {
  if (window.innerWidth <= 760) {
    setActiveTab("map");
  }
};

const placeDraftMarker = (coords) => {
  if (!map) return;
  if (!draftMarker) {
    const element = document.createElement("div");
    element.className = "draft-map-marker";
    draftMarker = new mapboxgl.Marker({ element }).setLngLat(coords).addTo(map);
  } else {
    draftMarker.setLngLat(coords);
  }
};

const geocodeLocation = async (query) => {
  if (!hasValidMapboxToken()) return null;
  const encodedQuery = encodeURIComponent(query.trim());
  if (!encodedQuery) return null;

  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?limit=1&autocomplete=true&language=${MAP_LANGUAGE}&access_token=${MAPBOX_ACCESS_TOKEN}`
  );
  if (!response.ok) return null;

  const data = await response.json();
  const feature = data.features?.[0];
  if (!feature?.center) return null;

  return {
    name: feature.place_name || feature.text,
    coords: feature.center,
  };
};

const reverseGeocode = async (coords) => {
  if (!hasValidMapboxToken()) return null;
  const [lng, lat] = coords;
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?limit=1&language=${MAP_LANGUAGE}&access_token=${MAPBOX_ACCESS_TOKEN}`
  );
  if (!response.ok) return null;

  const data = await response.json();
  return data.features?.[0]?.place_name || null;
};

const readPhoto = (file) =>
  new Promise((resolve) => {
    if (!file) {
      resolve("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });

// Upload multiple photos to Supabase Storage, return array of public URLs
const uploadPhotosToCloud = async (files) => {
  if (!isCloudAvailable() || !files?.length) return [];
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const url = await uploadPhotoToStorage(files[i]);
    if (url) urls.push(url);
  }
  return urls;
};

const setMemoryFormMode = (mode) => {
  if (!memorySubmitButton) return;
  memorySubmitButton.textContent = mode === "edit" ? "Update" : "Keep This Memory";
};

const clearMemoryEditState = () => {
  editingMemoryId = null;
  setMemoryFormMode("create");
};

const beginMemoryEdit = (entry) => {
  if (!entry) return;

  editingMemoryId = entry.id;
  setMemoryFormMode("edit");
  setActiveTab("memory");

  const objectTypeExists = [...memoryObjectTypeInput.options].some((option) => option.value === entry.objectType);
  memoryObjectTypeInput.value = objectTypeExists ? entry.objectType : memoryObjectTypeInput.options[0]?.value || "";
  memoryLocationInput.value = entry.locationName || "";
  memoryDiaryInput.value = entry.diary || "";
  memoryMusicInput.value = entry.music || "";
  memoryEmotionInput.value = entry.emotion || "";
  memoryDateInput.value = entry.date || new Date().toISOString().slice(0, 10);

  const tagInput = document.getElementById("memoryTagsInput");
  if (tagInput) tagInput.value = (entry.tags || []).join(", ");

  if (Array.isArray(entry.coords) && entry.coords.length === 2) {
    updateSelectedPoint(entry.locationName || "Selected location", entry.coords, { moveMap: true });
    placeDraftMarker(entry.coords);
  } else {
    selectedPoint = null;
  }

  closeModal(memoryModal);
  memoryLocationInput.focus();
};

const addMemoryMarker = (entry) => {
  if (!map) return;

  const memoryId = entry.id;
  const element = document.createElement("button");
  element.type = "button";
  element.className = "memory-map-marker";
  element.title = `${entry.objectType} - ${entry.locationName}`;

  const marker = new mapboxgl.Marker({ element }).setLngLat(entry.coords).addTo(map);
  element.addEventListener("click", () => {
    const latestEntry = memoryEntries.find((item) => item.id === memoryId) || entry;
    focusMarker(element);
    updateSelectedPoint(latestEntry.locationName, latestEntry.coords, { moveMap: true });
    openMemoryModal(memoryId);
  });

  memoryMarkers.set(memoryId, { marker, element });
};

let memoryGroupMode = "all"; // "all" | "time" | "location" | "tag"
let memorySearchQuery = "";
let heatmapActive = false;

const getMemoryYearMonth = (entry) => {
  if (!entry?.date) return "Unknown";
  const [year, month] = String(entry.date).split("-");
  if (!year || !month) return String(entry.date);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[Number(month) - 1] || month;
  return `${monthName} ${year}`;
};

const getMemoryCity = (entry) => {
  return entry?.cityName || extractCityName(entry?.locationName) || "Unknown";
};

const filterMemories = (entries, query) => {
  if (!query.trim()) return entries;
  const q = query.toLowerCase();
  return entries.filter((entry) => {
    const searchable = [
      entry.locationName,
      entry.cityName,
      entry.diary,
      entry.emotion,
      entry.objectType,
      ...(entry.tags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return searchable.includes(q);
  });
};

const groupMemories = (entries, mode) => {
  if (mode === "all") return [{ label: null, entries }];

  const groups = new Map();
  entries.forEach((entry) => {
    if (mode === "tag") {
      const tags = entry.tags?.length ? entry.tags : ["Untagged"];
      tags.forEach((tag) => {
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag).push(entry);
      });
    } else {
      const key = mode === "time" ? getMemoryYearMonth(entry) : getMemoryCity(entry);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
  });

  if (mode === "time") {
    const sorted = [...groups.entries()].sort((a, b) => {
      const aDate = a[1][0]?.date || "";
      const bDate = b[1][0]?.date || "";
      return bDate.localeCompare(aDate);
    });
    return sorted.map(([label, entries]) => ({ label, entries }));
  }

  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([label, entries]) => ({ label, entries }));
};

const createMemoryItem = (entry) => {
  const item = document.createElement("button");
  item.type = "button";
  item.role = "listitem";
  item.className = "archive-item archive-item-rich";
  item.dataset.type = entry.objectType;

  const photoSrc = getEntryThumb(entry);
  if (photoSrc) {
    const thumb = document.createElement("span");
    thumb.className = "archive-thumb";
    thumb.style.backgroundImage = `url("${photoSrc}")`;
    item.appendChild(thumb);
  } else {
    const thumb = document.createElement("span");
    thumb.className = "archive-thumb archive-thumb-empty";
    item.appendChild(thumb);
  }

  const content = document.createElement("span");
  content.className = "archive-content";

  const title = document.createElement("span");
  title.className = "archive-title";
  title.textContent = `${entry.objectType} — ${entry.locationName}`;
  content.appendChild(title);

  if (entry.date) {
    const date = document.createElement("span");
    date.className = "archive-date";
    date.textContent = formatTimelineDate(entry.date);
    content.appendChild(date);
  }

  if (entry.tags?.length) {
    const tagLine = document.createElement("span");
    tagLine.className = "archive-tags";
    tagLine.textContent = entry.tags.join(" · ");
    content.appendChild(tagLine);
  }

  item.appendChild(content);

  item.addEventListener("click", () => {
    const markerRef = memoryMarkers.get(entry.id);
    if (markerRef) focusMarker(markerRef.element);
    if (map) {
      map.flyTo({ center: entry.coords, zoom: Math.max(map.getZoom(), 4.8), essential: true });
    }
    updateSelectedPoint(entry.locationName, entry.coords);
    openMemoryModal(entry.id);
  });
  return item;
};

const renderMemoryCollection = () => {
  memoryCollection.innerHTML = "";
  const filtered = filterMemories(memoryEntries, memorySearchQuery);

  if (!memoryEntries.length) {
    const empty = document.createElement("p");
    empty.className = "status-line";
    empty.textContent = "Nothing here yet. Your first memory is waiting.";
    memoryCollection.appendChild(empty);
    return;
  }

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "status-line";
    empty.textContent = `Nothing found for "${memorySearchQuery}".`;
    memoryCollection.appendChild(empty);
    return;
  }

  const groups = groupMemories(filtered, memoryGroupMode);

  groups.forEach((group) => {
    if (group.label) {
      const folder = document.createElement("details");
      folder.className = "memory-folder";
      folder.open = true;

      const summary = document.createElement("summary");
      summary.className = "memory-folder-label";
      summary.innerHTML = `<span class="folder-name">${group.label}</span><span class="folder-count">${group.entries.length}</span>`;
      folder.appendChild(summary);

      const list = document.createElement("div");
      list.className = "folder-contents";
      group.entries.forEach((entry) => list.appendChild(createMemoryItem(entry)));
      folder.appendChild(list);

      memoryCollection.appendChild(folder);
    } else {
      group.entries.forEach((entry) => memoryCollection.appendChild(createMemoryItem(entry)));
    }
  });
};

const getMemoryDateSortValue = (entry) => {
  if (!entry?.date) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(entry.date);
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
};

const formatTimelineDate = (value) => {
  if (!value) return "Unknown date";

  const [year, month, day] = String(value)
    .split("-")
    .map((part) => Number(part));
  if (Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day)) {
    const utcDate = new Date(Date.UTC(year, month - 1, day));
    if (!Number.isNaN(utcDate.getTime())) {
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      }).format(utcDate);
    }
  }

  const fallbackDate = new Date(value);
  if (Number.isNaN(fallbackDate.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(fallbackDate);
};

let timelineGroupMode = "all"; // "all" | "time" | "location"

const createTimelineItem = (entry) => {
  const item = document.createElement("button");
  item.type = "button";
  item.role = "listitem";
  item.className = "timeline-item";

  const dateLine = document.createElement("p");
  dateLine.className = "timeline-date";
  dateLine.textContent = formatTimelineDate(entry.date);

  const locationLine = document.createElement("p");
  locationLine.className = "timeline-location";
  locationLine.textContent = entry.locationName || "Unknown location";

  const objectLine = document.createElement("p");
  objectLine.className = "timeline-object";
  objectLine.textContent = entry.objectType || "Memory";

  item.append(dateLine, locationLine, objectLine);
  item.addEventListener("click", () => {
    const markerRef = memoryMarkers.get(entry.id);
    if (markerRef) focusMarker(markerRef.element);
    if (map) {
      map.flyTo({ center: entry.coords, zoom: Math.max(map.getZoom(), 4.8), essential: true });
    }
    updateSelectedPoint(entry.locationName, entry.coords);
    openMemoryModal(entry.id);
  });

  return item;
};

const renderTimeline = () => {
  memoryTimeline.innerHTML = "";
  if (!memoryEntries.length) {
    const empty = document.createElement("p");
    empty.className = "status-line compact";
    empty.textContent = "The timeline starts with your first memory.";
    memoryTimeline.appendChild(empty);
    return;
  }

  const sortedEntries = [...memoryEntries].sort((a, b) => {
    const timeA = getMemoryDateSortValue(a);
    const timeB = getMemoryDateSortValue(b);
    if (timeA === timeB) return (a.locationName || "").localeCompare(b.locationName || "");
    return timeA - timeB;
  });

  const groups = groupMemories(sortedEntries, timelineGroupMode);

  groups.forEach((group) => {
    if (group.label) {
      const folder = document.createElement("details");
      folder.className = "memory-folder timeline-folder";
      folder.open = true;

      const summary = document.createElement("summary");
      summary.className = "memory-folder-label";
      summary.innerHTML = `<span class="folder-name">${group.label}</span><span class="folder-count">${group.entries.length}</span>`;
      folder.appendChild(summary);

      const list = document.createElement("div");
      list.className = "folder-contents timeline-folder-contents";
      group.entries.forEach((entry) => list.appendChild(createTimelineItem(entry)));
      folder.appendChild(list);

      memoryTimeline.appendChild(folder);
    } else {
      sortedEntries.forEach((entry) => memoryTimeline.appendChild(createTimelineItem(entry)));
    }
  });
};

const openMemoryModal = (memoryId) => {
  const entry = memoryEntries.find((item) => item.id === memoryId);
  if (!entry) return;

  const photos = getEntryPhotos(entry);
  const fallbackVisual =
    "linear-gradient(140deg, rgba(243, 238, 227, 0.3), rgba(28, 29, 31, 0.28)), radial-gradient(circle at 24% 22%, rgba(216, 210, 200, 0.5), transparent 48%)";
  memoryVisual.style.backgroundImage = photos[0]
    ? `linear-gradient(140deg, rgba(243, 238, 227, 0.12), rgba(28, 29, 31, 0.2)), url("${photos[0]}")`
    : fallbackVisual;

  // Render multi-photo gallery strip
  const existingGallery = memoryVisual.querySelector(".memory-photo-strip");
  if (existingGallery) existingGallery.remove();
  if (photos.length > 1) {
    const strip = document.createElement("div");
    strip.className = "memory-photo-strip";
    photos.forEach((photoSrc, index) => {
      const thumb = document.createElement("button");
      thumb.type = "button";
      thumb.className = "memory-strip-thumb";
      if (index === 0) thumb.classList.add("is-active");
      thumb.style.backgroundImage = `url("${photoSrc}")`;
      thumb.addEventListener("click", () => {
        memoryVisual.style.backgroundImage = `linear-gradient(140deg, rgba(243, 238, 227, 0.12), rgba(28, 29, 31, 0.2)), url("${photoSrc}")`;
        strip.querySelectorAll(".memory-strip-thumb").forEach((t) => t.classList.remove("is-active"));
        thumb.classList.add("is-active");
      });
      strip.appendChild(thumb);
    });
    memoryVisual.appendChild(strip);
  }

  memoryMeta.textContent = `${entry.locationName} | ${entry.date}`;
  memoryTitle.textContent = entry.objectType;
  memoryDiaryText.textContent = entry.diary;
  memoryEmotionText.textContent = entry.emotion ? entry.emotion : "";

  // Tags display
  const existingTags = memoryModal.querySelector(".memory-modal-tags");
  if (existingTags) existingTags.remove();
  if (entry.tags?.length) {
    const tagsEl = document.createElement("p");
    tagsEl.className = "memory-modal-tags";
    tagsEl.textContent = entry.tags.map((t) => `#${t}`).join("  ");
    memoryDiaryText.parentElement.insertBefore(tagsEl, memoryEmotionText);
  }

  // Linked films display
  const existingFilms = memoryModal.querySelector(".memory-linked-films");
  if (existingFilms) existingFilms.remove();
  const linkedFilms = getLinksForMemory(entry.id);
  if (linkedFilms.length) {
    const filmsEl = document.createElement("div");
    filmsEl.className = "memory-linked-films";
    const filmsLabel = document.createElement("p");
    filmsLabel.className = "modal-kicker";
    filmsLabel.textContent = "Films that touch this place";
    filmsEl.appendChild(filmsLabel);
    linkedFilms.forEach((link) => {
      const filmTag = document.createElement("span");
      filmTag.className = "memory-film-tag";
      filmTag.textContent = link.movieTitle || `Film #${link.movieId}`;
      filmsEl.appendChild(filmTag);
    });
    memoryDiaryText.parentElement.appendChild(filmsEl);
  }

  if (entry.music) {
    memoryMusicLink.href = entry.music;
    memoryMusicLink.removeAttribute("aria-disabled");
  } else {
    memoryMusicLink.href = "#";
    memoryMusicLink.setAttribute("aria-disabled", "true");
  }

  memoryModal.dataset.memoryId = entry.id;
  openModal(memoryModal);
};

const removeMemoryEntry = (memoryId) => {
  const entryIndex = memoryEntries.findIndex((item) => item.id === memoryId);
  if (entryIndex === -1) return null;

  if (editingMemoryId === memoryId) {
    clearMemoryEditState();
  }

  const [removedEntry] = memoryEntries.splice(entryIndex, 1);
  const markerRef = memoryMarkers.get(memoryId);
  if (markerRef) {
    markerRef.marker.remove();
    if (activeMarkerElement === markerRef.element) {
      markerRef.element.classList.remove("is-active");
      activeMarkerElement = null;
    }
    memoryMarkers.delete(memoryId);
  }

  saveMemories();
  cloudDeleteMemory(memoryId);
  renderMemoryCollection();
  renderTimeline();
  refreshOverlapMarkers();

  return removedEntry;
};

const clearFilmMarkers = () => {
  filmMarkers.forEach(({ marker }) => marker.remove());
  filmMarkers = [];
  activeCinemaLocations = [];
  cinemaCollection.innerHTML = "";
  overlapMarkers.forEach(({ marker }) => marker.remove());
  overlapMarkers.clear();
};

const clearOverlapMarkers = () => {
  overlapMarkers.forEach(({ marker }) => marker.remove());
  overlapMarkers.clear();
};

const computeOverlapData = () => {
  if (!activeCinemaLocations.length || !memoryEntries.length) return [];

  const memoryByCity = new Map();
  memoryEntries.forEach((entry) => {
    const key = entry.cityKey;
    if (!key) return;
    if (!memoryByCity.has(key)) memoryByCity.set(key, []);
    memoryByCity.get(key).push(entry);
  });

  const overlaps = [];
  const seenKeys = new Set();
  const cinemaByCity = new Map();

  activeCinemaLocations.forEach((item) => {
    if (!item.cityKey) return;
    if (!cinemaByCity.has(item.cityKey)) cinemaByCity.set(item.cityKey, []);
    cinemaByCity.get(item.cityKey).push(item);
  });

  cinemaByCity.forEach((cinemaItems, cityKey) => {
    const memories = memoryByCity.get(cityKey);
    if (!memories?.length) return;

    const memoryEntry = memories[0];
    const cinemaEntry = cinemaItems[0];
    const overlapKey = `${cityKey}-${cinemaEntry.movieId}`;
    overlaps.push({
      cityKey: overlapKey,
      cityName: cinemaEntry.cityName || memoryEntry.cityName,
      memoryEntry,
      cinemaEntry,
      coords: memoryEntry.coords || cinemaEntry.coords,
    });
    seenKeys.add(overlapKey);
  });

  // Also include explicitly linked memories
  if (activeCinemaLocations.length > 0) {
    const movieId = activeCinemaLocations[0]?.movieId;
    if (movieId) {
      const explicitLinks = getLinksForMovie(movieId);
      explicitLinks.forEach((link) => {
        const entry = memoryEntries.find((m) => m.id === link.memoryId);
        if (!entry || !entry.coords) return;
        const overlapKey = `linked-${link.id}`;
        if (seenKeys.has(overlapKey)) return;

        const cinemaEntry = activeCinemaLocations[0];
        overlaps.push({
          cityKey: overlapKey,
          cityName: entry.cityName || entry.locationName,
          memoryEntry: entry,
          cinemaEntry,
          coords: entry.coords,
        });
        seenKeys.add(overlapKey);
      });
    }
  }

  return overlaps;
};

const openOverlapModal = (overlap) => {
  const { memoryEntry, cinemaEntry, cityName } = overlap;

  const memThumb = getEntryThumb(memoryEntry);
  const realityVisual =
    memThumb ||
    "linear-gradient(140deg, rgba(243, 238, 227, 0.22), rgba(28, 29, 31, 0.26)), radial-gradient(circle at 20% 24%, rgba(216, 210, 200, 0.48), transparent 50%)";
  const cinemaVisual = cinemaEntry.stillPath
    ? buildTmdbImage(cinemaEntry.stillPath, tmdbConfig.backdropSize)
    : "linear-gradient(140deg, rgba(216, 210, 200, 0.38), rgba(58, 60, 64, 0.22))";

  overlapReality.style.backgroundImage = memThumb
    ? `linear-gradient(145deg, rgba(243, 238, 227, 0.08), rgba(28, 29, 31, 0.2)), url("${realityVisual}")`
    : realityVisual;
  overlapCinema.style.backgroundImage = cinemaEntry.stillPath
    ? `linear-gradient(145deg, rgba(243, 238, 227, 0.08), rgba(28, 29, 31, 0.24)), url("${cinemaVisual}")`
    : cinemaVisual;

  overlapMeta.textContent = `${cityName} | Overlapped Memory`;
  overlapTitle.textContent = "You've been here before — on screen, and then in person.";
  overlapQuote.textContent = `"${cinemaEntry.quote}"`;
  overlapDiary.textContent = memoryEntry.diary;
  overlapScene.textContent = `${cinemaEntry.movieTitle}: ${cinemaEntry.scene || cinemaEntry.emotion}`;

  if (memoryEntry.music) {
    overlapMusicLink.href = memoryEntry.music;
    overlapMusicLink.removeAttribute("aria-disabled");
  } else {
    overlapMusicLink.href = "#";
    overlapMusicLink.setAttribute("aria-disabled", "true");
  }

  if (overlapBlend && overlapVisuals) {
    overlapBlend.value = "50";
    overlapVisuals.style.setProperty("--blend", "50%");
  }
  openModal(overlapModal);
};

const refreshOverlapMarkers = () => {
  if (!map) return;

  clearOverlapMarkers();
  const overlaps = computeOverlapData();
  overlaps.forEach((overlap) => {
    const element = document.createElement("button");
    element.type = "button";
    element.className = "overlap-map-marker";
    element.title = `Overlapped memory: ${overlap.cityName}`;

    const marker = new mapboxgl.Marker({ element }).setLngLat(overlap.coords).addTo(map);
    element.addEventListener("click", () => {
      focusMarker(element);
      map.flyTo({ center: overlap.coords, zoom: Math.max(map.getZoom(), 5.1), essential: true });
      openOverlapModal(overlap);
    });

    overlapMarkers.set(overlap.cityKey, { marker, element, overlap });
  });
};

const getIconicQuote = (movieDetails) => {
  const normalized = normalizeTitle(movieDetails.title || "");
  const curated = curatedFilmGeography[normalized];
  if (curated?.[0]?.quote) return curated[0].quote;
  if (movieDetails.tagline) return movieDetails.tagline;
  if (movieDetails.overview) return movieDetails.overview.split(".")[0];
  return "Some places only exist in the space between a screen and a memory.";
};

const getLinksForMovie = (movieId) =>
  filmMemoryLinks.filter((link) => link.movieId === movieId);

const getLinksForMemory = (memoryId) =>
  filmMemoryLinks.filter((link) => link.memoryId === memoryId);

const addFilmMemoryLink = (movieId, movieTitle, memoryId, locationCity) => {
  const exists = filmMemoryLinks.some(
    (link) => link.movieId === movieId && link.memoryId === memoryId
  );
  if (exists) return;
  const link = {
    id: `link-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    movieId,
    movieTitle,
    memoryId,
    locationCity: locationCity || "",
    createdAt: new Date().toISOString(),
  };
  filmMemoryLinks.push(link);
  saveFilmLinks();
  cloudSaveLink(link);
};

const removeFilmMemoryLink = (movieId, memoryId) => {
  filmMemoryLinks = filmMemoryLinks.filter(
    (link) => !(link.movieId === movieId && link.memoryId === memoryId)
  );
  saveFilmLinks();
  cloudDeleteLink(movieId, memoryId);
};

const renderLinkableMemories = (movieId, movieTitle) => {
  if (!movieId || !memoryEntries.length) {
    linkSection.hidden = true;
    return;
  }

  linkSection.hidden = false;
  linkableMemories.innerHTML = "";

  const currentLinks = getLinksForMovie(movieId);
  const linkedIds = new Set(currentLinks.map((l) => l.memoryId));

  const unlinked = memoryEntries.filter((entry) => !linkedIds.has(entry.id));

  if (!unlinked.length && !currentLinks.length) {
    linkHint.textContent = "No memories yet. Go make some, then come back.";
    linkedSection.hidden = true;
    return;
  }

  if (!unlinked.length) {
    linkHint.textContent = "Every memory is already woven into this film.";
  } else {
    linkHint.textContent = "Tap a memory to connect it to this film.";
  }

  unlinked.forEach((entry) => {
    const item = document.createElement("button");
    item.type = "button";
    item.role = "listitem";
    item.className = "linkable-item";

    const thumb = document.createElement("span");
    thumb.className = "linkable-thumb";
    if (getEntryThumb(entry)) {
      thumb.style.backgroundImage = `url("${getEntryThumb(entry)}")`;
    }

    const info = document.createElement("span");
    info.className = "linkable-info";

    const loc = document.createElement("span");
    loc.className = "linkable-loc";
    loc.textContent = entry.locationName || "Unknown";

    const obj = document.createElement("span");
    obj.className = "linkable-obj";
    obj.textContent = `${entry.objectType} · ${entry.emotion || ""}`;

    info.append(loc, obj);
    item.append(thumb, info);

    item.addEventListener("click", () => {
      addFilmMemoryLink(movieId, movieTitle, entry.id, entry.locationName);
      renderLinkableMemories(movieId, movieTitle);
      refreshOverlapMarkers();
    });

    linkableMemories.appendChild(item);
  });

  renderLinkedMemories(movieId, movieTitle);
};

const renderLinkedMemories = (movieId, movieTitle) => {
  const currentLinks = getLinksForMovie(movieId);
  if (!currentLinks.length) {
    linkedSection.hidden = true;
    return;
  }

  linkedSection.hidden = false;
  linkedMemories.innerHTML = "";

  currentLinks.forEach((link) => {
    const entry = memoryEntries.find((m) => m.id === link.memoryId);
    if (!entry) return;

    const item = document.createElement("div");
    item.className = "linked-item";

    const thumb = document.createElement("span");
    thumb.className = "linkable-thumb";
    if (getEntryThumb(entry)) {
      thumb.style.backgroundImage = `url("${getEntryThumb(entry)}")`;
    }

    const info = document.createElement("span");
    info.className = "linkable-info";

    const loc = document.createElement("span");
    loc.className = "linkable-loc";
    loc.textContent = entry.locationName || "Unknown";

    const diary = document.createElement("span");
    diary.className = "linkable-obj";
    diary.textContent = entry.diary ? entry.diary.slice(0, 60) + (entry.diary.length > 60 ? "…" : "") : entry.objectType;

    info.append(loc, diary);

    const unlinkBtn = document.createElement("button");
    unlinkBtn.type = "button";
    unlinkBtn.className = "unlink-button";
    unlinkBtn.textContent = "Unlink";
    unlinkBtn.addEventListener("click", () => {
      removeFilmMemoryLink(movieId, link.memoryId);
      renderLinkableMemories(movieId, movieTitle);
      refreshOverlapMarkers();
    });

    item.append(thumb, info, unlinkBtn);
    linkedMemories.appendChild(item);
  });
};

const renderFilmLinkedGallery = (movieId, locationCityKey) => {
  const links = getLinksForMovie(movieId);
  // Show all linked memories regardless of city — the user explicitly linked them
  const relevantLinks = links.filter((link) => {
    const entry = memoryEntries.find((m) => m.id === link.memoryId);
    return !!entry;
  });

  if (!relevantLinks.length) {
    filmLinkedMemories.hidden = true;
    return;
  }

  filmLinkedMemories.hidden = false;
  filmLinkedGallery.innerHTML = "";
  filmLinkedGallery.classList.add("has-rich-cards");

  relevantLinks.forEach((link) => {
    const entry = memoryEntries.find((m) => m.id === link.memoryId);
    if (!entry) return;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "gallery-card gallery-card-rich";

    if (getEntryThumb(entry)) {
      const img = document.createElement("img");
      img.className = "gallery-photo";
      img.src = getEntryThumb(entry);
      img.alt = entry.locationName || "Memory photo";
      card.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "gallery-photo gallery-placeholder";
      card.appendChild(placeholder);
    }

    const caption = document.createElement("span");
    caption.className = "gallery-caption gallery-caption-rich";

    const capLoc = document.createElement("span");
    capLoc.className = "gallery-cap-loc";
    capLoc.textContent = entry.locationName || "Unknown";

    const capDate = document.createElement("span");
    capDate.className = "gallery-cap-date";
    capDate.textContent = formatTimelineDate(entry.date);

    const capObj = document.createElement("span");
    capObj.className = "gallery-cap-obj";
    capObj.textContent = entry.objectType || "Memory";

    caption.append(capLoc, capDate, capObj);

    if (entry.diary) {
      const capDiary = document.createElement("span");
      capDiary.className = "gallery-cap-diary gallery-cap-diary-full";
      capDiary.textContent = entry.diary.length > 140 ? entry.diary.slice(0, 140) + "…" : entry.diary;
      caption.appendChild(capDiary);
    }

    if (entry.emotion) {
      const capEmotion = document.createElement("span");
      capEmotion.className = "gallery-cap-emotion";
      capEmotion.textContent = entry.emotion;
      caption.appendChild(capEmotion);
    }

    if (entry.music) {
      const capMusic = document.createElement("span");
      capMusic.className = "gallery-cap-music";
      capMusic.textContent = "♪ has a soundtrack";
      caption.appendChild(capMusic);
    }

    card.appendChild(caption);

    card.addEventListener("click", () => {
      closeModal(filmModal);
      window.setTimeout(() => openMemoryModal(entry.id), 360);
    });

    filmLinkedGallery.appendChild(card);
  });
};

const openFilmModal = (movieDetails, location) => {
  const releaseYear = (movieDetails.release_date || "").slice(0, 4) || "Unknown year";
  const director =
    movieDetails.credits?.crew?.find((crewItem) => crewItem.job === "Director")?.name || "Unknown";
  filmMeta.textContent = `${movieDetails.title} | ${releaseYear} | ${director}`;
  filmTitle.textContent = location.city;
  filmQuote.textContent = `"${location.quote}"`;
  filmEmotion.textContent = `${location.scene || ""} ${location.emotion || ""} ${movieDetails.overview || ""}`.trim();

  const stillPath = location.stillPath || movieDetails.backdrop_path || movieDetails.poster_path;
  const fallbackVisual =
    "linear-gradient(145deg, rgba(216, 210, 200, 0.56), rgba(58, 60, 64, 0.22)), radial-gradient(circle at 78% 26%, rgba(243, 238, 227, 0.48), transparent 52%)";
  filmVisual.style.backgroundImage = stillPath
    ? `linear-gradient(145deg, rgba(243, 238, 227, 0.12), rgba(28, 29, 31, 0.22)), url("${buildTmdbImage(
        stillPath,
        tmdbConfig.backdropSize
      )}")`
    : fallbackVisual;

  // Personal film note
  const modalCopy = filmMeta.parentElement;
  const existingNote = modalCopy.querySelector(".film-note-section");
  if (existingNote) existingNote.remove();

  const noteSection = document.createElement("div");
  noteSection.className = "film-note-section";

  const noteLabel = document.createElement("p");
  noteLabel.className = "modal-kicker";
  noteLabel.textContent = "Something personal";
  noteSection.appendChild(noteLabel);

  const noteInput = document.createElement("textarea");
  noteInput.className = "film-note-input";
  noteInput.placeholder = "What did this film leave you with?";
  noteInput.value = filmNotes[movieDetails.id] || "";
  noteInput.addEventListener("input", () => {
    filmNotes[movieDetails.id] = noteInput.value;
    saveFilmNotes();
    cloudSaveFilmNote(movieDetails.id, noteInput.value);
  });
  noteSection.appendChild(noteInput);

  // Insert before linked memories
  const linkedMemoriesEl = modalCopy.querySelector(".film-linked-memories") || filmLinkedMemories;
  if (linkedMemoriesEl && linkedMemoriesEl.parentElement === modalCopy) {
    modalCopy.insertBefore(noteSection, linkedMemoriesEl);
  } else {
    modalCopy.appendChild(noteSection);
  }

  renderFilmLinkedGallery(movieDetails.id, location.cityKey || buildCityKey(location.city));
  openModal(filmModal);
};

const renderFilmMarkers = (movieDetails, locations) => {
  clearFilmMarkers();
  activeCinemaLocations = [];

  locations.forEach((location) => {
    const normalizedLocation = {
      ...location,
      movieId: movieDetails.id,
      movieTitle: movieDetails.title,
      cityName: extractCityName(location.city),
      cityKey: buildCityKey(location.city),
    };

    const element = document.createElement("button");
    element.type = "button";
    element.className = "film-map-marker";
    element.title = `${movieDetails.title} - ${normalizedLocation.city}`;

    const marker = new mapboxgl.Marker({ element }).setLngLat(normalizedLocation.coords).addTo(map);
    element.addEventListener("click", () => {
      focusMarker(element);
      map.flyTo({ center: normalizedLocation.coords, zoom: Math.max(map.getZoom(), 4.8), essential: true });
      openFilmModal(movieDetails, normalizedLocation);
    });

    filmMarkers.push({ marker, element, location: normalizedLocation });
    activeCinemaLocations.push(normalizedLocation);

    const item = document.createElement("button");
    item.type = "button";
    item.role = "listitem";
    item.className = "cinema-item";
    item.textContent = `${normalizedLocation.city} - open cinematic panel`;
    item.addEventListener("click", () => {
      focusMarker(element);
      map.flyTo({ center: normalizedLocation.coords, zoom: Math.max(map.getZoom(), 4.8), essential: true });
      openFilmModal(movieDetails, normalizedLocation);
    });
    cinemaCollection.appendChild(item);
  });

  refreshOverlapMarkers();
};

const simplifyMapStyle = () => {
  if (!map) return;
  const layers = map.getStyle()?.layers || [];
  const hiddenTokens = [
    "poi",
    "transit",
    "airport",
    "natural",
    "road-label",
    "water-point",
    "settlement-subdivision",
  ];

  layers.forEach((layer) => {
    if (layer.type !== "symbol") return;
    if (hiddenTokens.some((token) => layer.id.includes(token))) {
      map.setLayoutProperty(layer.id, "visibility", "none");
    }
  });
};

const forceEnglishMapLabels = () => {
  if (!map) return;

  const englishLabelExpression = [
    "coalesce",
    ["get", `name_${MAP_LANGUAGE}`],
    ["get", "name_en"],
    ["get", "name"],
  ];
  const labelLayerHints = [
    "country-label",
    "state-label",
    "settlement",
    "place-label",
    "airport-label",
    "water-point-label",
    "natural",
    "poi-label",
    "road-label",
    "waterway-label",
    "transit-label",
  ];

  const layers = map.getStyle()?.layers || [];
  layers.forEach((layer) => {
    if (layer.type !== "symbol") return;
    if (!labelLayerHints.some((hint) => layer.id.includes(hint))) return;

    const currentTextField = map.getLayoutProperty(layer.id, "text-field");
    if (currentTextField === undefined || currentTextField === null) return;

    try {
      map.setLayoutProperty(layer.id, "text-field", englishLabelExpression);
    } catch {
      // Some style layers cannot be updated at runtime; ignore safely.
    }
  });
};

const initMap = () => {
  if (!hasValidMapboxToken()) {
    tokenNote.hidden = false;
    selectedLocationText.textContent = "Map is disabled until a Mapbox token is added.";
    setMapFeatureAvailability(false);
    return;
  }

  setMapFeatureAvailability(true);
  mapboxgl.accessToken = MAPBOX_ACCESS_TOKEN;

  map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/light-v11",
    center: [8, 26],
    zoom: 1.7,
    projection: "mercator",
  });

  map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

  geocoderControl = new MapboxGeocoder({
    accessToken: MAPBOX_ACCESS_TOKEN,
    marker: false,
    mapboxgl,
    placeholder: "Search city or address",
    language: MAP_LANGUAGE,
  });

  map.addControl(geocoderControl, "top-left");

  geocoderControl.on("result", (event) => {
    const result = event.result;
    const coords = result.center;
    const name = result.place_name || result.text || formatCoordinates(coords);
    updateSelectedPoint(name, coords, { moveMap: true });
    placeDraftMarker(coords);
  });

  map.on("click", async (event) => {
    const coords = [event.lngLat.lng, event.lngLat.lat];
    const reverseName = await reverseGeocode(coords);
    const placeName = reverseName || formatCoordinates(coords);
    updateSelectedPoint(placeName, coords);
    placeDraftMarker(coords);
  });

  map.on("load", () => {
    simplifyMapStyle();
    forceEnglishMapLabels();
    memoryEntries.forEach((entry) => addMemoryMarker(entry));
    refreshOverlapMarkers();
  });
};

const loadTmdbImageConfiguration = async () => {
  const configuration = await fetchTmdb("/configuration");
  if (!configuration?.images?.secure_base_url) return;

  const { secure_base_url: baseUrl, poster_sizes: posterSizes, backdrop_sizes: backdropSizes } =
    configuration.images;

  const pickSize = (sizes, preferred, fallback) => {
    if (!Array.isArray(sizes) || !sizes.length) return fallback;
    if (sizes.includes(preferred)) return preferred;
    return sizes[Math.min(2, sizes.length - 1)] || fallback;
  };

  tmdbConfig = {
    imageBaseUrl: baseUrl,
    posterSize: pickSize(posterSizes, "w185", "w185"),
    backdropSize: pickSize(backdropSizes, "w1280", "w780"),
  };
};

const hideMovieSearchResults = () => {
  movieSearchResults.hidden = true;
  movieSearchResults.innerHTML = "";
  movieSearchItems = [];
  highlightedSearchIndex = -1;
};

const highlightSearchItem = (index) => {
  const items = [...movieSearchResults.querySelectorAll(".movie-search-item")];
  items.forEach((item, itemIndex) => {
    item.classList.toggle("is-highlighted", itemIndex === index);
  });
  highlightedSearchIndex = index;
};

const renderMovieSearchResults = (results) => {
  movieSearchResults.innerHTML = "";
  movieSearchItems = results;

  if (!results.length) {
    const empty = document.createElement("p");
    empty.className = "movie-search-empty";
    empty.textContent = "No films found. Try another title.";
    movieSearchResults.appendChild(empty);
    movieSearchResults.hidden = false;
    return;
  }

  results.forEach((movie, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.role = "option";
    button.className = "movie-search-item";

    const year = (movie.release_date || "").slice(0, 4) || "Unknown year";
    const posterUrl = movie.poster_path ? buildTmdbImage(movie.poster_path, tmdbConfig.posterSize) : "";

    button.innerHTML = `
      ${
        posterUrl
          ? `<img class="movie-search-poster" src="${posterUrl}" alt="${movie.title} poster">`
          : `<div class="movie-search-poster" aria-hidden="true"></div>`
      }
      <span class="movie-search-copy">
        <span class="movie-search-title">${movie.title}</span>
        <span class="movie-search-year">${year}</span>
      </span>
    `;

    button.addEventListener("mouseenter", () => highlightSearchItem(index));
    button.addEventListener("click", () => {
      selectMovieFromSearch(movie).catch(() => {
        cinemaStatus.textContent = "Unable to load movie details right now.";
      });
    });

    movieSearchResults.appendChild(button);
  });

  highlightSearchItem(0);
  movieSearchResults.hidden = false;
};

const searchMoviesByTitle = async (query, signal = undefined) => {
  const data = await fetchTmdb(
    "/search/movie",
    { query, language: "en-US", include_adult: false, page: 1 },
    signal
  );
  return data?.results?.slice(0, 8) || [];
};

const fetchMovieDetails = async (movieId) => {
  return fetchTmdb(`/movie/${movieId}`, {
    language: "en-US",
    append_to_response: "credits,images",
    include_image_language: "en,null",
  });
};

const resolveLocationsFromMovie = async (movieDetails, customLocationQuery = "") => {
  const normalized = normalizeTitle(movieDetails.title || "");
  const curatedLocations = curatedFilmGeography[normalized] || [];
  const locations = curatedLocations.map((item) => ({
    ...item,
    stillPath: movieDetails.backdrop_path || movieDetails.poster_path || "",
  }));

  if (!locations.length) {
    const countries = (movieDetails.production_countries || []).slice(0, 3);
    for (const country of countries) {
      const geo = await geocodeLocation(country.name);
      if (!geo) continue;
      locations.push({
        city: country.name,
        coords: geo.coords,
        quote: getIconicQuote(movieDetails),
        emotion: `Somewhere in ${country.name}, this film came to life.`,
        scene: "A coordinate traced from the production credits.",
        stillPath: movieDetails.backdrop_path || movieDetails.poster_path || "",
      });
    }
  }

  if (customLocationQuery.trim()) {
    const customGeo = await geocodeLocation(customLocationQuery.trim());
    if (customGeo) {
      locations.push({
        city: customGeo.name,
        coords: customGeo.coords,
        quote: getIconicQuote(movieDetails),
        emotion: "A place you chose to connect with this film.",
        scene: "Your own cinematic coordinate.",
        stillPath: movieDetails.backdrop_path || movieDetails.poster_path || "",
      });
    }
  }

  const deduped = [];
  const seen = new Set();
  locations.forEach((location) => {
    const key = `${location.coords[0].toFixed(2)}|${location.coords[1].toFixed(2)}`;
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(location);
  });

  return deduped;
};

const revealMovieOnMap = async (movieId, customLocationQuery = "") => {
  if (!map) {
    cinemaStatus.textContent = "Map is currently unavailable.";
    return;
  }

  const movieDetails = await fetchMovieDetails(movieId);
  if (!movieDetails) {
    cinemaStatus.textContent = "Unable to retrieve movie details from TMDB.";
    return;
  }

  activeMovieDetails = movieDetails;
  const locations = await resolveLocationsFromMovie(movieDetails, customLocationQuery);
  if (!locations.length) {
    cinemaStatus.textContent = "Couldn't find any locations for this film on the map.";
    clearFilmMarkers();
    return;
  }

  renderFilmMarkers(movieDetails, locations);
  renderLinkableMemories(movieDetails.id, movieDetails.title);
  map.flyTo({
    center: locations[0].coords,
    zoom: Math.max(map.getZoom(), 3.8),
    essential: true,
  });

  const year = (movieDetails.release_date || "").slice(0, 4) || "Unknown year";
  const overlapCount = overlapMarkers.size;
  cinemaStatus.textContent =
    overlapCount > 0
      ? `${movieDetails.title} (${year}) — ${locations.length} place(s) on the map, ${overlapCount} where your life and this film intersect.`
      : `${movieDetails.title} (${year}) — ${locations.length} place(s) on the map.`;
};

const selectMovieFromSearch = async (movieSummary) => {
  selectedMovieSummary = movieSummary;
  selectedMovieIdInput.value = String(movieSummary.id);
  movieSearchInput.value = movieSummary.title;
  hideMovieSearchResults();

  const year = (movieSummary.release_date || "").slice(0, 4) || "Unknown year";
  selectedMovieMeta.textContent = `Selected: ${movieSummary.title} (${year})`;

  await revealMovieOnMap(movieSummary.id, movieLocationInput.value.trim());
};

const handleMovieSearchInput = () => {
  if (!hasValidTmdbCredentials()) return;

  const query = movieSearchInput.value.trim();
  selectedMovieIdInput.value = "";
  selectedMovieSummary = null;

  if (searchDebounceTimer) window.clearTimeout(searchDebounceTimer);
  if (searchAbortController) searchAbortController.abort();

  if (query.length < 2) {
    hideMovieSearchResults();
    selectedMovieMeta.textContent = "Start typing a film title…";
    return;
  }

  selectedMovieMeta.textContent = "Looking…";
  searchDebounceTimer = window.setTimeout(async () => {
    searchAbortController = new AbortController();
    const results = await searchMoviesByTitle(query, searchAbortController.signal);
    if (!results) return;
    renderMovieSearchResults(results);
    selectedMovieMeta.textContent = results.length
      ? "Select a film to reveal cinematic coordinates."
      : "No films found for that query.";
  }, 260);
};

const handleMovieSearchKeydown = (event) => {
  if (movieSearchResults.hidden || !movieSearchItems.length) return;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    const nextIndex = Math.min(highlightedSearchIndex + 1, movieSearchItems.length - 1);
    highlightSearchItem(nextIndex);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    const nextIndex = Math.max(highlightedSearchIndex - 1, 0);
    highlightSearchItem(nextIndex);
    return;
  }

  if (event.key === "Enter") {
    event.preventDefault();
    const movie = movieSearchItems[Math.max(highlightedSearchIndex, 0)];
    if (!movie) return;
    selectMovieFromSearch(movie).catch(() => {
      cinemaStatus.textContent = "Unable to load movie details right now.";
    });
    return;
  }

  if (event.key === "Escape") {
    hideMovieSearchResults();
  }
};

const handleMemoryLocate = async () => {
  if (!map) return;
  const query = memoryLocationInput.value.trim();
  if (!query) return;

  const result = await geocodeLocation(query);
  if (!result) {
    selectedLocationText.textContent = "Couldn't find that place. Try a different name.";
    return;
  }

  updateSelectedPoint(result.name, result.coords, { moveMap: true });
  placeDraftMarker(result.coords);
};

const handleCinemaLocate = async () => {
  if (!map) return;
  const query = movieLocationInput.value.trim();
  if (!query) return;

  const result = await geocodeLocation(query);
  if (!result) {
    cinemaStatus.textContent = "Unable to find that location.";
    return;
  }

  cinemaStatus.textContent = `Location found: ${result.name}`;
  map.flyTo({ center: result.coords, zoom: Math.max(map.getZoom(), 4.3), essential: true });
  placeDraftMarker(result.coords);

  if (selectedMovieIdInput.value) {
    await revealMovieOnMap(Number(selectedMovieIdInput.value), movieLocationInput.value.trim());
  }
};

const handleMemorySubmit = async (event) => {
  event.preventDefault();
  if (!map) {
    selectedLocationText.textContent = "Map is currently unavailable. Add your Mapbox token first.";
    return;
  }

  const locationQuery = memoryLocationInput.value.trim();
  let locationData = null;

  if (locationQuery) {
    locationData = await geocodeLocation(locationQuery);
  }

  if (!locationData && selectedPoint) {
    locationData = { name: selectedPoint.name, coords: selectedPoint.coords };
  }

  if (!locationData) {
    selectedLocationText.textContent = "Pick a place on the map first, or type one in.";
    return;
  }

  const existingEntry = editingMemoryId
    ? memoryEntries.find((item) => item.id === editingMemoryId) || null
    : null;

  // Multi-photo support
  const photoFiles = memoryPhotoFile.files;
  let photos = existingEntry?.photos || (existingEntry?.photoData ? [existingEntry.photoData] : []);
  let photoUrls = existingEntry?.photoUrls || [];

  if (photoFiles?.length) {
    // Upload to cloud if available
    const cloudUrls = await uploadPhotosToCloud(photoFiles);
    if (cloudUrls.length) {
      photoUrls = [...photoUrls, ...cloudUrls];
    }
    // Also read as base64 for local/offline use
    const newPhotos = [];
    for (let i = 0; i < photoFiles.length; i++) {
      const data = await readPhoto(photoFiles[i]);
      if (data) newPhotos.push(data);
    }
    if (newPhotos.length) photos = [...photos, ...newPhotos];
  }
  const photoData = photos[0] || "";

  // Tags
  const tagInput = document.getElementById("memoryTagsInput");
  const tagsRaw = tagInput ? tagInput.value.trim() : "";
  const tags = tagsRaw
    ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean)
    : existingEntry?.tags || [];

  // Update master tag list
  tags.forEach((tag) => {
    if (!memoryTags.includes(tag)) {
      memoryTags.push(tag);
      saveTags();
      cloudSaveTag(tag);
    }
  });

  const entry = annotateMemoryEntry({
    id: existingEntry?.id || `mem-${Date.now()}`,
    locationName: locationData.name,
    coords: locationData.coords,
    objectType: memoryObjectTypeInput.value.trim(),
    diary: memoryDiaryInput.value.trim(),
    emotion: memoryEmotionInput.value.trim(),
    music: memoryMusicInput.value.trim(),
    date: memoryDateInput.value,
    photoData,
    photos,
    photoUrls,
    tags,
  });

  if (existingEntry) {
    const entryIndex = memoryEntries.findIndex((item) => item.id === existingEntry.id);
    if (entryIndex >= 0) {
      memoryEntries[entryIndex] = entry;
    } else {
      memoryEntries = [entry, ...memoryEntries];
    }

    const markerRef = memoryMarkers.get(entry.id);
    if (markerRef) {
      markerRef.marker.setLngLat(entry.coords);
      markerRef.element.title = `${entry.objectType} - ${entry.locationName}`;
    } else {
      addMemoryMarker(entry);
    }
  } else {
    memoryEntries = [entry, ...memoryEntries];
    addMemoryMarker(entry);
  }

  saveMemories();
  cloudSaveMemory(entry);
  renderMemoryCollection();
  renderTimeline();

  const markerRef = memoryMarkers.get(entry.id);
  if (markerRef) focusMarker(markerRef.element);

  updateSelectedPoint(entry.locationName, entry.coords, { moveMap: true });
  refreshOverlapMarkers();
  memoryForm.reset();
  clearMemoryEditState();

  memoryDateInput.value = new Date().toISOString().slice(0, 10);
};

const handleCinemaSubmit = async (event) => {
  event.preventDefault();
  if (!map) {
    cinemaStatus.textContent = "Map is currently unavailable. Add your Mapbox token first.";
    return;
  }

  if (!hasValidTmdbCredentials()) {
    cinemaStatus.textContent = "Add your TMDB API key or read access token in script.js.";
    return;
  }

  let movieId = Number(selectedMovieIdInput.value);
  if (!movieId) {
    const manualQuery = movieSearchInput.value.trim();
    if (!manualQuery) {
      cinemaStatus.textContent = "Type a film name to begin.";
      return;
    }

    const firstMatch = (await searchMoviesByTitle(manualQuery))[0];
    if (!firstMatch) {
      cinemaStatus.textContent = "No film by that name. Try the full title.";
      return;
    }
    movieId = firstMatch.id;
    await selectMovieFromSearch(firstMatch);
    return;
  }

  await revealMovieOnMap(movieId, movieLocationInput.value.trim());
};

const bindModalEvents = () => {
  document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
      const modalId = button.getAttribute("data-close");
      const modal = document.getElementById(modalId);
      if (modal) closeModal(modal);
    });
  });

  [memoryModal, filmModal, overlapModal].forEach((modal) => {
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  window.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!memoryModal.hidden) closeModal(memoryModal);
    if (!filmModal.hidden) closeModal(filmModal);
    if (!overlapModal.hidden) closeModal(overlapModal);
    hideMovieSearchResults();
  });
};

const bindUIEvents = () => {
  tabButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });

  locateMemoryButton.addEventListener("click", handleMemoryLocate);
  locateCinemaButton.addEventListener("click", () => {
    handleCinemaLocate().catch(() => {
      cinemaStatus.textContent = "Unable to locate this place.";
    });
  });

  movieSearchInput.addEventListener("input", handleMovieSearchInput);
  movieSearchInput.addEventListener("keydown", handleMovieSearchKeydown);
  movieSearchInput.addEventListener("focus", () => {
    if (movieSearchItems.length) movieSearchResults.hidden = false;
  });

  document.addEventListener("click", (event) => {
    if (!movieSearchResults.contains(event.target) && event.target !== movieSearchInput) {
      hideMovieSearchResults();
    }
  });

  memoryForm.addEventListener("submit", handleMemorySubmit);
  cinemaForm.addEventListener("submit", (event) => {
    handleCinemaSubmit(event).catch(() => {
      cinemaStatus.textContent = "Unable to map this film right now.";
    });
  });
  editMemoryButton.addEventListener("click", () => {
    const memoryId = memoryModal.dataset.memoryId;
    if (!memoryId) return;

    const entry = memoryEntries.find((item) => item.id === memoryId);
    if (!entry) return;

    beginMemoryEdit(entry);
  });
  deleteMemoryButton.addEventListener("click", () => {
    const memoryId = memoryModal.dataset.memoryId;
    if (!memoryId) return;

    const entry = memoryEntries.find((item) => item.id === memoryId);
    if (!entry) return;

    const confirmed = window.confirm(`Let go of this ${entry.objectType.toLowerCase()} from ${entry.locationName}?`);
    if (!confirmed) return;

    const removed = removeMemoryEntry(memoryId);
    if (!removed) return;

    closeModal(memoryModal);
  });

  memoryLocationInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleMemoryLocate();
    }
  });

  movieLocationInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCinemaLocate().catch(() => {
        cinemaStatus.textContent = "Unable to locate this place.";
      });
    }
  });

  if (overlapBlend && overlapVisuals) {
    overlapBlend.addEventListener("input", (event) => {
      const blendValue = Number(event.target.value);
      overlapVisuals.style.setProperty("--blend", `${blendValue}%`);
    });
  }

  // Inject group-by toggles for collection and timeline
  injectGroupToggle(memoryCollection, "collection", (mode) => {
    memoryGroupMode = mode;
    renderMemoryCollection();
  });
  injectGroupToggle(memoryTimeline, "timeline", (mode) => {
    timelineGroupMode = mode;
    renderTimeline();
  });
};

const injectGroupToggle = (container, id, onChange) => {
  const parent = container.parentElement;
  if (!parent) return;

  // Find the section label (meta-label) and insert toggle after it
  const existing = parent.querySelector(`.group-toggle[data-for="${id}"]`);
  if (existing) return;

  const toggle = document.createElement("div");
  toggle.className = "group-toggle";
  toggle.dataset.for = id;

  const modes = [
    { value: "all", label: "All" },
    { value: "time", label: "By Time" },
    { value: "location", label: "By Place" },
    { value: "tag", label: "By Tag" },
  ];

  modes.forEach((mode) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "group-toggle-btn";
    if (mode.value === "all") btn.classList.add("is-active");
    btn.textContent = mode.label;
    btn.dataset.mode = mode.value;
    btn.addEventListener("click", () => {
      toggle.querySelectorAll(".group-toggle-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      onChange(mode.value);
    });
    toggle.appendChild(btn);
  });

  // Insert before the container
  parent.insertBefore(toggle, container);
};

// ─── Export / Import ─────────────────────────────────────────────────
const exportAllData = () => {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    memories: memoryEntries,
    filmLinks: filmMemoryLinks,
    tags: memoryTags,
    filmNotes,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cinema-atlas-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const importData = (file) => {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!data?.memories || !Array.isArray(data.memories)) {
        window.alert("Invalid backup file format.");
        return;
      }
      const confirmed = window.confirm(
        `Bring in ${data.memories.length} memories, ${data.filmLinks?.length || 0} film connections, and ${data.tags?.length || 0} tags? They'll merge with what's already here.`
      );
      if (!confirmed) return;

      // Merge memories
      const existingIds = new Set(memoryEntries.map((m) => m.id));
      data.memories.forEach((m) => {
        if (!existingIds.has(m.id)) {
          memoryEntries.push(annotateMemoryEntry(m));
          addMemoryMarker(memoryEntries[memoryEntries.length - 1]);
        }
      });

      // Merge links
      if (data.filmLinks) {
        const existingLinkKeys = new Set(filmMemoryLinks.map((l) => `${l.movieId}-${l.memoryId}`));
        data.filmLinks.forEach((l) => {
          if (!existingLinkKeys.has(`${l.movieId}-${l.memoryId}`)) {
            filmMemoryLinks.push(l);
          }
        });
      }

      // Merge tags
      if (data.tags) {
        data.tags.forEach((t) => {
          if (!memoryTags.includes(t)) memoryTags.push(t);
        });
      }

      // Merge film notes
      if (data.filmNotes) {
        Object.entries(data.filmNotes).forEach(([id, note]) => {
          if (!filmNotes[id]) filmNotes[id] = note;
        });
      }

      saveMemories();
      saveFilmLinks();
      saveTags();
      saveFilmNotes();
      renderMemoryCollection();
      renderTimeline();
      refreshOverlapMarkers();
      window.alert("Everything's here now.");
    } catch {
      window.alert("Failed to parse backup file.");
    }
  };
  reader.readAsText(file);
};

// ─── Stats Dashboard ─────────────────────────────────────────────────
const openStatsModal = () => {
  const uniqueCities = new Set(memoryEntries.map((e) => e.cityKey).filter(Boolean));
  const uniqueCountries = new Set(
    memoryEntries
      .map((e) => {
        const parts = (e.locationName || "").split(",");
        return parts[parts.length - 1]?.trim() || "";
      })
      .filter(Boolean)
  );
  const filmCount = new Set(filmMemoryLinks.map((l) => l.movieId)).size;
  const overlapCount = overlapMarkers.size;
  const tagCount = memoryTags.length;
  const photoCount = memoryEntries.reduce((sum, e) => sum + (e.photos?.length || (e.photoData ? 1 : 0)), 0);

  // Find most-visited city
  const cityFreq = {};
  memoryEntries.forEach((e) => {
    const city = e.cityName || "Unknown";
    cityFreq[city] = (cityFreq[city] || 0) + 1;
  });
  const topCity = Object.entries(cityFreq).sort((a, b) => b[1] - a[1])[0];

  // Date range
  const dates = memoryEntries.map((e) => e.date).filter(Boolean).sort();
  const dateRange = dates.length
    ? `${formatTimelineDate(dates[0])} — ${formatTimelineDate(dates[dates.length - 1])}`
    : "No dates recorded";

  const statsHtml = `
    <div class="stats-grid">
      <div class="stat-card"><span class="stat-number">${memoryEntries.length}</span><span class="stat-label">Memories kept</span></div>
      <div class="stat-card"><span class="stat-number">${uniqueCities.size}</span><span class="stat-label">Cities touched</span></div>
      <div class="stat-card"><span class="stat-number">${uniqueCountries.size}</span><span class="stat-label">Countries</span></div>
      <div class="stat-card"><span class="stat-number">${filmCount}</span><span class="stat-label">Films woven in</span></div>
      <div class="stat-card"><span class="stat-number">${overlapCount}</span><span class="stat-label">Overlaps</span></div>
      <div class="stat-card"><span class="stat-number">${photoCount}</span><span class="stat-label">Photos</span></div>
      <div class="stat-card"><span class="stat-number">${tagCount}</span><span class="stat-label">Tags</span></div>
      <div class="stat-card stat-card-wide"><span class="stat-number">${topCity ? topCity[0] : "—"}</span><span class="stat-label">${topCity ? `Kept returning (${topCity[1]}×)` : "Favorite city"}</span></div>
      <div class="stat-card stat-card-wide"><span class="stat-number stat-number-small">${dateRange}</span><span class="stat-label">Time span</span></div>
    </div>
  `;

  // Reuse overlap modal structure
  const statsOverlay = document.createElement("div");
  statsOverlay.className = "modal-overlay stats-modal-overlay";
  statsOverlay.hidden = false;
  statsOverlay.innerHTML = `
    <div class="modal-sheet stats-sheet">
      <button class="modal-close" type="button">Close</button>
      <div class="modal-copy stats-copy">
        <p class="panel-kicker">Cinema Atlas</p>
        <h3 class="modal-heading">Your world so far</h3>
        ${statsHtml}
      </div>
    </div>
  `;
  document.body.appendChild(statsOverlay);
  window.requestAnimationFrame(() => statsOverlay.classList.add("is-open"));
  document.body.classList.add("modal-open");

  const closeBtn = statsOverlay.querySelector(".modal-close");
  const closeStats = () => {
    statsOverlay.classList.remove("is-open");
    window.setTimeout(() => {
      document.body.removeChild(statsOverlay);
      const stillOpen = [...document.querySelectorAll(".modal-overlay")].some((item) => !item.hidden);
      if (!stillOpen) document.body.classList.remove("modal-open");
    }, 320);
  };
  closeBtn.addEventListener("click", closeStats);
  statsOverlay.addEventListener("click", (e) => { if (e.target === statsOverlay) closeStats(); });
};

// ─── Random Memory ───────────────────────────────────────────────────
const openRandomMemory = () => {
  if (!memoryEntries.length) return;
  const randomIndex = Math.floor(Math.random() * memoryEntries.length);
  const entry = memoryEntries[randomIndex];
  if (map) {
    map.flyTo({ center: entry.coords, zoom: Math.max(map.getZoom(), 5), essential: true });
  }
  const markerRef = memoryMarkers.get(entry.id);
  if (markerRef) focusMarker(markerRef.element);
  openMemoryModal(entry.id);
};

// ─── Heatmap Toggle ──────────────────────────────────────────────────
const toggleHeatmap = () => {
  if (!map) return;
  heatmapActive = !heatmapActive;

  if (heatmapActive) {
    // Add heatmap source + layer
    if (!map.getSource("memory-heat")) {
      map.addSource("memory-heat", {
        type: "geojson",
        data: buildHeatmapGeoJSON(),
      });
    } else {
      map.getSource("memory-heat").setData(buildHeatmapGeoJSON());
    }

    if (!map.getLayer("memory-heatmap")) {
      map.addLayer({
        id: "memory-heatmap",
        type: "heatmap",
        source: "memory-heat",
        paint: {
          "heatmap-weight": 1,
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.6, 9, 2],
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 18, 9, 42],
          "heatmap-opacity": 0.55,
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(243,238,227,0)",
            0.2, "rgba(216,210,200,0.4)",
            0.4, "rgba(181,175,166,0.55)",
            0.6, "rgba(58,60,64,0.45)",
            0.8, "rgba(28,29,31,0.55)",
            1, "rgba(28,29,31,0.7)",
          ],
        },
      });
    } else {
      map.setLayoutProperty("memory-heatmap", "visibility", "visible");
    }
  } else {
    if (map.getLayer("memory-heatmap")) {
      map.setLayoutProperty("memory-heatmap", "visibility", "none");
    }
  }
};

const buildHeatmapGeoJSON = () => ({
  type: "FeatureCollection",
  features: memoryEntries
    .filter((e) => e.coords)
    .map((e) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: e.coords },
      properties: {},
    })),
});

// ─── Film Recommendations by City ────────────────────────────────────
const discoverFilmsForCities = async () => {
  if (!hasValidTmdbCredentials() || !memoryEntries.length) {
    cinemaStatus.textContent = "Pin some places on the map first — then we can find films that go there too.";
    return;
  }

  const cities = [...new Set(memoryEntries.map((e) => e.cityName).filter(Boolean))];
  if (!cities.length) {
    cinemaStatus.textContent = "Your memories don't have city names yet. Add some detail and come back.";
    return;
  }

  cinemaStatus.textContent = `Wandering through ${cities.length} of your cities…`;
  const allResults = [];
  const seenIds = new Set();

  for (const city of cities.slice(0, 5)) {
    const data = await fetchTmdb("/search/movie", {
      query: city,
      language: "en-US",
      include_adult: false,
      page: 1,
    });
    if (data?.results) {
      data.results.slice(0, 3).forEach((movie) => {
        if (!seenIds.has(movie.id)) {
          seenIds.add(movie.id);
          allResults.push({ ...movie, matchedCity: city });
        }
      });
    }
  }

  if (!allResults.length) {
    cinemaStatus.textContent = "Nothing came up. Your cities are keeping their secrets.";
    return;
  }

  cinemaStatus.textContent = `${allResults.length} film(s) that share your geography.`;

  // Display recommendations in cinema collection area
  const recsContainer = document.createElement("div");
  recsContainer.className = "recs-container";

  const recsLabel = document.createElement("p");
  recsLabel.className = "meta-label";
  recsLabel.textContent = "Films that passed through your cities";
  recsContainer.appendChild(recsLabel);

  allResults.forEach((movie) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "cinema-item rec-item";

    const posterUrl = movie.poster_path ? buildTmdbImage(movie.poster_path, tmdbConfig.posterSize) : "";
    const year = (movie.release_date || "").slice(0, 4) || "";
    item.innerHTML = `
      ${posterUrl ? `<img class="rec-poster" src="${posterUrl}" alt="">` : ""}
      <span class="rec-info">
        <span class="rec-title">${movie.title}${year ? ` (${year})` : ""}</span>
        <span class="rec-city">via ${movie.matchedCity}</span>
      </span>
    `;
    item.addEventListener("click", () => {
      selectMovieFromSearch(movie).catch(() => {
        cinemaStatus.textContent = "Unable to load movie details.";
      });
    });
    recsContainer.appendChild(item);
  });

  // Clear previous recs
  const existingRecs = cinemaCollection.parentElement.querySelector(".recs-container");
  if (existingRecs) existingRecs.remove();
  cinemaCollection.parentElement.appendChild(recsContainer);
};

// ─── Dynamic UI Injection ────────────────────────────────────────────
const injectDynamicUI = () => {
  // Add "Map" tab button for mobile
  const tabSwitcher = document.querySelector(".tab-switcher");
  if (tabSwitcher && !tabSwitcher.querySelector('[data-tab="map"]')) {
    const mapTab = document.createElement("button");
    mapTab.type = "button";
    mapTab.className = "tab-button tab-button-map";
    mapTab.dataset.tab = "map";
    mapTab.setAttribute("role", "tab");
    mapTab.setAttribute("aria-selected", "false");
    mapTab.textContent = "Map";
    mapTab.addEventListener("click", () => setActiveTab("map"));
    tabSwitcher.insertBefore(mapTab, tabSwitcher.firstChild);
    tabButtons.push(mapTab);
  }

  // Memory search bar
  const searchWrapper = document.createElement("div");
  searchWrapper.className = "memory-search-wrapper";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "memory-search-input";
  searchInput.placeholder = "A place, a feeling, a tag…";
  searchInput.addEventListener("input", () => {
    memorySearchQuery = searchInput.value;
    renderMemoryCollection();
    renderTimeline();
  });
  searchWrapper.appendChild(searchInput);
  memoryCollection.parentElement.insertBefore(searchWrapper, memoryCollection.parentElement.querySelector(".group-toggle") || memoryCollection);

  // Tags input in memory form
  const tagsLabel = document.createElement("label");
  tagsLabel.innerHTML = `Tags <input type="text" id="memoryTagsInput" placeholder="rainy day, solo, rooftop…" list="tagSuggestions">`;
  const tagDatalist = document.createElement("datalist");
  tagDatalist.id = "tagSuggestions";
  memoryTags.forEach((tag) => {
    const opt = document.createElement("option");
    opt.value = tag;
    tagDatalist.appendChild(opt);
  });
  tagsLabel.appendChild(tagDatalist);
  // Insert before submit button
  const submitBtn = memoryForm.querySelector("button[type='submit']");
  if (submitBtn) memoryForm.insertBefore(tagsLabel, submitBtn);

  // Make photo input accept multiple files
  memoryPhotoFile.setAttribute("multiple", "");

  // Utility buttons bar for memory panel
  const utilBar = document.createElement("div");
  utilBar.className = "util-bar";

  const randomBtn = document.createElement("button");
  randomBtn.type = "button";
  randomBtn.className = "util-btn";
  randomBtn.textContent = "Surprise me";
  randomBtn.addEventListener("click", openRandomMemory);
  utilBar.appendChild(randomBtn);

  const statsBtn = document.createElement("button");
  statsBtn.type = "button";
  statsBtn.className = "util-btn";
  statsBtn.textContent = "My atlas";
  statsBtn.addEventListener("click", openStatsModal);
  utilBar.appendChild(statsBtn);

  const heatBtn = document.createElement("button");
  heatBtn.type = "button";
  heatBtn.className = "util-btn";
  heatBtn.textContent = "Heat";
  heatBtn.addEventListener("click", () => {
    toggleHeatmap();
    heatBtn.classList.toggle("is-active", heatmapActive);
  });
  utilBar.appendChild(heatBtn);

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "util-btn";
  exportBtn.textContent = "Export";
  exportBtn.addEventListener("click", exportAllData);
  utilBar.appendChild(exportBtn);

  const importLabel = document.createElement("label");
  importLabel.className = "util-btn util-import-label";
  importLabel.textContent = "Import";
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = ".json";
  importInput.hidden = true;
  importInput.addEventListener("change", () => {
    if (importInput.files?.[0]) importData(importInput.files[0]);
    importInput.value = "";
  });
  importLabel.appendChild(importInput);
  utilBar.appendChild(importLabel);

  memoryCollection.parentElement.insertBefore(utilBar, searchWrapper);

  // Film discover button in cinema panel
  const discoverBtn = document.createElement("button");
  discoverBtn.type = "button";
  discoverBtn.className = "soft-button discover-btn";
  discoverBtn.textContent = "What films have been where I've been?";
  discoverBtn.addEventListener("click", () => {
    discoverFilmsForCities().catch(() => {
      cinemaStatus.textContent = "Unable to discover films right now.";
    });
  });
  cinemaCollection.parentElement.insertBefore(discoverBtn, cinemaCollection);
};

const startIntroExperience = () => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let introFinished = false;
  let introTimer = null;
  const finishIntro = () => {
    if (introFinished) return;
    introFinished = true;
    if (introTimer) window.clearTimeout(introTimer);
    document.body.classList.add("is-ready");
    document.body.classList.remove("is-intro");
    mainInterface.setAttribute("aria-hidden", "false");
    introOverlay.setAttribute("aria-hidden", "true");
  };

  if (reduceMotion) {
    finishIntro();
    return;
  }

  introTimer = window.setTimeout(finishIntro, INTRO_DURATION_MS);
  introOverlay.addEventListener("click", finishIntro, { once: true });
};

const initialize = async () => {
  // Ensure viewport meta tag exists for mobile
  if (!document.querySelector('meta[name="viewport"]')) {
    const meta = document.createElement("meta");
    meta.name = "viewport";
    meta.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    document.head.appendChild(meta);
  }

  // Init Supabase
  initSupabase();

  // Check for existing session
  if (supabase) {
    try {
      const { data } = await sb.auth.getSession();
      if (data?.session?.user) {
        currentUser = data.session.user;
      }
    } catch {}

    // Listen for auth changes
    sb.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      injectAuthUI();
    });
  }

  memoryDateInput.value = new Date().toISOString().slice(0, 10);
  clearMemoryEditState();

  // Load data: prefer cloud if logged in, else localStorage
  if (isCloudAvailable()) {
    const cloudMemories = await loadMemoriesFromCloud();
    const cloudLinks = await loadLinksFromCloud();
    const cloudTags = await loadTagsFromCloud();
    const cloudNotes = await loadFilmNotesFromCloud();

    memoryEntries = (cloudMemories || loadMemories()).map(annotateMemoryEntry);
    filmMemoryLinks = cloudLinks || loadFilmLinks();
    memoryTags = cloudTags || loadTags();
    filmNotes = cloudNotes || loadFilmNotes();

    // Cache to localStorage
    saveMemories();
    saveFilmLinks();
    saveTags();
    saveFilmNotes();
  } else {
    memoryEntries = loadMemories().map(annotateMemoryEntry);
    filmMemoryLinks = loadFilmLinks();
    memoryTags = loadTags();
    filmNotes = loadFilmNotes();
  }

  setActiveTab("memory");
  bindUIEvents();
  bindModalEvents();
  initMap();
  injectDynamicUI();
  injectAuthUI();
  renderMemoryCollection();
  renderTimeline();

  if (!hasValidTmdbCredentials()) {
    selectedMovieMeta.textContent = "Film search needs API credentials — see script.js.";
    cinemaStatus.textContent = "TMDB search is off until you add your key.";
    setCinemaFeatureAvailability(false);
  } else {
    setCinemaFeatureAvailability(true);
    await loadTmdbImageConfiguration();
    selectedMovieMeta.textContent = "Start typing to find a film.";
  }

  startIntroExperience();
};

initialize();
