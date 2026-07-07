const CALGARY_TIME_ZONE = "America/Edmonton";
const AREA_CATEGORIES = new Set([
  "Downtown Calgary",
  "North Calgary",
  "North East Calgary",
  "North West Calgary",
  "Okotoks",
  "South Calgary",
  "South East Calgary",
  "South West Calgary",
]);

const MAP_REGIONS = [
  { key: "nw", label: "NW", title: "North West Calgary" },
  { key: "north", label: "N", title: "North Calgary" },
  { key: "ne", label: "NE", title: "North East Calgary" },
  { key: "downtown", label: "DT", title: "Downtown Calgary" },
  { key: "sw", label: "SW", title: "South West Calgary" },
  { key: "south", label: "S", title: "South Calgary" },
  { key: "se", label: "SE", title: "South East Calgary" },
  { key: "okotoks", label: "OK", title: "Okotoks" },
  { key: "unknown", label: "??", title: "Unplaced" },
];

const AREA_TO_MAP_KEY = new Map(MAP_REGIONS.map((region) => [region.title, region.key]));
const TEXT_ME_NUMBER = "+15878436226";

const state = {
  events: [],
  mapOpen: false,
  mapRegion: null,
  query: "",
  date: "all",
  area: "all",
  areaGroup: "all",
  selectedKey: null,
  selectedIndex: -1,
  sort: "soonest",
};

const LIST_BATCH_SIZE = 20;

const pager = {
  results: [],
  now: null,
  index: 0,
  sentinel: null,
  observer: null,
};

const chart = {
  dates: [],
};

const elements = {
  areaFilter: document.querySelector("#area-filter"),
  asciiMap: document.querySelector("#season-map"),
  clearFilters: document.querySelector("#clear-filters"),
  dateFilter: document.querySelector("#date-filter"),
  detail: document.querySelector("#event-detail"),
  emptyState: document.querySelector("#empty-state"),
  eventList: document.querySelector("#event-list"),
  pancakeChart: document.querySelector("#pancake-chart"),
  search: document.querySelector("#search"),
  seasonBody: document.querySelector("#season-body"),
  seasonMapToggle: document.querySelector("#season-map-toggle"),
  sortFilter: document.querySelector("#sort-filter"),
};

init();

async function init() {
  startClock();

  try {
    const response = await fetch("/all-events.json");

    if (!response.ok) {
      throw new Error(`Could not load events: ${response.status}`);
    }

    const events = await response.json();
    state.events = events.map(normalizeEvent).sort(compareByStart);

    populateFilters();
    bindEvents();
    render();
  } catch (error) {
    console.error(error);
    elements.emptyState.hidden = false;
    elements.emptyState.textContent = "error: could not load breakfasts.";
  }
}

// Clock
function startClock() {
  const el = document.querySelector("#t-clock");
  if (!el) return;
  const fmt = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: CALGARY_TIME_ZONE,
  });
  const tick = () => {
    el.textContent = fmt.format(new Date());
  };
  tick();
  setInterval(tick, 1000);
}

// Utilities
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Events
function bindEvents() {
  // Any printable keypress that isn't in a form element refocuses the search box,
  // making the whole page feel like a live search terminal.
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey || e.altKey)) {
      e.preventDefault();
      focusSearch();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      resetFilters();
      return;
    }

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      selectResult(state.selectedIndex + (e.key === "ArrowDown" ? 1 : -1));
      return;
    }

    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      selectAdjacentDate(e.key === "ArrowRight" ? 1 : -1);
      return;
    }

    if (
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      document.activeElement !== elements.search &&
      !["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(document.activeElement?.tagName)
    ) {
      elements.search.focus();
    }
  });

  elements.search.addEventListener(
    "input",
    debounce(() => {
      state.query = elements.search.value.trim().toLowerCase();
      render();
    }, 150),
  );

  elements.dateFilter.addEventListener("change", () => {
    state.date = elements.dateFilter.value;
    render();
  });

  elements.areaFilter.addEventListener("change", () => {
    state.area = elements.areaFilter.value;
    state.areaGroup = "all";
    state.mapRegion = AREA_TO_MAP_KEY.get(state.area) || null;
    syncAreaButtons();
    render();
  });

  elements.sortFilter.addEventListener("change", () => {
    state.sort = elements.sortFilter.value;
    render();
  });

  document.querySelectorAll("[data-area-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      selectAreaFilter(button.dataset.areaFilter || "all");
      render();
    });
  });

  elements.clearFilters.addEventListener("click", resetFilters);
  elements.seasonMapToggle.addEventListener("click", () => {
    setMapOpen(!state.mapOpen);
  });
}

