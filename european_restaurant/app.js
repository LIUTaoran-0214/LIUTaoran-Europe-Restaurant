const endpoint = "http://127.0.0.1:3030/European_restaurants/query";
const namedGraph = "http://ltr.european-restaurants.org";

// Initialize the map
const map = L.map("map").setView([48, -1], 6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

const layer = L.layerGroup().addTo(map);

// SPARQL queries for statistics
const queryCuisineTop = `
PREFIX : <http://ltr.european-restaurants.org/>

SELECT ?cuisine (COUNT(?r) AS ?n)
WHERE {
  ?r a :Restaurant ; 
       :cuisines ?cuisine .
}
GROUP BY ?cuisine
ORDER BY DESC(?n)
LIMIT 15
`;

const queryRating = `
PREFIX : <http://ltr.european-restaurants.org/>

SELECT ?bucket (COUNT(?r) AS ?n)
WHERE {
  ?r a :Restaurant ; 
       :avgRating ?a .
  BIND(
    IF(?a < 2.5, "<2.5",
    IF(?a < 3.5, "2.5-3.5",
    IF(?a < 4.5, "3.5-4.5", ">=4.5"))) AS ?bucket
  )
}
GROUP BY ?bucket
ORDER BY ?bucket
`;

const queryMealTop = `
PREFIX : <http://ltr.european-restaurants.org/>

SELECT ?meal (COUNT(DISTINCT ?r) AS ?n)
WHERE {
  ?r a :Restaurant ;
     :meals ?meal .
}
GROUP BY ?meal
ORDER BY DESC(?n)
LIMIT 10
`;

function drawBarH(divId, data, labelKey, valueKey, w, barH, leftPad) {
  document.getElementById(divId).innerHTML = "";

  if (!data || data.length === 0) {
    document.getElementById(divId).textContent = "No data";
    return;
  }

  const h = data.length * (barH + 4) + 6;
  const maxV = d3.max(data, d => d[valueKey]) || 1;

  const svg = d3.select("#" + divId).append("svg")
    .attr("width", w)
    .attr("height", h);

  // label
  svg.selectAll("text.label")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", 0)
    .attr("y", (d, i) => i * (barH + 4) + barH)
    .text(d => d[labelKey]);

  // bars
  svg.selectAll("rect")
    .data(data)
    .enter()
    .append("rect")
    .attr("x", leftPad)
    .attr("y", (d, i) => i * (barH + 4))
    .attr("height", barH)
    .attr("width", d => (d[valueKey] / maxV) * (w - leftPad - 50))
    .attr("fill", "#0066CC");

  // values
  svg.selectAll("text.val")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "val")
    .attr("x", w - 4)
    .attr("y", (d, i) => i * (barH + 4) + barH)
    .attr("text-anchor", "end")
    .text(d => d[valueKey]);
}

function loadCuisineTop() {
  d3sparql.query(endpoint, queryCuisineTop, function (json) {
    const data = json.results.bindings.map(b => ({
      cuisine: b.cuisine.value,
      n: parseInt(b.n.value, 10)
    }));
    drawBarH("graphCuisine", data, "cuisine", "n", 360, 12, 160);
  });
}

function loadRatingDist() {
  d3sparql.query(endpoint, queryRating, function (json) {
    const order = ["<2.5", "2.5-3.5", "3.5-4.5", ">=4.5"];
    const map = {};
    json.results.bindings.forEach(b => {
      map[b.bucket.value] = parseInt(b.n.value, 10);
    });

    const data = order.map(k => ({ bucket: k, n: map[k] || 0 }));
    drawBarH("graphRating", data, "bucket", "n", 280, 12, 110);
  });
}

function loadMealTop() {
  d3sparql.query(endpoint, queryMealTop, function (json) {
    const data = json.results.bindings.map(b => ({
      meal: b.meal.value,
      n: parseInt(b.n.value, 10)
    }));
    drawBarH("graphMeal", data, "meal", "n", 280, 12, 110);
  });
}

