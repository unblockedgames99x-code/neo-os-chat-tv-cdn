window.NEO_GAMES_CONFIG = Object.freeze({
  provider: "fern-lumin",
  sdk: "https://cdn.jsdelivr.net/gh/luminsdk/script@e1107337f26529e032d7873cbbb310d485d5d403/fonts.min.js",
  sdkFallbacks: [
    "https://fastly.jsdelivr.net/gh/luminsdk/script@e1107337f26529e032d7873cbbb310d485d5d403/fonts.min.js"
  ],
  pageSize: 48,
  imageBatchSize: 8,
  searchDelay: 300,
  providerLabel: "Fern + Aether + GN Math + StaticQuasar",
  aether: {
    base: "https://gn-local.booksforschool.online/",
    catalog: "offline/catalog.json",
    coverBase: "offline/covers/",
    gameBase: "offline/html/",
    expectedCount: 825
  },
  gnMath: {
    catalog: "https://cdn.jsdelivr.net/gh/freebuisness/assets@main/zones.json",
    coverBase: "https://cdn.jsdelivr.net/gh/freebuisness/covers@main/",
    gameBase: "https://cdn.jsdelivr.net/gh/freebuisness/html@main/",
    expectedCount: 836
  },
  staticQuasar: {
    catalog: "https://fastly.jsdelivr.net/gh/unblockedgames99x-code/neo-os-games-catalog-cdn@main/index.json",
    covers: "https://fastly.jsdelivr.net/gh/unblockedgames99x-code/neo-os-games-catalog-cdn@main/covers.json",
    expectedCount: 885
  }
});
