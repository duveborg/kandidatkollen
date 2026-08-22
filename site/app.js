/* Kandidatkollen — klientlogik.
 *
 * Sajten är helt statisk. Sökindexet (alla riksdagskandidater 2026) laddas
 * en gång; varje ledamotsprofil hämtas som en egen liten JSON-fil.
 */

"use strict";

var app = document.getElementById("app");

var state = {
  index: null,   // {falt, rader}
  stats: null,
  rum: null,     // laddas först när blockkartan öppnas
  radkarta: null // normaliserat namn -> rad
};

var PARTINAMN = {
  S: "Socialdemokraterna", M: "Moderaterna", SD: "Sverigedemokraterna",
  C: "Centerpartiet", V: "Vänsterpartiet", KD: "Kristdemokraterna",
  MP: "Miljöpartiet", L: "Liberalerna", "-": "Politiskt obunden"
};

// ------------------------------------------------------------- hjälpare

function h(tag, attrs, kids) {
  var el = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function (k) {
      if (k === "class") el.className = attrs[k];
      else if (k === "html") el.innerHTML = attrs[k];
      else if (k === "text") el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
  }
  (kids || []).forEach(function (kid) {
    if (kid == null) return;
    el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  });
  return el;
}

function norm(s) {
  return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}

function pct(x, dec) {
  if (x == null) return "–";
  return (x * 100).toFixed(dec == null ? 1 : dec).replace(".", ",") + " %";
}

function num(n) {
  return (n == null ? "–" : n.toLocaleString("sv-SE"));
}

function kortdatum(s) {
  return (s || "").slice(0, 10);
}

function partiKlass(p) {
  return "p-" + (p || "-");
}

/* Valkretsnamn är långa och upprepas i listor; korta ner dem läsbart.
   "Stockholms kommun" blir "Stockholm", inte "Stockholms". */
function kortValkrets(v) {
  v = v || "";
  var m = v.match(/^(.*?)s kommun$/);
  if (m) return m[1];              // Stockholms kommun -> Stockholm
  if (/ kommun$/.test(v)) return v.replace(/ kommun$/, "");
  return v
    .replace(/^Västra Götalands läns /, "V Götaland ")
    .replace(/^Skåne läns /, "Skåne ")
    .replace(/ läns /g, " ");
}

/* Skillnad i procentenheter — inte procent, vilket är två olika saker. */
function enheter(x, dec) {
  if (x == null) return "–";
  return (x * 100).toFixed(dec == null ? 1 : dec).replace(".", ",") +
    " procentenheter";
}

function setTitel(t) {
  document.title = t ? t + " — Kandidatkollen" : "Kandidatkollen";
}

// ------------------------------------------------------------- data

function hamta(url) {
  return fetch(url).then(function (r) {
    if (!r.ok) throw new Error(url + ": " + r.status);
    return r.json();
  });
}

function laddaBas() {
  if (state.index) return Promise.resolve();
  return Promise.all([
    hamta("data/index.json"),
    hamta("data/stats.json")
  ]).then(function (res) {
    state.index = res[0];
    state.stats = res[1];
    // rader: [namn, parti, ordning, valkrets, kandidaturer, ledamot_id, narvaro_pct]
    state.radkarta = {};
    state.index.rader.forEach(function (r) {
      state.radkarta[norm(r[0])] = r;
    });
  });
}

// ------------------------------------------------------------- sök

function sokTraffar(q, max) {
  var nq = norm(q);
  if (nq.length < 2) return [];
  var prefix = [];
  var ord = [];
  var ovrigt = [];
  var rader = state.index.rader;

  for (var i = 0; i < rader.length; i++) {
    var r = rader[i];
    var n = norm(r[0]);
    var pos = n.indexOf(nq);
    if (pos === -1) continue;
    if (pos === 0) prefix.push(r);
    else if (n[pos - 1] === " ") ord.push(r);
    else ovrigt.push(r);
    if (prefix.length >= max) break;
  }

  // Ledamöter först inom varje grupp: de är det sökaren oftast letar efter.
  function ordna(a) {
    return a.sort(function (x, y) {
      if (!!y[5] !== !!x[5]) return y[5] ? 1 : -1;
      return x[0].localeCompare(y[0], "sv");
    });
  }
  return ordna(prefix).concat(ordna(ord), ordna(ovrigt)).slice(0, max);
}

function traffRad(r) {
  var namn = r[0], parti = r[1], ordning = r[2], vk = r[3];
  var kandidaturer = r[4], ledamotId = r[5], narvaro = r[6];

  var metabitar = [];
  if (parti) metabitar.push(PARTINAMN[parti] || parti);
  if (ordning) metabitar.push("plats " + ordning);
  if (vk) metabitar.push(kortValkrets(vk));

  // Tre fall: sittande som kandiderar igen, sittande som lämnar, och ny
  // kandidat utan riksdagshistorik.
  var hoger;
  if (ledamotId && kandidaturer) {
    hoger = h("span", { class: "pill har", text: "satt i riksdagen" });
  } else if (ledamotId) {
    hoger = h("span", { class: "pill", text: "lämnar riksdagen" });
  } else {
    hoger = h("span", { class: "pill utan", text: "ny kandidat" });
  }

  return h("li", { class: partiKlass(parti) }, [
    h("a", { href: ledamotId ? "#/ledamot/" + ledamotId : "#/kandidat/" + encodeURIComponent(namn) }, [
      h("span", { class: "flagga" }),
      h("span", {}, [
        h("div", { class: "traff-namn", text: namn }),
        h("div", { class: "traff-meta", text: metabitar.join(" · ") })
      ]),
      h("span", { class: "traff-hoger" }, [
        hoger,
        ledamotId && narvaro
          ? h("div", { class: "traff-meta", text: "röstade i " + narvaro + " % av voteringarna" })
          : null
      ])
    ])
  ]);
}

// ------------------------------------------------------------- vy: start