// SPARQL query to get restaurant coordinates
const queryMainBase = `
PREFIX : <http://ltr.european-restaurants.org/>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

SELECT ?r ?name ?address ?lat ?lon ?avgRating ?openHours ?keywords
       ?isGlutenFree ?isVeganOptions ?isVegetarianFriendly
       ?country ?city ?priceLevel
       ?averageCount ?excellentCount ?veryGoodCount ?poorCount ?terribleCount
       ?atmosphere ?service ?food ?value
       ?sameAs
WHERE {
  ?r a :Restaurant ;
       :restaurantName ?name ;
       :coordinate [ :latitude ?lat ; :longitude ?lon ] ;
       :address ?address ;
       :avgRating ?avgRating ;
       :isGlutenFree ?isGlutenFree ;
       :isVeganOptions ?isVeganOptions ;
       :isVegetarianFriendly ?isVegetarianFriendly ;
       :country ?country ;
       :city ?city ;
       :priceLevel ?priceLevel ;
       :reviewsComponents [
          :averageCount ?averageCount ;
          :excellentCount ?excellentCount ;
          :veryGoodCount ?veryGoodCount ;
          :poorCount ?poorCount ;
          :terribleCount ?terribleCount
       ] ;
       :scoreComponents [
          :atmosphereScore ?atmosphere ;
          :serviceScore ?service ;
          :foodScore ?food ;
          :valueScore ?value
       ] .
  OPTIONAL { ?r :originalOpenHours ?openHours . }
  OPTIONAL { ?r :keywords ?keywords . }
  OPTIONAL { ?r owl:sameAs ?sameAs . }
}
LIMIT 5000
`;

function querySelect(uris) {
  const values = uris.map(u => `(${u})`).join(" ");

  return `
PREFIX : <http://ltr.european-restaurants.org/>

SELECT ?r
       (GROUP_CONCAT(DISTINCT ?cuisine;  separator="||") AS ?cuisines)
       (GROUP_CONCAT(DISTINCT ?meal;     separator="||") AS ?meals)
       (GROUP_CONCAT(DISTINCT ?feature;  separator="||") AS ?features)
       (GROUP_CONCAT(DISTINCT ?award;    separator="||") AS ?awards)
WHERE {
  VALUES (?r) { ${values} }

  OPTIONAL { ?r :cuisines ?cuisine . }
  OPTIONAL { ?r :meals ?meal . }
  OPTIONAL { ?r :features ?feature . }
  OPTIONAL { ?r :awards ?award . }
}
GROUP BY ?r
`;
}

// SPARQL query for select panel
function loadSelectQuery(selectElement) {
  if (!selectElement) return;

  let querySelect = `
PREFIX : <http://ltr.european-restaurants.org/>

SELECT DISTINCT ?s
WHERE { 
  ?r a :Restaurant ;
       :${selectElement.dataset.prop} ?s .
}
ORDER BY ?s
`;

  d3sparql.query(endpoint, querySelect, function (json) {
    const values = json.results.bindings
      .map(b => b.s.value)
      .filter(v => v && v.trim().length > 0);

    setOptions(selectElement, values);
  });
}

// Helpers
function boolVal(x) {
  return String(x).toLowerCase() === "true";
}