function focusSearch() {
  elements.search.focus();
  elements.search.select();
}

function resetFilters() {
  state.query = "";
  state.date = "all";
  state.area = "all";
  state.areaGroup = "all";
  state.mapRegion = null;
  state.sort = "soonest";
  state.selectedKey = null;
  state.selectedIndex = -1;
  elements.search.value = "";
  elements.dateFilter.value = "all";
  elements.areaFilter.value = "all";
  elements.sortFilter.value = "soonest";
  syncAreaButtons();
  render();
  focusSearch();
}

function selectAreaFilter(area) {
  state.area = area;
  state.areaGroup = "all";
  state.mapRegion = AREA_TO_MAP_KEY.get(area) || null;
  state.selectedKey = null;
  state.selectedIndex = -1;
  elements.areaFilter.value = area;
  syncAreaButtons();
}

function syncAreaButtons() {
  document.querySelectorAll("[data-area-filter]").forEach((chip) => {
    chip.classList.toggle("is-active", chip.dataset.areaFilter === state.area);
  });
}

function setMapOpen(open) {
  state.mapOpen = open;
  elements.asciiMap.hidden = !open;
  elements.seasonBody.classList.toggle("is-map-closed", !open);
  elements.seasonMapToggle.classList.toggle("is-active", open);
  elements.seasonMapToggle.setAttribute("aria-expanded", open.toString());
}

function populateFilters() {
  const dates = unique(state.events.map((event) => event.date)).sort();
  const areas = unique(state.events.flatMap((event) => event.areas)).sort();

  elements.dateFilter.replaceChildren(
    option("all", "all dates"),
    ...dates.map((date) => option(date, formatDate(date))),
  );

  elements.areaFilter.replaceChildren(
    option("all", "all areas"),
    ...areas.map((area) => option(area, area)),
  );
}

// Render
function render() {
  const now = getCalgaryNow();
  const results = state.events.filter((event) => matchesFilters(event, now)).sort(getSort());
  const mapResults = state.events
    .filter((event) => matchesFilters(event, now, { ignoreArea: true }))
    .sort(getSort());
  const chartResults = state.events
    .filter((event) => matchesFilters(event, now, { ignoreDate: true }))
    .sort(getSort());
  syncSelection(results);

  elements.emptyState.hidden = results.length > 0;
  if (!results.length) {
    elements.emptyState.textContent = "no pancakes found - adjust filters and try again";
  }
  renderPancakeChart(chartResults, results);
  renderList(results, now);
  renderDetail(results[state.selectedIndex], now);
  renderPancakeMap(mapResults);
  syncChartActive();
}

function renderList(results, now) {
  pager.results = results;
  pager.now = now;
  pager.index = 0;
  elements.eventList.replaceChildren();

  if (!("IntersectionObserver" in window)) {
    appendBatch(results.length);
    return;
  }

  ensureSentinel();
  appendBatch(LIST_BATCH_SIZE);
  ensureSelectedRendered();
}

