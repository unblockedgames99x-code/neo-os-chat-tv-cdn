(function () {
  "use strict";

  var config = window.NEO_GAMES_CONFIG || {};
  var CATALOG_URL = "https://fastly.jsdelivr.net/gh/unblockedgames99x-code/neo-os-games-catalog-cdn@main/index.json";
  var CATALOG_URLS = [config.catalog || CATALOG_URL].concat(Array.isArray(config.catalogFallbacks) ? config.catalogFallbacks : []).filter(Boolean);
  var COVERS_URL = config.covers || "https://fastly.jsdelivr.net/gh/unblockedgames99x-code/neo-os-games-catalog-cdn@main/covers.json";
  var COVERS_URLS = [COVERS_URL].concat(Array.isArray(config.coversFallbacks) ? config.coversFallbacks : []).filter(Boolean);
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
      var url = new URL(String(value || ""), base || document.baseURI);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      url.username = "";
      url.password = "";
      return url.href;
    } catch (_error) {
      return "";
    }
  }

  function directGameUrl(value) {
    var source = safeWebUrl(value);
    if (!source) return "";
    var url = new URL(source);
    var jsDelivr = url.pathname.match(/^\/gh\/unblockedgames99x-code\/(neo-os-games-\d+-cdn)@([^/]+)\/(games\/[A-Za-z0-9%._()\[\] -]+\.html)$/i);
    if (/^(?:fastly|cdn|gcore|quantil)\.jsdelivr\.net$/i.test(url.hostname) && jsDelivr) {
      return "https://rawcdn.githack.com/unblockedgames99x-code/" + jsDelivr[1] + "/" + jsDelivr[2] + "/" + jsDelivr[3];
    }
    if (/^(?:raw|rawcdn)\.githack\.com$/i.test(url.hostname) &&
        /^\/unblockedgames99x-code\/neo-os-games-\d+-cdn\/[^/]+\/games\/[A-Za-z0-9%._()\[\] -]+\.html$/i.test(url.pathname)) {
      url.hostname = "rawcdn.githack.com";
      return url.href;
    }
    if (url.origin === location.origin && /^\/games\/[A-Za-z0-9%._()\[\] -]+\.html$/i.test(url.pathname)) return url.href;
    return "";
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

  function coverCandidates(value) {
    var source = safeWebUrl(value);
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
      image.onerror = function () {
        image.onerror = null;
        image.removeAttribute("src");
        tryNext();
      };
      image.onload = function () {
        image.dataset.neoCoverReady = "true";
        image.dataset.neoCoverSource = source;
      };
      image.src = source;
    }
    tryNext();
  }

  function normalizeGame(entry, index, covers) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    var source = String(entry.source || "NEO Games").trim() || "NEO Games";
    var url = directGameUrl(entry.file);
    var name = String(entry.name || "").replace(/\uFFFD/g, "").trim();
    if (!name || !url) return null;
    var slug = String(entry.slug || "").trim();
    var id = "neo-game-" + (slug.replace(/[^a-z0-9_-]/gi, "-") || stableId([source, name, url].join("|")));
    return {
      id: id,
      name: name,
      category: source,
      categoryKey: normalize(source) || "other",
      url: url,
      img: safeWebUrl(covers && covers[slug]),
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

  function resetGameFrame(frame) {
    clearTimeout(frameTimer);
    delete frame.dataset.neoGameReady;
    delete frame.dataset.neoGameSource;
    frame.setAttribute("src", "about:blank");
  }

  function requestDirectEmbed(frame, target) {
    var route = directGameUrl(target);
    if (!route) return false;
    frame.dataset.neoGameSource = route;
    frame.setAttribute("src", route);
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
    resetGameFrame(frame);
    $("[data-player-title]").textContent = game.name;
    var shortcutButton = $("[data-player-pin]");
    shortcutButton.disabled = false;
    shortcutButton.textContent = "Add to taskbar";
    shortcutButton.title = "Also adds this game to the home screen";
    $("[data-player]").hidden = false;
    document.documentElement.classList.add("is-playing");
    showFrameMessage("Loading " + game.name + " directly…", false);
    if (!requestDirectEmbed(frame, game.url)) {
      showFrameMessage("This title is not available from the direct game CDN.", true);
      return;
    }
    remember(game);
    frameTimer = window.setTimeout(function () {
      if (frame.dataset.neoGameReady !== "true") showFrameMessage("Still loading the game CDN…", false);
    }, 10000);
  }

  function closeGame() {
    var frame = $("[data-game-frame]");
    resetGameFrame(frame);
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
      game: { title: activeGame.name, url: activeGame.url, icon: activeGame.img, mode: "direct-game" }
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
      if (!frame.dataset.neoGameSource || frame.getAttribute("src") === "about:blank") return;
      clearTimeout(frameTimer);
      frame.dataset.neoGameReady = "true";
      $("[data-frame-status]").classList.add("is-ready");
    });
  }

  async function fetchJsonFallback(urls, label) {
    var lastError = null;
    for (var index = 0; index < urls.length; index += 1) {
      var controller = new AbortController();
      var timer = window.setTimeout(function () { controller.abort(); }, 15000);
      try {
        var response = await fetch(urls[index], {
          credentials: "omit",
          cache: "force-cache",
          mode: "cors",
          signal: controller.signal
        });
        if (!response.ok) throw new Error(label + " returned " + response.status);
        return await response.json();
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error(label + " is unavailable");
  }

  async function loadCatalog() {
    var loaded = await Promise.all([
      fetchJsonFallback(CATALOG_URLS, "The game catalogue"),
      fetchJsonFallback(COVERS_URLS, "The cover catalogue").catch(function () { return {}; })
    ]);
    var rows = loaded[0];
    var covers = loaded[1];
    if (!Array.isArray(rows)) throw new Error("The direct game catalogue is invalid");
    var seen = new Set();
    catalog = rows.map(function (entry, index) { return normalizeGame(entry, index, covers); }).filter(function (game) {
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
      description: "Open one game directly from the NEO game CDN.",
      inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 160 } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: function (input) {
        if (!input || typeof input.id !== "string") throw new TypeError("id must be a string");
        var game = gamesById.get(input.id);
        if (!game) throw new Error("Game not found");
        openGame(game);
        return { id: game.id, title: game.name, status: "opening-directly" };
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