function visaStart() {
  setTitel("");
  var s = state.stats;

  var input = h("input", {
    type: "search",
    placeholder: "Skriv ett namn från din valsedel …",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Sök kandidat"
  });

  var lista = h("ul", { class: "traffar" });
  var status = h("p", { class: "hint" });

  function uppdatera() {
    var q = input.value;
    lista.innerHTML = "";
    if (norm(q).length < 2) {
      status.textContent = state.index.rader.length.toLocaleString("sv-SE") +
        " kandidater och ledamöter. Skriv minst två bokstäver.";
      return;
    }
    var traffar = sokTraffar(q, 40);
    status.textContent = traffar.length
      ? traffar.length + (traffar.length === 40 ? "+ träffar" : " träffar")
      : "Inga träffar på ”" + q + "”.";
    traffar.forEach(function (r) { lista.appendChild(traffRad(r)); });
  }

  input.addEventListener("input", uppdatera);
  uppdatera();   // fyll statusraden redan innan något skrivits

  app.innerHTML = "";
  app.appendChild(h("h1", { text: "Vad gjorde de i riksdagen?" }));
  app.appendChild(h("p", {
    class: "lede",
    text: "Valkompasser visar vad partierna säger. Den här sajten visar vad " +
          "ledamöterna gjorde: hur de röstade i riksdagens " +
          num(s.antal_voteringar) + " voteringar under mandatperioden, hur " +
          "ofta de gick mot sitt eget parti, och om de kandiderar igen."
  }));
  app.appendChild(h("div", { class: "sok" }, [input]));
  app.appendChild(status);
  app.appendChild(lista);

  app.appendChild(h("h2", { text: "Riksdagen 2022–2026 i siffror" }));
  app.appendChild(h("div", { class: "kort" }, [
    h("div", { class: "siffror" }, [
      siffra(num(s.antal_voteringar), "voteringar"),
      siffra(num(s.antal_roster), "avlagda röster"),
      siffra(num(s.antal_knappa), "avgjordes med ≤10 rösters marginal"),
      siffra(num(s.lamnar_riksdagen.length), "ledamöter kandiderar inte igen")
    ])
  ]));

  app.appendChild(h("p", { class: "hint" }, [
    h("a", { href: "#/lamnar", text: "Se vilka som lämnar riksdagen →" })
  ]));

  app.appendChild(h("h2", { text: "Hela riksdagen på en karta" }));
  app.appendChild(h("div", { class: "kort" }, [
    h("p", {
      text: "Blockkartan visar samma voteringar från motsatt håll: vilka " +
            "partier som röstar ihop, hur blocken rört sig under " +
            "mandatperioden, och hur riksdagen ser ut när man låter " +
            "röstningen själv rita kartan utan någon inmatad " +
            "höger-vänster-skala."
    }),
    h("p", { class: "hint" }, [
      h("a", { href: "#/block", text: "Öppna blockkartan →" })
    ])
  ]));

  input.focus();
}

function siffra(tal, etikett, jmf) {
  return h("div", { class: "siffra" }, [
    h("span", { class: "tal", text: tal }),
    h("span", { class: "etikett", text: etikett }),
    jmf ? h("span", { class: "jmf", text: jmf }) : null
  ]);
}

/* "5 h 12 min" — talartid läses inte som 312 minuter.
   Medianen kan vara halvtalig när antalet ledamöter är jämnt, så avrunda. */
function timmar(min) {
  if (min == null) return "–";
  min = Math.round(min);
  if (min < 60) return min + " min";
  return Math.floor(min / 60) + " h " + (min % 60) + " min";
}

function medianJmf(varde, median, enhet) {
  if (median == null || varde == null) return null;
  if (median === 0) return "median 0";
  var kvot = varde / median;
  var ord = kvot >= 1.15 ? "över" : (kvot <= 0.85 ? "under" : "kring");
  return "median " + (enhet === "tid" ? timmar(median) : num(median)) +
    " — " + ord + " snittet";
}

// ------------------------------------------------------------- vy: ledamot