function appendBatch(size) {
  const { results, now, index } = pager;
  const end = Math.min(index + size, results.length);
  const fragment = document.createDocumentFragment();

  for (let i = index; i < end; i += 1) {
    fragment.append(renderEventCard(results[i], now, i));
  }

  elements.eventList.append(fragment);
  pager.index = end;

  const remaining = pager.index < results.length;
  if (pager.sentinel) {
    pager.sentinel.hidden = !remaining;
  }

  if (remaining && pager.observer && pager.sentinel) {
    pager.observer.unobserve(pager.sentinel);
    pager.observer.observe(pager.sentinel);
  }
}

function ensureSentinel() {
  if (pager.sentinel) {
    return;
  }

  const sentinel = document.createElement("div");
  sentinel.className = "list-sentinel";
  sentinel.setAttribute("aria-hidden", "true");
  elements.eventList.after(sentinel);

  pager.sentinel = sentinel;
  pager.observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting) && pager.index < pager.results.length) {
        appendBatch(LIST_BATCH_SIZE);
      }
    },
    { rootMargin: "600px 0px" },
  );
  pager.observer.observe(sentinel);
}

function ensureSelectedRendered() {
  while (state.selectedIndex >= pager.index && pager.index < pager.results.length) {
    appendBatch(LIST_BATCH_SIZE);
  }
}

function matchesFilters(event, now, options = {}) {
  if (state.query && !event.searchText.includes(state.query)) {
    return false;
  }

  if (!options.ignoreDate && state.date !== "all" && event.date !== state.date) {
    return false;
  }

  if (!options.ignoreArea) {
    if (state.area !== "all" && !event.areas.includes(state.area)) {
      return false;
    }

    if (state.areaGroup !== "all" && !matchesAreaGroup(event, state.areaGroup)) {
      return false;
    }
  }

  return true;
}

function matchesAreaGroup(event, group) {
  const areas = event.areas.join(" ").toLowerCase();

  if (group === "downtown") {
    return areas.includes("downtown");
  }

  if (group === "okotoks") {
    return areas.includes("okotoks");
  }

  if (group === "north") {
    return areas.includes("north");
  }

  if (group === "south") {
    return areas.includes("south");
  }

  if (group === "east") {
    return areas.includes("east");
  }

  if (group === "west") {
    return areas.includes("west");
  }

  return true;
}

function syncSelection(results) {
  if (!results.length) {
    state.selectedKey = null;
    state.selectedIndex = -1;
    return;
  }

  const index = results.findIndex((event) => eventKey(event) === state.selectedKey);
  state.selectedIndex = index >= 0 ? index : 0;
  state.selectedKey = eventKey(results[state.selectedIndex]);
}

function selectResult(index) {
  if (!pager.results.length) {
    return;
  }

  const nextIndex = Math.max(0, Math.min(index, pager.results.length - 1));
  const event = pager.results[nextIndex];
  state.selectedIndex = nextIndex;
  state.selectedKey = eventKey(event);

  while (pager.index <= nextIndex && pager.index < pager.results.length) {
    appendBatch(LIST_BATCH_SIZE);
  }

  for (const row of elements.eventList.querySelectorAll(".trow")) {
    const selected = row.dataset.key === state.selectedKey;
    row.classList.toggle("is-selected", selected);
    row.setAttribute("aria-selected", selected.toString());
    if (selected) {
      row.scrollIntoView({ block: "nearest" });
    }
  }

  renderDetail(event, pager.now);
}

function renderPancakeMap(events) {
  if (!elements.asciiMap) {
    return;
  }

  const byRegion = getMapRegions(events);
  const count = (key) => byRegion.get(key)?.length || 0;

  elements.asciiMap.replaceChildren(...renderAsciiCalgaryMap(count));
}

function getMapRegions(events) {
  const regions = new Map(MAP_REGIONS.map((region) => [region.key, []]));
  for (const event of events) {
    for (const key of getMapRegionKeys(event)) {
      regions.get(key).push(event);
    }
  }
  return regions;
}

