(function () {
  var STATE_CONFIG = {
    name: "New York",
    stateFips: "36",
    boundaryUrl: "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json",
    ratesApi: "https://data.ny.gov/resource/34dd-6g2j.json",
    categoryApi: "https://data.ny.gov/resource/ca8h-8gjq.json",
    countyFipsByName: {
      "Albany": "36001",
      "Allegany": "36003",
      "Bronx": "36005",
      "Broome": "36007",
      "Cattaraugus": "36009",
      "Cayuga": "36011",
      "Chautauqua": "36013",
      "Chemung": "36015",
      "Chenango": "36017",
      "Clinton": "36019",
      "Columbia": "36021",
      "Cortland": "36023",
      "Delaware": "36025",
      "Dutchess": "36027",
      "Erie": "36029",
      "Essex": "36031",
      "Franklin": "36033",
      "Fulton": "36035",
      "Genesee": "36037",
      "Greene": "36039",
      "Hamilton": "36041",
      "Herkimer": "36043",
      "Jefferson": "36045",
      "Kings": "36047",
      "Lewis": "36049",
      "Livingston": "36051",
      "Madison": "36053",
      "Monroe": "36055",
      "Montgomery": "36057",
      "Nassau": "36059",
      "New York": "36061",
      "Niagara": "36063",
      "Oneida": "36065",
      "Onondaga": "36067",
      "Ontario": "36069",
      "Orange": "36071",
      "Orleans": "36073",
      "Oswego": "36075",
      "Otsego": "36077",
      "Putnam": "36079",
      "Queens": "36081",
      "Rensselaer": "36083",
      "Richmond": "36085",
      "Rockland": "36087",
      "St Lawrence": "36089",
      "Saratoga": "36091",
      "Schenectady": "36093",
      "Schoharie": "36095",
      "Schuyler": "36097",
      "Seneca": "36099",
      "Steuben": "36101",
      "Suffolk": "36103",
      "Sullivan": "36105",
      "Tioga": "36107",
      "Tompkins": "36109",
      "Ulster": "36111",
      "Warren": "36113",
      "Washington": "36115",
      "Wayne": "36117",
      "Westchester": "36119",
      "Wyoming": "36121",
      "Yates": "36123"
    }
  };

  var COUNTY_NAME_OVERRIDES = {
    "St Lawrence": "St. Lawrence"
  };

  var METRICS = [
    {
      id: "violent_rate",
      label: "Violent crime",
      description: "Official violent crime rate per 100,000 residents. A strong default when you do not want larceny to dominate the picture.",
      countKey: "violent",
      group: "Recommended lenses"
    },
    {
      id: "property_rate",
      label: "Property crime",
      description: "Official property crime rate per 100,000 residents.",
      countKey: "property",
      group: "Recommended lenses"
    },
    {
      id: "index_rate",
      label: "Overall index crime",
      description: "Official index crime rate per 100,000 residents.",
      countKey: "index",
      group: "Recommended lenses"
    },
    {
      id: "firearm_rate",
      label: "Firearm incidents",
      description: "Official firearm-related incident rate per 100,000 residents.",
      countKey: "firearm",
      group: "Recommended lenses"
    },
    {
      id: "murder_rate",
      label: "Murder",
      description: "Murders per 100,000 residents.",
      countKey: "murder",
      group: "Violent detail"
    },
    {
      id: "rape_rate",
      label: "Rape",
      description: "Rape incidents per 100,000 residents. Source field name is forcible_rape in the official dataset.",
      countKey: "rape",
      group: "Violent detail"
    },
    {
      id: "robbery_rate",
      label: "Robbery",
      description: "Robberies per 100,000 residents.",
      countKey: "robbery",
      group: "Violent detail"
    },
    {
      id: "aggravated_assault_rate",
      label: "Aggravated assault",
      description: "Aggravated assaults per 100,000 residents.",
      countKey: "aggravated_assault",
      group: "Violent detail"
    },
    {
      id: "burglary_rate",
      label: "Burglary",
      description: "Burglaries per 100,000 residents.",
      countKey: "burglary",
      group: "Property detail"
    },
    {
      id: "larceny_rate",
      label: "Larceny",
      description: "Larcenies per 100,000 residents.",
      countKey: "larceny",
      group: "Property detail"
    },
    {
      id: "motor_vehicle_theft_rate",
      label: "Motor vehicle theft",
      description: "Motor vehicle thefts per 100,000 residents.",
      countKey: "motor_vehicle_theft",
      group: "Property detail"
    }
  ];

  var METRIC_GROUPS = ["Recommended lenses", "Violent detail", "Property detail"];
  var METRIC_BY_ID = {};
  var metricIndex = 0;
  for (; metricIndex < METRICS.length; metricIndex += 1) {
    METRIC_BY_ID[METRICS[metricIndex].id] = METRICS[metricIndex];
  }

  var numberFormat = new Intl.NumberFormat("en-US");
  var integerFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  var decimalFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  var els = {
    year: document.getElementById("crime-year"),
    countyCount: document.getElementById("crime-county-count"),
    updated: document.getElementById("crime-updated"),
    status: document.getElementById("crime-status"),
    metricSelect: document.getElementById("metric-select"),
    countySelect: document.getElementById("county-select"),
    mapTitle: document.getElementById("map-title"),
    mapSubtitle: document.getElementById("map-subtitle"),
    mapShell: document.getElementById("crime-map-shell"),
    mapSvg: document.getElementById("crime-map"),
    mapTooltip: document.getElementById("crime-map-tooltip"),
    legendTrack: document.getElementById("crime-legend-track"),
    legendMin: document.getElementById("legend-min"),
    legendMid: document.getElementById("legend-mid"),
    legendMax: document.getElementById("legend-max"),
    countySummary: document.getElementById("county-summary"),
    countyStatGrid: document.getElementById("county-stat-grid"),
    violentBreakdown: document.getElementById("violent-breakdown"),
    propertyBreakdown: document.getElementById("property-breakdown"),
    insightCards: document.getElementById("insight-cards"),
    rankingSubtitle: document.getElementById("ranking-subtitle"),
    topTableBody: document.getElementById("top-table-body"),
    bottomTableBody: document.getElementById("bottom-table-body"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    zoomReset: document.getElementById("zoom-reset")
  };

  var state = {
    latestYear: null,
    counties: [],
    countiesByName: new Map(),
    countiesByFips: new Map(),
    selectedMetric: "violent_rate",
    selectedCounty: "Albany",
    metricExtent: null,
    colorScale: null,
    map: null
  };

  init();

  function init() {
    if (!window.d3 || !window.topojson) {
      setError("The map libraries did not load, so this project cannot render right now.");
      return;
    }

    buildMetricSelect();
    bindControls();
    loadData();
  }

  function buildMetricSelect() {
    var html = [];
    var groupIndex = 0;

    for (; groupIndex < METRIC_GROUPS.length; groupIndex += 1) {
      var group = METRIC_GROUPS[groupIndex];
      html.push('<optgroup label="' + group + '">');
      var optionIndex = 0;
      for (; optionIndex < METRICS.length; optionIndex += 1) {
        var metric = METRICS[optionIndex];
        if (metric.group !== group) {
          continue;
        }
        var selected = metric.id === state.selectedMetric ? ' selected' : '';
        html.push('<option value="' + metric.id + '"' + selected + '>' + metric.label + '</option>');
      }
      html.push("</optgroup>");
    }

    els.metricSelect.innerHTML = html.join("");
  }

  function bindControls() {
    els.metricSelect.addEventListener("change", function () {
      state.selectedMetric = els.metricSelect.value;
      updateView();
    });

    els.countySelect.addEventListener("change", function () {
      focusCounty(els.countySelect.value);
    });

    els.zoomIn.addEventListener("click", function () {
      if (!state.map) {
        return;
      }
      state.map.svg.transition().duration(200).call(state.map.zoom.scaleBy, 1.35);
    });

    els.zoomOut.addEventListener("click", function () {
      if (!state.map) {
        return;
      }
      state.map.svg.transition().duration(200).call(state.map.zoom.scaleBy, 1 / 1.35);
    });

    els.zoomReset.addEventListener("click", function () {
      if (!state.map) {
        return;
      }
      state.map.svg.transition().duration(250).call(state.map.zoom.transform, d3.zoomIdentity);
    });
  }

  async function loadData() {
    setStatus("Loading latest county crime data from official New York sources...");

    try {
      var yearInfo = await Promise.all([
        fetchLatestYear(STATE_CONFIG.ratesApi),
        fetchLatestYear(STATE_CONFIG.categoryApi),
        fetchJson(STATE_CONFIG.boundaryUrl)
      ]);
      var latestYear = String(Math.min(Number(yearInfo[0]), Number(yearInfo[1])));
      var boundaries = yearInfo[2];
      var rows = await Promise.all([
        fetchJson(buildRatesUrl(latestYear)),
        fetchJson(buildCategoryUrl(latestYear))
      ]);
      var counties = buildCountyRecords(rows[0], rows[1]);

      state.latestYear = latestYear;
      state.counties = counties;
      state.countiesByName = new Map(counties.map(function (county) { return [county.county, county]; }));
      state.countiesByFips = new Map(counties.map(function (county) { return [county.fips, county]; }));

      populateCountySelect();
      renderHeroMeta();
      renderMap(boundaries);
      updateView();
      setStatus("Showing official New York county crime data for " + latestYear + ". Rates are per 100,000 residents.");
    } catch (error) {
      console.error(error);
      setError("Could not load live New York county crime data right now. Please try again later.");
    }
  }

  function renderHeroMeta() {
    els.year.textContent = state.latestYear;
    els.countyCount.textContent = state.counties.length + " counties";
    els.updated.textContent = "Loaded " + new Date().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function populateCountySelect() {
    var options = state.counties.slice().sort(function (a, b) {
      return a.displayName.localeCompare(b.displayName);
    }).map(function (county) {
      var selected = county.county === state.selectedCounty ? " selected" : "";
      return '<option value="' + county.county + '"' + selected + '>' + county.displayName + '</option>';
    });

    els.countySelect.innerHTML = options.join("");
    els.countySelect.value = state.selectedCounty;
  }

  function buildCountyRecords(rateRows, categoryRows) {
    var categoryMap = new Map(categoryRows.map(function (row) {
      return [row.county, row];
    }));

    return rateRows.map(function (row) {
      var detail = categoryMap.get(row.county);
      var fips = STATE_CONFIG.countyFipsByName[row.county];

      if (!detail || !fips) {
        return null;
      }

      var population = toNumber(row.population);
      var counts = {
        index: toNumber(row.index_count),
        violent: toNumber(row.violent_count),
        property: toNumber(row.property_count),
        firearm: toNumber(row.firearm_count),
        murder: toNumber(detail.murder),
        rape: toNumber(detail.forcible_rape),
        robbery: toNumber(detail.robbery),
        aggravated_assault: toNumber(detail.aggravated_assault),
        burglary: toNumber(detail.burglary),
        larceny: toNumber(detail.larceny),
        motor_vehicle_theft: toNumber(detail.motor_vehicle_theft)
      };

      return {
        county: row.county,
        displayName: formatCountyName(row.county),
        fips: fips,
        population: population,
        counts: counts,
        metrics: {
          index_rate: toNumber(row.index_rate),
          violent_rate: toNumber(row.violent_rate),
          property_rate: toNumber(row.property_rate),
          firearm_rate: toNumber(row.firearm_rate),
          murder_rate: ratePer100k(counts.murder, population),
          rape_rate: ratePer100k(counts.rape, population),
          robbery_rate: ratePer100k(counts.robbery, population),
          aggravated_assault_rate: ratePer100k(counts.aggravated_assault, population),
          burglary_rate: ratePer100k(counts.burglary, population),
          larceny_rate: ratePer100k(counts.larceny, population),
          motor_vehicle_theft_rate: ratePer100k(counts.motor_vehicle_theft, population)
        }
      };
    }).filter(Boolean);
  }

  function renderMap(boundaries) {
    var svg = d3.select(els.mapSvg);
    svg.selectAll("*").remove();

    var allCounties = topojson.feature(boundaries, boundaries.objects.counties).features;
    var allStates = topojson.feature(boundaries, boundaries.objects.states).features;
    var nyCounties = allCounties.filter(function (feature) {
      return String(feature.id).padStart(5, "0").indexOf(STATE_CONFIG.stateFips) === 0;
    });
    var nyState = allStates.find(function (feature) {
      return String(feature.id).padStart(2, "0") === STATE_CONFIG.stateFips;
    });
    var projection = d3.geoMercator().fitSize([720, 560], nyState);
    var path = d3.geoPath(projection);
    var root = svg.append("g").attr("class", "crime-map-root");
    var countyLayer = root.append("g").attr("class", "crime-county-layer");
    var outlineLayer = root.append("g").attr("class", "crime-outline-layer");

    countyLayer.selectAll("path")
      .data(nyCounties)
      .join("path")
      .attr("class", "crime-county")
      .attr("data-fips", function (feature) {
        return String(feature.id).padStart(5, "0");
      })
      .attr("tabindex", 0)
      .attr("d", path)
      .on("mouseenter", handleMapHover)
      .on("mousemove", handleMapHover)
      .on("mouseleave", hideMapTooltip)
      .on("focus", handleMapHover)
      .on("blur", hideMapTooltip)
      .on("click", function (event, feature) {
        var county = countyFromFeature(feature);
        if (county) {
          focusCounty(county.county);
        }
      })
      .on("keydown", function (event, feature) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          var county = countyFromFeature(feature);
          if (county) {
            focusCounty(county.county);
          }
        }
      });

    outlineLayer.append("path")
      .datum(nyState)
      .attr("class", "crime-state-outline")
      .attr("d", path);

    var zoom = d3.zoom()
      .scaleExtent([1, 7])
      .on("zoom", function (event) {
        root.attr("transform", event.transform);
      });

    svg.call(zoom).on("dblclick.zoom", null);

    state.map = {
      svg: svg,
      zoom: zoom,
      root: root,
      paths: countyLayer.selectAll("path")
    };
  }

  function updateView() {
    if (!state.counties.length) {
      return;
    }

    updateColorScale();
    updateMapFills();
    updateLegend();
    updateTitles();
    updateCountyPanel();
    updateInsights();
    updateTables();
  }

  function updateColorScale() {
    var values = state.counties.map(function (county) {
      return county.metrics[state.selectedMetric];
    }).filter(Number.isFinite);
    var min = d3.min(values);
    var max = d3.max(values);
    var mid = d3.median(values);

    state.metricExtent = { min: min, mid: mid, max: max };
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
      state.colorScale = function () { return "#ffcf77"; };
      return;
    }

    state.colorScale = d3.scaleSequential(function (t) {
      return d3.interpolateYlOrRd(Math.pow(t, 0.72));
    }).domain([min, max]);
  }

  function updateMapFills() {
    if (!state.map) {
      return;
    }

    state.map.paths
      .attr("fill", function (feature) {
        var county = countyFromFeature(feature);
        if (!county) {
          return "#1a2940";
        }
        return state.colorScale(county.metrics[state.selectedMetric]);
      })
      .classed("is-selected", function (feature) {
        var county = countyFromFeature(feature);
        return !!county && county.county === state.selectedCounty;
      });
  }

  function updateLegend() {
    var extent = state.metricExtent;
    if (!extent) {
      return;
    }

    var stops = [];
    var step = 0;
    var spread = extent.max - extent.min;
    for (; step <= 10; step += 1) {
      var ratio = step / 10;
      var sampleValue = extent.min + spread * ratio;
      stops.push(state.colorScale(sampleValue) + " " + ratio * 100 + "%");
    }

    els.legendTrack.style.background = "linear-gradient(90deg, " + stops.join(", ") + ")";
    els.legendMin.textContent = formatRate(extent.min);
    els.legendMid.textContent = formatRate(extent.mid);
    els.legendMax.textContent = formatRate(extent.max);
  }

  function updateTitles() {
    var metric = getMetric();
    els.mapTitle.textContent = metric.label + " by county";
    els.mapSubtitle.textContent = metric.description + " Source year: " + state.latestYear + ".";
    els.rankingSubtitle.textContent = "Top and bottom counties for " + metric.label.toLowerCase() + " in " + state.latestYear + ".";
  }

  function updateCountyPanel() {
    var county = state.countiesByName.get(state.selectedCounty) || state.counties[0];
    var metric = getMetric();
    var sorted = sortedCounties();
    var rank = rankOf(sorted, county.county);
    var value = county.metrics[state.selectedMetric];
    var median = d3.median(sorted, function (item) { return item.metrics[state.selectedMetric]; });
    var count = county.counts[metric.countKey];
    var compareText = comparisonText(value, median);
    var percentile = percentileText(rank, sorted.length);

    els.countySummary.innerHTML = [
      '<p class="crime-eyebrow">Focus county</p>',
      '<h3>' + county.displayName + '</h3>',
      '<p class="crime-summary-copy">' + county.displayName + ' is at <strong>' + formatRate(value) + '</strong> per 100,000 residents for ' + metric.label.toLowerCase() + '.</p>',
      '<p class="brief-sub">Population ' + integerFormat.format(county.population) + '. ' + compareText + '. ' + percentile + '.</p>'
    ].join("");

    els.countyStatGrid.innerHTML = [
      statCard(metric.label, formatRate(value), "per 100,000 residents"),
      statCard("Statewide rank", ordinal(rank) + " of " + sorted.length, "Higher rank means a higher rate"),
      statCard("Raw incident count", integerFormat.format(count), "County total in " + state.latestYear),
      statCard("NY median", formatRate(median), comparisonDelta(value, median))
    ].join("");

    renderBreakdown(els.violentBreakdown, county, [
      { key: "murder", label: "Murder" },
      { key: "rape", label: "Rape" },
      { key: "robbery", label: "Robbery" },
      { key: "aggravated_assault", label: "Aggravated assault" }
    ], county.counts.violent);

    renderBreakdown(els.propertyBreakdown, county, [
      { key: "burglary", label: "Burglary" },
      { key: "larceny", label: "Larceny" },
      { key: "motor_vehicle_theft", label: "Motor vehicle theft" }
    ], county.counts.property);
  }

  function renderBreakdown(container, county, items, total) {
    if (!total) {
      container.innerHTML = '<p class="brief-sub">No incidents reported for this group.</p>';
      return;
    }

    container.innerHTML = items.map(function (item) {
      var count = county.counts[item.key];
      var share = total ? (count / total) * 100 : 0;
      return [
        '<div class="crime-breakdown-row">',
        '<div class="crime-breakdown-line"><strong>' + item.label + '</strong><span>' + integerFormat.format(count) + ' incidents</span></div>',
        '<div class="crime-breakdown-bar"><span style="width:' + Math.max(share, 2).toFixed(1) + '%"></span></div>',
        '<div class="crime-breakdown-meta">' + decimalFormat.format(share) + '% of ' + integerFormat.format(total) + '</div>',
        '</div>'
      ].join("");
    }).join("");
  }

  function updateInsights() {
    var metric = getMetric();
    var sorted = sortedCounties();
    var highest = sorted[0];
    var lowest = sorted[sorted.length - 1];
    var selected = state.countiesByName.get(state.selectedCounty) || state.counties[0];
    var albany = state.countiesByName.get("Albany");
    var median = d3.median(sorted, function (item) { return item.metrics[state.selectedMetric]; });
    var cards = [];

    if (albany) {
      var albanyRank = rankOf(sorted, albany.county);
      cards.push(insightCard(
        "Albany County check",
        albany.displayName + " ranks " + ordinal(albanyRank) + " of " + sorted.length + " on " + metric.label.toLowerCase() + ", at " + formatRate(albany.metrics[state.selectedMetric]) + " per 100,000 residents."
      ));
    }

    cards.push(insightCard(
      state.selectedCounty === "Albany" ? "Statewide middle" : selected.displayName,
      state.selectedCounty === "Albany"
        ? "The statewide median for " + metric.label.toLowerCase() + " is " + formatRate(median) + ", which gives a cleaner baseline than raw counts alone."
        : selected.displayName + " ranks " + ordinal(rankOf(sorted, selected.county)) + " of " + sorted.length + " on the active metric."
    ));

    cards.push(insightCard(
      "Highest rate",
      highest.displayName + " has the highest " + metric.label.toLowerCase() + " rate in New York at " + formatRate(highest.metrics[state.selectedMetric]) + ", based on " + integerFormat.format(highest.counts[metric.countKey]) + " incidents."
    ));

    cards.push(insightCard(
      "Lowest rate",
      lowest.displayName + " has the lowest " + metric.label.toLowerCase() + " rate at " + formatRate(lowest.metrics[state.selectedMetric]) + ". The spread from lowest to highest is " + spreadText(lowest.metrics[state.selectedMetric], highest.metrics[state.selectedMetric]) + "."
    ));

    els.insightCards.innerHTML = cards.join("");
  }

  function updateTables() {
    var sorted = sortedCounties();
    var top = sorted.slice(0, 5);
    var bottom = sorted.slice().reverse().slice(0, 5);

    els.topTableBody.innerHTML = renderTableRows(top, sorted);
    els.bottomTableBody.innerHTML = renderTableRows(bottom, sorted);
    bindRowButtons(els.topTableBody);
    bindRowButtons(els.bottomTableBody);
  }

  function renderTableRows(rows, sorted) {
    var metric = getMetric();
    return rows.map(function (county) {
      return [
        "<tr>",
        "<td>" + ordinal(rankOf(sorted, county.county)) + "</td>",
        '<td><button type="button" class="crime-link-button" data-county="' + county.county + '">' + county.displayName + "</button></td>",
        "<td>" + formatRate(county.metrics[state.selectedMetric]) + "</td>",
        "<td>" + integerFormat.format(county.counts[metric.countKey]) + "</td>",
        "</tr>"
      ].join("");
    }).join("");
  }

  function bindRowButtons(container) {
    var buttons = container.querySelectorAll(".crime-link-button");
    var index = 0;
    for (; index < buttons.length; index += 1) {
      buttons[index].addEventListener("click", function () {
        focusCounty(this.getAttribute("data-county"));
      });
    }
  }

  function focusCounty(countyName) {
    if (!state.countiesByName.has(countyName)) {
      return;
    }
    state.selectedCounty = countyName;
    els.countySelect.value = countyName;
    updateView();
  }

  function handleMapHover(event, feature) {
    var county = countyFromFeature(feature);
    if (!county) {
      return;
    }

    var metric = getMetric();
    var shellBox = els.mapShell.getBoundingClientRect();
    els.mapTooltip.hidden = false;
    els.mapTooltip.innerHTML = [
      '<strong>' + county.displayName + '</strong>',
      '<span>' + metric.label + ': ' + formatRate(county.metrics[state.selectedMetric]) + ' per 100k</span>',
      '<span>Count: ' + integerFormat.format(county.counts[metric.countKey]) + '</span>'
    ].join("");

    var left = event.clientX ? event.clientX - shellBox.left + 14 : 14;
    var top = event.clientY ? event.clientY - shellBox.top + 14 : 14;
    els.mapTooltip.style.left = Math.min(left, els.mapShell.clientWidth - 220) + "px";
    els.mapTooltip.style.top = Math.min(top, els.mapShell.clientHeight - 90) + "px";
  }

  function hideMapTooltip() {
    els.mapTooltip.hidden = true;
  }

  function countyFromFeature(feature) {
    return state.countiesByFips.get(String(feature.id).padStart(5, "0")) || null;
  }

  function sortedCounties() {
    return state.counties.slice().sort(function (a, b) {
      var delta = b.metrics[state.selectedMetric] - a.metrics[state.selectedMetric];
      if (delta !== 0) {
        return delta;
      }
      return a.displayName.localeCompare(b.displayName);
    });
  }

  function rankOf(sorted, countyName) {
    var index = 0;
    for (; index < sorted.length; index += 1) {
      if (sorted[index].county === countyName) {
        return index + 1;
      }
    }
    return sorted.length;
  }

  function fetchLatestYear(resource) {
    return fetchJson(buildSocrataUrl(resource, {
      "$select": "max(year)"
    })).then(function (rows) {
      return rows[0] && rows[0].max_year ? rows[0].max_year : "0";
    });
  }

  function buildRatesUrl(year) {
    return buildSocrataUrl(STATE_CONFIG.ratesApi, {
      "$select": "county,population,index_count,index_rate,violent_count,violent_rate,property_count,property_rate,firearm_count,firearm_rate",
      "$where": "year='" + year + "'",
      "$limit": "100"
    });
  }

  function buildCategoryUrl(year) {
    return buildSocrataUrl(STATE_CONFIG.categoryApi, {
      "$select": "county,total_index_crimes,violent,murder,forcible_rape,robbery,aggravated_assault,property,burglary,larceny,motor_vehicle_theft",
      "$where": "year='" + year + "' and agency='County Total'",
      "$limit": "100"
    });
  }

  function buildSocrataUrl(base, params) {
    var url = new URL(base);
    var key;
    for (key in params) {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        url.searchParams.set(key, params[key]);
      }
    }
    return url.toString();
  }

  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) {
        throw new Error("Request failed: " + response.status);
      }
      return response.json();
    });
  }

  function getMetric() {
    return METRIC_BY_ID[state.selectedMetric] || METRIC_BY_ID.violent_rate;
  }

  function toNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function ratePer100k(count, population) {
    if (!population) {
      return 0;
    }
    return (count / population) * 100000;
  }

  function formatCountyName(name) {
    return (COUNTY_NAME_OVERRIDES[name] || name) + " County";
  }

  function formatRate(value) {
    if (!Number.isFinite(value)) {
      return "0";
    }
    return Math.abs(value - Math.round(value)) < 0.05 ? integerFormat.format(Math.round(value)) : decimalFormat.format(value);
  }

  function comparisonText(value, median) {
    if (!median) {
      return "No statewide median is available";
    }
    var delta = ((value - median) / median) * 100;
    if (Math.abs(delta) < 1) {
      return "Almost exactly in line with the statewide median";
    }
    return Math.abs(Math.round(delta)) + "% " + (delta > 0 ? "above" : "below") + " the statewide median";
  }

  function comparisonDelta(value, median) {
    if (!median) {
      return "No statewide median available";
    }
    var delta = ((value - median) / median) * 100;
    if (Math.abs(delta) < 1) {
      return "Nearly identical to the state median";
    }
    return Math.abs(Math.round(delta)) + "% " + (delta > 0 ? "higher" : "lower") + " than the median";
  }

  function percentileText(rank, size) {
    if (size <= 1) {
      return "Only one county is available";
    }
    var percentile = Math.round(((size - rank) / (size - 1)) * 100);
    return "That places it around the " + ordinal(percentile) + " percentile statewide";
  }

  function spreadText(low, high) {
    if (!low) {
      return "a very large multiple";
    }
    return decimalFormat.format(high / low) + "x";
  }

  function statCard(label, value, detail) {
    return [
      '<article class="crime-stat-card">',
      '<span>' + label + '</span>',
      '<strong>' + value + '</strong>',
      '<small>' + detail + '</small>',
      '</article>'
    ].join("");
  }

  function insightCard(title, body) {
    return [
      '<article class="crime-insight-card">',
      '<h3>' + title + '</h3>',
      '<p>' + body + '</p>',
      '</article>'
    ].join("");
  }

  function ordinal(value) {
    var remainder10 = value % 10;
    var remainder100 = value % 100;
    if (remainder10 === 1 && remainder100 !== 11) {
      return value + "st";
    }
    if (remainder10 === 2 && remainder100 !== 12) {
      return value + "nd";
    }
    if (remainder10 === 3 && remainder100 !== 13) {
      return value + "rd";
    }
    return value + "th";
  }

  function setStatus(message) {
    els.status.textContent = message;
  }

  function setError(message) {
    els.status.textContent = message;
    els.updated.textContent = "Unavailable";
    els.mapSubtitle.textContent = message;
  }
})();