function visaLedamot(id) {
  app.innerHTML = "<p class='loading'>Hämtar ledamot …</p>";
  hamta("data/ledamot/" + id + ".json").then(function (l) {
    setTitel(l.namn);
    var r = l.rostning;
    var s = state.stats;
    var k = l.kandidatur_2026;

    app.innerHTML = "";

    // rubrik
    var bild = h("img", {
      class: "portratt", src: l.bild, alt: "", loading: "lazy"
    });
    bild.addEventListener("error", function () { bild.style.display = "none"; });

    var undertitel = [PARTINAMN[l.parti] || l.parti];
    if (l.valkrets) undertitel.push(l.valkrets);
    if (l.fodd) undertitel.push("född " + l.fodd);

    var taggar = h("div", { class: "taggar" });
    (l.rollkontext || []).forEach(function (x) {
      taggar.appendChild(h("span", { class: "pill", text: x.roll }));
    });
    (l.organ || []).forEach(function (o) {
      taggar.appendChild(h("span", { class: "pill", text: o.namn }));
    });
    (l.utskott || []).slice(0, 3).forEach(function (u) {
      taggar.appendChild(h("span", { class: "pill", text: u.namn }));
    });

    app.appendChild(h("div", { class: "profil-topp " + partiKlass(l.parti) }, [
      bild,
      h("div", {}, [
        h("h1", { text: l.namn }),
        h("div", { class: "undertitel", text: undertitel.join(" · ") }),
        taggar
      ])
    ]));

    // valsedeln 2026
    app.appendChild(kandidaturKort(l, k));

    // röstning
    app.appendChild(h("h2", { text: "Röstning i kammaren" }));
    var kort = h("div", { class: "kort" }, [
      h("div", { class: "siffror" }, [
        siffra(pct(r.narvaro, 1), "av voteringarna röstade hen"),
        siffra(num(r.deltog), "avlagda röster"),
        siffra(num(r.rostade_inte), "gånger utan röst"),
        siffra(num(r.avstar), "gånger avstod")
      ])
    ]);

    // jämförelse mot medianen
    if (r.narvaro != null && s.narvaro_median) {
      var diff = r.narvaro - s.narvaro_median;
      kort.appendChild(h("div", { class: "mot-median " + partiKlass(l.parti) }, [
        h("div", { class: "stapel" }, [
          h("div", { class: "fyll", style: "width:" + (r.narvaro * 100).toFixed(1) + "%" }),
          h("div", { class: "median", style: "left:" + (s.narvaro_median * 100).toFixed(1) + "%" })
        ]),
        h("div", {
          class: "stapel-text",
          text: "Strecket är riksdagens median, " + pct(s.narvaro_median, 1) +
                ". " + l.namn.split(" ")[0] + " ligger " +
                (Math.abs(diff) < 0.005 ? "i nivå med den"
                  : enheter(Math.abs(diff), 1) + (diff > 0 ? " över" : " under")) + "."
        })
      ]));
    }

    // Kvittningsnoten visas när siffran ligger påtagligt under medianen,
    // eftersom det är då den riskerar att läsas som skolk.
    if (r.narvaro != null && r.narvaro < s.narvaro_median - 0.05) {
      kort.appendChild(h("div", { class: "not" }, [
        h("strong", { text: "Låg röstandel betyder inte frånvaro från arbetet. " }),
        document.createTextNode(
          "Riksdagen har ett kvittningssystem: partier kommer överens om att " +
          "lika många ledamöter avstår på båda sidor, så att en frånvaro inte " +
          "ändrar utfallet. Partiledare, gruppledare och ledamöter med " +
          "utrikesuppdrag kvittas ut i stor omfattning. Riksdagen publicerar " +
          "inte skälet till en utebliven röst, så siffran säger vad som hände " +
          "— inte varför."
        )
      ]));
    }
    app.appendChild(kort);

    if (l.ledighet && l.ledighet.length) {
      app.appendChild(h("p", {
        class: "hint",
        text: "Beviljad ledighet under perioden: " + l.ledighet.map(function (p) {
          return p[0] + " – " + p[1];
        }).join(", ") + ". Under ledigheten satt en ersättare på platsen och " +
          "de voteringarna räknas därför inte som hens."
      }));
    }

    // avvikelser
    app.appendChild(h("h2", { text: "Röstade mot sitt eget parti" }));
    if (!l.avvikelser.matbar) {
      app.appendChild(h("p", {
        class: "tom",
        text: l.namn + " är politiskt obunden och har inget parti att avvika " +
              "från, så måttet går inte att beräkna."
      }));
    } else {
      app.appendChild(h("div", { class: "kort" }, [
        h("div", { class: "siffror" }, [
          siffra(num(l.avvikelser.antal), "gånger mot partilinjen"),
          siffra(pct(l.avvikelser.andel, 2), "av sina röster"),
          siffra(pct((s.per_parti[l.parti] || {}).avvikelse_median, 2),
                 "median i " + l.parti)
        ])
      ]));
      if (l.avvikelser.exempel.length) {
        app.appendChild(h("h3", { text: "Senaste tillfällena" }));
        var ul = h("ul", { class: "rader" });
        l.avvikelser.exempel.forEach(function (a) {
          ul.appendChild(h("li", {}, [
            h("span", { class: "datum", text: kortdatum(a.datum) }),
            h("span", { class: "amne", text: a.rubrik }),
            h("span", {
              class: "utfall",
              text: a.min_rost + " · partiet " + a.partiets_rost.toLowerCase()
            })
          ]));
        });
        app.appendChild(ul);
      } else {
        app.appendChild(h("p", { class: "tom", text: "Inga avvikelser med känt ämne." }));
      }
    }

    // sagt och gjort
    if (l.aktivitet) app.appendChild(aktivitetsAvsnitt(l, s));

    // uppdrag
    if (l.utskott && l.utskott.length) {
      app.appendChild(h("h2", { text: "Uppdrag i riksdagen" }));
      var uu = h("ul", { class: "rader" });
      l.utskott.forEach(function (u) {
        uu.appendChild(h("li", {}, [
          h("span", { class: "amne", text: u.namn }),
          h("span", { class: "utfall", text: u.roll + " · " + u.from + " – " + u.tom })
        ]));
      });
      app.appendChild(uu);
    }

    app.appendChild(h("p", { class: "hint" }, [
      h("a", {
        href: "https://www.riksdagen.se/sv/ledamoter-och-partier/ledamot/_" + l.id,
        rel: "noopener", target: "_blank",
        text: "Ledamotens sida på riksdagen.se →"
      })
    ]));
    app.appendChild(h("a", { class: "tillbaka", href: "#/", text: "← Ny sökning" }));

  }).catch(function (e) {
    app.innerHTML = "";
    app.appendChild(h("h1", { text: "Kunde inte hämta ledamoten" }));
    app.appendChild(h("p", { class: "tom", text: String(e.message || e) }));
    app.appendChild(h("a", { class: "tillbaka", href: "#/", text: "← Tillbaka" }));
  });
}

/* "Sagt och gjort": talarstol, motioner, frågor — plus vilka sakområden
   ledamoten faktiskt ägnat sig åt, räknat på utskottet varje anförande och
   motion hör till. */
function aktivitetsAvsnitt(l, s) {
  var a = l.aktivitet;
  var m = s.aktivitet_median || {};
  var frag = h("div", {});

  frag.appendChild(h("h2", { text: "Sagt och gjort" }));
  frag.appendChild(h("div", { class: "kort" }, [
    h("div", { class: "siffror" }, [
      siffra(num(a.anforanden), "anföranden i kammaren",
             medianJmf(a.anforanden, m.anforanden)),
      siffra(timmar(a.talartid_min), "i talarstolen",
             medianJmf(a.talartid_min, m.talartid_min, "tid")),
      siffra(num(a.motioner), "motioner hen står bakom",
             medianJmf(a.motioner, m.motioner)),
      siffra(num(a.fragor), "skriftliga frågor",
             medianJmf(a.fragor, m.fragor)),
      siffra(num(a.interpellationer), "interpellationer",
             medianJmf(a.interpellationer, m.interpellationer))
    ])
  ]));

  frag.appendChild(h("p", {
    class: "hint",
    text: "En motion kan ha upp till 26 undertecknare och datan anger inte " +
          "vem som är huvudförfattare, så talet visar motioner hen står " +
          "bakom — inte nödvändigtvis har skrivit."
  }));

  if (a.amnen && a.amnen.length) {
    frag.appendChild(h("h3", { text: "Sakområden" }));
    frag.appendChild(h("p", {
      class: "hint",
      text: "Vilket utskott ledamotens anföranden och motioner hör till. " +
            "Det säger vad hen ägnat sin tid åt, inte vilken ståndpunkt hen tagit."
    }));
    var max = a.amnen[0].antal || 1;
    var ul = h("ul", { class: "amnen " + partiKlass(l.parti) });
    a.amnen.forEach(function (x) {
      ul.appendChild(h("li", {}, [
        h("span", { class: "amne-namn", title: x.namn, text: x.namn }),
        h("span", { class: "spar" }, [
          h("span", { style: "width:" + Math.round(x.antal / max * 100) + "%" })
        ]),
        h("span", { class: "amne-tal", text: num(x.antal) })
      ]));
    });
    frag.appendChild(ul);
  }

  if (a.rubriker && a.rubriker.length) {
    frag.appendChild(h("h3", { text: "Debatter hen återkommit till" }));
    var ru = h("ul", { class: "rader" });
    a.rubriker.forEach(function (x) {
      ru.appendChild(h("li", {}, [
        h("span", { class: "amne", text: x.rubrik }),
        h("span", { class: "utfall", text: x.antal + " anföranden" })
      ]));
    });
    frag.appendChild(ru);
  }

  return frag;
}

