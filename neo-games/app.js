(function () {
  "use strict";

  var config = window.NEO_GAMES_CONFIG || {};
  var CATALOG_URL = "https://cdn.jsdelivr.net/gh/lauraevan/greatestgreatest-revive@main/scrapegames.js";
  var CATALOG_URLS = [config.catalog || CATALOG_URL].concat(Array.isArray(config.catalogFallbacks) ? config.catalogFallbacks : []).filter(Boolean);
  var ASSET_BASE = config.assetBase || "https://cdn.jsdelivr.net/gh/lauraevan/greatestgreatest-revive@main/";
  var EXECUTABLE_BASE = config.executableBase || "https://raw.githubusercontent.com/lauraevan/greatestgreatest-revive/main/";
  var chunkSize = Math.max(24, Math.min(72, Number(config.chunkSize) || 48));
  var favoritesKey = "neo_games_favorites_v4";
  var recentKey = "neo_games_recent_v4";
  var catalog = [];
  var discoverCatalog = [];
  var gamesById = new Map();
  var sourceCounts = new Map();
  var favorites = new Set(read(favoritesKey, []));
  var recent = read(recentKey, []);
  var matches = [];
  var mode = "home";
  var category = "all";
  var sortMode = "title-asc";
  var query = "";
  var visible = 0;
  var activeGame = null;
  var frameTimer = 0;
  var shortcutTimer = 0;
  var shortcutRequestId = "";
  var loadObserver = null;

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function read(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (_error) {
      return fallback;
    }
  }

  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_error) {}
  }

  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  }

  function titleCase(value) {
    return String(value || "Other").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    }) || "Other";
  }

  function safeWebUrl(value, base) {
    try {
      var url = new URL(String(value || ""), base || CATALOG_URL);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      url.username = "";
      url.password = "";
      return url.href;
    } catch (_error) {
      return "";
    }
  }

  function executableGameUrl(value) {
    var url = safeWebUrl(value, EXECUTABLE_BASE);
    if (!url) return "";
    var match = url.match(/^https?:\/\/cdn\.jsdelivr\.net\/gh\/([^/]+)\/([^@/]+)@([^/]+)\/(.+)$/i);
    if (match) return safeWebUrl("https://raw.githubusercontent.com/" + match[1] + "/" + match[2] + "/" + match[3] + "/" + match[4]);
    match = url.match(/^https?:\/\/(?:raw|rawcdn)\.githack\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/i);
    if (match) return safeWebUrl("https://raw.githubusercontent.com/" + match[1] + "/" + match[2] + "/" + match[3] + "/" + match[4]);
    match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/i);
    if (match) return safeWebUrl("https://raw.githubusercontent.com/" + match[1] + "/" + match[2] + "/" + match[3] + "/" + match[4]);
    return url;
  }

  function absolutePlay(value) {
    var source = String(value || "").trim();
    if (!source) return "";
    return executableGameUrl(/^(?:https?:)?\/\//i.test(source) ? source : new URL(source.replace(/^\.?\//, ""), EXECUTABLE_BASE).href);
  }

  function absoluteImage(value) {
    var source = String(value || "").trim();
    if (!source) return "";
    return safeWebUrl(source, ASSET_BASE);
  }

  function stableId(value) {
    var hash = 2166136261;
    var text = String(value || "");
    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return "ggr-" + (hash >>> 0).toString(36);
  }

  function proxyResource(value, kind) {
    var client = window.NEO_PROXY_CLIENT;
    if (!client) return Promise.resolve(value);
    if (kind === "image" && typeof client.image === "function") return client.image(value);
    return client.resolve(value, kind || "fetch");
  }

  function coverCandidates(value) {
    var source = safeWebUrl(value, ASSET_BASE);
    if (!source) return [];
    var candidates = [source];
    try {
      var url = new URL(source);
      if (/^(?:cdn|fastly|gcore)\.jsdelivr\.net$/i.test(url.hostname)) {
        ["cdn.jsdelivr.net", "fastly.jsdelivr.net", "gcore.jsdelivr.net"].forEach(function (hostname) {
          var alternate = new URL(url.href);
          alternate.hostname = hostname;
          candidates.push(alternate.href);
        });
      }
    } catch (_error) {}
    return candidates.filter(function (candidate, index, list) { return list.indexOf(candidate) === index; });
  }

  function loadCoverImage(image, value) {
    var candidates = coverCandidates(value);
    var index = 0;
    function tryNext() {
      if (index >= candidates.length) {
        image.remove();
        return;
      }
      var source = candidates[index++];
      proxyResource(source, "image").then(function (route) {
        image.onerror = function () {
          image.onerror = null;
          image.removeAttribute("src");
          tryNext();
        };
        image.onload = function () {
          image.dataset.neoCoverReady = "true";
          image.dataset.neoCoverSource = source;
        };
        image.src = route;
      }).catch(tryNext);
    }
    tryNext();
  }

  function normalizeGame(entry, index) {
    if (!Array.isArray(entry) || entry.length < 4) return null;
    var source = String(entry[0] || "Unknown source").trim() || "Unknown source";
    var url = absolutePlay(entry[1]);
    var name = String(entry[3] || "").replace(/\uFFFD/g, "").trim();
    if (!name || !url) return null;
    var id = stableId([source, name, url].join("|"));
    return {
      id: id,
      name: name,
      category: source,
      categoryKey: normalize(source) || "other",
      url: url,
      img: absoluteImage(entry[2]),
      featured: index < 96,
      index: index,
      search: normalize([name, source].join(" "))
    };
  }

  function saveFavorites() {
    save(favoritesKey, Array.from(favorites).slice(0, 5000));
  }

  function remember(game) {
    recent = [game.id].concat(recent.filter(function (id) { return id !== game.id; })).slice(0, 48);
    save(recentKey, recent);
  }

  function createSymbol(className) {
    var symbol = document.createElement("span");
    symbol.className = className;
    symbol.setAttribute("aria-hidden", "true");
    symbol.textContent = "×";
    return symbol;
  }

  function createCard(game) {
    var card = document.createElement("article");
    card.className = "game-card";
    card.dataset.gameId = game.id;

    var launch = document.createElement("button");
    launch.type = "button";
    launch.className = "game-card-open";
    launch.dataset.openGame = game.id;
    launch.setAttribute("aria-label", "Play " + game.name);

    var cover = document.createElement("span");
    cover.className = "cover";
    cover.appendChild(createSymbol("cover-symbol"));
    if (game.img) {
      var image = document.createElement("img");
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.fetchPriority = "low";
      cover.appendChild(image);
      loadCoverImage(image, game.img);
    }
    var play = document.createElement("span");
    play.className = "play-mark";
    play.setAttribute("aria-hidden", "true");
    play.textContent = "▶";
    cover.appendChild(play);

    var copy = document.createElement("span");
    copy.className = "copy";
    var title = document.createElement("strong");
    title.textContent = game.name;
    var meta = document.createElement("small");
    meta.textContent = game.category;
    copy.append(title, meta);
    launch.append(cover, copy);

    var favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "favorite";
    favorite.dataset.favoriteGame = game.id;
    updateFavoriteButton(favorite, game);
    card.append(launch, favorite);
    return card;
  }

  function updateFavoriteButton(button, game) {
    var selected = favorites.has(game.id);
    button.classList.toggle("is-favorite", selected);
    button.textContent = selected ? "♥" : "♡";
    button.setAttribute("aria-label", (selected ? "Remove " : "Add ") + game.name + (selected ? " from favorites" : " to favorites"));
  }

  function buildCategories() {
    var categories = new Map();
    catalog.forEach(function (game) {
      if (!categories.has(game.categoryKey)) categories.set(game.categoryKey, { key: game.categoryKey, label: game.category, count: 0 });
      categories.get(game.categoryKey).count += 1;
    });
    var items = Array.from(categories.values()).sort(function (left, right) {
      return right.count - left.count || left.label.localeCompare(right.label);
    });
    var host = $("[data-category-chips]");
    var fragment = document.createDocumentFragment();
    [{ key: "all", label: "All", count: catalog.length }].concat(items).forEach(function (item) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "category-chip";
      button.dataset.category = item.key;
      button.classList.toggle("is-active", item.key === category);
      button.setAttribute("aria-pressed", item.key === category ? "true" : "false");
      button.textContent = item.label;
      button.title = item.count.toLocaleString() + " games";
      fragment.appendChild(button);
    });
    host.replaceChildren(fragment);
  }

  function enableCategoryPanning(host) {
    if (!host || host.dataset.neoPanningReady === "true") return;
    host.dataset.neoPanningReady = "true";
    var pointerId = null;
    var captureTarget = null;
    var startX = 0;
    var startScrollLeft = 0;
    var dragged = false;
    var suppressClick = false;

    host.addEventListener("wheel", function (event) {
      if (host.scrollWidth <= host.clientWidth) return;
      var rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!rawDelta) return;
      var scale = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? host.clientWidth : 1;
      var before = host.scrollLeft;
      host.scrollLeft += rawDelta * scale;
      if (host.scrollLeft !== before) event.preventDefault();
    }, { passive: false });

    host.addEventListener("pointerdown", function (event) {
      if (event.pointerType === "touch" || event.button !== 0) return;
      pointerId = event.pointerId;
      captureTarget = event.target;
      startX = event.clientX;
      startScrollLeft = host.scrollLeft;
      dragged = false;
      host.classList.add("is-grabbing");
      if (captureTarget && captureTarget.setPointerCapture) captureTarget.setPointerCapture(pointerId);
    });

    host.addEventListener("pointermove", function (event) {
      if (event.pointerId !== pointerId) return;
      var distance = startX - event.clientX;
      if (!dragged && Math.abs(distance) > 4) dragged = true;
      if (!dragged) return;
      event.preventDefault();
      host.scrollLeft = startScrollLeft + distance;
    }, { passive: false });

    function finishPan(event) {
      if (event.pointerId !== pointerId) return;
      if (dragged) {
        suppressClick = true;
        window.setTimeout(function () { suppressClick = false; }, 0);
      }
      if (captureTarget && captureTarget.releasePointerCapture && captureTarget.hasPointerCapture && captureTarget.hasPointerCapture(pointerId)) {
        captureTarget.releasePointerCapture(pointerId);
      }
      pointerId = null;
      captureTarget = null;
      dragged = false;
      host.classList.remove("is-grabbing");
    }

    host.addEventListener("pointerup", finishPan);
    host.addEventListener("pointercancel", finishPan);
    host.addEventListener("click", function (event) {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
  }

  function sortGames(items) {
    return items.slice().sort(function (left, right) {
      if (sortMode === "title-desc") return right.name.localeCompare(left.name, undefined, { numeric: true, sensitivity: "base" });
      if (sortMode === "source-asc") {
        return left.category.localeCompare(right.category, undefined, { sensitivity: "base" }) || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
      }
      if (sortMode === "source-size") {
        return (sourceCounts.get(right.categoryKey) || 0) - (sourceCounts.get(left.categoryKey) || 0) || left.category.localeCompare(right.category) || left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
      }
      return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
    });
  }

  function filteredGames() {
    var items;
    if (mode === "recent") {
      items = recent.map(function (id) { return gamesById.get(id); }).filter(Boolean);
    } else {
      items = mode === "home" ? discoverCatalog : catalog;
    }
    if (mode === "favorites") items = items.filter(function (game) { return favorites.has(game.id); });
    if (category !== "all") items = items.filter(function (game) { return game.categoryKey === category; });
    if (query) {
      var terms = normalize(query).split(" ").filter(Boolean);
      items = items.filter(function (game) {
        return terms.every(function (term) { return game.search.indexOf(term) >= 0; });
      });
    }
    return sortGames(items);
  }

  function updateHeading() {
    var label = "FEATURED";
    var title = "Featured games";
    if (mode === "all") { label = "GAME LIBRARY"; title = "All games"; }
    if (mode === "favorites") { label = "YOUR LIBRARY"; title = "Favorite games"; }
    if (mode === "recent") { label = "PLAY AGAIN"; title = "Recently played"; }
    if (category !== "all") {
      var chip = $$("[data-category]").find(function (button) { return button.dataset.category === category; });
      label = "SOURCE";
      title = chip ? chip.textContent : titleCase(category);
    }
    if (query) { label = "SEARCH"; title = 'Results for "' + query + '"'; }
    $("[data-library-label]").textContent = label;
    $("[data-library-title]").textContent = title;
    $("[data-results]").textContent = matches.length.toLocaleString() + (matches.length === 1 ? " game" : " games");
  }

  function renderNext() {
    if (visible >= matches.length) return;
    var end = Math.min(visible + chunkSize, matches.length);
    var fragment = document.createDocumentFragment();
    for (var index = visible; index < end; index += 1) fragment.appendChild(createCard(matches[index]));
    $("[data-grid]").appendChild(fragment);
    visible = end;
    $("[data-more]").hidden = visible >= matches.length;
  }

  function emptyMessage() {
    if (mode === "favorites") return "No favorites yet. Select the heart on any game to add one.";
    if (mode === "recent") return "Games you play will appear here.";
    return "No games match this search and category.";
  }

  function renderLibrary() {
    matches = filteredGames();
    visible = 0;
    $("[data-grid]").replaceChildren();
    $("[data-state]").hidden = matches.length > 0;
    $("[data-state]").textContent = matches.length ? "" : emptyMessage();
    updateHeading();
    renderNext();
  }

  function setMode(next) {
    mode = next || "home";
    query = "";
    category = "all";
    $("[data-search]").value = "";
    $$("[data-mode]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.mode === mode);
    });
    $$("[data-category]").forEach(function (button) {
      button.classList.toggle("is-active", button.dataset.category === category);
      button.setAttribute("aria-pressed", button.dataset.category === category ? "true" : "false");
    });
    renderLibrary();
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function setCategory(next) {
    category = next || "all";
    $$("[data-category]").forEach(function (button) {
      var selected = button.dataset.category === category;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    renderLibrary();
  }

  function isEmbedded() {
    try { return window.parent && window.parent !== window; } catch (_error) { return false; }
  }

  function resetProxyFrame(frame) {
    clearTimeout(frameTimer);
    delete frame.dataset.neoProxyReady;
    delete frame.dataset.neoProxyError;
    delete frame.dataset.neoProxyRequestId;
    delete frame.dataset.neoProxySource;
    frame.setAttribute("src", "about:blank");
  }

  function requestProxiedEmbed(frame, target) {
    if (!isEmbedded()) return false;
    var wrapper = new URL("https://fastly.jsdelivr.net/gh/unblockedgames99x-code/neo-os-browser-cdn@cb5aee4dc37ea5c3e83511855b0563cf988a9050/NEO-BROWSER/launch.svg", document.baseURI);
    wrapper.searchParams.set("neo-app-mode", "1");
    wrapper.searchParams.set("neo-custom-app", "1");
    wrapper.searchParams.set("neo-app-target", target);
    wrapper.searchParams.set("neo-game-mode", "1");
    frame.dataset.neoProxySource = target;
    frame.dataset.neoProxyReady = "true";
    frame.setAttribute("src", wrapper.href);
    return true;
  }

  function showFrameMessage(message, failed) {
    var status = $("[data-frame-status]");
    status.classList.remove("is-ready");
    status.classList.toggle("is-error", Boolean(failed));
    status.textContent = message;
  }

  function openGame(game) {
    if (!game) return;
    activeGame = game;
    var frame = $("[data-game-frame]");
    resetProxyFrame(frame);
    $("[data-player-title]").textContent = game.name;
    var shortcutButton = $("[data-player-pin]");
    shortcutButton.disabled = false;
    shortcutButton.textContent = "Add to taskbar";
    shortcutButton.title = "Also adds this game to the home screen";
    $("[data-player]").hidden = false;
    document.documentElement.classList.add("is-playing");
    showFrameMessage("Loading " + game.name + " through the NEO web proxy…", false);
    if (!requestProxiedEmbed(frame, game.url)) {
      showFrameMessage("Open Games inside NEO OS to launch this title through the web proxy.", true);
      return;
    }
    remember(game);
    frameTimer = window.setTimeout(function () {
      if (frame.dataset.neoProxyError === "true") {
        showFrameMessage("The NEO web proxy could not open this game. Try again.", true);
      } else if (frame.dataset.neoProxyReady !== "true") {
        showFrameMessage("Still connecting through the NEO web proxy…", false);
      }
    }, 10000);
  }

  function closeGame() {
    var frame = $("[data-game-frame]");
    resetProxyFrame(frame);
    clearTimeout(shortcutTimer);
    shortcutRequestId = "";
    activeGame = null;
    $("[data-player]").hidden = true;
    document.documentElement.classList.remove("is-playing");
  }

  function addActiveGameToTaskbar() {
    if (!activeGame) return;
    var button = $("[data-player-pin]");
    if (!isEmbedded()) {
      button.textContent = "Add to taskbar";
      button.title = "Open Games inside NEO OS to add this shortcut";
      return;
    }
    clearTimeout(shortcutTimer);
    shortcutRequestId = "game-shortcut-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    button.disabled = true;
    button.textContent = "Adding…";
    window.parent.postMessage({
      type: "neo-shell:add-game-shortcut",
      id: shortcutRequestId,
      game: { title: activeGame.name, url: activeGame.url, icon: activeGame.img }
    }, "*");
    shortcutTimer = window.setTimeout(function () {
      if (!shortcutRequestId) return;
      shortcutRequestId = "";
      button.disabled = false;
      button.textContent = "Try again";
      button.title = "NEO OS did not answer. Select to retry.";
    }, 8000);
  }

  function handleShellShortcutResult(event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.type !== "neo-shell:add-game-shortcut-result" || data.id !== shortcutRequestId) return;
    clearTimeout(shortcutTimer);
    shortcutRequestId = "";
    var button = $("[data-player-pin]");
    if (data.ok) {
      button.disabled = true;
      button.textContent = "Added";
      button.title = "Added to the taskbar and home screen";
      return;
    }
    button.disabled = false;
    button.textContent = "Try again";
    button.title = String(data.error || "This game could not be added.");
  }

  function observeFrameState() {
    var frame = $("[data-game-frame]");
    frame.addEventListener("load", function () {
      if (frame.dataset.neoProxyReady !== "true" || frame.getAttribute("src") === "about:blank") return;
      clearTimeout(frameTimer);
      $("[data-frame-status]").classList.add("is-ready");
    });
    new MutationObserver(function () {
      if (frame.dataset.neoProxyError === "true") {
        clearTimeout(frameTimer);
        showFrameMessage("The NEO web proxy could not open this game. Try again.", true);
      }
    }).observe(frame, { attributes: true, attributeFilter: ["data-neo-proxy-error"] });
  }

  function parseCatalogScript(source) {
    var marker = source.indexOf("window.SCRAPE_GAMES");
    var start = source.indexOf("[", marker);
    var end = source.lastIndexOf("];");
    if (marker < 0 || start < 0 || end <= start) throw new Error("Invalid master scrape list");
    var serialized = source.slice(start, end + 1).replace(/,\s*\]$/, "\n]");
    var rows = JSON.parse(serialized);
    if (!Array.isArray(rows)) throw new Error("Invalid master scrape list");
    return rows;
  }

  async function fetchCatalogRows() {
    var lastError = null;
    for (var index = 0; index < CATALOG_URLS.length; index += 1) {
      var controller = new AbortController();
      var timer = window.setTimeout(function () { controller.abort(); }, 15000);
      try {
        // This is a trusted, read-only data file rather than a playable URL.
        // Loading it directly avoids booting the full browsing transport before
        // the catalogue can render; covers and every game launch stay proxied.
        var response = await fetch(CATALOG_URLS[index], {
          credentials: "omit",
          cache: "force-cache",
          mode: "cors",
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Catalogue returned " + response.status);
        return parseCatalogScript(await response.text());
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error("The game catalogue is unavailable");
  }

  async function loadCatalog() {
    var rows = await fetchCatalogRows();
    var seen = new Set();
    catalog = rows.map(normalizeGame).filter(function (game) {
      if (!game || seen.has(game.id)) return false;
      seen.add(game.id);
      return true;
    });
    if (!catalog.length) throw new Error("The master game catalogue is empty");
    gamesById = new Map(catalog.map(function (game) { return [game.id, game]; }));
    sourceCounts = new Map();
    catalog.forEach(function (game) { sourceCounts.set(game.categoryKey, (sourceCounts.get(game.categoryKey) || 0) + 1); });
    discoverCatalog = catalog.filter(function (game) { return game.featured; }).concat(catalog.filter(function (game) { return !game.featured; }));
    favorites = new Set(Array.from(favorites).filter(function (id) { return gamesById.has(id); }));
    recent = recent.filter(function (id) { return gamesById.has(id); });
    $("[data-count]").textContent = catalog.length.toLocaleString() + " GAMES";
    buildCategories();
    renderLibrary();
  }

  function registerWebTools() {
    var context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    var lifecycle = new AbortController();
    function register(tool) {
      try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(function () {}); } catch (_error) {}
    }
    register({
      name: "search_neo_games",
      title: "Search NEO Games",
      description: "Search the visible master game catalogue by title or source.",
      inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 80 } }, required: ["query"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: function (input) {
        if (!input || typeof input.query !== "string" || !input.query.trim()) throw new TypeError("query must be a non-empty string");
        window.NEO_GAMES.search(input.query.trim());
        return { query: input.query.trim(), results: matches.length };
      }
    });
    register({
      name: "open_neo_game",
      title: "Open NEO Game",
      description: "Open one game from the master catalogue through the NEO web proxy.",
      inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 160 } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: function (input) {
        if (!input || typeof input.id !== "string") throw new TypeError("id must be a string");
        var game = gamesById.get(input.id);
        if (!game) throw new Error("Game not found");
        openGame(game);
        return { id: game.id, title: game.name, status: "opening-through-proxy" };
      }
    });
    window.addEventListener("pagehide", function () { lifecycle.abort(); }, { once: true });
  }

  function init() {
    $$("[data-mode]").forEach(function (button) {
      button.addEventListener("click", function () { setMode(button.dataset.mode); });
    });
    var categoryChips = $("[data-category-chips]");
    enableCategoryPanning(categoryChips);
    categoryChips.addEventListener("click", function (event) {
      var button = event.target.closest("[data-category]");
      if (button) setCategory(button.dataset.category);
    });
    $("[data-grid]").addEventListener("click", function (event) {
      var favoriteButton = event.target.closest("[data-favorite-game]");
      if (favoriteButton) {
        var favoriteGame = gamesById.get(favoriteButton.dataset.favoriteGame);
        if (!favoriteGame) return;
        if (favorites.has(favoriteGame.id)) favorites.delete(favoriteGame.id); else favorites.add(favoriteGame.id);
        saveFavorites();
        updateFavoriteButton(favoriteButton, favoriteGame);
        if (mode === "favorites") renderLibrary();
        return;
      }
      var launch = event.target.closest("[data-open-game]");
      if (launch) openGame(gamesById.get(launch.dataset.openGame));
    });

    var searchTimer = 0;
    $("[data-search]").addEventListener("input", function () {
      query = this.value.trim();
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(renderLibrary, 100);
    });
    $("[data-sort]").addEventListener("change", function () {
      sortMode = this.value || "title-asc";
      renderLibrary();
    });
    $("[data-more]").addEventListener("click", renderNext);
    if ("IntersectionObserver" in window) {
      loadObserver = new IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) renderNext();
      }, { rootMargin: "500px 0px" });
      loadObserver.observe($("[data-sentinel]"));
    }

    $("[data-player-close]").addEventListener("click", closeGame);
    $("[data-player-pin]").addEventListener("click", addActiveGameToTaskbar);
    $("[data-player-fullscreen]").addEventListener("click", function () {
      var player = $("[data-player]");
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else player.requestFullscreen().catch(function () {});
    });
    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !$("[data-player]").hidden && !document.fullscreenElement) closeGame();
    });
    window.addEventListener("message", handleShellShortcutResult);
    observeFrameState();

    loadCatalog().catch(function () {
      $("[data-count]").textContent = "CATALOGUE UNAVAILABLE";
      $("[data-results]").textContent = "Master list connection failed";
      $("[data-state]").hidden = false;
      $("[data-state]").textContent = "The master game catalogue could not load. Check the connection and try again.";
    });

    window.NEO_GAMES = Object.freeze({
      search: function (value) {
        query = String(value || "").trim();
        $("[data-search]").value = query;
        renderLibrary();
      },
      open: function (id) { openGame(gamesById.get(String(id || ""))); },
      favorites: function () { setMode("favorites"); }
    });
    registerWebTools();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
