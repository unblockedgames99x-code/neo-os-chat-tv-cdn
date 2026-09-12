(function () {
  "use strict";

  var catalog = Array.isArray(window.NEO_MOVIES_CATALOG) ? window.NEO_MOVIES_CATALOG :
    (Array.isArray(window.NEO_STREAM_CATALOG) ? window.NEO_STREAM_CATALOG : []);
  var profileKey = "neo_stream_profiles_v1";
  var dataKey = "neo_stream_profile_data_v1";
  var settingsKey = "neo_stream_settings_v1";
  var sessionKey = "neo_stream_active_profile";
  var activeProfile = null;
  var activeTitle = catalog[0] || null;
  var profileEditingId = "";
  var searchAbort = null;
  var saveProgressAt = 0;
  var heroTimer = 0;
  var requestedView = "";
  var posterFallbacks = Object.create(null);
  var heroImageRequest = 0;
  var activeMediaSources = [];
  var activeMediaIndex = 0;
  var activeResumeAt = 0;
  var playerLoadId = 0;
  var uploadedTitles = [];
  var shellPopoutActive = false;
  var avatarSprite = "./assets/profile-avatars-v1.webp";
  var profileAvatars = Array.from({ length: 16 }, function (_, index) {
    return { id: "classic-" + String(index + 1).padStart(2, "0"), label: "Classic character " + (index + 1), spriteIndex: index };
  });
  try { requestedView = new URLSearchParams(location.search).get("view") || ""; } catch (error) {}
  var initialView = ["home", "movies", "series", "anime", "manga", "list"].indexOf(requestedView) !== -1 ? requestedView : "home";
  var currentView = initialView;

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }
  function read(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch (error) { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {} }
  function clean(value) { return String(value || "").replace(/<[^>]*>/g, "").replace(/&[^;]+;/g, " ").trim(); }
  function initials(name) { return clean(name).split(/\s+/).slice(0, 2).map(function (part) { return part[0] || ""; }).join("").toUpperCase() || "N"; }
  function uid() { return "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function proxyRoute(value, kind) {
    if (!value || /^(?:blob:|data:)/i.test(String(value))) return Promise.resolve(String(value || ""));
    var proxy = window.NEO_PROXY_CLIENT;
    if (!proxy) {
      if (window.parent !== window) return Promise.reject(new Error("The NEO web proxy is unavailable."));
      return Promise.resolve(String(value));
    }
    if (kind === "image" && typeof proxy.image === "function") return proxy.image(value);
    if (kind === "media" && typeof proxy.media === "function") return proxy.media(value);
    return proxy.resolve(value, kind || "fetch");
  }
  function proxyFetch(value, options) {
    var proxy = window.NEO_PROXY_CLIENT;
    if (proxy && typeof proxy.fetch === "function") return proxy.fetch(value, options);
    if (window.parent !== window) return Promise.reject(new Error("The NEO web proxy is unavailable."));
    return fetch(value, Object.assign({ credentials: "omit", cache: "no-store" }, options || {}));
  }
  function profileAvatar(profile) {
    if (profile && profile.avatar === "custom" && /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(String(profile.avatarData || ""))) {
      return { id: "custom", label: "Uploaded picture", src: profile.avatarData };
    }
    var selected = profileAvatars.find(function (avatar) { return avatar.id === String(profile && profile.avatar || ""); });
    if (selected) return selected;
    var seed = String(profile && (profile.id || profile.name) || "guest");
    var hash = 0;
    for (var index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
    return profileAvatars[Math.abs(hash) % profileAvatars.length];
  }
  function paintProfileAvatar(node, profile) {
    if (!node) return;
    var avatar = profileAvatar(profile);
    node.textContent = "";
    node.classList.add("has-profile-picture");
    node.style.removeProperty("background-image");
    node.style.removeProperty("background-position");
    node.style.removeProperty("background-size");
    if (avatar.src) {
      var image = document.createElement("img");
      image.src = avatar.src;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", function () {
        node.classList.remove("has-profile-picture");
        node.textContent = initials(profile && profile.name || avatar.label);
      }, { once: true });
      node.appendChild(image);
    } else {
      var column = avatar.spriteIndex % 4;
      var row = Math.floor(avatar.spriteIndex / 4);
      node.style.backgroundImage = 'url("' + avatarSprite + '")';
      node.style.backgroundSize = "400% 400%";
      node.style.backgroundPosition = (column * 100 / 3) + "% " + (row * 100 / 3) + "%";
    }
    node.setAttribute("aria-hidden", "true");
  }
  function renderAvatarPicker(selectedId) {
    var host = $("[data-profile-picture-picker]");
    if (!host) return;
    host.replaceChildren();
    profileAvatars.forEach(function (avatar) {
      var button = document.createElement("button");
      var preview = document.createElement("span");
      button.type = "button";
      button.className = "profile-picture-choice";
      button.dataset.avatar = avatar.id;
      button.title = avatar.label;
      button.setAttribute("aria-label", "Use " + avatar.label + " picture");
      button.setAttribute("aria-pressed", avatar.id === selectedId ? "true" : "false");
      preview.className = "profile-picture-preview";
      paintProfileAvatar(preview, { avatar: avatar.id, id: avatar.id });
      button.appendChild(preview);
      button.addEventListener("click", function () {
        var form = $("[data-profile-form]");
        form.elements.avatar.value = avatar.id;
        form.elements.avatarData.value = "";
        $("[data-avatar-upload-note]").textContent = "Images are resized and stored only on this device.";
        $$("[data-avatar]", host).forEach(function (choice) { choice.setAttribute("aria-pressed", choice === button ? "true" : "false"); });
      });
      host.appendChild(button);
    });
  }
  function profiles() {
    var list = read(profileKey, null);
    if (!Array.isArray(list) || !list.length) {
      list = [{ id: "guest", name: "Guest", color: "#77d5ff", avatar: "classic-01", kids: false }];
      save(profileKey, list);
    }
    return list.slice(0, 6);
  }
  function allData() {
    var value = read(dataKey, {});
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function currentData() {
    var all = allData();
    var id = activeProfile ? activeProfile.id : "guest";
    var value = all[id] || { list: [], progress: {} };
    if (!Array.isArray(value.list)) value.list = [];
    if (!value.progress || typeof value.progress !== "object") value.progress = {};
    return value;
  }
  function saveCurrentData(value) {
    var all = allData();
    all[activeProfile ? activeProfile.id : "guest"] = value;
    save(dataKey, all);
  }
  function getSettings() {
    var value = read(settingsKey, {});
    return Object.assign({ dataSaver: false, autoplayPreview: false }, value && typeof value === "object" ? value : {});
  }

  function renderProfileGate(managing) {
    var host = $("[data-profiles]");
    var list = profiles();
    host.replaceChildren();
    list.forEach(function (profile) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "profile";
      button.style.setProperty("--profile", profile.color || "#77d5ff");
      button.innerHTML = '<span class="profile-avatar"></span><strong></strong><small></small>';
      paintProfileAvatar($(".profile-avatar", button), profile);
      $("strong", button).textContent = profile.name;
      $("small", button).textContent = profile.kids ? "KIDS" : "PROFILE";
      button.addEventListener("click", function () { managing ? openProfileDialog(profile) : chooseProfile(profile); });
      if (managing && list.length > 1) {
        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "profile-remove";
        remove.setAttribute("aria-label", "Remove " + profile.name);
        remove.textContent = "×";
        remove.addEventListener("click", function (event) {
          event.stopPropagation();
          save(profileKey, profiles().filter(function (item) { return item.id !== profile.id; }));
          var data = allData();
          delete data[profile.id];
          save(dataKey, data);
          renderProfileGate(true);
        });
        button.appendChild(remove);
      }
      host.appendChild(button);
    });
    if (list.length < 6) {
      var add = document.createElement("button");
      add.type = "button";
      add.className = "profile profile-add";
      add.innerHTML = '<span class="profile-avatar">+</span><strong>Add profile</strong><small>LOCAL</small>';
      add.addEventListener("click", function () { openProfileDialog(); });
      host.appendChild(add);
    }
    var manage = $("[data-manage-profiles]");
    manage.textContent = managing ? "Done" : "Manage profiles";
    manage.dataset.managing = managing ? "true" : "false";
  }

  function openProfileDialog(profile) {
    profileEditingId = profile ? profile.id : "";
    var form = $("[data-profile-form]");
    form.elements.name.value = profile ? profile.name : "";
    form.elements.color.value = profile ? profile.color : "#77d5ff";
    form.elements.avatar.value = profileAvatar(profile || { id: profileEditingId || "new-profile" }).id;
    form.elements.avatarData.value = profile && profile.avatarData || "";
    form.elements.kids.checked = Boolean(profile && profile.kids);
    renderAvatarPicker(form.elements.avatar.value);
    $("[data-profile-dialog-title]").textContent = profile ? "Edit profile" : "Add profile";
    $("[data-profile-dialog]").showModal();
    requestAnimationFrame(function () { form.elements.name.focus(); });
  }

  function saveProfile(event) {
    event.preventDefault();
    var form = $("[data-profile-form]");
    if (!form.reportValidity()) return;
    var list = profiles();
    var value = {
      id: profileEditingId || uid(),
      name: clean(form.elements.name.value).slice(0, 18) || "Profile",
      color: form.elements.color.value || "#77d5ff",
      avatar: form.elements.avatar.value === "custom" && form.elements.avatarData.value ? "custom" :
        (profileAvatars.some(function (avatar) { return avatar.id === form.elements.avatar.value; }) ? form.elements.avatar.value : "classic-01"),
      avatarData: form.elements.avatar.value === "custom" ? form.elements.avatarData.value : "",
      kids: form.elements.kids.checked
    };
    var index = list.findIndex(function (item) { return item.id === value.id; });
    if (index < 0) list.push(value); else list[index] = value;
    save(profileKey, list.slice(0, 6));
    $("[data-profile-dialog]").close();
    renderProfileGate($("[data-manage-profiles]").dataset.managing === "true");
  }

  function chooseProfile(profile) {
    activeProfile = profile;
    try { sessionStorage.setItem(sessionKey, profile.id); } catch (error) {}
    document.documentElement.style.setProperty("--profile", profile.color || "#77d5ff");
    paintProfileAvatar($("[data-profile-avatar]"), profile);
    $("[data-profile-name]").textContent = profile.name;
    $("[data-profile-gate]").hidden = true;
    $("[data-app-shell]").hidden = false;
    renderView(initialView);
  }

  function meta(title) {
    var labels = { movie: "MOVIE", series: "SERIES", anime: "ANIME", manga: "MANGA" };
    return [title.year || "NEW", title.rating ? Number(title.rating).toFixed(1) + " ★" : "", title.maturity || "", labels[title.type] || "TITLE"].filter(Boolean).join("  ·  ");
  }
  function imageFor(title, backdrop) {
    if (getSettings().dataSaver && backdrop && title.poster) return title.poster;
    return (backdrop ? title.backdrop : title.poster) || "";
  }
  function wikipediaPoster(title) {
    var key = clean(title);
    if (posterFallbacks[key]) return posterFallbacks[key];
    var query = new URLSearchParams({
      action: "query", format: "json", origin: "*", prop: "pageimages",
      piprop: "thumbnail", pithumbsize: "600", redirects: "1", titles: key
    });
    posterFallbacks[key] = proxyFetch("https://en.wikipedia.org/w/api.php?" + query.toString(), { cache: "force-cache" })
      .then(function (response) { if (!response.ok) throw new Error("Poster unavailable"); return response.json(); })
      .then(function (payload) {
        var pages = payload && payload.query && payload.query.pages;
        var page = pages && Object.keys(pages).map(function (id) { return pages[id]; })[0];
        var source = page && page.thumbnail && page.thumbnail.source || "";
        return /^https:\/\//i.test(source) ? source : "";
      }).catch(function () { return ""; });
    return posterFallbacks[key];
  }
  function loadPoster(image, title, source) {
    var frame = image.closest(".poster");
    var triedFallback = false;
    var requestId = String(Date.now()) + Math.random();
    image.dataset.requestId = requestId;
    if (frame) {
      frame.dataset.fallback = title.title;
      frame.classList.add("is-missing");
    }
    function finishMissing() {
      image.removeAttribute("src");
      image.alt = "";
      if (frame) frame.classList.add("is-missing");
    }
    function useFallback() {
      if (title.userUpload) return finishMissing();
      if (triedFallback) return finishMissing();
      triedFallback = true;
      wikipediaPoster(title.title).then(function (fallback) {
        if (fallback) assign(fallback);
        else finishMissing();
      });
    }
    function assign(value) {
      proxyRoute(value, "image").then(function (route) {
        if (image.dataset.requestId === requestId && route) image.src = route;
      }).catch(useFallback);
    }
    image.addEventListener("load", function () { if (frame) frame.classList.remove("is-missing"); });
    image.addEventListener("error", useFallback);
    image.removeAttribute("src");
    if (source) assign(source);
    else useFallback();
  }
  function allowedCatalog() {
    var combined = uploadedTitles.concat(catalog);
    if (!activeProfile || !activeProfile.kids) return combined;
    return combined.filter(function (title) { return title.userUpload || !/14|13|18|R/.test(title.maturity || ""); });
  }
  function streamSources(title) {
    if (!title) return [];
    var candidates = [title.media].concat(Array.isArray(title.mediaFallbacks) ? title.mediaFallbacks : []);
    return candidates.filter(function (source, index) {
      return /^(?:https:\/\/|blob:)/i.test(String(source || "")) && candidates.indexOf(source) === index;
    });
  }
  function setHero(title) {
    if (!title) return;
    activeTitle = title;
    $("[data-hero-title]").textContent = title.title;
    $("[data-hero-meta]").textContent = meta(title);
    $("[data-hero-description]").textContent = title.description || "A new story is waiting.";
    var heroAction = $("[data-hero-action]");
    if (heroAction) heroAction.textContent = title.type === "manga" ? "Read" : (title.media ? "Play" : "More info");
    var image = $("[data-hero-image]");
    image.style.opacity = "0";
    var requestId = ++heroImageRequest;
    window.setTimeout(function () {
      var source = imageFor(title, true);
      function apply(sourceUrl) {
        if (requestId !== heroImageRequest) return;
        image.style.backgroundImage = sourceUrl ? 'url("' + sourceUrl.replace(/"/g, "%22") + '")' : "none";
        image.style.opacity = "1";
      }
      function routeAndApply(sourceUrl) {
        if (!sourceUrl) return apply("");
        proxyRoute(sourceUrl, "image").then(apply).catch(function () { apply(""); });
      }
      if (source) routeAndApply(source);
      else wikipediaPoster(title.title).then(routeAndApply).catch(function () { apply(""); });
    }, 80);
  }

  var liveRows = [
    { title: "Animation & family", endpoint: "animation" },
    { title: "Comedies", endpoint: "comedy" },
    { title: "Drama", endpoint: "drama" },
    { title: "Science fiction & fantasy", endpoint: "scifi-fantasy" },
    { title: "Mystery", endpoint: "mystery" },
    { title: "Classics", endpoint: "classic" }
  ];
  function rowsFor(view) {
    var data = currentData();
    var items = allowedCatalog();
    var streaming = items.filter(function (item) { return item.type === "movie" && streamSources(item).length; });
    if (view === "movies") return (uploadedTitles.length ? [{ title: "Your uploads", items: uploadedTitles, portrait: true }] : []).concat([{ title: "Streaming now", items: streaming, portrait: true, emptyMessage: "No playable films are available right now." }], liveRows);
    if (view === "series") return [{ title: "Discover series", tvmaze: true }];
    if (view === "anime") return [{ title: "Anime", items: [], emptyMessage: "No verified anime titles are available yet." }];
    if (view === "manga") return [{ title: "Manga", items: [], portrait: true, emptyMessage: "No verified manga titles are available yet." }];
    if (view === "list") return [{ title: "My List", items: items.filter(function (item) { return data.list.indexOf(item.id) !== -1; }), emptyMessage: "Your list is empty." }];
    var progressItems = Object.keys(data.progress).map(function (id) { return items.find(function (item) { return item.id === id; }); }).filter(Boolean);
    return (uploadedTitles.length ? [{ title: "Your uploads", items: uploadedTitles, portrait: true }] : []).concat([
      { title: "Continue watching", items: progressItems },
      { title: "Streaming now", items: streaming.slice(0, 12), portrait: true },
      { title: "Series", items: items.filter(function (item) { return item.type === "series"; }).slice(0, 12) }
    ].filter(function (row) { return row.items.length; }), liveRows.slice(0, 3));
  }

  function createCard(title, portrait) {
    var card = $("#card-template").content.firstElementChild.cloneNode(true);
    var image = $("img", card);
    card.classList.toggle("is-portrait", Boolean(portrait));
    image.alt = title.title;
    var source = imageFor(title, !portrait);
    loadPoster(image, title, source);
    $(".card-copy strong", card).textContent = title.title;
    $(".card-copy small", card).textContent = meta(title);
    var progress = currentData().progress[title.id];
    if (progress && progress.duration) card.style.setProperty("--progress", Math.min(100, progress.time / progress.duration * 100).toFixed(1) + "%");
    card.addEventListener("click", function () { openDetails(title); });
    card.addEventListener("mouseenter", function () { if (title.openSample) setHero(title); }, { passive: true });
    return card;
  }
  function renderCards(track, items, portrait) {
    var fragment = document.createDocumentFragment();
    track.classList.toggle("is-poster-rail", Boolean(portrait));
    items.slice(0, 36).forEach(function (title) { fragment.appendChild(createCard(title, portrait)); });
    track.replaceChildren(fragment);
    var count = $(".rail-heading span", track.closest(".rail"));
    if (count) count.textContent = items.length + " TITLES";
  }
  function makeRail(row) {
    var section = document.createElement("section");
    section.className = "rail";
    section.innerHTML = '<div class="rail-heading"><h2></h2><span>LOADING</span></div><div class="rail-track"></div>';
    $("h2", section).textContent = row.title;
    var track = $(".rail-track", section);
    if (row.items) {
      renderCards(track, row.items, Boolean(row.portrait));
      if (!row.items.length && row.emptyMessage) {
        var empty = document.createElement("p");
        empty.className = "rail-error";
        empty.textContent = row.emptyMessage;
        track.appendChild(empty);
      }
    }
    else {
      section.dataset.live = row.endpoint || (row.tvmaze ? "tvmaze" : "");
      track.innerHTML = '<div class="rail-skeleton"></div><div class="rail-skeleton"></div><div class="rail-skeleton"></div>';
    }
    return section;
  }
  function sampleTitle(item, index, endpoint) {
    return {
      id: "sample-" + endpoint + "-" + String(item.imdbId || item.id || index),
      title: clean(item.title || "Untitled"), type: "movie", year: "", genre: endpoint.replace("-", " "), maturity: "", rating: "",
      description: "Explore this title and find an official place to watch.",
      poster: /^https:\/\//i.test(item.posterURL || "") ? item.posterURL : "",
      backdrop: /^https:\/\//i.test(item.posterURL || "") ? item.posterURL : "",
      officialUrl: item.imdbId ? "https://www.imdb.com/title/" + encodeURIComponent(item.imdbId) + "/" : ""
    };
  }
  async function loadLiveRail(section) {
    if (section.dataset.loaded === "true") return;
    section.dataset.loaded = "true";
    var kind = section.dataset.live;
    var track = $(".rail-track", section);
    try {
      var response = await proxyFetch(kind === "tvmaze" ? "https://api.tvmaze.com/shows?page=0" : "https://api.sampleapis.com/movies/" + encodeURIComponent(kind), { cache: "force-cache" });
      if (!response.ok) throw new Error("Catalog unavailable");
      var json = await response.json();
      var items = kind === "tvmaze" ? json.slice(0, 30).map(function (show) {
        return {
          id: "tvmaze-" + show.id, title: clean(show.name), type: "series", year: String(show.premiered || "").slice(0, 4),
          genre: (show.genres || [])[0] || "Series", rating: show.rating && show.rating.average || "", maturity: "",
          description: clean(show.summary) || "Discover this series.", poster: show.image && (show.image.medium || show.image.original),
          backdrop: show.image && show.image.original, officialUrl: show.officialSite || show.url
        };
      }) : json.slice(0, 30).map(function (item, index) { return sampleTitle(item, index, kind); });
      renderCards(track, items, true);
    } catch (error) {
      track.innerHTML = '<p class="rail-error">This row is temporarily unavailable.</p>';
      $(".rail-heading span", section).textContent = "OFFLINE";
    }
  }
  var railObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      railObserver.unobserve(entry.target);
      loadLiveRail(entry.target);
    });
  }, { rootMargin: "500px 0px" });

  function renderView(view) {
    if (["home", "movies", "series", "anime", "manga", "list"].indexOf(view) === -1) view = "home";
    currentView = view;
    clearInterval(heroTimer);
    $$(".nav-button[data-view]").forEach(function (button) { button.classList.toggle("is-active", button.dataset.view === view); });
    $("[data-search]").value = "";
    $("[data-search-results]").hidden = true;
    $("[data-hero]").hidden = true;
    var rails = $("[data-rails]");
    rails.hidden = false;
    rails.replaceChildren();
    rowsFor(view).forEach(function (row) {
      var rail = makeRail(row);
      rails.appendChild(rail);
      if (rail.dataset.live) railObserver.observe(rail);
    });
    if (view !== "list" && view !== "manga") {
      var featured = allowedCatalog().filter(function (title) {
        if (!title.openSample) return false;
        if (view === "movies") return title.type === "movie";
        if (view === "series") return title.type === "series";
        if (view === "anime") return title.type === "anime";
        return title.type !== "manga";
      });
      if (featured.length) {
        $("[data-hero]").hidden = false;
        setHero(featured[0]);
      } else {
        activeTitle = null;
      }
      if (getSettings().autoplayPreview && featured.length > 1) {
        var index = 0;
        heroTimer = window.setInterval(function () {
          if (document.hidden || !$("[data-player]").hidden) return;
          index = (index + 1) % featured.length;
          setHero(featured[index]);
        }, 8500);
      }
    }
    $("[data-content]").scrollTo({ top: 0, behavior: "auto" });
  }

  function openDetails(title) {
    activeTitle = title;
    var data = currentData();
    var inList = data.list.indexOf(title.id) !== -1;
    var card = $("[data-details-card]");
    card.replaceChildren();
    var backdrop = document.createElement("div");
    backdrop.className = "details-backdrop";
    var source = imageFor(title, true);
    backdrop.style.backgroundImage = "none";
    if (source) proxyRoute(source, "image").then(function (route) {
      if (backdrop.isConnected) backdrop.style.backgroundImage = 'url("' + route.replace(/"/g, "%22") + '")';
    }).catch(function () {});
    var close = document.createElement("button");
    close.className = "details-close"; close.type = "button"; close.setAttribute("aria-label", "Close details"); close.textContent = "×";
    close.addEventListener("click", function () { $("[data-details-dialog]").close(); });
    var body = document.createElement("div");
    body.className = "details-body";
    var tag = document.createElement("span"); tag.className = "eyebrow"; tag.textContent = title.genre || "FEATURED";
    var heading = document.createElement("h2"); heading.textContent = title.title;
    var metaLine = document.createElement("p"); metaLine.className = "details-meta"; metaLine.textContent = meta(title);
    var description = document.createElement("p"); description.className = "details-description"; description.textContent = title.description || "Discover this title.";
    var actions = document.createElement("div"); actions.className = "details-actions";
    var play = document.createElement("button"); play.type = "button"; play.className = "primary"; play.textContent = title.type === "manga" ? "Read" : (title.media ? "Play" : "Open official page");
    play.addEventListener("click", function () { title.type === "manga" ? openReader(title) : (title.media ? playTitle(title) : openOfficial(title)); });
    var listButton = document.createElement("button"); listButton.type = "button"; listButton.className = "secondary"; listButton.textContent = inList ? "✓ In My List" : "+ My List";
    listButton.addEventListener("click", function () {
      var current = currentData();
      var at = current.list.indexOf(title.id);
      if (at < 0) current.list.push(title.id); else current.list.splice(at, 1);
      saveCurrentData(current);
      $("[data-details-dialog]").close();
      renderView("list");
    });
    actions.append(play, listButton);
    body.append(tag, heading, metaLine, description, actions);
    card.append(backdrop, close, body);
    $("[data-details-dialog]").showModal();
  }
  function openReader(title) {
    if (!title || title.type !== "manga") return;
    if ($("[data-details-dialog]").open) $("[data-details-dialog]").close();
    activeTitle = title;
    $("[data-reader-title]").textContent = title.title;
    $("[data-reader-meta]").textContent = meta(title);
    var pages = $("[data-reader-pages]");
    pages.replaceChildren();
    (Array.isArray(title.chapters) ? title.chapters : []).forEach(function (chapterItem, chapterIndex) {
      var chapterSection = document.createElement("section");
      chapterSection.className = "reader-chapter";
      var heading = document.createElement("h2");
      heading.textContent = clean(chapterItem.title) || "Chapter " + (chapterIndex + 1);
      chapterSection.appendChild(heading);
      (Array.isArray(chapterItem.pages) ? chapterItem.pages : []).forEach(function (pageText, pageIndex) {
        var page = document.createElement("article");
        page.className = "manga-page";
        var number = document.createElement("span");
        number.textContent = String(pageIndex + 1).padStart(2, "0");
        var copy = document.createElement("p");
        copy.textContent = clean(pageText);
        page.append(number, copy);
        chapterSection.appendChild(page);
      });
      pages.appendChild(chapterSection);
    });
    if (!pages.children.length) {
      var empty = document.createElement("p");
      empty.className = "reader-empty";
      empty.textContent = "This title does not have a readable chapter yet.";
      pages.appendChild(empty);
    }
    $("[data-reader]").hidden = false;
    pages.scrollTop = 0;
    requestAnimationFrame(function () { pages.focus({ preventScroll: true }); });
  }
  function closeReader() { $("[data-reader]").hidden = true; }
  function openOfficial(title) {
    if (!title.officialUrl) return;
    if (window.parent !== window) {
      proxyRoute(title.officialUrl, "link").then(function () {
        postShell({ type: "neo-shell:proxy-open", href: title.officialUrl, label: title.title || "Official film page" });
      }).catch(function () { setPlayerMessage("The official page could not be routed through the NEO web proxy.", false); });
      return;
    }
    window.open(title.officialUrl, "_blank", "noopener,noreferrer");
  }
  function setPlayerMessage(message, failed) {
    var status = $("[data-player-status]");
    if (!status) return;
    $("[data-player-message]").textContent = message || "";
    status.hidden = !message;
    $("[data-retry-player]").hidden = !failed;
    $("[data-player-official]").hidden = !failed || !activeTitle || !activeTitle.officialUrl;
  }
  function startPlayerSource(index, resumeAt) {
    var video = $("[data-video]");
    if (!activeMediaSources[index]) return;
    activeMediaIndex = index;
    activeResumeAt = Math.max(0, Number(resumeAt) || 0);
    var loadId = ++playerLoadId;
    setPlayerMessage(index ? "Switching to backup stream…" : "Loading stream…", false);
    video.removeAttribute("src");
    proxyRoute(activeMediaSources[index], "media").then(function (route) {
      if (loadId !== playerLoadId || !route) return;
      video.src = route;
      video.load();
      video.addEventListener("loadedmetadata", function restore() {
        if (loadId !== playerLoadId) return;
        if (activeResumeAt && activeResumeAt < video.duration - 10) video.currentTime = activeResumeAt;
      }, { once: true });
      video.addEventListener("canplay", function ready() {
        if (loadId === playerLoadId) setPlayerMessage("", false);
      }, { once: true });
      video.play().catch(function () {});
    }).catch(function () {
      if (loadId !== playerLoadId) return;
      if (index + 1 < activeMediaSources.length) startPlayerSource(index + 1, activeResumeAt);
      else setPlayerMessage("The NEO web proxy could not route this stream.", true);
    });
  }
  function handlePlaybackError() {
    var player = $("[data-player]");
    var video = $("[data-video]");
    if (player.hidden || !activeMediaSources.length) return;
    var resumeAt = Math.max(activeResumeAt, Number(video.currentTime) || 0);
    if (activeMediaIndex + 1 < activeMediaSources.length) {
      startPlayerSource(activeMediaIndex + 1, resumeAt);
      return;
    }
    setPlayerMessage("The stream could not start. Retry it or open the official film page.", true);
  }
  function retryPlayer() {
    if (!activeMediaSources.length) return;
    startPlayerSource(0, Math.max(activeResumeAt, Number($("[data-video]").currentTime) || 0));
  }
  function playTitle(title) {
    var sources = streamSources(title);
    if (!title || !sources.length) return openOfficial(title || {});
    if ($("[data-details-dialog]").open) $("[data-details-dialog]").close();
    activeTitle = title;
    activeMediaSources = sources;
    activeMediaIndex = 0;
    $("[data-player-title]").textContent = title.title;
    $("[data-player]").hidden = false;
    var progress = currentData().progress[title.id];
    startPlayerSource(0, progress ? progress.time : 0);
  }
  function persistProgress(force) {
    var video = $("[data-video]");
    if (!activeTitle || !video.duration || (!force && performance.now() - saveProgressAt < 3500)) return;
    saveProgressAt = performance.now();
    var data = currentData();
    data.progress[activeTitle.id] = { time: Math.round(video.currentTime), duration: Math.round(video.duration), updated: Date.now() };
    saveCurrentData(data);
  }
  function closePlayer() {
    var video = $("[data-video]");
    setShellPopout(false);
    persistProgress(true);
    activeMediaSources = [];
    activeMediaIndex = 0;
    activeResumeAt = 0;
    playerLoadId += 1;
    video.pause();
    video.removeAttribute("src");
    video.load();
    setPlayerMessage("", false);
    $("[data-player]").hidden = true;
  }
  function postShell(message) {
    if (window.parent !== window) window.parent.postMessage(message, "*");
  }
  function setShellPopout(active) {
    active = Boolean(active && !$("[data-player]").hidden);
    shellPopoutActive = active;
    document.body.classList.toggle("media-popout", active);
    document.documentElement.classList.toggle("media-popout", active);
    $("[data-popout-controls]").hidden = !active;
    $("[data-pip]").setAttribute("aria-pressed", String(active));
    postShell({
      type: "neo-shell:media-popout",
      active: active,
      mode: active ? "movies" : "",
      title: activeTitle && activeTitle.title || "NEO Movies"
    });
  }
  function beginPopoutDrag(event) {
    if (!shellPopoutActive || event.button !== 0 || event.target.closest("button")) return;
    var pointerId = event.pointerId;
    if (event.currentTarget.setPointerCapture) event.currentTarget.setPointerCapture(pointerId);
    event.preventDefault();
    function send(phase, pointerEvent) {
      postShell({
        type: "neo-shell:media-popout-drag", phase: phase, pointerId: pointerId,
        screenX: Number(pointerEvent.screenX) || 0, screenY: Number(pointerEvent.screenY) || 0
      });
    }
    function move(moveEvent) { if (moveEvent.pointerId === pointerId) send("move", moveEvent); }
    function end(endEvent) {
      if (endEvent.pointerId !== pointerId) return;
      send("end", endEvent);
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    }
    send("start", event);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  }
  function addVideoUpload(file) {
    if (!file || !/^video\//i.test(file.type || "")) return;
    var title = clean(String(file.name || "My video").replace(/\.[^.]+$/, "")) || "My video";
    var route = URL.createObjectURL(file);
    uploadedTitles.unshift({
      id: "upload-" + uid(), title: title, type: "movie", year: String(new Date().getFullYear()),
      genre: "Your upload", maturity: "", rating: "", description: "A video selected from this device.",
      poster: "", backdrop: "", media: route, mediaFallbacks: [], userUpload: true
    });
    while (uploadedTitles.length > 12) {
      var removed = uploadedTitles.pop();
      if (removed && /^blob:/i.test(removed.media || "")) URL.revokeObjectURL(removed.media);
    }
    renderView("home");
    openDetails(uploadedTitles[0]);
  }
  function resizeProfilePicture(file) {
    if (!file || !/^image\/(?:png|jpeg|webp|gif)$/i.test(file.type || "") || file.size > 8 * 1024 * 1024) {
      return Promise.reject(new Error("Choose an image smaller than 8 MB."));
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("The image could not be read.")); };
      reader.onload = function () {
        var image = new Image();
        image.onerror = function () { reject(new Error("The image could not be opened.")); };
        image.onload = function () {
          var canvas = document.createElement("canvas");
          canvas.width = 256; canvas.height = 256;
          var context = canvas.getContext("2d", { alpha: false });
          var scale = Math.max(256 / image.naturalWidth, 256 / image.naturalHeight);
          var width = image.naturalWidth * scale;
          var height = image.naturalHeight * scale;
          context.fillStyle = "#111"; context.fillRect(0, 0, 256, 256);
          context.drawImage(image, (256 - width) / 2, (256 - height) / 2, width, height);
          resolve(canvas.toDataURL("image/webp", .82));
        };
        image.src = String(reader.result || "");
      };
      reader.readAsDataURL(file);
    });
  }
  function showSearch(query) {
    query = clean(query).toLowerCase();
    var section = $("[data-search-results]");
    var grid = $("[data-search-grid]");
    var empty = $("[data-search-empty]");
    if (!query) {
      section.hidden = true;
      $("[data-rails]").hidden = false;
      $("[data-hero]").hidden = currentView === "list" || currentView === "manga" || !activeTitle;
      return;
    }
    section.hidden = false; $("[data-rails]").hidden = true; $("[data-hero]").hidden = true;
    var searchable = allowedCatalog();
    if (["movies", "series", "anime", "manga"].indexOf(currentView) !== -1) {
      var searchType = currentView === "movies" ? "movie" : currentView;
      searchable = searchable.filter(function (title) { return title.type === searchType; });
    } else if (currentView === "list") {
      var list = currentData().list;
      searchable = searchable.filter(function (title) { return list.indexOf(title.id) !== -1; });
    }
    var local = searchable.filter(function (title) { return [title.title, title.genre, title.description].join(" ").toLowerCase().indexOf(query) >= 0; });
    grid.replaceChildren();
    local.forEach(function (title) { grid.appendChild(createCard(title, true)); });
    empty.hidden = local.length > 0;
    if (searchAbort) searchAbort.abort();
    if (query.length < 3 || currentView === "anime" || currentView === "manga" || currentView === "list") return;
    searchAbort = new AbortController();
    proxyFetch("https://api.tvmaze.com/search/shows?q=" + encodeURIComponent(query), { signal: searchAbort.signal })
      .then(function (response) { if (!response.ok) throw new Error("Search unavailable"); return response.json(); })
      .then(function (matches) {
        matches.slice(0, 18).forEach(function (match) {
          var show = match.show || {};
          grid.appendChild(createCard({
            id: "tvmaze-" + show.id, title: clean(show.name), type: "series", year: String(show.premiered || "").slice(0, 4),
            genre: (show.genres || [])[0] || "Series", rating: show.rating && show.rating.average || "", maturity: "",
            description: clean(show.summary), poster: show.image && (show.image.medium || show.image.original),
            backdrop: show.image && show.image.original, officialUrl: show.officialSite || show.url
          }, true));
        });
        empty.hidden = grid.children.length > 0;
      }).catch(function (error) { if (error.name !== "AbortError") empty.hidden = grid.children.length > 0; });
  }
  function syncSettings() {
    var value = getSettings();
    $("[data-data-saver]").checked = value.dataSaver;
    $("[data-autoplay-preview]").checked = value.autoplayPreview;
    document.documentElement.dataset.dataSaver = value.dataSaver ? "true" : "false";
  }

  function registerWebTools() {
    var context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    var lifecycle = new AbortController();
    function register(tool) {
      try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(function () {}); } catch (error) {}
    }
    register({
      name: "search_neo_movies", title: "Search NEO Movies",
      description: "Search movies and series in the visible NEO Movies interface.",
      inputSchema: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 80 } }, required: ["query"], additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: function (input) {
        if (!input || typeof input.query !== "string" || !input.query.trim()) throw new TypeError("query must be a non-empty string");
        window.NEO_MOVIES.search(input.query.trim());
        return { query: input.query.trim(), status: "visible" };
      }
    });
    register({
      name: "open_neo_movies_title", title: "Open NEO Movies title",
      description: "Open the details panel for a title from the bundled NEO Movies catalog.",
      inputSchema: { type: "object", properties: { id: { type: "string", minLength: 1, maxLength: 80 } }, required: ["id"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: function (input) {
        if (!input || typeof input.id !== "string") throw new TypeError("id must be a string");
        var title = catalog.find(function (item) { return item.id === input.id; });
        if (!title) throw new Error("Title not found");
        openDetails(title);
        return { id: title.id, title: title.title, status: "opened" };
      }
    });
    window.addEventListener("pagehide", function () { lifecycle.abort(); }, { once: true });
  }

  function init() {
    renderProfileGate(false);
    $("[data-manage-profiles]").addEventListener("click", function () { renderProfileGate(this.dataset.managing !== "true"); });
    $("[data-profile-save]").addEventListener("click", saveProfile);
    $("[data-avatar-upload]").addEventListener("change", function () {
      var file = this.files && this.files[0];
      var form = $("[data-profile-form]");
      var note = $("[data-avatar-upload-note]");
      note.textContent = "Preparing picture…";
      resizeProfilePicture(file).then(function (value) {
        form.elements.avatar.value = "custom";
        form.elements.avatarData.value = value;
        $$("[data-avatar]", $("[data-profile-picture-picker]")).forEach(function (choice) { choice.setAttribute("aria-pressed", "false"); });
        note.textContent = "Uploaded picture selected. It stays on this device.";
      }).catch(function (error) { note.textContent = error.message || "The picture could not be used."; });
      this.value = "";
    });
    $("[data-profile-menu]").addEventListener("click", function () {
      $("[data-app-shell]").hidden = true; $("[data-profile-gate]").hidden = false; renderProfileGate(false);
    });
    $$("[data-view]").forEach(function (button) {
      button.addEventListener("click", function () { if (button.tagName !== "A") renderView(button.dataset.view); });
    });
    $("[data-hero-play]").addEventListener("click", function () { activeTitle && activeTitle.type === "manga" ? openReader(activeTitle) : playTitle(activeTitle); });
    $("[data-hero-details]").addEventListener("click", function () { openDetails(activeTitle); });
    $("[data-open-settings]").addEventListener("click", function () { $("[data-settings-dialog]").showModal(); });
    $("[data-data-saver]").addEventListener("change", function () { var value = getSettings(); value.dataSaver = this.checked; save(settingsKey, value); syncSettings(); });
    $("[data-autoplay-preview]").addEventListener("change", function () { var value = getSettings(); value.autoplayPreview = this.checked; save(settingsKey, value); renderView(currentView); });
    var searchTimer = 0;
    $("[data-search]").addEventListener("input", function () {
      var value = this.value;
      clearTimeout(searchTimer);
      searchTimer = window.setTimeout(function () { showSearch(value); }, 160);
    });
    $("[data-close-player]").addEventListener("click", closePlayer);
    $("[data-video-upload]").addEventListener("click", function () { $("[data-video-file]").click(); });
    $("[data-video-file]").addEventListener("change", function () {
      addVideoUpload(this.files && this.files[0]);
      this.value = "";
    });
    $("[data-retry-player]").addEventListener("click", retryPlayer);
    $("[data-player-official]").addEventListener("click", function () { if (activeTitle) openOfficial(activeTitle); });
    $("[data-fullscreen-player]").addEventListener("click", function () {
      var player = $("[data-player]");
      var video = $("[data-video]");
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      else if (player.requestFullscreen) player.requestFullscreen().catch(function () {});
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });
    $("[data-close-reader]").addEventListener("click", closeReader);
    $("[data-pip]").addEventListener("click", function () {
      var video = $("[data-video]");
      if (window.parent !== window) {
        setShellPopout(!shellPopoutActive);
        return;
      }
      if (video.disablePictureInPicture) return;
      if (document.pictureInPictureElement && document.exitPictureInPicture) document.exitPictureInPicture().catch(function () {});
      else if (document.pictureInPictureEnabled && video.requestPictureInPicture) video.requestPictureInPicture().catch(function () {});
      else if (video.webkitSetPresentationMode) {
        try { video.webkitSetPresentationMode(video.webkitPresentationMode === "picture-in-picture" ? "inline" : "picture-in-picture"); } catch (_error) {}
      }
    });
    function syncPictureInPicture() {
      var video = $("[data-video]");
      $("[data-pip]").setAttribute("aria-pressed", String(shellPopoutActive || document.pictureInPictureElement === video || video.webkitPresentationMode === "picture-in-picture"));
    }
    ["enterpictureinpicture", "leavepictureinpicture", "webkitpresentationmodechanged"].forEach(function (type) {
      $("[data-video]").addEventListener(type, syncPictureInPicture);
    });
    $("[data-restore-popout]").addEventListener("click", function () { setShellPopout(false); });
    $("[data-popout-drag]").addEventListener("pointerdown", beginPopoutDrag);
    $("[data-video]").addEventListener("timeupdate", function () { persistProgress(false); }, { passive: true });
    $("[data-video]").addEventListener("ended", function () { persistProgress(true); });
    $("[data-video]").addEventListener("error", handlePlaybackError);
    $("[data-details-dialog]").addEventListener("click", function (event) { if (event.target === this) this.close(); });
    window.addEventListener("beforeunload", function () { persistProgress(true); });
    window.addEventListener("pagehide", function () {
      uploadedTitles.forEach(function (title) { if (/^blob:/i.test(title.media || "")) URL.revokeObjectURL(title.media); });
    }, { once: true });
    window.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (!$("[data-reader]").hidden) closeReader();
      else if (!$("[data-player]").hidden) closePlayer();
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden && !shellPopoutActive && !$("[data-player]").hidden) $("[data-video]").pause(); });
    var id = "";
    try { id = sessionStorage.getItem(sessionKey) || ""; } catch (error) {}
    var selected = profiles().find(function (profile) { return profile.id === id; });
    if (selected) chooseProfile(selected);
    syncSettings();
    window.NEO_MOVIES = Object.freeze({
      showProfiles: function () { $("[data-app-shell]").hidden = true; $("[data-profile-gate]").hidden = false; renderProfileGate(false); },
      openTitle: function (id) { var title = catalog.find(function (item) { return item.id === id; }); if (title) openDetails(title); },
      search: function (query) { $("[data-search]").value = String(query || ""); showSearch(query); },
      openView: renderView
    });
    window.NEO_STREAM = window.NEO_MOVIES;
    registerWebTools();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