function kandidaturKort(l, k) {
  if (!k) {
    return h("div", { class: "kort valsedel " + partiKlass(l.parti) }, [
      h("h3", { text: "Valsedeln 2026" }),
      h("p", {
        class: "tom",
        text: l.namn + " står inte på någon valsedel i riksdagsvalet 2026 och " +
              "lämnar därmed riksdagen. Matchningen sker på namn, så en " +
              "stavningsskillnad mot Valmyndighetens listor kan i sällsynta " +
              "fall ge det här utfallet felaktigt."
      })
    ]);
  }
  var plats = [];
  if (k.ordning) plats.push("plats " + k.ordning);
  plats.push(k.hela_landet ? "listan gäller hela landet" : k.valkretsar.join(", "));

  var noder = [
    h("h3", { text: "Valsedeln 2026" }),
    h("p", {
      class: "undertitel",
      text: (k.parti_full || k.parti) + " — " + plats.join(", ")
    })
  ];
  if (k.uppgift) {
    noder.push(h("p", { class: "hint", text: "På valsedeln: ”" + k.uppgift + "”" }));
  }
  if (k.partibyte) {
    noder.push(h("div", { class: "not" }, [
      h("strong", { text: "Byte av parti. " }),
      document.createTextNode(
        "Hen röstade senast för " + (PARTINAMN[l.parti] || l.parti) +
        " i riksdagen men kandiderar nu för " + (k.parti_full || k.parti) + "."
      )
    ]));
  }
  if (!k.sakert_namn) {
    noder.push(h("p", {
      class: "hint",
      text: "Namnet förekommer på " + k.antal_kandidaturer + " kandidaturer och " +
            "ingen av dem är i hens riksdagsparti. Det kan vara en annan person " +
            "med samma namn."
    }));
  }
  return h("div", { class: "kort valsedel " + partiKlass(l.parti) }, noder);
}

// ------------------------------------------------------------- vy: kandidat utan riksdagshistorik

function visaKandidat(namn) {
  setTitel(namn);
  var r = state.radkarta[norm(namn)];
  app.innerHTML = "";
  if (!r) {
    app.appendChild(h("h1", { text: "Okänd kandidat" }));
    app.appendChild(h("a", { class: "tillbaka", href: "#/", text: "← Tillbaka" }));
    return;
  }
  var parti = r[1];
  app.appendChild(h("div", { class: "profil-topp " + partiKlass(parti) }, [
    h("div", {}, [
      h("h1", { text: r[0] }),
      h("div", {
        class: "undertitel",
        text: [PARTINAMN[parti] || parti, r[2] ? "plats " + r[2] : null, r[3]]
          .filter(Boolean).join(" · ")
      })
    ])
  ]));
  app.appendChild(h("div", { class: "kort" }, [
    h("p", {
      text: r[0] + " har inte suttit i riksdagen under mandatperioden " +
            "2022–2026, så det finns ingen voteringshistorik att visa här."
    }),
    h("p", {
      class: "hint",
      text: "Sajten täcker bara riksdagen. En kandidat kan ha gedigen " +
            "erfarenhet från kommun eller region utan att synas här."
    })
  ]));
  app.appendChild(h("a", { class: "tillbaka", href: "#/", text: "← Ny sökning" }));
}

// ------------------------------------------------------------- vy: lämnar

function visaLamnar() {
  setTitel("Lämnar riksdagen");
  var lista = state.stats.lamnar_riksdagen;
  app.innerHTML = "";
  app.appendChild(h("h1", { text: "Lämnar riksdagen" }));
  app.appendChild(h("p", {
    class: "lede",
    text: lista.length + " ledamöter som röstat under mandatperioden står inte " +
          "på någon valsedel i riksdagsvalet 2026. Matchningen sker på namn " +
          "mot Valmyndighetens listor."
  }));

  var perParti = {};
  lista.forEach(function (x) {
    (perParti[x.parti] = perParti[x.parti] || []).push(x);
  });

  Object.keys(perParti).sort().forEach(function (p) {
    app.appendChild(h("h2", { text: (PARTINAMN[p] || p) + " (" + perParti[p].length + ")" }));
    var ul = h("ul", { class: "traffar" });
    perParti[p].forEach(function (x) {
      ul.appendChild(h("li", { class: partiKlass(p) }, [
        h("a", { href: "#/ledamot/" + x.id }, [
          h("span", { class: "flagga" }),
          h("span", {}, [
            h("div", { class: "traff-namn", text: x.namn }),
            h("div", {
              class: "traff-meta",
              text: [kortValkrets(x.valkrets), x.fodd ? "född " + x.fodd : null]
                .filter(Boolean).join(" · ")
            })
          ]),
          h("span", { class: "traff-hoger" }, [
            h("div", { class: "traff-meta", text: "röstade i " + pct(x.narvaro, 0) })
          ])
        ])
      ]));
    });
    app.appendChild(ul);
  });
  app.appendChild(h("a", { class: "tillbaka", href: "#/", text: "← Till sökningen" }));
}

// ------------------------------------------------------------- vy: blockkartan

var PARTIFARG = {
  S: "#e8112d", M: "#52bdec", SD: "#ddd000", C: "#009933",
  V: "#af0000", KD: "#2b3a8f", MP: "#83cf39", L: "#006ab3", "-": "#8a8a8a"
};

