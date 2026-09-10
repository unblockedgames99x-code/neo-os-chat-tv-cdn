(function () {
  "use strict";
  var samples = [
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm",
    "https://media.w3.org/2010/05/sintel/trailer.mp4",
    "https://media.w3.org/2010/05/bunny/trailer.mp4",
    "https://media.w3.org/2010/05/video/movie_300.mp4",
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4"
  ];
  var titles = [
    ["open-horizons","Open Horizons","movie",2026,"Adventure",8.7,"A pilot follows a signal past the edge of every known map.","horizon",0,"PG"],
    ["signal-at-dawn","Signal at Dawn","movie",2025,"Science Fiction",8.4,"A quiet coastal town wakes to a message sent from tomorrow.","signal",4,"PG-13"],
    ["last-archive","The Last Archive","series",2026,"Mystery",8.9,"Every memory is catalogued. One file refuses to stay erased.","archive",1,"TV-14"],
    ["between-worlds","Between Worlds","movie",2024,"Drama",7.9,"Two strangers discover the same city exists in two different years.","worlds",5,"PG-13"],
    ["deep-current","Deep Current","series",2025,"Thriller",8.2,"An ocean lab hears something moving beneath the silent zone.","current",1,"TV-14"],
    ["neon-harbor","Neon Harbor","movie",2026,"Crime",8.1,"A courier has one night to cross a city that never switches off.","harbor",2,"PG-13"],
    ["northbound","Northbound","series",2023,"Adventure",8.0,"A found family turns a broken train into a road home.","north",0,"TV-PG"],
    ["ember-city","Ember City","movie",2025,"Fantasy",8.6,"The last lightkeeper guards a flame that remembers every promise.","ember",4,"PG"],
    ["parallel","Parallel","series",2026,"Science Fiction",9.0,"Five versions of one detective chase the same impossible suspect.","parallel",5,"TV-14"],
    ["silent-orbit","Silent Orbit","movie",2024,"Science Fiction",8.3,"A repair crew finds an abandoned station that is still transmitting.","orbit",3,"PG-13"],
    ["glasshouse","Glasshouse","series",2025,"Drama",7.8,"A perfect family home starts replaying conversations that never happened.","glass",1,"TV-14"],
    ["long-winter","The Long Winter","movie",2022,"Drama",8.5,"A mountain radio host becomes the only voice for miles.","winter",0,"PG"],
    ["continuum","Continuum","series",2026,"Science Fiction",8.8,"A physicist receives weekly calls from herself ten years ahead.","continuum",4,"TV-14"],
    ["wildlight","Wildlight","movie",2025,"Family",8.4,"Three friends follow a glowing fox into a forest that changes with music.","wildlight",0,"PG"],
    ["afterimage","Afterimage","series",2024,"Mystery",8.1,"A photographer sees clues in pictures taken one day in the future.","afterimage",5,"TV-14"],
    ["paper-moons","Paper Moons","movie",2023,"Romance",7.7,"Two makers rebuild an old planetarium and find a forgotten love story.","moons",2,"PG"],
    ["zero-hour","Zero Hour","movie",2026,"Action",8.0,"A rescue team has sixty minutes before an entire city loses gravity.","zero",3,"PG-13"],
    ["quiet-giants","Quiet Giants","series",2025,"Documentary",9.1,"A close look at the forests growing back in unexpected places.","giants",0,"TV-G"],
    ["redline","Redline","movie",2024,"Action",7.9,"An engineer enters a solar race to save the machine she designed.","redline",2,"PG-13"],
    ["small-things","The Shape of Small Things","series",2023,"Comedy",8.0,"Neighbors solve tiny mysteries with unnecessarily elaborate plans.","small",3,"TV-PG"]
  ];
  window.NEO_STREAM_CATALOG = titles.map(function (item, index) {
    var seed = item[7];
    return {
      id:item[0], title:item[1], type:item[2], year:item[3], genre:item[4], rating:item[5],
      description:item[6], maturity:item[9], featured:index < 6,
      poster:"https://picsum.photos/seed/neo-stream-" + seed + "/560/840",
      backdrop:"https://picsum.photos/seed/neo-cinema-" + seed + "/1600/900",
      media:samples[item[8] % samples.length], openSample:true
    };
  });
})();
