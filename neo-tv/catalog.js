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
  var screenCatalog = titles.map(function (item, index) {
    var seed = item[7];
    return {
      id:item[0], title:item[1], type:item[2], year:item[3], genre:item[4], rating:item[5],
      description:item[6], maturity:item[9], featured:index < 6,
      poster:"https://picsum.photos/seed/neo-stream-" + seed + "/560/840",
      backdrop:"https://picsum.photos/seed/neo-cinema-" + seed + "/1600/900",
      media:samples[item[8] % samples.length], openSample:true
    };
  });

  var anime = [
    ["skyline-runners","Skyline Runners",2026,"Action",8.8,"A delivery crew races across a floating city before its lights disappear.","anime-skyline",2,"TV-PG"],
    ["library-of-stars","Library of Stars",2025,"Fantasy",8.6,"An apprentice discovers that every borrowed book opens a path to another world.","anime-library",0,"TV-PG"],
    ["zero-gravity-club","Zero Gravity Club",2026,"Comedy",8.2,"Five students turn a broken training pod into the school's strangest clubroom.","anime-zero",4,"TV-PG"],
    ["echo-blade","Echo Blade",2024,"Adventure",8.5,"A musician's sword can replay the final sound made in any place.","anime-echo",3,"TV-14"],
    ["after-school-orbit","After School Orbit",2025,"Slice of Life",8.1,"Friends restore a rooftop observatory one constellation at a time.","anime-orbit",1,"TV-G"],
    ["paper-dragon","The Paper Dragon",2023,"Family",8.4,"A folded dragon leads two siblings through a city made from unfinished stories.","anime-dragon",5,"TV-G"]
  ].map(function (item, index) {
    return {
      id:item[0], title:item[1], type:"anime", year:item[2], genre:item[3], rating:item[4], description:item[5], maturity:item[8], featured:index < 4,
      poster:"https://picsum.photos/seed/neo-" + item[6] + "/560/840",
      backdrop:"https://picsum.photos/seed/neo-wide-" + item[6] + "/1600/900",
      media:samples[item[7] % samples.length], openSample:true
    };
  });

  function chapter(title, pages) { return { title:title, pages:pages }; }
  var manga = [
    {
      id:"midnight-platform", title:"Midnight Platform", type:"manga", year:2026, genre:"Mystery", rating:8.9, maturity:"TEEN",
      description:"The last train arrives at a platform that does not exist on any city map.", seed:"manga-platform",
      chapters:[
        chapter("Chapter 1 · The Thirteenth Platform", ["11:59 PM. Mina's station map showed twelve platforms. The sign ahead showed thirteen.","A train without lights rolled in. Every window reflected tomorrow morning.","The doors opened. A paper ticket waited on the empty seat, printed with Mina's name."]),
        chapter("Chapter 2 · A Stop Called Yesterday", ["The conductor punched a star into the ticket and warned her not to miss her return.","Outside, the city looked familiar—except every clock was running backward.","At the next stop, Mina saw herself waiting on the platform."])
      ]
    },
    {
      id:"garden-of-machines", title:"Garden of Machines", type:"manga", year:2025, genre:"Science Fiction", rating:8.7, maturity:"ALL",
      description:"A mechanic grows tiny robots from seeds left behind by her grandmother.", seed:"manga-garden",
      chapters:[chapter("Chapter 1 · Tin Seed", ["Aya planted the silver seed because the instruction card simply said: listen.","At sunrise, a mechanical sprout tapped a rhythm against the glass.","By noon, twelve tiny gardeners were repairing everything in the workshop—except the one thing Aya wanted fixed."])]
    },
    {
      id:"lantern-keeper", title:"The Lantern Keeper", type:"manga", year:2024, genre:"Fantasy", rating:8.5, maturity:"ALL",
      description:"Every lantern contains a memory. One of them remembers a future that has not happened.", seed:"manga-lantern",
      chapters:[chapter("Chapter 1 · Future Light", ["Ren catalogued each flame by the memory it carried: birthdays, storms, quiet goodbyes.","The new lantern showed the tower beneath a violet sky—and Ren standing where the tower should be.","Before he could call for help, the future flame whispered his name."])]
    },
    {
      id:"coffee-comet", title:"Coffee Comet", type:"manga", year:2026, genre:"Comedy", rating:8.2, maturity:"ALL",
      description:"A neighborhood café becomes an accidental rest stop for travelers from across the galaxy.", seed:"manga-coffee",
      chapters:[chapter("Chapter 1 · One Meteor Macchiato", ["The customer ordered in radio static, then paid with a coin warm enough to melt the tip jar.","Nori served the only drink on the menu that glowed back.","Five minutes later, a comet parked neatly beside the bicycle rack."])]
    },
    {
      id:"wind-at-noon", title:"Wind at Noon", type:"manga", year:2023, genre:"Adventure", rating:8.4, maturity:"ALL",
      description:"Two mapmakers follow a wind that draws new roads across blank paper.", seed:"manga-wind",
      chapters:[chapter("Chapter 1 · The Moving Road", ["At noon, the compass stopped pointing north and began pointing somewhere new.","Sora laid out the blank map. A blue line drew itself toward the mountains.","They packed before the ink was dry."])]
    },
    {
      id:"small-planet-club", title:"Small Planet Club", type:"manga", year:2025, genre:"Slice of Life", rating:8.3, maturity:"ALL",
      description:"Four friends care for a pocket-sized planet hidden in the school greenhouse.", seed:"manga-planet",
      chapters:[chapter("Chapter 1 · Weather in a Jar", ["The tiny planet rained whenever Jun forgot to water the ferns.","By lunch, a storm the size of a marble was circling the greenhouse sink.","The club agreed on rule number one: no homework near the atmosphere."])]
    }
  ].map(function (item) {
    item.poster = "https://picsum.photos/seed/neo-" + item.seed + "/560/840";
    item.backdrop = "https://picsum.photos/seed/neo-wide-" + item.seed + "/1600/900";
    delete item.seed;
    return item;
  });

  window.NEO_STREAM_CATALOG = screenCatalog.concat(anime, manga);
})();