/* Skjuter isär etiketter som annars skriver över varandra. Partier med
   identisk enighet — M, KD och L ligger alla på 100 % — hamnar på samma
   y-koordinat, och då blir texten oläslig.

   Bara etiketter som ligger nära även i x knuffas, annars skulle två
   etiketter i motsatta hörn av ett spridningsdiagram flytta varandra utan
   att ha överlappat. xNara sätts till diagrammets bredd när alla etiketter
   står i samma kolumn, som i tidslinjen. */
function undvikKollision(etiketter, minAvstand, xNara) {
  var dy = minAvstand || 14;
  var dx = xNara == null ? 44 : xNara;
  etiketter.sort(function (a, b) { return a.y - b.y; });
  for (var i = 1; i < etiketter.length; i++) {
    for (var j = i - 1; j >= 0; j--) {
      if (Math.abs(etiketter[i].x - etiketter[j].x) > dx) continue;
      var gap = etiketter[i].y - etiketter[j].y;
      if (gap < dy) etiketter[i].y = etiketter[j].y + dy;
      break;
    }
  }
  return etiketter;
}

function svgEl(tag, attrs, kids) {
  var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.keys(attrs || {}).forEach(function (k) {
    if (k === "text") el.textContent = attrs[k];
    else el.setAttribute(k, attrs[k]);
  });
  (kids || []).forEach(function (kid) { if (kid) el.appendChild(kid); });
  return el;
}

function enighetVarde(s, a, b) {
  var v = s.partienighet[a + "-" + b];
  return v == null ? s.partienighet[b + "-" + a] : v;
}

/* Värmekarta över hela mandatperioden. Skalan går från 25 % till 100 %,
   eftersom inget partipar ligger under det -- en skala från noll skulle
   trycka ihop alla skillnader som faktiskt finns. */
function enighetsHeat(s) {
  var partier = s.partier;
  var tabell = svgHeatTabell(partier, function (a, b) {
    return enighetVarde(s, a, b);
  });
  return h("div", { class: "tabell-scroll" }, [tabell]);
}

function svgHeatTabell(partier, hamtaVarde) {
  var tabell = h("table", { class: "data heat" });
  var huvud = h("tr", {}, [h("th", { class: "hoek" })]);
  partier.forEach(function (p) { huvud.appendChild(h("th", { text: p })); });
  tabell.appendChild(h("thead", {}, [huvud]));

  var tbody = h("tbody");
  partier.forEach(function (a) {
    var tr = h("tr", {}, [h("th", { class: "rad", text: a })]);
    partier.forEach(function (b) {
      if (a === b) {
        tr.appendChild(h("td", { class: "h" }, [h("span", { text: "—" })]));
        return;
      }
      var v = hamtaVarde(a, b);
      if (v == null) {
        tr.appendChild(h("td", { class: "h" }, [h("span", { text: "·" })]));
        return;
      }
      // 0.25–1.0 mappas till 0–1 och därefter till opacitet
      var t = Math.max(0, Math.min(1, (v - 0.25) / 0.75));
      var cell = h("span", { text: Math.round(v * 100) + "" });
      cell.style.background = "color-mix(in srgb, var(--accent) " +
        Math.round(t * 82) + "%, transparent)";
      if (t > 0.62) cell.style.color = "#fff";
      tr.appendChild(h("td", { class: "h", title: a + "–" + b }, [cell]));
    });
    tbody.appendChild(tr);
  });
  tabell.appendChild(tbody);
  return tabell;
}

/* Tidslinje: hur ett valt partis enighet med de sju övriga rört sig över
   mandatperiodens fyra riksmöten. */
function enighetsTidslinje(s) {
  var partier = s.partier;
  var rm = s.riksmoten.filter(function (r) { return s.enighet_per_rm[r]; });
  var valt = "M";

  var W = 720, H = 300, ML = 42, MR = 116, MT = 14, MB = 34;
  var innerW = W - ML - MR, innerH = H - MT - MB;

  var host = h("figure", { class: "diagram" });
  var valjare = h("div", { class: "valjare" });

  function xPos(i) {
    return ML + (rm.length === 1 ? innerW / 2 : i * innerW / (rm.length - 1));
  }
  function yPos(v) {
    return MT + innerH - (Math.max(0, Math.min(1, (v - 0.2) / 0.8)) * innerH);
  }

  function rita() {
    host.innerHTML = "";
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H,
                             role: "img",
                             "aria-label": "Enighet över tid för " + valt });

    // rutnät och y-etiketter, 20-100 %
    [0.2, 0.4, 0.6, 0.8, 1.0].forEach(function (v) {
      var y = yPos(v);
      svg.appendChild(svgEl("line", { class: "rutnat", x1: ML, x2: ML + innerW,
                                      y1: y, y2: y }));
      svg.appendChild(svgEl("text", { x: ML - 8, y: y + 4, "text-anchor": "end",
                                      text: Math.round(v * 100) + " %" }));
    });
    // x-etiketter
    rm.forEach(function (r, i) {
      svg.appendChild(svgEl("text", { x: xPos(i), y: H - 12,
                                      "text-anchor": "middle", text: r }));
    });

    // en linje per motpart
    var etiketter = [];
    partier.forEach(function (p) {
      if (p === valt) return;
      var pkt = rm.map(function (r, i) {
        var v = s.enighet_per_rm[r].enighet[valt + "-" + p];
        if (v == null) v = s.enighet_per_rm[r].enighet[p + "-" + valt];
        return v == null ? null : [xPos(i), yPos(v), v];
      });
      var giltiga = pkt.filter(Boolean);
      if (giltiga.length < 2) return;
      svg.appendChild(svgEl("path", {
        class: "linje",
        stroke: PARTIFARG[p] || "#888",
        d: giltiga.map(function (q, i) {
          return (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1);
        }).join(" ")
      }));
      giltiga.forEach(function (q) {
        svg.appendChild(svgEl("circle", { cx: q[0], cy: q[1], r: 3.5,
                                          fill: PARTIFARG[p] || "#888" }));
      });
      var sista = giltiga[giltiga.length - 1];
      etiketter.push({
        x: sista[0] + 9, y: sista[1] + 4, farg: PARTIFARG[p] || "#888",
        text: p + " " + Math.round(sista[2] * 100) + " %"
      });
    });

    // alla etiketter står i samma kolumn, så x-villkoret ska inte gälla
    undvikKollision(etiketter, 15, Infinity).forEach(function (e) {
      svg.appendChild(svgEl("text", {
        class: "partietikett", x: e.x, y: e.y, fill: e.farg, text: e.text
      }));
    });

    svg.appendChild(svgEl("line", { class: "axel", x1: ML, x2: ML,
                                    y1: MT, y2: MT + innerH }));
    host.appendChild(svg);
    host.appendChild(h("figcaption", {
      text: "Andel voteringar per riksmöte där " + (PARTINAMN[valt] || valt) +
            " och det andra partiet landade på samma ståndpunkt."
    }));
  }

  partier.forEach(function (p) {
    var b = h("button", { type: "button", class: partiKlass(p),
                          "aria-pressed": p === valt ? "true" : "false",
                          text: p });
    b.addEventListener("click", function () {
      valt = p;
      Array.prototype.forEach.call(valjare.children, function (el) {
        el.setAttribute("aria-pressed", el.textContent === p ? "true" : "false");
      });
      rita();
    });
    valjare.appendChild(b);
  });

  rita();
  return h("div", {}, [valjare, host]);
}