function getMapRegionKeys(event) {
  const keys = unique(event.areas.map((area) => AREA_TO_MAP_KEY.get(area)));
  return keys.length ? keys : ["unknown"];
}

function formatMapCount(count) {
  return String(count).padStart(2, "0");
}

function getMapRegion(key) {
  return MAP_REGIONS.find((region) => region.key === key) || null;
}

function selectMapRegion(key) {
  const region = getMapRegion(key);
  if (!region || region.key === "unknown") {
    return;
  }

  selectAreaFilter(state.area === region.title ? "all" : region.title);
  render();
}

function renderAsciiCalgaryMap(count) {
  const fragment = document.createDocumentFragment();
  const edge = (text) => mapToken(text, "map-token--edge");
  const faint = (text) => mapToken(text, "map-token--faint");
  const river = (text) => mapToken(text, "map-token--river");
  const road = (text) => mapToken(text, "map-token--road");
  const title = (text) => mapToken(text, "map-token--title");
  const regionCell = (key, text, width) =>
    mapRegionToken(key, mapCellText(`${text} ${formatMapCount(count(key))}`, width, key));
  const regionFill = (key, width, text = "") => {
    const token = mapToken(mapCellText(text, width, key), `map-token--region-fill map-token--${key}`);
    token.classList.toggle("is-active", isMapRegionActive(key));
    return token;
  };
  const emptyCell = (width) => edge(" ".repeat(width));

  appendMapLine(fragment, [faint("        .:*+ "), title("CALGARY, ALBERTA"), faint(" / AREA GRID +*:.")]);
  appendMapLine(fragment, [edge("  +-----------------+--------+-----------------+")]);
  appendMapCells(fragment, [regionFill("nw", 17), regionFill("north", 8), regionFill("ne", 17)]);
  appendMapCells(fragment, [regionCell("nw", "NW", 17), regionCell("north", "N", 8), regionCell("ne", "NE", 17)]);
  appendMapCells(fragment, [regionFill("nw", 17), regionFill("north", 8), regionFill("ne", 17, "YYC")]);
  appendMapLine(fragment, [edge("  +-----------------+---"), river("~~~~~"), edge("+-----------------+")]);
  appendMapCells(fragment, [
    river(centerMapText("Bow River", 17)),
    regionCell("downtown", "DT", 8),
    emptyCell(17),
  ]);
  appendMapLine(fragment, [edge("  +-----------------+---"), road("====="), edge("+-----------------+")]);
  appendMapCells(fragment, [regionFill("sw", 17), regionFill("south", 8), regionFill("se", 17)]);
  appendMapCells(fragment, [regionCell("sw", "SW", 17), regionCell("south", "S", 8), regionCell("se", "SE", 17)]);
  appendMapCells(fragment, [regionFill("sw", 17), regionFill("south", 8, "Macleod"), regionFill("se", 17)]);
  appendMapLine(fragment, [edge("  +-----------------+--------+-----------------+")]);

  return [...fragment.childNodes];
}

function appendMapCells(fragment, cells) {
  const edge = (text) => mapToken(text, "map-token--edge");
  appendMapLine(fragment, [edge("  |"), cells[0], edge("|"), cells[1], edge("|"), cells[2], edge("|")]);
}

function appendMapLine(fragment, parts) {
  for (const part of parts) {
    fragment.append(part);
  }
  fragment.append(document.createTextNode("\n"));
}

function mapToken(text, className) {
  const token = document.createElement("span");
  token.className = `map-token ${className}`;
  token.textContent = text;
  return token;
}

function mapRegionToken(key, text) {
  const token = document.createElement("button");
  const region = getMapRegion(key);
  const active = state.area === region?.title;
  token.type = "button";
  token.className = `map-token map-token--region map-token--${key}`;
  token.textContent = text;
  token.setAttribute("aria-pressed", active.toString());
  token.setAttribute("aria-label", `Filter events to ${region?.title || text}`);
  token.classList.toggle("is-active", active);
  token.addEventListener("click", () => selectMapRegion(key));
  return token;
}

