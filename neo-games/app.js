(function () {
  "use strict";
  var config = window.NEO_GAMES_CONFIG || {};
  var catalog = [];
  var covers = Object.create(null);
  var mode = "home";
  var query = "";
  var source = "";
  var visible = 0;
  var matches = [];
  var activeGame = null;
  var frameTimer = 0;
  var favoritesKey = "neo_games_favorites_v2";
  var recentKey = "neo_games_recent_v2";
  var favorites = new Set(read(favoritesKey, []));
  var recent = read(recentKey, []);

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function read(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (error) { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {} }
  function nameOf(value) {
    return String(value || "").replace(/[_-]+/g, " ").replace(/\b\w/g, function (letter) { return letter.toUpperCase(); }).trim() || "Untitled";
  }
  function normalize(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
  function coverFor(game) {
    var value = covers[game.slug] || "";
    if (value && value.charAt(0) === "/") {
      try { return new URL(value.replace(/^\//, "../../"), location.href).href; } catch (error) {}
    }
    return value;
  }
  function saveFavorites() { save(favoritesKey, Array.from(favorites).slice(0, 1000)); }
  function remember(game) {
    recent = [game.slug].concat(recent.filter(function (slug) { return slug !== game.slug; })).slice(0, 40);
    save(recentKey, recent);
  }
  function meta(game) {
    return nameOf(game.source || "NEO library").toUpperCase();
  }

  function createCard(game) {
    var card = document.createElement("button");
    card.type = "button";
    card.className = "game-card";
    card.innerHTML = '<span class="cover"><img alt="" loading="lazy" decoding="async"><span class="play-mark">▶</span></span><span class="copy"><strong></strong><small></small></span><span class="favorite" role="button" tabindex="0" aria-label="Add to favorites">♡</span>';
    var image = $("img", card);
    image.alt = game.name;
    var cover = coverFor(game);
    if (cover) image.src = cover;
    image.addEventListener("error", function () { image.removeAttribute("src"); image.alt = ""; }, { once: true });
    $(".copy strong", card).textContent = game.name;
    $(".copy small", card).textContent = meta(game);
    var favorite = $(".favorite", card);
    favorite.classList.toggle("is-favorite", favorites.has(game.slug));
    favorite.textContent = favorites.has(game.slug) ? "♥" : "♡";
    favorite.setAttribute("aria-label", favorites.has(game.slug) ? "Remove from favorites" : "Add to favorites");
    function toggleFavorite(event) {
      event.stopPropagation();
      if (favorites.has(game.slug)) favorites.delete(game.slug); else favorites.add(game.slug);
      saveFavorites();
      favorite.classList.toggle("is-favorite", favorites.has(game.slug));
      favorite.textContent = favorites.has(game.slug) ? "♥" : "♡";
      if (mode === "favorites") renderLibrary(true);
    }
    favorite.addEventListener("click", toggleFavorite);
    favorite.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleFavorite(event);
    });
    card.addEventListener("click", function () { openGame(game); });
    return card;
  }

  function setHero(game) {
    if (!game) return;
    activeGame = game;
    $("[data-hero-title]").textContent = game.name;
    $("[data-hero-meta]").textContent = meta(game) + "  ·  READY TO PLAY";
    var art = $("[data-hero-art]");
    var cover = coverFor(game);
    art.style.backgroundImage = cover ? 'url("' + cover.replace(/"/g, "%22") + '")' : "linear-gradient(135deg,#142438,#08090b)";
  }

  function cardList(items, limit) {
    var fragment = document.createDocumentFragment();
    items.slice(0, limit || 24).forEach(function (game) { fragment.appendChild(createCard(game)); });
    return fragment;
  }

  function makeRail(title, items) {
    if (!items.length) return null;
    var rail = document.createElement("section");
    rail.className = "rail";
    rail.innerHTML = '<div class="rail-head"><h2></h2><span></span></div><div class="rail-track"></div>';
    $("h2", rail).textContent = title;
    $(".rail-head span", rail).textContent = items.length.toLocaleString() + " GAMES";
    $(".rail-track", rail).appendChild(cardList(items, 18));
    return rail;
  }

  function picksByPattern(pattern, maximum) {
    return catalog.filter(function (game) { return pattern.test(game.search); }).slice(0, maximum || 30);
  }
  function picksBySource(sourceName, maximum) {
    return catalog.filter(function (game) { return game.source === sourceName; }).slice(0, maximum || 30);
  }
  function renderHome() {
    $("[data-library]").hidden = true;
    $("[data-home-rails]").hidden = false;
    $("[data-hero]").hidden = false;
    var preferred = ["minecraft", "slope", "geometry-dash", "subway-surfers", "tetris"];
    var featured = preferred.map(function (slug) { return catalog.find(function (game) { return game.slug === slug; }); }).filter(Boolean);
    if (!featured.length) featured = catalog.filter(function (game) { return coverFor(game); }).slice(0, 6);
    setHero(featured[0] || catalog[0]);
    var rows = [
      ["Featured", featured.concat(catalog.filter(function (game) { return coverFor(game) && featured.indexOf(game) < 0; }).slice(0, 24))],
      ["Arcade essentials", picksByPattern(/slope|run |runner|dash|race|moto|bike|drift|tunnel|subway|pac ?man|sonic/, 34)],
      ["Adventure & platform", picksByPattern(/mario|adventure|quest|zelda|kirby|metroid|papa|duck life|fireboy|watergirl|vex/, 34)],
      ["Puzzle & strategy", picksByPattern(/chess|tetris|2048|puzzle|sudoku|solitaire|bloons|tower|factory|alchemy|craft/, 34)],
      ["Retro classics", picksByPattern(/mario|sonic|pokemon|doom|pac|nintendo|atari|retro|gba|nes|n64/, 34)]
    ];
    var sourceCounts = {};
    catalog.forEach(function (game) { sourceCounts[game.source] = (sourceCounts[game.source] || 0) + 1; });
    Object.keys(sourceCounts).sort(function (a, b) { return sourceCounts[b] - sourceCounts[a]; }).slice(0, 3).forEach(function (sourceName) {
      rows.push([nameOf(sourceName), picksBySource(sourceName, 30)]);
    });
    var host = $("[data-home-rails]");
    host.replaceChildren();
    rows.forEach(function (row) { var rail = makeRail(row[0], row[1]); if (rail) host.appendChild(rail); });
  }

  function filteredGames() {
    var items = catalog;
    if (mode === "favorites") items = items.filter(function (game) { return favorites.has(game.slug); });
    if (mode === "recent") items = recent.map(function (slug) { return catalog.find(function (game) { return game.slug === slug; }); }).filter(Boolean);
    if (source) items = items.filter(function (game) { return game.source === source; });
    if (query) {
      var terms = normalize(query).split(" ").filter(Boolean);
      items = items.filter(function (game) { return terms.every(function (term) { return game.search.indexOf(term) >= 0; }); });
    }
    return items;
  }
  function renderNext() {
    var grid = $("[data-grid]");
    var end = Math.min(visible + 60, matches.length);
    var fragment = document.createDocumentFragment();
    for (var index = visible; index < end; index++) fragment.appendChild(createCard(matches[index]));
    grid.appendChild(fragment);
    visible = end;
    $("[data-more]").hidden = visible >= matches.length;
    $("[data-state]").hidden = matches.length > 0;
    $("[data-state]").textContent = matches.length ? "" : (mode === "favorites" ? "No favorites yet. Use the heart on any game." : "No games match this search.");
    $("[data-count]").textContent = matches.length.toLocaleString() + " GAMES";
  }
  function renderLibrary(reset) {
    $("[data-hero]").hidden = true;
    $("[data-home-rails]").hidden = true;
    $("[data-library]").hidden = false;
    var names = { all: ["ALL GAMES", "Complete library"], favorites: ["YOUR LIBRARY", "Favorite games"], recent: ["PLAY AGAIN", "Recently played"] };
    var labels = names[mode] || names.all;
    $("[data-library-label]").textContent = labels[0];
    $("[data-library-title]").textContent = query ? 'Results for "' + query + '"' : labels[1];
    matches = filteredGames();
    if (reset !== false) {
      visible = 0;
      $("[data-grid]").replaceChildren();
    }
    renderNext();
  }
  function setMode(next) {
    mode = next || "home";
    $$(".nav-button[data-mode]").forEach(function (button) { button.classList.toggle("is-active", button.dataset.mode === mode); });
    if (mode === "home" && !query) renderHome(); else renderLibrary(true);
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  function openGame(game) {
    if (!game || !game.file) return;
    activeGame = game;
    remember(game);
    var player = $("[data-player]");
    var frame = $("[data-game-frame]");
    var status = $("[data-frame-status]");
    clearTimeout(frameTimer);
    $("[data-player-title]").textContent = game.name;
    $("[data-player-open]").href = game.file;
    frame.title = game.name;
    status.classList.remove("is-ready");
    status.textContent = "Loading " + game.name + "…";
    player.hidden = false;
    frame.src = game.file;
    frame.addEventListener("load", function loaded() {
      frame.removeEventListener("load", loaded);
      status.classList.add("is-ready");
    });
    frameTimer = window.setTimeout(function () {
      if (!status.classList.contains("is-ready")) status.textContent = "Still loading… larger games can take a moment.";
    }, 9000);
  }
  function closeGame() {
    clearTimeout(frameTimer);
    var frame = $("[data-game-frame]");
    frame.src = "about:blank";
    $("[data-player]").hidden = true;
  }

  async function loadCatalog() {
    var catalogResponse = await fetch(config.catalog || "../../games/index.json", { credentials: "omit", cache: "force-cache" });
    if (!catalogResponse.ok) throw new Error("Catalog returned " + catalogResponse.status);
    var json = await catalogResponse.json();
    var catalogRoot = new URL("../", catalogResponse.url).href;
    catalog = (Array.isArray(json) ? json : []).filter(function (entry) { return entry && entry.file && entry.slug; }).map(function (entry, index) {
      return {
        slug: String(entry.slug), name: String(entry.name || nameOf(entry.slug)), file: new URL(String(entry.file), catalogRoot).href,
        source: String(entry.source || "neo-library"), index: index,
        search: normalize([entry.name, entry.slug, entry.source].join(" "))
      };
    });
    $("[data-count]").textContent = catalog.length.toLocaleString() + " GAMES";
    var sourceCounts = {};
    catalog.forEach(function (game) { sourceCounts[game.source] = (sourceCounts[game.source] || 0) + 1; });
    var select = $("[data-source]");
    Object.keys(sourceCounts).sort(function (a, b) { return sourceCounts[b] - sourceCounts[a] || a.localeCompare(b); }).forEach(function (sourceName) {
      var option = document.createElement("option");
      option.value = sourceName;
      option.textContent = nameOf(sourceName) + " (" + sourceCounts[sourceName].toLocaleString() + ")";
      select.appendChild(option);
    });
    var coversResponse = await fetch(config.covers || "../../games/covers.json", { credentials: "omit", cache: "force-cache" }).catch(function () { return null; });
    if (coversResponse && coversResponse.ok) covers = await coversResponse.json();
    setMode("home");
  }

  function registerWebTools() {
    var context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    var lifecycle = new AbortController();
    function register(tool) {
      try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(function () {}); } catch (error) {}
    }
    register({
      name: "search_neo_games", title: "Search NEO Games",
      description: "Search the visible NEO Games catalog by title or source.",
      inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 80 } }, required: ["query"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: function (input) {
        if (!input || typeof input.query !== "string" || !input.query.trim()) throw new TypeError("query must be a non-empty string");
        window.NEO_GAMES.search(input.query.trim());
        return { query: input.query.trim(), results: matches.length };
      }
    });
    register({
      name: "open_neo_game", title: "Open NEO Game",
      description: "Open one game from the NEO Games catalog by its stable slug.",
      inputSchema: { type: "object", properties: { slug: { type: "string", minLength: 1, maxLength: 120 } }, required: ["slug"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: function (input) {
        if (!input || typeof input.slug !== "string") throw new TypeError("slug must be a string");
        var game = catalog.find(function (item) { return item.slug === input.slug; });
        if (!game) throw new Error("Game not found");
        openGame(game);
        return { slug: game.slug, title: game.name, status: "opened" };
      }
    });
    window.addEventListener("pagehide", function () { lifecycle.abort(); }, { once: true });
  }

  function init() {
    $$(".nav-button[data-mode]").forEach(function (button) { button.addEventListener("click", function () { query = ""; $("[data-search]").value = ""; setMode(button.dataset.mode); }); });
    $("[data-hero-play]").addEventListener("click", function () { openGame(activeGame); });
    $("[data-more]").addEventListener("click", renderNext);
    $("[data-source]").addEventListener("change", function () { source = this.value; renderLibrary(true); });
    var searchTimer = 0;
    $("[data-search]").addEventListener("input", function () {
      query = this.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () { query ? renderLibrary(true) : setMode(mode); }, 120);
    });
    $("[data-player-close]").addEventListener("click", closeGame);
    $("[data-player-fullscreen]").addEventListener("click", function () {
      var player = $("[data-player]");
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else player.requestFullscreen().catch(function () {});
    });
    window.addEventListener("keydown", function (event) { if (event.key === "Escape" && !$("[data-player]").hidden && !document.fullscreenElement) closeGame(); });
    loadCatalog().catch(function () {
      $("[data-count]").textContent = "CATALOG OFFLINE";
      $("[data-library]").hidden = false;
      $("[data-state]").textContent = "The game catalog could not load. Check the connection and reopen Games.";
    });
    window.NEO_GAMES = Object.freeze({
      search: function (value) { query = String(value || ""); $("[data-search]").value = query; renderLibrary(true); },
      open: function (slug) { var game = catalog.find(function (item) { return item.slug === slug; }); if (game) openGame(game); },
      favorites: function () { setMode("favorites"); }
    });
    registerWebTools();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