/* Spridningsdiagram över det politiska rummet. Punkterna är ledamöter,
   färgade efter parti; texten är partiets mittpunkt. */
function politisktRum(rum) {
  var W = 720, H = 520, M = 34;
  var pts = rum.ledamoter;
  var xs = pts.map(function (p) { return p.x; });
  var ys = pts.map(function (p) { return p.y; });
  var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
  var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  var pad = 0.08;
  x0 -= (x1 - x0) * pad; x1 += (x1 - x0) * pad;
  y0 -= (y1 - y0) * pad; y1 += (y1 - y0) * pad;

  function sx(v) { return M + (v - x0) / (x1 - x0) * (W - 2 * M); }
  function sy(v) { return H - M - (v - y0) / (y1 - y0) * (H - 2 * M); }

  var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
    "aria-label": "Ledamöterna placerade efter sitt röstmönster" });

  // nollaxlar som orienteringshjälp
  svg.appendChild(svgEl("line", { class: "rutnat", x1: sx(0), x2: sx(0),
                                  y1: M, y2: H - M }));
  svg.appendChild(svgEl("line", { class: "rutnat", x1: M, x2: W - M,
                                  y1: sy(0), y2: sy(0) }));

  pts.forEach(function (p) {
    var c = svgEl("circle", {
      class: "punkt", cx: sx(p.x).toFixed(1), cy: sy(p.y).toFixed(1), r: 4.2,
      fill: PARTIFARG[p.parti] || "#888"
    });
    c.appendChild(svgEl("title", { text: p.namn + " (" + p.parti + ")" }));
    svg.appendChild(c);
  });

  // partiernas mittpunkter, som etiketter. M, KD och L ligger tätt i
  // regeringsklungan, så etiketterna behöver skiljas åt.
  var grupp = {};
  pts.forEach(function (p) { (grupp[p.parti] = grupp[p.parti] || []).push(p); });
  var etiketter = [];
  Object.keys(grupp).forEach(function (parti) {
    var g = grupp[parti];
    if (g.length < 3) return;
    etiketter.push({
      x: sx(median(g.map(function (p) { return p.x; }))),
      y: sy(median(g.map(function (p) { return p.y; }))) + 4,
      farg: PARTIFARG[parti] || "#888", text: parti
    });
  });
  undvikKollision(etiketter, 16).forEach(function (e) {
    svg.appendChild(svgEl("text", {
      class: "partietikett", x: e.x, y: e.y, "text-anchor": "middle",
      fill: e.farg, text: e.text
    }));
  });

  svg.appendChild(svgEl("text", {
    class: "axeltitel", x: W - M, y: H - 10, "text-anchor": "end",
    text: "Dimension 1 — " + pct(rum.varians[0], 0) + " av variationen"
  }));
  svg.appendChild(svgEl("text", {
    class: "axeltitel", x: 12, y: 18,
    text: "Dimension 2 — " + pct(rum.varians[1], 0)
  }));

  var legend = h("div", { class: "legend" });
  Object.keys(grupp).sort().forEach(function (p) {
    var sp = h("span", { class: partiKlass(p) }, [
      h("i"), document.createTextNode((PARTINAMN[p] || p) + " (" + grupp[p].length + ")")
    ]);
    legend.appendChild(sp);
  });

  return h("figure", { class: "diagram" }, [
    svg,
    h("figcaption", {
      text: "Varje punkt är en ledamot, placerad efter hur hen röstat i " +
            num(rum.antal_voteringar) + " voteringar. Axlarna är inte " +
            "förutbestämda: de är de två riktningar där ledamöterna skiljer " +
            "sig mest. Håll över en punkt för namn."
    }),
    legend
  ]);
}

function median(xs) {
  xs = xs.slice().sort(function (a, b) { return a - b; });
  var n = xs.length;
  if (!n) return 0;
  return n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2;
}

