(function () {
  var BOUNDARY_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json";
  var IMPACT_WEIGHTS = {
    murder: 25,
    rape: 12,
    robbery: 6,
    aggravated_assault: 4,
    burglary: 2,
    motor_vehicle_theft: 2,
    larceny: 1
  };

  var STATE_CONFIGS = {
    NY: {
      id: "NY",
      name: "New York",
      stateFips: "36",
      boundaryUrl: BOUNDARY_URL,
      sourceType: "ny_socrata",
      ratesApi: "https://data.ny.gov/resource/34dd-6g2j.json",
      categoryApi: "https://data.ny.gov/resource/ca8h-8gjq.json",
      defaultCounty: "Albany",
      defaultCompareCounty: "Rensselaer",
      headline: "New York County Crime Explorer",
      sourceLabel: "New York State Open Data",
      heroNote: "New York publishes statewide county totals and rates through a single official source, which makes it the strongest current county benchmark in the project.",
      sourceNote: "Notes: overall index crime is the official NY top-line county metric across reported index offenses. The crime impact score is a site-defined weighted lens: murder 25, rape 12, robbery 6, aggravated assault 4, burglary 2, motor vehicle theft 2, larceny 1.",
      coverageNote: "County-first expansion is underway. New York remains the deepest source today, while New Jersey is now live as the first additional county state in the new adapter-based architecture.",
      insightCounty: "Albany",
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
      },
      sources: [
        {
          label: "County crime rates and population",
          url: "https://data.ny.gov/d/34dd-6g2j",
          text: "NYS Open Data dataset 34dd-6g2j"
        },
        {
          label: "County total offense categories",
          url: "https://data.ny.gov/d/ca8h-8gjq",
          text: "NYS Open Data dataset ca8h-8gjq"
        },
        {
          label: "County boundaries for the map",
          url: "https://github.com/topojson/us-atlas",
          text: "us-atlas TopoJSON, derived from U.S. Census geography"
        }
      ]
    },
    NJ: {
      id: "NJ",
      name: "New Jersey",
      stateFips: "34",
      boundaryUrl: BOUNDARY_URL,
      sourceType: "json",
      dataUrl: "/projects/data/project-02-nj.json",
      defaultCounty: "Essex",
      defaultCompareCounty: "Bergen",
      headline: "New Jersey County Crime Explorer",
      sourceLabel: "New Jersey State Police UCR",
      heroNote: "New Jersey county data is built from the official county worksheets in the state police Uniform Crime Report workbooks. The current county trend window runs from 2019 through 2023.",
      sourceNote: "Notes: New Jersey publishes county totals in annual workbook tabs. The total field is treated as index crime, and the impact score uses the same weighted lens as New York for consistency across states.",
      coverageNote: "County-first expansion is underway. New York and New Jersey are live today, and Pennsylvania, Connecticut, and Maine are the next official county sources being normalized into the same structure.",
      sources: [
        {
          label: "2023 county UCR workbook",
          url: "https://www.nj.gov/njsp/ucr/pdf/current/20250416_2023_Uniform_Crime_Report.xlsx",
          text: "New Jersey Uniform Crime Report 2023 workbook"
        },
        {
          label: "2022 county UCR workbook",
          url: "https://www.nj.gov/njsp/ucr/pdf/current/20241101_2022_Uniform_Crime_Report.xlsx",
          text: "New Jersey Uniform Crime Report 2022 workbook"
        },
        {
          label: "2021 county UCR workbook",
          url: "https://www.nj.gov/njsp/ucr/pdf/current/20241101_2021_Uniform_Crime_Report.xlsx",
          text: "New Jersey Uniform Crime Report 2021 workbook"
        },
        {
          label: "County boundaries for the map",
          url: "https://github.com/topojson/us-atlas",
          text: "us-atlas TopoJSON, derived from U.S. Census geography"
        }
      ]
    }
  };

  var COUNTY_NAME_OVERRIDES = {
    NY: {
      "St Lawrence": "St. Lawrence"
    }
  };

  var METRICS = [
    {
      id: "impact_score",
      label: "Crime impact score",
      description: "Custom weighted score per 100,000 residents. Best single answer to how bad crime feels because it blends quantity and severity.",
      countKey: "index",
      countLabel: "Index incidents",
      group: "Recommended lenses"
    },
    {
      id: "index_rate",
      label: "Overall index crime",
      description: "Official index crime rate per 100,000 residents across the major index offenses. Good official top line, but it does not weight murder above larceny.",
      countKey: "index",
      countLabel: "Index incidents",
      group: "Recommended lenses"
    },
    {
      id: "violent_rate",
      label: "Violent crime",
      description: "Official violent crime rate per 100,000 residents. Useful when you want a serious-crime view without property crimes dominating the picture.",
      countKey: "violent",
      countLabel: "Violent incidents",
      group: "Recommended lenses"
    },
    {
      id: "property_rate",
      label: "Property crime",
      description: "Official property crime rate per 100,000 residents.",
      countKey: "property",
      countLabel: "Property incidents",
      group: "Recommended lenses"
    },
    {
      id: "firearm_rate",
      label: "Firearm incidents",
      description: "Official firearm-related incident rate per 100,000 residents.",
      countKey: "firearm",
      countLabel: "Firearm incidents",
      group: "Recommended lenses"
    },
    {
      id: "murder_rate",
      label: "Murder",
      description: "Murders per 100,000 residents.",
      countKey: "murder",
      countLabel: "Murders",
      group: "Violent detail"
    },
    {
      id: "rape_rate",
      label: "Rape",
      description: "Rape incidents per 100,000 residents. Source field name is forcible_rape in the official dataset.",
      countKey: "rape",
      countLabel: "Rape incidents",
      group: "Violent detail"
    },
    {
      id: "robbery_rate",
      label: "Robbery",
      description: "Robberies per 100,000 residents.",
      countKey: "robbery",
      countLabel: "Robberies",
      group: "Violent detail"
    },
    {
      id: "aggravated_assault_rate",
      label: "Aggravated assault",
      description: "Aggravated assaults per 100,000 residents.",
      countKey: "aggravated_assault",
      countLabel: "Aggravated assaults",
      group: "Violent detail"
    },
    {
      id: "burglary_rate",
      label: "Burglary",
      description: "Burglaries per 100,000 residents.",
      countKey: "burglary",
      countLabel: "Burglaries",
      group: "Property detail"
    },
    {
      id: "larceny_rate",
      label: "Larceny",
      description: "Larcenies per 100,000 residents.",
      countKey: "larceny",
      countLabel: "Larcenies",
      group: "Property detail"
    },
    {
      id: "motor_vehicle_theft_rate",
      label: "Motor vehicle theft",
      description: "Motor vehicle thefts per 100,000 residents.",
      countKey: "motor_vehicle_theft",
      countLabel: "Motor vehicle thefts",
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
    title: document.getElementById("crime-title"),
    year: document.getElementById("crime-year"),
    historyWindow: document.getElementById("crime-history-window"),
    countyCount: document.getElementById("crime-county-count"),
    sourceName: document.getElementById("crime-source-name"),
    heroNoteCopy: document.getElementById("crime-hero-note-copy"),
    updated: document.getElementById("crime-updated"),
    status: document.getElementById("crime-status"),
    stateSelect: document.getElementById("state-select"),
    metricSelect: document.getElementById("metric-select"),
    countySelect: document.getElementById("county-select"),
    compareCountySelect: document.getElementById("compare-county-select"),
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
    trendSubtitle: document.getElementById("trend-subtitle"),
    trendDirection: document.getElementById("trend-direction"),
    trendBlurb: document.getElementById("trend-blurb"),
    trendChart: document.getElementById("crime-trend-chart"),
    violentBreakdown: document.getElementById("violent-breakdown"),
    propertyBreakdown: document.getElementById("property-breakdown"),
    comparisonSubtitle: document.getElementById("comparison-subtitle"),
    comparisonSummary: document.getElementById("comparison-summary"),
    comparisonStatGrid: document.getElementById("comparison-stat-grid"),
    comparisonPrimaryHead: document.getElementById("comparison-primary-head"),
    comparisonSecondaryHead: document.getElementById("comparison-secondary-head"),
    comparisonTableBody: document.getElementById("comparison-table-body"),
    insightCards: document.getElementById("insight-cards"),
    rankingSubtitle: document.getElementById("ranking-subtitle"),
    topTableBody: document.getElementById("top-table-body"),
    bottomTableBody: document.getElementById("bottom-table-body"),
    sourceList: document.getElementById("crime-source-list"),
    sourceNote: document.getElementById("crime-source-note"),
    coverageNote: document.getElementById("crime-coverage-note"),
    zoomIn: document.getElementById("zoom-in"),
    zoomOut: document.getElementById("zoom-out"),
    zoomReset: document.getElementById("zoom-reset")
  };

  var state = {
    latestYear: null,
    years: [],
    counties: [],
    countiesByName: new Map(),
    countiesByFips: new Map(),
    historyByCounty: new Map(),
    historyByYear: new Map(),
    selectedState: "NY",
    selectedMetric: "index_rate",
    selectedCounty: null,
    selectedCompareCounty: null,
    metricExtent: null,
    colorScale: null,
    map: null,
    boundaries: null,
    datasetCache: new Map()
  };

  init();

  function init() {
    if (!window.d3 || !window.topojson) {
      setError("The map libraries did not load, so this project cannot render right now.");
      return;
    }

    buildStateSelect();
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

  function buildStateSelect() {
    els.stateSelect.innerHTML = Object.keys(STATE_CONFIGS).map(function (stateId) {
      var config = STATE_CONFIGS[stateId];
      var selected = state.selectedState === stateId ? ' selected' : '';
      return '<option value="' + stateId + '"' + selected + '>' + config.name + '</option>';
    }).join('');
  }

  function bindControls() {
    els.stateSelect.addEventListener("change", function () {
      state.selectedState = els.stateSelect.value;
      state.selectedCounty = null;
      state.selectedCompareCounty = null;
      loadData();
    });

    els.metricSelect.addEventListener("change", function () {
      state.selectedMetric = els.metricSelect.value;
      updateView();
    });

    els.countySelect.addEventListener("change", function () {
      focusCounty(els.countySelect.value);
    });

    els.compareCountySelect.addEventListener("change", function () {
      setCompareCounty(els.compareCountySelect.value);
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
    var config = getStateConfig();
    setStatus("Loading " + config.name + " county crime history from official sources...");

    try {
      if (!state.boundaries) {
        state.boundaries = await fetchJson(config.boundaryUrl);
      }
      var historyRecords = await loadHistoryRecords(config);

      state.years = uniqueYears(historyRecords);
      state.latestYear = state.years[state.years.length - 1];
      state.historyByCounty = groupBy(historyRecords, "county");
      state.historyByYear = groupBy(historyRecords, "year");
      state.counties = historyRecords.filter(function (record) {
        return record.year === state.latestYear;
      });
      state.countiesByName = new Map(state.counties.map(function (county) { return [county.county, county]; }));
      state.countiesByFips = new Map(state.counties.map(function (county) { return [county.fips, county]; }));

      if (!state.selectedCounty || !state.countiesByName.has(state.selectedCounty)) {
        state.selectedCounty = config.defaultCounty && state.countiesByName.has(config.defaultCounty) ? config.defaultCounty : state.counties[0].county;
      }
      if (!state.selectedCompareCounty || !state.countiesByName.has(state.selectedCompareCounty) || state.selectedCompareCounty === state.selectedCounty) {
        state.selectedCompareCounty = config.defaultCompareCounty && state.countiesByName.has(config.defaultCompareCounty) && config.defaultCompareCounty !== state.selectedCounty
          ? config.defaultCompareCounty
          : fallbackCompareCounty(state.selectedCounty);
      }

      populateCountySelect();
      renderHeroMeta();
      renderSourcePanel();
      renderMap(state.boundaries);
      updateView();
      setStatus("Showing official " + config.name + " county crime data through " + state.latestYear + ". Trend history begins in " + state.years[0] + ".");
    } catch (error) {
      console.error(error);
      setError("Could not load official county crime history for " + config.name + " right now. Please try again later.");
    }
  }

  async function loadHistoryRecords(config) {
    if (state.datasetCache.has(config.id)) {
      return state.datasetCache.get(config.id);
    }

    var records;
    if (config.sourceType === "ny_socrata") {
      var payloads = await Promise.all([
        fetchJson(buildAllRatesHistoryUrl(config)),
        fetchJson(buildAllCategoryHistoryUrl(config))
      ]);
      records = buildNyHistoryRecords(payloads[0], payloads[1]);
    } else {
      var payload = await fetchJson(config.dataUrl);
      records = buildJsonHistoryRecords(payload.records || []);
    }

    state.datasetCache.set(config.id, records);
    return records;
  }

  function renderHeroMeta() {
    var config = getStateConfig();
    document.title = config.name + " County Crime Atlas | Scout";
    els.title.textContent = "County Crime Atlas";
    els.sourceName.textContent = config.sourceLabel;
    els.heroNoteCopy.textContent = config.heroNote;
    els.year.textContent = state.latestYear;
    els.historyWindow.textContent = state.years[0] + "-" + state.latestYear;
    els.countyCount.textContent = state.counties.length + " counties";
    els.updated.textContent = "Loaded " + new Date().toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function renderSourcePanel() {
    var config = getStateConfig();
    els.sourceList.innerHTML = config.sources.map(function (source) {
      return '<li>' + source.label + ': <a href="' + source.url + '" target="_blank" rel="noopener noreferrer">' + source.text + '</a></li>';
    }).join("");
    els.sourceNote.textContent = config.sourceNote;
    els.coverageNote.textContent = config.coverageNote;
  }

  function populateCountySelect() {
    var sortedCounties = state.counties.slice().sort(function (a, b) {
      return a.displayName.localeCompare(b.displayName);
    });
    var optionMarkup = sortedCounties.map(function (county) {
      return '<option value="' + county.county + '">' + county.displayName + '</option>';
    }).join("");

    if (!state.countiesByName.has(state.selectedCompareCounty)) {
      state.selectedCompareCounty = fallbackCompareCounty(state.selectedCounty);
    }

    els.stateSelect.value = state.selectedState;
    els.countySelect.innerHTML = optionMarkup;
    els.compareCountySelect.innerHTML = optionMarkup;
    els.countySelect.value = state.selectedCounty;
    els.compareCountySelect.value = state.selectedCompareCounty;
  }

  function buildNyHistoryRecords(rateRows, categoryRows) {
    var config = getStateConfig();
    var categoryMap = new Map(categoryRows.map(function (row) {
      return [row.county + "|" + row.year, row];
    }));

    return rateRows.map(function (row) {
      var detail = categoryMap.get(row.county + "|" + row.year);
      var fips = config.countyFipsByName[row.county];

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

      return normalizeCountyRecord({
        county: row.county,
        displayName: formatCountyName(row.county),
        fips: fips,
        year: toNumber(row.year),
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
      });
    }).filter(Boolean);
  }

  function buildJsonHistoryRecords(records) {
    return records.map(function (record) {
      return normalizeCountyRecord(record);
    }).filter(Boolean);
  }

  function normalizeCountyRecord(record) {
    var population = toNumber(record.population);
    var counts = {
      index: toNumber(record.counts.index),
      violent: toNumber(record.counts.violent),
      property: toNumber(record.counts.property),
      firearm: toNumber(record.counts.firearm),
      murder: toNumber(record.counts.murder),
      rape: toNumber(record.counts.rape),
      robbery: toNumber(record.counts.robbery),
      aggravated_assault: toNumber(record.counts.aggravated_assault),
      burglary: toNumber(record.counts.burglary),
      larceny: toNumber(record.counts.larceny),
      motor_vehicle_theft: toNumber(record.counts.motor_vehicle_theft)
    };
    if (!counts.violent) {
      counts.violent = counts.murder + counts.rape + counts.robbery + counts.aggravated_assault;
    }
    if (!counts.property) {
      counts.property = counts.burglary + counts.larceny + counts.motor_vehicle_theft;
    }
    if (!counts.index) {
      counts.index = counts.violent + counts.property;
    }

    var metrics = record.metrics || {};
    var normalizedMetrics = {
      impact_score: Number.isFinite(Number(metrics.impact_score)) ? toNumber(metrics.impact_score) : ratePer100k(weightedImpactCount(counts), population),
      index_rate: Number.isFinite(Number(metrics.index_rate)) ? toNumber(metrics.index_rate) : ratePer100k(counts.index, population),
      violent_rate: Number.isFinite(Number(metrics.violent_rate)) ? toNumber(metrics.violent_rate) : ratePer100k(counts.violent, population),
      property_rate: Number.isFinite(Number(metrics.property_rate)) ? toNumber(metrics.property_rate) : ratePer100k(counts.property, population),
      firearm_rate: Number.isFinite(Number(metrics.firearm_rate)) ? toNumber(metrics.firearm_rate) : 0,
      murder_rate: Number.isFinite(Number(metrics.murder_rate)) ? toNumber(metrics.murder_rate) : ratePer100k(counts.murder, population),
      rape_rate: Number.isFinite(Number(metrics.rape_rate)) ? toNumber(metrics.rape_rate) : ratePer100k(counts.rape, population),
      robbery_rate: Number.isFinite(Number(metrics.robbery_rate)) ? toNumber(metrics.robbery_rate) : ratePer100k(counts.robbery, population),
      aggravated_assault_rate: Number.isFinite(Number(metrics.aggravated_assault_rate)) ? toNumber(metrics.aggravated_assault_rate) : ratePer100k(counts.aggravated_assault, population),
      burglary_rate: Number.isFinite(Number(metrics.burglary_rate)) ? toNumber(metrics.burglary_rate) : ratePer100k(counts.burglary, population),
      larceny_rate: Number.isFinite(Number(metrics.larceny_rate)) ? toNumber(metrics.larceny_rate) : ratePer100k(counts.larceny, population),
      motor_vehicle_theft_rate: Number.isFinite(Number(metrics.motor_vehicle_theft_rate)) ? toNumber(metrics.motor_vehicle_theft_rate) : ratePer100k(counts.motor_vehicle_theft, population)
    };

    return {
      county: record.county,
      displayName: record.displayName || formatCountyName(record.county),
      fips: String(record.fips),
      year: toNumber(record.year),
      population: population,
      counts: counts,
      metrics: normalizedMetrics
    };
  }

  function getStateConfig() {
    return STATE_CONFIGS[state.selectedState] || STATE_CONFIGS.NY;
  }

  function renderMap(boundaries) {
    var svg = d3.select(els.mapSvg);
    svg.selectAll("*").remove();

    var config = getStateConfig();
    var allCounties = topojson.feature(boundaries, boundaries.objects.counties).features;
    var allStates = topojson.feature(boundaries, boundaries.objects.states).features;
    var stateCounties = allCounties.filter(function (feature) {
      return String(feature.id).padStart(5, "0").indexOf(config.stateFips) === 0;
    });
    var stateFeature = allStates.find(function (feature) {
      return String(feature.id).padStart(2, "0") === config.stateFips;
    });
    var projection = d3.geoMercator().fitSize([720, 560], stateFeature);
    var path = d3.geoPath(projection);
    var root = svg.append("g").attr("class", "crime-map-root");
    var countyLayer = root.append("g").attr("class", "crime-county-layer");
    var outlineLayer = root.append("g").attr("class", "crime-outline-layer");

    countyLayer.selectAll("path")
      .data(stateCounties)
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
      .datum(stateFeature)
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
    updateTrendPanel();
    updateComparisonPanel();
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
    var config = getStateConfig();
    els.mapTitle.textContent = metric.label + " heatmap";
    els.mapSubtitle.textContent = config.name + " in " + state.latestYear + ". Drag to pan, scroll to zoom, and click a county to update the drilldown.";
    els.rankingSubtitle.textContent = "Top and bottom counties for " + metric.label.toLowerCase() + " in " + config.name + " in " + state.latestYear + ".";
  }

  function updateCountyPanel() {
    var county = selectedCountyRecord();
    var metric = getMetric();
    var sorted = sortedCounties();
    var rank = rankOf(sorted, county.county);
    var value = county.metrics[state.selectedMetric];
    var median = d3.median(sorted, function (item) { return item.metrics[state.selectedMetric]; });
    var history = countyHistory(county.county);
    var lookback = lookbackComparison(history, 5);

    els.countySummary.innerHTML = [
      '<p class="crime-eyebrow">Focus county</p>',
      '<h3>' + county.displayName + '</h3>',
      '<p class="crime-summary-copy">' + county.displayName + ' is at <strong>' + formatRate(value) + '</strong> per 100,000 residents for ' + metric.label.toLowerCase() + '.</p>',
      '<p class="brief-sub">Population ' + integerFormat.format(county.population) + '. ' + comparisonText(value, median) + '. ' + metricContext(metric) + '</p>'
    ].join("");

    els.countyStatGrid.innerHTML = [
      statCard(metric.label, formatRate(value), "per 100,000 residents"),
      statCard("Statewide rank", ordinal(rank) + " of " + sorted.length, "Higher rank means a higher rate"),
      statCard(metric.countLabel, integerFormat.format(county.counts[metric.countKey]), "County total in " + state.latestYear),
      statCard(lookback.label, lookback.value, lookback.detail)
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

  function updateTrendPanel() {
    var county = selectedCountyRecord();
    var metric = getMetric();
    var history = countyHistory(county.county);
    var medianSeries = stateMedianSeries();
    var lookback = lookbackComparison(history, 5);

    els.trendSubtitle.textContent = metric.label + " from " + state.years[0] + " to " + state.latestYear + ".";
    els.trendDirection.textContent = lookback.directionWord === "mostly flat" ? "Mostly flat" : (lookback.directionWord === "getting better" ? "Getting better" : "Getting worse");
    els.trendBlurb.textContent = trendBlurb(county, history, metric, medianSeries[medianSeries.length - 1]);
    renderTrendChart(history, medianSeries);
  }

  function renderTrendChart(history, medianSeries) {
    var svg = d3.select(els.trendChart);
    svg.selectAll("*").remove();

    var width = 560;
    var height = 260;
    var margin = { top: 16, right: 56, bottom: 34, left: 48 };
    var values = history.map(function (point) { return point.metrics[state.selectedMetric]; })
      .concat(medianSeries.map(function (point) { return point.value; }))
      .filter(Number.isFinite);
    var yMax = d3.max(values) || 1;
    var x = d3.scaleLinear().domain([state.years[0], state.latestYear]).range([margin.left, width - margin.right]);
    var y = d3.scaleLinear().domain([0, yMax * 1.08]).nice().range([height - margin.bottom, margin.top]);
    var line = d3.line()
      .defined(function (point) { return Number.isFinite(point.value); })
      .x(function (point) { return x(point.year); })
      .y(function (point) { return y(point.value); });

    svg.append("g")
      .attr("class", "crime-trend-grid")
      .selectAll("line")
      .data(y.ticks(4))
      .join("line")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", function (tick) { return y(tick); })
      .attr("y2", function (tick) { return y(tick); });

    var tickYears = state.years.filter(function (year) {
      return year === state.years[0] || year === state.latestYear || year % 5 === 0;
    });

    svg.append("g")
      .attr("class", "crime-trend-axis")
      .attr("transform", "translate(0," + (height - margin.bottom) + ")")
      .call(d3.axisBottom(x).tickValues(tickYears).tickFormat(d3.format("d")));

    svg.append("g")
      .attr("class", "crime-trend-axis")
      .attr("transform", "translate(" + margin.left + ",0)")
      .call(d3.axisLeft(y).ticks(4).tickFormat(function (tick) { return formatRate(tick); }));

    svg.append("path")
      .datum(medianSeries)
      .attr("class", "crime-trend-line median")
      .attr("d", line);

    svg.append("path")
      .datum(history.map(function (point) { return { year: point.year, value: point.metrics[state.selectedMetric] }; }))
      .attr("class", "crime-trend-line county")
      .attr("d", line);

    var latestCounty = history[history.length - 1];
    var latestMedian = medianSeries[medianSeries.length - 1];

    svg.append("circle").attr("class", "crime-trend-dot county").attr("cx", x(latestCounty.year)).attr("cy", y(latestCounty.metrics[state.selectedMetric])).attr("r", 4);
    svg.append("circle").attr("class", "crime-trend-dot median").attr("cx", x(latestMedian.year)).attr("cy", y(latestMedian.value)).attr("r", 4);
    svg.append("text").attr("class", "crime-trend-label county").attr("x", x(latestCounty.year) - 6).attr("y", y(latestCounty.metrics[state.selectedMetric]) - 10).attr("text-anchor", "end").text(formatRate(latestCounty.metrics[state.selectedMetric]));
    svg.append("text").attr("class", "crime-trend-label median").attr("x", x(latestMedian.year) - 6).attr("y", y(latestMedian.value) - 10).attr("text-anchor", "end").text(formatRate(latestMedian.value));
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

  function updateComparisonPanel() {
    var primary = selectedCountyRecord();
    var secondary = selectedCompareCountyRecord();
    var metric = getMetric();
    var primaryHistory = countyHistory(primary.county);
    var secondaryHistory = countyHistory(secondary.county);
    var primaryTrend = lookbackComparison(primaryHistory, 5);
    var secondaryTrend = lookbackComparison(secondaryHistory, 5);
    var primaryRank = rankOf(sortedCounties(), primary.county);
    var secondaryRank = rankOf(sortedCounties(), secondary.county);

    els.comparisonPrimaryHead.textContent = primary.displayName;
    els.comparisonSecondaryHead.textContent = secondary.displayName;
    els.comparisonSubtitle.textContent = metric.label + " and core crime lenses in " + state.latestYear + ".";
    els.comparisonSummary.innerHTML = comparisonSummary(primary, secondary, metric, primaryTrend, secondaryTrend);
    els.comparisonStatGrid.innerHTML = [
      statCard(primary.displayName, formatRate(primary.metrics[state.selectedMetric]), metric.label.toLowerCase() + " per 100,000"),
      statCard(secondary.displayName, formatRate(secondary.metrics[state.selectedMetric]), metric.label.toLowerCase() + " per 100,000"),
      statCard("Current gap", formatComparisonGap(primary.metrics[state.selectedMetric], secondary.metrics[state.selectedMetric]), metricEdgeText(primary, secondary, primary.metrics[state.selectedMetric], secondary.metrics[state.selectedMetric]))
    ].join("");

    els.comparisonTableBody.innerHTML = [
      comparisonRow(metric.label, formatRate(primary.metrics[state.selectedMetric]), formatRate(secondary.metrics[state.selectedMetric]), metricEdgeText(primary, secondary, primary.metrics[state.selectedMetric], secondary.metrics[state.selectedMetric])),
      comparisonRow("Crime impact score", formatRate(primary.metrics.impact_score), formatRate(secondary.metrics.impact_score), metricEdgeText(primary, secondary, primary.metrics.impact_score, secondary.metrics.impact_score)),
      comparisonRow("Overall index crime", formatRate(primary.metrics.index_rate), formatRate(secondary.metrics.index_rate), metricEdgeText(primary, secondary, primary.metrics.index_rate, secondary.metrics.index_rate)),
      comparisonRow("Violent crime", formatRate(primary.metrics.violent_rate), formatRate(secondary.metrics.violent_rate), metricEdgeText(primary, secondary, primary.metrics.violent_rate, secondary.metrics.violent_rate)),
      comparisonRow("Property crime", formatRate(primary.metrics.property_rate), formatRate(secondary.metrics.property_rate), metricEdgeText(primary, secondary, primary.metrics.property_rate, secondary.metrics.property_rate)),
      comparisonRow("5-year change", primaryTrend.value, secondaryTrend.value, trendEdgeText(primary, secondary, primaryTrend, secondaryTrend)),
      comparisonRow("Current rank", ordinal(primaryRank) + " of " + state.counties.length, ordinal(secondaryRank) + " of " + state.counties.length, rankEdgeText(primary, secondary, primaryRank, secondaryRank)),
      comparisonRow(metric.countLabel, integerFormat.format(primary.counts[metric.countKey]), integerFormat.format(secondary.counts[metric.countKey]), countEdgeText(primary, secondary, primary.counts[metric.countKey], secondary.counts[metric.countKey]))
    ].join("");
  }
  function updateInsights() {
    var config = getStateConfig();
    var metric = getMetric();
    var sorted = sortedCounties();
    var highest = sorted[0];
    var lowest = sorted[sorted.length - 1];
    var selected = selectedCountyRecord();
    var selectedTrend = lookbackComparison(countyHistory(selected.county), 5);
    var insightCounty = config.insightCounty ? state.countiesByName.get(config.insightCounty) : null;
    var cards = [];

    if (insightCounty) {
      var insightRank = rankOf(sorted, insightCounty.county);
      cards.push(insightCard(
        insightCounty.displayName + " check",
        insightCounty.displayName + " ranks " + ordinal(insightRank) + " of " + sorted.length + " on " + metric.label.toLowerCase() + ", at " + formatRate(insightCounty.metrics[state.selectedMetric]) + " per 100,000 residents."
      ));
    }

    cards.push(insightCard(
      selected.displayName + " trend",
      selectedTrend.narrative + " Latest value: " + formatRate(selected.metrics[state.selectedMetric]) + " per 100,000 residents."
    ));

    cards.push(insightCard(
      "Highest rate",
      highest.displayName + " has the highest " + metric.label.toLowerCase() + " rate in " + config.name + " at " + formatRate(highest.metrics[state.selectedMetric]) + ", based on " + integerFormat.format(highest.counts[metric.countKey]) + " " + metric.countLabel.toLowerCase() + "."
    ));

    cards.push(insightCard(
      "Lowest rate",
      lowest.displayName + " has the lowest " + metric.label.toLowerCase() + " rate in " + config.name + " at " + formatRate(lowest.metrics[state.selectedMetric]) + ", based on " + integerFormat.format(lowest.counts[metric.countKey]) + " " + metric.countLabel.toLowerCase() + "."
    ));

    cards.push(insightCard(
      metric.id === "impact_score" ? "How impact score works" : "Why this metric matters",
      metric.id === "impact_score"
        ? "This weighted score counts all official index offenses but leans harder on severe harm: murder 25, rape 12, robbery 6, aggravated assault 4, burglary 2, motor vehicle theft 2, larceny 1."
        : "Overall index crime is the official top-line benchmark. If you want a single lens that weights severity more heavily, switch to Crime impact score."
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
    if (state.selectedCompareCounty === countyName) {
      state.selectedCompareCounty = fallbackCompareCounty(countyName);
    }
    els.countySelect.value = countyName;
    els.compareCountySelect.value = state.selectedCompareCounty;
    updateView();
  }

  function setCompareCounty(countyName) {
    if (!state.countiesByName.has(countyName)) {
      return;
    }
    state.selectedCompareCounty = countyName;
    els.compareCountySelect.value = countyName;
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
      '<span>' + metric.countLabel + ': ' + integerFormat.format(county.counts[metric.countKey]) + '</span>'
    ].join("");

    var left = event.clientX ? event.clientX - shellBox.left + 14 : 14;
    var top = event.clientY ? event.clientY - shellBox.top + 14 : 14;
    els.mapTooltip.style.left = Math.min(left, els.mapShell.clientWidth - 220) + "px";
    els.mapTooltip.style.top = Math.min(top, els.mapShell.clientHeight - 90) + "px";
  }

  function hideMapTooltip() {
    els.mapTooltip.hidden = true;
  }

  function selectedCountyRecord() {
    return state.countiesByName.get(state.selectedCounty) || state.counties[0];
  }

  function selectedCompareCountyRecord() {
    return state.countiesByName.get(state.selectedCompareCounty) || state.counties[0];
  }

  function fallbackCompareCounty(excludedCounty) {
    var index = 0;
    for (; index < state.counties.length; index += 1) {
      if (state.counties[index].county !== excludedCounty) {
        return state.counties[index].county;
      }
    }
    return excludedCounty;
  }

  function countyHistory(countyName) {
    return state.historyByCounty.get(countyName) || [];
  }

  function stateMedianSeries() {
    return state.years.map(function (year) {
      var values = (state.historyByYear.get(year) || []).map(function (record) {
        return record.metrics[state.selectedMetric];
      }).filter(Number.isFinite);
      return { year: year, value: d3.median(values) || 0 };
    });
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

  function weightedImpactCount(counts) {
    return (counts.murder * IMPACT_WEIGHTS.murder) +
      (counts.rape * IMPACT_WEIGHTS.rape) +
      (counts.robbery * IMPACT_WEIGHTS.robbery) +
      (counts.aggravated_assault * IMPACT_WEIGHTS.aggravated_assault) +
      (counts.burglary * IMPACT_WEIGHTS.burglary) +
      (counts.motor_vehicle_theft * IMPACT_WEIGHTS.motor_vehicle_theft) +
      (counts.larceny * IMPACT_WEIGHTS.larceny);
  }

  function metricContext(metric) {
    if (metric.id === "impact_score") {
      return "This is a severity-weighted lens rather than an official state-published field.";
    }
    if (metric.id === "index_rate") {
      return "This is the official top-line benchmark across index offenses.";
    }
    return "Use the trend chart below to see whether the county is improving or worsening over time.";
  }

  function lookbackComparison(history, yearsBack) {
    var latest = history[history.length - 1];
    var targetYear = latest.year - yearsBack;
    var baseline = history[0];
    var index = history.length - 2;

    if (yearsBack > 0) {
      for (; index >= 0; index -= 1) {
        if (history[index].year <= targetYear) {
          baseline = history[index];
          break;
        }
      }
    }

    var delta = percentChange(latest.metrics[state.selectedMetric], baseline.metrics[state.selectedMetric]);
    var directionWord = Math.abs(delta) < 4 ? "mostly flat" : (delta < 0 ? "getting better" : "getting worse");
    var label = baseline.year === latest.year - 5 ? "5-year change" : "Since " + baseline.year;

    return {
      label: label,
      value: formatChange(delta),
      detail: baseline.year === latest.year ? "Current year" : baseline.year + " to " + latest.year,
      directionWord: directionWord,
      narrative: baseline.year === latest.year
        ? "There is not enough history yet to call a trend."
        : directionWord === "mostly flat"
          ? "It has been roughly flat since " + baseline.year + "."
          : "It is " + formatChange(delta).replace("+", "") + (delta > 0 ? " higher" : " lower") + " than it was in " + baseline.year + "."
    };
  }

  function trendBlurb(county, history, metric, latestMedianPoint) {
    var shortTerm = lookbackComparison(history, 5);
    var longDelta = percentChange(history[history.length - 1].metrics[state.selectedMetric], history[0].metrics[state.selectedMetric]);
    var latest = history[history.length - 1];
    var medianText = comparisonText(latest.metrics[state.selectedMetric], latestMedianPoint.value).toLowerCase();

    return county.displayName + " is " + shortTerm.directionWord + " on " + metric.label.toLowerCase() + ": " + shortTerm.narrative + " Long run, it is " + (Math.abs(longDelta) < 4 ? "still near its " + history[0].year + " level" : formatChange(longDelta).replace("+", "") + (longDelta > 0 ? " higher" : " lower") + " than in " + history[0].year) + ". It is currently " + medianText + ".";
  }

  function groupBy(records, field) {
    var map = new Map();
    var index = 0;
    for (; index < records.length; index += 1) {
      var record = records[index];
      if (!map.has(record[field])) {
        map.set(record[field], []);
      }
      map.get(record[field]).push(record);
    }
    map.forEach(function (rows) {
      rows.sort(function (a, b) { return a.year - b.year; });
    });
    return map;
  }

  function uniqueYears(records) {
    var seen = {};
    var years = [];
    var index = 0;
    for (; index < records.length; index += 1) {
      if (!seen[records[index].year]) {
        seen[records[index].year] = true;
        years.push(records[index].year);
      }
    }
    years.sort(function (a, b) { return a - b; });
    return years;
  }

  function buildAllRatesHistoryUrl(config) {
    return buildSocrataUrl(config.ratesApi, {
      "$select": "county,year,population,index_count,index_rate,violent_count,violent_rate,property_count,property_rate,firearm_count,firearm_rate",
      "$limit": "5000"
    });
  }

  function buildAllCategoryHistoryUrl(config) {
    return buildSocrataUrl(config.categoryApi, {
      "$select": "county,year,total_index_crimes,violent,murder,forcible_rape,robbery,aggravated_assault,property,burglary,larceny,motor_vehicle_theft",
      "$where": "agency='County Total'",
      "$limit": "5000"
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
    return METRIC_BY_ID[state.selectedMetric] || METRIC_BY_ID.index_rate;
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
    var overrides = COUNTY_NAME_OVERRIDES[state.selectedState] || {};
    return (overrides[name] || name) + " County";
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

  function comparisonSummary(primary, secondary, metric, primaryTrend, secondaryTrend) {
    if (primary.county === secondary.county) {
      return '<p class="crime-summary-copy">You are comparing <strong>' + primary.displayName + '</strong> to itself. Pick a different county in the compare control for a true side-by-side read.</p>';
    }

    var activePrimary = primary.metrics[state.selectedMetric];
    var activeSecondary = secondary.metrics[state.selectedMetric];
    var activeLeader = higherCounty(primary, secondary, activePrimary, activeSecondary);
    var activeGap = formatComparisonGap(activePrimary, activeSecondary);
    var impactLeader = higherCounty(primary, secondary, primary.metrics.impact_score, secondary.metrics.impact_score);
    var activeSentence = activeGap === 'nearly tied'
      ? primary.displayName + ' and ' + secondary.displayName + ' are effectively tied on ' + metric.label.toLowerCase()
      : '<strong>' + activeLeader.displayName + '</strong> is higher on ' + metric.label.toLowerCase() + ' by ' + activeGap;
    return '<p class="crime-summary-copy">' + activeSentence + '. On the weighted crime impact score, <strong>' + impactLeader.displayName + '</strong> comes out worse. Over the last 5 years, ' + primary.displayName + ' is ' + primaryTrend.directionWord + ' while ' + secondary.displayName + ' is ' + secondaryTrend.directionWord + '.</p>';
  }

  function comparisonRow(label, primaryValue, secondaryValue, edgeText) {
    return '<tr><td>' + label + '</td><td>' + primaryValue + '</td><td>' + secondaryValue + '</td><td>' + edgeText + '</td></tr>';
  }

  function higherCounty(primary, secondary, primaryValue, secondaryValue) {
    if (primaryValue >= secondaryValue) {
      return primary;
    }
    return secondary;
  }

  function formatComparisonGap(primaryValue, secondaryValue) {
    if (!Number.isFinite(primaryValue) || !Number.isFinite(secondaryValue)) {
      return 'n/a';
    }
    if (Math.abs(primaryValue - secondaryValue) < 0.1) {
      return 'nearly tied';
    }
    if (!secondaryValue) {
      return formatRate(Math.abs(primaryValue - secondaryValue)) + ' points';
    }
    return integerFormat.format(Math.round(Math.abs(((primaryValue - secondaryValue) / secondaryValue) * 100))) + '%';
  }

  function metricEdgeText(primary, secondary, primaryValue, secondaryValue) {
    if (Math.abs(primaryValue - secondaryValue) < 0.1) {
      return 'Essentially tied';
    }
    return higherCounty(primary, secondary, primaryValue, secondaryValue).displayName + ' higher';
  }

  function countEdgeText(primary, secondary, primaryValue, secondaryValue) {
    if (primaryValue === secondaryValue) {
      return 'Same incident count';
    }
    return (primaryValue > secondaryValue ? primary.displayName : secondary.displayName) + ' more incidents';
  }

  function rankEdgeText(primary, secondary, primaryRank, secondaryRank) {
    if (primaryRank === secondaryRank) {
      return 'Same statewide rank';
    }
    return (primaryRank < secondaryRank ? primary.displayName : secondary.displayName) + ' ranks worse';
  }

  function trendEdgeText(primary, secondary, primaryTrend, secondaryTrend) {
    var primaryValue = parseTrendValue(primaryTrend.value);
    var secondaryValue = parseTrendValue(secondaryTrend.value);
    if (primaryValue === secondaryValue) {
      return 'Same 5-year change';
    }
    return (primaryValue < secondaryValue ? primary.displayName : secondary.displayName) + ' improving faster';
  }

  function parseTrendValue(value) {
    if (value === 'Flat') {
      return 0;
    }
    return Number(String(value).replace('%', '')) || 0;
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




