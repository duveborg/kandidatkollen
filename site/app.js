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

  app.appendChild(h("h2", { text: "Hur ofta röstade partierna lika?" }));
  app.appendChild(h("p", {
    class: "hint",
    text: "Andel av voteringarna där två partier landade på samma ståndpunkt. " +
          "Läs den som en grov karta över blocken, inte som ett exakt mått — " +
          "se Om siffrorna."
  }));
  app.appendChild(enighetsTabell(s));

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

function enighetsTabell(s) {
  var partier = s.partier;
  var tabell = h("table", { class: "data" });
  var thead = h("tr", {}, [h("th", { text: "" })]);
  partier.forEach(function (p) { thead.appendChild(h("th", { text: p })); });
  tabell.appendChild(h("thead", {}, [thead]));

  var tbody = h("tbody");
  partier.forEach(function (a) {
    var tr = h("tr", {}, [h("th", { text: a })]);
    partier.forEach(function (b) {
      if (a === b) {
        tr.appendChild(h("td", { class: "num", text: "—" }));
        return;
      }
      var v = s.partienighet[a + "-" + b];
      if (v == null) v = s.partienighet[b + "-" + a];
      tr.appendChild(h("td", {
        class: "num",
        text: v == null ? "·" : Math.round(v * 100) + ""
      }));
    });
    tbody.appendChild(tr);
  });
  tabell.appendChild(tbody);
  return h("div", { class: "tabell-scroll" }, [tabell]);
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