function visaBlock() {
  setTitel("Blockkartan");
  var s = state.stats;
  app.innerHTML = "<p class='loading'>Beräknar kartan …</p>";

  var p = state.rum ? Promise.resolve(state.rum)
                    : hamta("data/rum.json").then(function (r) {
                        state.rum = r; return r;
                      });

  p.then(function (rum) {
    app.innerHTML = "";
    app.appendChild(h("h1", { text: "Blockkartan" }));
    app.appendChild(h("p", {
      class: "lede",
      text: "Samma " + num(s.antal_voteringar) + " voteringar, sedda från " +
            "riksdagen som helhet i stället för från en enskild ledamot: " +
            "vilka partier som röstar ihop, hur det förändrats under " +
            "mandatperioden, och hur riksdagen ser ut när man låter " +
            "röstningen själv rita kartan."
    }));

    app.appendChild(h("h2", { text: "Riksdagens politiska rum" }));
    app.appendChild(h("p", {
      class: "hint",
      text: "Ingen höger-vänster-skala är matad in. Metoden får bara veta hur " +
            "varje ledamot röstat och letar de mönster som förklarar mest av " +
            "skillnaderna. Att partierna hamnar i sammanhängande klungor är " +
            "alltså ett resultat, inte en förutsättning."
    }));
    app.appendChild(politisktRum(rum));
    app.appendChild(h("div", { class: "not" }, [
      h("strong", { text: "Axlarna har ingen inbyggd betydelse. " }),
      document.createTextNode(
        "Dimension 1 skiljer i praktiken regeringsunderlaget från " +
        "oppositionen, och dimension 2 lyfter ut V och MP från övriga. Men " +
        "det är en tolkning i efterhand, och tecknet på en axel är " +
        "godtyckligt. Avstånd mellan punkter är meningsfulla; riktningen " +
        "höger eller vänster i bilden är inte det."
      )
    ]));
    if (rum.uteslutna && rum.uteslutna.length) {
      app.appendChild(h("p", {
        class: "hint",
        text: "Utebliven röst räknas som 0, samma värde som Avstår, vilket " +
              "drar en ledamot som röstar sällan mot mitten. Därför krävs " +
              "minst " + pct(rum.min_deltagande, 0) + " deltagande för att " +
              "platsas i diagrammet. Uteslutna: " +
              rum.uteslutna.map(function (u) {
                return u.namn + " (" + pct(u.narvaro, 0) + ")";
              }).join(", ") + "."
      }));
    }

    app.appendChild(h("h2", { text: "Hur ofta röstade partierna lika?" }));
    app.appendChild(h("p", {
      class: "hint",
      text: "Andel av voteringarna där två partier landade på samma " +
            "ståndpunkt, hela mandatperioden. Måttet har en känd skevhet — " +
            "se Om siffrorna."
    }));
    app.appendChild(enighetsHeat(s));

    app.appendChild(h("h2", { text: "Blocken över tid" }));
    app.appendChild(h("p", {
      class: "hint",
      text: "Välj ett parti för att se hur dess enighet med de övriga rört " +
            "sig mellan riksmötena."
    }));
    app.appendChild(enighetsTidslinje(s));

    app.appendChild(h("h2", { text: "De knappaste voteringarna" }));
    app.appendChild(h("p", {
      class: "hint",
      text: num(s.antal_knappa) + " av " + num(s.antal_voteringar) +
            " voteringar avgjordes med tio rösters marginal eller mindre. " +
            "Här är de tjugo tätaste."
    }));
    var ul = h("ul", { class: "rader" });
    s.knappa_voteringar.slice(0, 20).forEach(function (v) {
      ul.appendChild(h("li", {}, [
        h("span", { class: "datum", text: kortdatum(v.datum) }),
        h("span", { class: "amne" }, [
          document.createTextNode(v.rubrik || v.bet + " punkt " + v.punkt),
          v.motforslag
            ? h("div", { class: "traff-meta", text: "motförslag från " + v.motforslag })
            : null
        ]),
        h("span", {
          class: "utfall",
          text: v.ja + "–" + v.nej + (v.avstar ? " (" + v.avstar + " avstod)" : "")
        })
      ]));
    });
    app.appendChild(ul);

    app.appendChild(h("a", { class: "tillbaka", href: "#/", text: "← Till sökningen" }));
  }).catch(function (e) {
    app.innerHTML = "";
    app.appendChild(h("h1", { text: "Kunde inte bygga blockkartan" }));
    app.appendChild(h("p", { class: "tom", text: String(e.message || e) }));
    app.appendChild(h("a", { class: "tillbaka", href: "#/", text: "← Tillbaka" }));
  });
}

// ------------------------------------------------------------- vy: om