function mapCellText(text, width, key) {
  return centerMapText(text, width, isMapRegionActive(key) ? "." : " ");
}

function centerMapText(text, width, fill = " ") {
  const value = String(text || "").slice(0, width);
  const left = Math.floor((width - value.length) / 2);
  const right = width - value.length - left;
  return `${fill.repeat(left)}${value}${fill.repeat(right)}`;
}

function isMapRegionActive(key) {
  const region = getMapRegion(key);
  return state.area === region?.title;
}

function getShortLocation(event) {
  const venue = event.venue || {};
  const label = venue.name || venue.address || event.locationLabel || event.areas[0] || "location TBD";
  return truncate(label.replace(/,\s*Calgary,\s*AB.*/i, ""), 44);
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function eventKey(event) {
  return event.url || `${event.date}:${event.title}`;
}

// Event row
function renderEventCard(event, now, index) {
  const status = getEventStatus(event, now);
  const row = document.createElement("div");
  row.className = "trow";
  row.dataset.key = eventKey(event);
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", (index === state.selectedIndex).toString());

  if (index === state.selectedIndex) {
    row.classList.add("is-selected");
  }

  const statusStyles = {
    open: ["OPEN", "ts-open"],
    upcoming: ["SOON", "ts-upcoming"],
    finished: ["DONE", "ts-finished"],
  };
  const [statusText, statusClass] = statusStyles[status.state] ?? statusStyles.finished;

  const statusEl = document.createElement("span");
  statusEl.className = statusClass;
  statusEl.textContent = statusText;

  const priceEl = document.createElement("span");
  priceEl.className = "trow-price";
  priceEl.textContent = event.priceLabel;

  const areaEl = document.createElement("span");
  areaEl.className = "trow-area";
  areaEl.textContent = event.areas[0] || "-";

  const nameEl = document.createElement("span");
  nameEl.className = "trow-name";
  nameEl.textContent = event.title;

  const whenEl = document.createElement("span");
  whenEl.className = "trow-when";
  whenEl.textContent = `${formatDate(event.date)} | ${event.timeLabel}`;

  const linksEl = document.createElement("span");
  linksEl.className = "trow-links";

  for (const link of event.links) {
    linksEl.append(createNavLink(event, link));
  }

  if (event.mapsUrl) {
    const mapLink = document.createElement("a");
    mapLink.href = event.mapsUrl;
    mapLink.target = "_blank";
    mapLink.rel = "noreferrer";
    mapLink.textContent = "map";
    mapLink.setAttribute("aria-label", `${event.title} - directions`);
    mapLink.title = "Get directions";
    linksEl.append(mapLink);
  }

  row.append(statusEl, priceEl, areaEl, nameEl, whenEl, linksEl);
  row.addEventListener("click", () => selectResult(index));
  return row;
}

function renderDetail(event, now) {
  if (!elements.detail) {
    return;
  }

  if (!event) {
    elements.detail.replaceChildren(detailEmpty("select a breakfast with arrow keys"));
    return;
  }

  const status = getEventStatus(event, now);
  const lines = [
    ["state", status.label],
    ["date", formatDate(event.date)],
    ["time", event.timeLabel],
    ["price", event.priceLabel],
    ["area", event.areas.join(", ") || "-"],
    ["where", event.locationLabel],
    ["organizer", event.organizer?.name || "-"],
  ];

  const title = document.createElement("h3");
  title.className = "detail-title";
  title.textContent = event.title;

  const textMe = createTextMeButton(event);

  const meta = document.createElement("dl");
  meta.className = "detail-meta";
  for (const [label, value] of lines) {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    meta.append(dt, dd);
  }

  const description = document.createElement("p");
  description.className = "detail-description";
  description.textContent = event.description || "No description provided.";

  const actions = document.createElement("div");
  actions.className = "detail-actions";
  const actionLinks = [
    ...event.links.map((link) => detailLink(formatLinkLabel(link), link.url)),
    detailLink("open map", event.mapsUrl),
    detailLink("organizer", event.organizer?.website),
    detailLink("email", event.organizer?.email ? `mailto:${event.organizer.email}` : null),
    detailLink("phone", event.organizer?.phone ? `tel:${event.organizer.phone}` : null),
  ].filter(Boolean);
  actions.append(...actionLinks);

  elements.detail.replaceChildren(title, textMe, meta, description, actions);
}

function detailEmpty(text) {
  const el = document.createElement("div");
  el.className = "detail-empty";
  el.textContent = text;
  return el;
}

function buildTextMeUrl(event) {
  const message = `Send me the details for '${event.title}' on '${formatDate(event.date)}'`;
  return `sms:${TEXT_ME_NUMBER}?body=${encodeURIComponent(message)}`;
}

function createTextMeButton(event) {
  const wrap = document.createElement("div");
  wrap.className = "detail-text-me";

  const link = document.createElement("a");
  link.className = "detail-text-me__btn";
  link.href = buildTextMeUrl(event);
  link.textContent = "text me the details";

  wrap.append(link);
  return wrap;
}

function detailLink(text, href) {
  if (!href) {
    return null;
  }

  const link = document.createElement("a");
  link.href = normalizeHref(href);
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = `[${text}]`;
  return link;
}

function normalizeHref(href) {
  const value = String(href).trim();
  if (/^(https?:|mailto:|tel:|sms:)/i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

function normalizeEventLinks(event) {
  const links = [];
  const seen = new Set();

  const addLink = (url, source) => {
    const normalized = String(url || "").trim();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    links.push({ url: normalized, source: source || "link" });
  };

  for (const link of event.links || []) {
    if (link?.url) {
      addLink(link.url, link.source);
    }
  }

  addLink(event.url, event.source || "primary");
  addLink(event.website, "website");

  return links;
}

function formatLinkLabel(link) {
  const source = String(link.source || "").toLowerCase();

  if (source.includes("stampedebreakfast")) {
    return "stampede breakfast";
  }
  if (source.includes("official-caravan") || source.includes("calgarystampede")) {
    return "official caravan";
  }
  if (source.includes("eventbrite")) {
    return "eventbrite";
  }
  if (source === "website") {
    return "website";
  }
  if (source && !["link", "primary"].includes(source)) {
    return source.split("/")[0];
  }

  try {
    return new URL(link.url).hostname.replace(/^www\./, "");
  } catch {
    return "link";
  }
}

function formatLinkShortLabel(link) {
  const source = String(link.source || "").toLowerCase();

  if (source.includes("stampedebreakfast")) {
    return "sb";
  }
  if (source.includes("official-caravan") || source.includes("calgarystampede")) {
    return "caravan";
  }
  if (source.includes("eventbrite")) {
    return "tix";
  }
  if (source === "website") {
    return "web";
  }

  const label = formatLinkLabel(link);
  return label.length <= 8 ? label : `${label.slice(0, 7)}…`;
}

function createNavLink(event, link) {
  const anchor = document.createElement("a");
  anchor.href = normalizeHref(link.url);
  anchor.target = "_blank";
  anchor.rel = "noreferrer";
  anchor.textContent = formatLinkShortLabel(link);
  anchor.title = link.url;
  anchor.setAttribute("aria-label", `${event.title} - ${formatLinkLabel(link)}`);
  return anchor;
}

// Season chart
const PANCAKE_WIDTH = 6;

function createPancakeBar(rowCount, layerClass) {
  const bar = document.createElement("span");
  bar.className = `bar ${layerClass}`;

  if (!rowCount) {
    return bar;
  }

  for (let index = 0; index < rowCount; index += 1) {
    appendPancakeSlice(bar, index);
  }

  return bar;
}

function appendPancakeSlice(container, stackIndex) {
  const isDark = stackIndex % 2 === 0;
  appendBarRow(
    container,
    isDark ? "crust" : "cream",
    isDark ? "▓".repeat(PANCAKE_WIDTH) : "░".repeat(PANCAKE_WIDTH),
  );
}

function appendBarRow(container, part, text) {
  const row = document.createElement("span");
  row.className = `bar-row bar-row--${part}`;
  row.textContent = text;
  container.append(row);
}

function renderPancakeChart(potentialEvents = state.events, selectedEvents = potentialEvents) {
  if (!elements.pancakeChart) return;

  const totalCounts = new Map();
  for (const event of state.events) {
    totalCounts.set(event.date, (totalCounts.get(event.date) || 0) + 1);
  }

  const potentialCounts = new Map();
  for (const event of potentialEvents) {
    potentialCounts.set(event.date, (potentialCounts.get(event.date) || 0) + 1);
  }

  const selectedCounts = new Map();
  for (const event of selectedEvents) {
    selectedCounts.set(event.date, (selectedCounts.get(event.date) || 0) + 1);
  }

  const dates = [...totalCounts.keys()].sort();
  chart.dates = dates;
  const maxCount = Math.max(1, ...totalCounts.values());

  const ROWS = 10;
  const axis = document.createElement("div");
  axis.className = "chart-axis";
  for (let row = ROWS; row >= 0; row -= 1) {
    const tick = document.createElement("span");
    tick.textContent = row === 0 ? "0" : String(Math.round((maxCount * row) / ROWS));
    axis.append(tick);
  }

  const bars = document.createElement("div");
  bars.className = "chart-bars";

  for (const date of dates) {
    const totalCount = totalCounts.get(date) || 0;
    const potentialCount = potentialCounts.get(date) || 0;
    const selectedCount = selectedCounts.get(date) || 0;
    const totalRows = Math.max(1, Math.round((totalCount / maxCount) * ROWS));
    const potentialRows = potentialCount
      ? Math.max(1, Math.round((potentialCount / maxCount) * ROWS))
      : 0;
    const selectedRows = selectedCount
      ? Math.max(1, Math.round((selectedCount / maxCount) * ROWS))
      : 0;

    const col = document.createElement("button");
    col.type = "button";
    col.className = "stack-col";
    col.dataset.date = date;
    col.setAttribute(
      "aria-label",
      `${formatDate(date)}: ${selectedCount} selected, ${potentialCount} possible, ${totalCount} total. Click to filter.`,
    );

    const bar = document.createElement("span");
    bar.className = "bar-stack";

    bar.append(
      createPancakeBar(totalRows, "bar-base"),
      createPancakeBar(potentialRows, "bar-potential"),
      createPancakeBar(selectedRows, "bar-fill"),
    );
    col.append(bar);

    const dl = document.createElement("span");
    dl.className = "sdl";
    dl.textContent = shortChartDateLabel(date);
    col.append(dl);

    col.addEventListener("click", () => {
      selectDate(state.date === date ? "all" : date);
    });

    bars.append(col);
  }

  elements.pancakeChart.replaceChildren(axis, bars);
}

function syncChartActive() {
  if (!elements.pancakeChart) return;
  for (const col of elements.pancakeChart.querySelectorAll(".stack-col")) {
    col.classList.toggle("is-active", col.dataset.date === state.date);
  }
}

function selectDate(date) {
  state.date = date;
  elements.dateFilter.value = date;
  render();
}

function selectAdjacentDate(direction) {
  if (!chart.dates.length) {
    return;
  }

  const currentIndex = chart.dates.indexOf(state.date);
  const fallbackIndex = direction > 0 ? 0 : chart.dates.length - 1;
  const nextIndex =
    currentIndex === -1
      ? fallbackIndex
      : Math.max(0, Math.min(currentIndex + direction, chart.dates.length - 1));

  selectDate(chart.dates[nextIndex]);
}

// Data
function normalizeEvent(event) {
  const areas = (event.categories || []).filter((category) => AREA_CATEGORIES.has(category));
  const venue = event.venue || {};
  const addressParts = [venue.name, venue.address, venue.city, venue.province, venue.zip].filter(Boolean);
  const locationLabel = addressParts.length ? addressParts.join(", ") : "Location details on event page";
  const startMinutes = parseTime(event.start_time);
  const rawEndMinutes = parseTime(event.end_time);
  const endMinutes = rawEndMinutes > startMinutes ? rawEndMinutes : startMinutes + 120;
  const startStamp = toStamp(event.date, startMinutes);
  const endStamp = toStamp(event.date, endMinutes);
  const categories = event.categories || [];
  const tags = event.tags || [];
  const priceValues = event.price_values || [];
  const priceText = [event.price, ...priceValues].join(" ").toLowerCase();
  const isFree =
    priceText.includes("free") ||
    priceText.includes("0") ||
    categories.includes("Free Stampede Breakfast");
  const isOfficial = Boolean(event.is_official_caravan || categories.includes("Official Caravan"));
  const links = normalizeEventLinks(event);
  const searchText = [
    event.title,
    event.description,
    locationLabel,
    event.organizer?.name,
    ...categories,
    ...tags,
    ...links.map((link) => `${link.url} ${link.source || ""}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    ...event,
    areas,
    endMinutes,
    endStamp,
    isFree,
    isOfficial,
    links,
    locationLabel,
    mapsUrl: addressParts.length
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`
      : null,
    priceLabel: isFree ? "Free" : event.price || "Check",
    searchText,
    startMinutes,
    startStamp,
    timeLabel: formatTimeRange(startMinutes, rawEndMinutes),
    url: links[0]?.url || event.url || "",
  };
}

function getEventStatus(event, now) {
  if (event.startStamp <= now.stamp && event.endStamp >= now.stamp) {
    return { label: "Open now", state: "open" };
  }

  if (event.startStamp > now.stamp) {
    return { label: "Upcoming", state: "upcoming" };
  }

  return { label: "Finished", state: "finished" };
}

function getSort() {
  if (state.sort === "name") {
    return (a, b) => a.title.localeCompare(b.title);
  }

  if (state.sort === "area") {
    return (a, b) =>
      (a.areas[0] || "ZZZ").localeCompare(b.areas[0] || "ZZZ") || compareByStart(a, b);
  }

  return compareByStart;
}

function compareByStart(a, b) {
  return a.startStamp - b.startStamp || a.title.localeCompare(b.title);
}

// DOM helpers
function option(value, label) {
  const element = document.createElement("option");
  element.value = value;
  element.textContent = label;
  return element;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

// Date/time
function chartDateLabel(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    timeZone: CALGARY_TIME_ZONE,
  }).formatToParts(new Date(`${date}T12:00:00-06:00`));
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  return `${month} ${day}`;
}

function shortChartDateLabel(date) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function parseTime(time) {
  const [hours = "0", minutes = "0"] = String(time || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function toStamp(date, minutes) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day, 0, minutes);
}

function getCalgaryNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: CALGARY_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date());

  const value = (type) => parts.find((part) => part.type === type)?.value || "00";
  const date = `${value("year")}-${value("month")}-${value("day")}`;
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));

  return { date, minutes, stamp: toStamp(date, minutes) };
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "numeric",
    month: "short",
    timeZone: CALGARY_TIME_ZONE,
    weekday: "short",
  }).format(new Date(`${date}T12:00:00-06:00`));
}

function formatTimeRange(startMinutes, endMinutes) {
  if (!endMinutes || endMinutes === startMinutes) {
    return formatTime(startMinutes);
  }
  return `${formatTime(startMinutes)}-${formatTime(endMinutes)}`;
}

function formatTime(minutes) {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const suffix = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${String(mins).padStart(2, "0")} ${suffix}`;
}