// Set options for a select element
function setOptions(select, values) {
  if (!select) return;
  select.innerHTML = "";

  const optAll = document.createElement("option");
  optAll.value = "ALL";
  optAll.textContent = "All";
  select.appendChild(optAll);

  values.sort().forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function splitPipeList(s) {
  if (!s) return [];
  return String(s).split("||").map(x => x.trim()).filter(Boolean);
}

// UI elements
const isGlutenFree = document.getElementById("isGlutenFree");
const isVegan = document.getElementById("isVegan");
const isVegetarian = document.getElementById("isVegetarian");

const minRating = document.getElementById("minRating");
const minRatingVal = document.getElementById("minRatingVal");

minRatingVal.textContent = parseFloat(minRating.value).toFixed(1);
minRating.oninput = function () {
  minRatingVal.textContent = parseFloat(minRating.value).toFixed(1);
  refresh();
};

const selCountry = document.getElementById("selCountry");
const selCity = document.getElementById("selCity");
const selCuisine = document.getElementById("selCuisine");
const selMeal = document.getElementById("selMeal");
const selFeature = document.getElementById("selFeature");
const selPrice = document.getElementById("selPrice");
const selAward = document.getElementById("selAward");

const isChain = document.getElementById("isChain");
const inView = document.getElementById("inView");

document.getElementById("btnReset").onclick = function () {
  isGlutenFree.checked = false;
  isVegan.checked = false;
  isVegetarian.checked = false;

  minRating.value = 0;
  minRatingVal.textContent = "0.0";

  selCountry.value = "ALL";
  selCity.value = "ALL";
  selCuisine.value = "ALL";
  selMeal.value = "ALL";
  selFeature.value = "ALL";
  selPrice.value = "ALL";
  selAward.value = "ALL";

  isChain.checked = false;
  inView.checked = false;

  refresh();
};

// Bar chart for reviews components
function drawReviewsChart(divId, counts) {
  const w = 240, h = 70;
  const left = 90;
  const right = 50;

  const cats = [
    { k: "excellent", v: counts.excellent },
    { k: "veryGood", v: counts.veryGood },
    { k: "average", v: counts.average },
    { k: "poor", v: counts.poor },
    { k: "terrible", v: counts.terrible }
  ];

  const maxV = d3.max(cats, d => d.v) || 1;
  const barH = 12;

  const svg = d3.select("#" + divId).append("svg")
    .attr("width", w)
    .attr("height", h);

  svg.selectAll("rect")
    .data(cats)
    .enter()
    .append("rect")
    .attr("x", left)
    .attr("y", (d, i) => i * (barH + 2))
    .attr("width", d => (d.v / maxV) * (w - left - right))
    .attr("height", barH)
    .attr("fill", "#0066CC");

  svg.selectAll("text.label")
    .data(cats)
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", 0)
    .attr("y", (d, i) => i * (barH + 2) + 10)
    .text(d => d.k);

  svg.selectAll("text.val")
    .data(cats)
    .enter()
    .append("text")
    .attr("class", "val")
    .attr("x", w - 8)
    .attr("y", (d, i) => i * (barH + 2) + 10)
    .attr("text-anchor", "end")
    .text(d => d.v);
}

// Bar chart for Score components
function drawScoreChart(divId, counts) {
  const w = 240, h = 70;
  const left = 90;
  const right = 50;

  const cats = [
    { k: "food", v: counts.food },
    { k: "service", v: counts.service },
    { k: "value", v: counts.value },
    { k: "atmosphere", v: counts.atmosphere },
  ];

  const maxV = 5;
  const barH = 12;

  const svg = d3.select("#" + divId).append("svg")
    .attr("width", w)
    .attr("height", h);

  svg.selectAll("rect")
    .data(cats)
    .enter()
    .append("rect")
    .attr("x", left)
    .attr("y", (d, i) => i * (barH + 2))
    .attr("width", d => (d.v / maxV) * (w - left - right))
    .attr("height", barH)
    .attr("fill", "#0066CC");

  svg.selectAll("text.label")
    .data(cats)
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", 0)
    .attr("y", (d, i) => i * (barH + 2) + 10)
    .text(d => d.k);

  svg.selectAll("text.val")
    .data(cats)
    .enter()
    .append("text")
    .attr("class", "val")
    .attr("x", w - 8)
    .attr("y", (d, i) => i * (barH + 2) + 10)
    .attr("text-anchor", "end")
    .text(d => d.v);
}

// Data
let DATA = []; // all restaurants
let loadSelect = false;

// Dot colors
function ratingColor(avg) {
  if (avg < 2.5) return "#D2042D";
  if (avg < 3.5) return "#FF4500";
  if (avg < 4.5) return "#318CE7";
  return "#9400D3";
}

// Load cuisines/meals/features for current selections
function loadSelections() {
  const needTags =
    (selCuisine && selCuisine.value !== "ALL") ||
    (selMeal && selMeal.value !== "ALL") ||
    (selFeature && selFeature.value !== "ALL") ||
    (selAward && selAward.value !== "ALL");

  if (!needTags) {
    refresh();
    return;
  }

  if (!DATA || DATA.length === 0) return;

  const allLoaded = DATA.every(d => d.loadSelectTag);
  if (allLoaded) {
    refresh();
    return;
  }

  if (loadSelect) return;
  loadSelect = true;

  const uris = DATA.map(d => `<${d.uri}>`);
  const q = querySelect(uris);

  d3sparql.query(endpoint, q, function (json) {
    const mapTags = new Map();

    json.results.bindings.forEach(b => {
      mapTags.set(b.r.value, {
        cuisines: splitPipeList(b.cuisines?.value),
        meals: splitPipeList(b.meals?.value),
        features: splitPipeList(b.features?.value),
        awards: splitPipeList(b.awards?.value)
      });
    });

    DATA.forEach(d => {
      const t = mapTags.get(d.uri);
      if (t) {
        d.cuisines = t.cuisines;
        d.meals = t.meals;
        d.features = t.features;
        d.awards = t.awards;
      } else {
        d.cuisines = [];
        d.meals = [];
        d.features = [];
        d.awards = [];
      }
      d.loadSelectTag = true;
    });

    loadSelect = false;
    refresh();
  });
}

// Refresh map based on filters
function refresh() {
  layer.clearLayers();

  const gluten = isGlutenFree.checked;
  const vegan = isVegan.checked;
  const vegetarian = isVegetarian.checked;

  const minRatingVal = parseFloat(minRating.value);
  
  const country = selCountry.value;
  const city = selCity.value;
  const price = selPrice.value;

  const cuisine = selCuisine.value;
  const meal    = selMeal.value;
  const feature = selFeature.value;
  const award = selAward.value;

  const bounds = inView.checked ? map.getBounds() : null;

  DATA.forEach((d, idx) => {
    // checkbox filters
    if (gluten && !d.isGlutenFree) return;
    if (vegan && !d.isVeganOptions) return;
    if (vegetarian && !d.isVegetarianFriendly) return;

    if (d.avgRating < minRatingVal) return;

    if (country !== "ALL" && d.country !== country) return;
    if (city !== "ALL" && d.city !== city) return;
    if (price !== "ALL" && d.priceLevel !== price) return;

    if (cuisine !== "ALL" && !d.cuisines.includes(cuisine)) return;
    if (meal    !== "ALL" && !d.meals.includes(meal)) return;
    if (feature !== "ALL" && !d.features.includes(feature)) return;
    if (award !== "ALL" && !d.awards.includes(award)) return;

    if (isChain.checked && !d.chain) return;
    if (inView.checked && bounds && !bounds.contains([d.lat, d.lon])) return;

    const c = ratingColor(d.avgRating);

    const circle = L.circle([d.lat, d.lon], {
      color: c,
      fillColor: c,
      fillOpacity: 1,
      radius: 500
    }).addTo(layer);

    const chartTipReviewsId = "chart_tip_" + idx;
    const chartTipScoreId = "chart_score_" + idx;
    const chartPopReviewsId = "chart_pop_" + idx;
    const chartPopScoreId = "chart_pop_score_" + idx;
      
    let linkHtml = "";
    if (d.chain && d.sameAs) {
      linkHtml =
        '<div class="meta">Wikidata: ' +
        '<a href="' + d.sameAs + '" target="_blank">' + d.sameAs + '</a>' +
        '</div>';
    }

    const keyWordsHtml = d.keywords ? ('<div class="meta">Keywords: ' + d.keywords + '</div>') : '';
    const openHoursHtml = d.openHours ? ('<div class="meta">Opening Hours: ' + d.openHours + '</div>') : '';

    const html =
    '<div class="rt-tip">' +
    '<div class="name">' + d.name + "</div>" +
    '<div class="addr">Address: ' + d.address + "</div>" +
    '<div class="meta">Average Rating: ' + d.avgRating + "</div>" +
    keyWordsHtml +
    openHoursHtml +
    linkHtml +
    '<div class="chartTitle">Reviews</div>' +
    '<div id="' + chartTipReviewsId + '"></div>' +
    '<div class="chartTitle">Scores</div>' +
    '<div id="' + chartTipScoreId + '"></div>' +
    "</div>";

    const htmlPop = html.replace(chartTipReviewsId, chartPopReviewsId)
                        .replace(chartTipScoreId, chartPopScoreId);

    circle.on("mouseover", function () {
      circle.bindTooltip(html, { direction: "top", opacity: 0.95, sticky: true }).openTooltip();

      setTimeout(function () {
        const el = document.getElementById(chartTipReviewsId);
        if (el) {
          el.innerHTML = "";
          drawReviewsChart(chartTipReviewsId, d.reviews);
        }

        const el2 = document.getElementById(chartTipScoreId);
        if (el2) {
          el2.innerHTML = "";
          drawScoreChart(chartTipScoreId, d.score);
        }
      }, 0);
    });

    circle.on("mouseout", function () {
      circle.closeTooltip();
    });

    circle.bindPopup(htmlPop, { maxWidth: 300 });

    circle.on("popupopen", function () {
      setTimeout(function () {
        const el = document.getElementById(chartPopReviewsId);
        if (el) {
          el.innerHTML = "";
          drawReviewsChart(chartPopReviewsId, d.reviews);
        }

        const el2 = document.getElementById(chartPopScoreId);
        if (el2) {
          el2.innerHTML = "";
          drawScoreChart(chartPopScoreId, d.score);
        }
      }, 0);
    });
  });
}

map.on("moveend zoomend", function () {
  if (inView.checked) refresh();
});

// Initialize selects and events
function initSelects() {
  [selCountry, selCity, selPrice, selCuisine, selMeal, selFeature, selAward].forEach(loadSelectQuery);
}

function initEvents() {
  [isGlutenFree, isVegan, isVegetarian, selCountry, selCity, selPrice, isChain, inView]
    .filter(x => !!x)
    .forEach(x => x.onchange = refresh);

  // cuisine/meal/feature/award
  [selCuisine, selMeal, selFeature, selAward]
    .filter(x => !!x)
    .forEach(x => x.onchange = loadSelections);
}

initSelects();
initEvents();

loadCuisineTop();
loadRatingDist();
loadMealTop();


// Load data and initialize
d3sparql.query(endpoint, queryMainBase, function (json) {
  DATA = json.results.bindings.map(b => {

    return {
      uri: b.r.value,
      name: b.name.value,
      address: b.address.value,
      lat: parseFloat(b.lat.value),
      lon: parseFloat(b.lon.value),
      avgRating: parseFloat(b.avgRating.value),
      openHours: b.openHours ? b.openHours.value : "",
      keywords: b.keywords ? b.keywords.value : "",

      isGlutenFree: boolVal(b.isGlutenFree.value),
      isVeganOptions: boolVal(b.isVeganOptions.value),
      isVegetarianFriendly: boolVal(b.isVegetarianFriendly.value),

      country: b.country.value,
      city: b.city.value,
      
      cuisines: [],
      meals: [],
      features: [],
      awards: [],
      loadSelectTag: false,

      priceLevel: b.priceLevel.value,

      sameAs: b.sameAs ? b.sameAs.value : "",
      chain: !!(b.sameAs && b.sameAs.value),

      reviews: {
        average: parseInt(b.averageCount.value, 10),
        excellent: parseInt(b.excellentCount.value, 10),
        veryGood: parseInt(b.veryGoodCount.value, 10),
        poor: parseInt(b.poorCount.value, 10),
        terrible: parseInt(b.terribleCount.value, 10)
      },

      score: {
        atmosphere: parseFloat(b.atmosphere.value),
        service: parseFloat(b.service.value),
        food: parseFloat(b.food.value),
        value: parseFloat(b.value.value)
      }
    };
  });

  refresh();
});