function visaOm() {
  setTitel("Om siffrorna");
  var s = state.stats;
  app.innerHTML = "";
  app.appendChild(h("h1", { text: "Om siffrorna" }));
  app.appendChild(h("div", { class: "prosa" }, [
    h("p", {
      text: "Sajten bygger på öppna data från Sveriges riksdag och " +
            "Valmyndigheten. Ingen data är egenhändigt insamlad och inga " +
            "bedömningar av politiskt innehåll görs. Nedan står exakt hur " +
            "varje tal räknas fram, inklusive det som måttet inte klarar."
    }),

    h("h2", { text: "Vad som räknas" }),
    h("p", {
      text: "Underlaget är riksdagens " + num(s.antal_voteringar) + " voteringar " +
            "mellan " + s.period[0] + " och " + s.period[1] + ", tillsammans " +
            num(s.antal_roster) + " avlagda röster. Endast voteringar som rör " +
            "sakfrågan ingår; procedurvoteringar om motivering är uteslutna."
    }),

    h("h2", { text: "Röstandel, inte närvaro" }),
    h("p", {
      text: "Varje votering i riksdagens data innehåller exakt en rad per " +
            "mandat — 349 rader, vilket stämmer för samtliga voteringar i " +
            "perioden. En ledamot som är tjänstledig finns alltså inte i " +
            "underlaget; hens ersättare står där i stället. Därför behöver " +
            "vi inte justera nämnaren, och en utebliven röst gäller alltid en " +
            "tjänstgörande ledamot."
    }),
    h("p", {
      text: "Men siffran mäter röster, inte arbete. Riksdagen har ett " +
            "kvittningssystem där partierna avtalar om att lika många " +
            "ledamöter avstår på båda sidor, så att frånvaro inte ändrar " +
            "utfallet. Partiledare och gruppledare kvittas ut i stor " +
            "omfattning, och riksdagen publicerar inte skälet till en enskild " +
            "utebliven röst. Därför visar sajten medianen (" +
            pct(s.narvaro_median, 1) + " bland de " + s.antal_heltid +
            " ledamöter som satt större delen av perioden) intill varje " +
            "siffra, och ingen topplista över lägst röstandel."
    }),

    h("h2", { text: "Avvikelse från partilinjen" }),
    h("p", {
      text: "Partiets linje i en votering är den vanligaste ståndpunkten " +
            "bland partiets röstande ledamöter, med minst tre röstande. En " +
            "avvikelse kräver att ledamoten själv röstade — en utebliven röst " +
            "räknas inte som avvikelse. Politiskt obundna ledamöter har ingen " +
            "partilinje och får därför inget värde alls."
    }),
    h("p", {
      text: "Svensk partidisciplin är hård: medianledamoten avviker i långt " +
            "under en procent av sina röster. Ett tal på ett par procent är " +
            "därför anmärkningsvärt högt, inte lågt."
    }),

    h("h2", { text: "Sagt och gjort" }),
    h("p", {
      text: "Anföranden, motioner, skriftliga frågor och interpellationer " +
            "kommer från riksdagens sagt-och-gjort-data. Skriftliga frågor " +
            "och interpellationer finns där i två roller: den ledamot som " +
            "frågar och det statsråd som svarar. Bara frågeställaren räknas, " +
            "annars skulle frågorna tillskrivas ministern."
    }),
    h("p", {
      text: "En motion kan ha upp till 26 undertecknare, och datan anger inte " +
            "vem som är huvudförfattare. Talet visar därför motioner ledamoten " +
            "står bakom, inte nödvändigtvis har skrivit. Ett högt tal kan " +
            "betyda mycket eget arbete eller flitigt medundertecknande — datan " +
            "skiljer dem inte."
    }),
    h("p", {
      text: "Sakområdena räknas på vilket utskott varje anförande och motion " +
            "hör till. Det är ett mått på var ledamoten lagt sin tid, inte på " +
            "vilken ståndpunkt hen tagit eller hur mycket hen påverkat. " +
            "Frågor och interpellationer saknar utskottskoppling i datan och " +
            "ingår inte i sakområdena."
    }),

    h("h2", { text: "Enighetsmatrisen" }),
    h("p", {
      text: "Talen visar andelen voteringar där två partier landade på samma " +
            "ståndpunkt. Måttet har en systematisk skevhet: de flesta " +
            "voteringar handlar om ett enskilt partis reservation, och då " +
            "röstar det partiet ja till sitt eget förslag medan andra " +
            "oppositionspartier avstår. Ett stort oppositionsparti kan därför " +
            "framstå som ungefär lika oenigt med alla. Läs matrisen som en " +
            "grov blockkarta, inte som ett mått på politisk närhet."
    }),

    h("h2", { text: "Det politiska rummet" }),
    h("p", {
      text: "Kartan på Blockkartan bygger på en principalkomponentanalys. Vi " +
            "ställer upp en matris med en rad per ledamot och en kolumn per " +
            "votering — Ja blir +1, Nej blir −1, Avstår och utebliven röst " +
            "blir 0 — centrerar varje votering och tar de två riktningar som " +
            "förklarar mest av skillnaderna mellan ledamöterna. Ingen " +
            "höger-vänster-skala matas in. Att partierna hamnar i " +
            "sammanhängande klungor är alltså ett resultat."
    }),
    h("p", {
      text: "Två saker begränsar tolkningen. Axlarnas tecken är godtyckligt: " +
            "det är avstånden mellan punkter som betyder något, inte om en " +
            "ledamot står till höger eller vänster i bilden. Och eftersom " +
            "utebliven röst kodas som 0 dras en ledamot som röstar sällan mot " +
            "mitten oavsett hur hen röstar när hen väl gör det. Därför krävs " +
            "både lång tjänstgöring och minst 60 procents deltagande för att " +
            "vara med, och de uteslutna namnges under diagrammet."
    }),

    h("h2", { text: "Kopplingen till valsedeln" }),
    h("p", {
      text: "Kandidatlistorna kommer från Valmyndigheten och matchas mot " +
            "riksdagens ledamöter på namn. Det ger fel i två riktningar: två " +
            "personer med samma namn kan slås samman, och en ledamot vars " +
            "namn stavas olika i de två källorna kan felaktigt framstå som " +
            "att hen inte kandiderar. Profilsidan flaggar de fall där " +
            "matchningen är osäker. Kontrollera alltid mot valsedeln."
    }),

    h("h2", { text: "Vad sajten inte visar" }),
    h("ul", {}, [
      h("li", { text: "Kommun- och regionpolitik. Bara riksdagen ingår." }),
      h("li", { text: "Utskottsarbete, förhandlingar och motionsskrivande — det som ofta utgör huvuddelen av en ledamots påverkan." }),
      h("li", { text: "Vad en votering handlade om i sak. Rubrikerna kommer från utskottens egna formuleringar." }),
      h("li", { text: "Nya kandidater. Den som inte suttit i riksdagen har ingen historik här, vilket inte säger något om lämplighet." })
    ]),

    h("h2", { text: "Källor" }),
    h("ul", {}, [
      h("li", {}, [h("a", { href: "https://data.riksdagen.se/", rel: "noopener", text: "data.riksdagen.se" }),
                   document.createTextNode(" — voteringar, ledamöter, uppdrag, utskottsförslag samt sagt och gjort.")]),
      h("li", {}, [h("a", { href: "https://www.val.se/valresultat-och-statistik/statistik-och-data/radata-val-2026", rel: "noopener", text: "val.se, rådata val 2026" }),
                   document.createTextNode(" — kandidatlistor, uppdaterade varje timme.")])
    ])
  ]));
  app.appendChild(h("a", { class: "tillbaka", href: "#/", text: "← Till sökningen" }));
}

// ------------------------------------------------------------- router

function router() {
  var hash = location.hash.replace(/^#/, "") || "/";
  var delar = hash.split("/").filter(Boolean);
  window.scrollTo(0, 0);

  if (delar[0] === "ledamot" && delar[1]) return visaLedamot(delar[1]);
  if (delar[0] === "kandidat" && delar[1]) return visaKandidat(decodeURIComponent(delar[1]));
  if (delar[0] === "block") return visaBlock();
  if (delar[0] === "lamnar") return visaLamnar();
  if (delar[0] === "om") return visaOm();
  return visaStart();
}

laddaBas().then(function () {
  var f = document.getElementById("byggd");
  if (f) {
    f.textContent = "Underlag: riksdagens voteringar " +
      state.stats.riksmoten.join(", ") + ". " +
      state.stats.antal_ledamoter + " ledamöter, " +
      state.index.rader.length.toLocaleString("sv-SE") +
      " sökbara kandidater och ledamöter.";
  }
  window.addEventListener("hashchange", router);
  router();
}).catch(function (e) {
  app.innerHTML = "";
  app.appendChild(h("h1", { text: "Kunde inte ladda valdata" }));
  app.appendChild(h("p", { class: "tom", text: String(e.message || e) }));
  app.appendChild(h("p", { class: "hint", text: "Kör build/fetch.py och build/build.py och servera site/ över http." }));
});
