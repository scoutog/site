(function () {
  var canvas = document.getElementById("capacity-model");
  var stageEl = document.getElementById("capacity-stage");
  if (!canvas) return;

  var ctx = canvas.getContext("2d");
  var reelSection = document.getElementById("capacity-case");
  var titleEl = document.getElementById("capacity-title");
  var kickerEl = document.getElementById("reel-kicker");
  var summaryEl = document.getElementById("reel-summary");
  var progressEl = document.getElementById("reel-progress");
  var mediaEl = document.querySelector(".reel-media");
  var projectVisualEl = document.getElementById("project-visual");
  var stepEls = Array.prototype.slice.call(document.querySelectorAll(".reel-step-list li"));
  var dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  var cssWidth = 960;
  var cssHeight = 620;
  var last = 0;
  var activeStep = -1;
  var targetProgress = 0.08;
  var visualProgress = 0.08;
  var particles = [];
  var animationOffset = 1800;

  var projects = [
    {
      title: "Distribution center capacity model",
      summary: "A three-DC capacity model showing one node overflow while another sits underused, then diverting flow to rebalance shipping capacity.",
      label: "Project 01",
      status: "Balancing DC flow",
      visual: "capacity",
      progress: 0.08
    },
    {
      title: "Size curve forecasting",
      summary: "Estimated true product demand by using sales history, imputing lost sales from stockouts, filtering unhealthy discounted demand, and producing size-curve distributions to reduce stockouts and overproduction.",
      label: "Project 02",
      status: "Size curve corrected",
      visual: "sizecurve",
      progress: 0.2
    },
    {
      title: "Mid-range supply and demand forecast",
      summary: "Built a 6-18 month planning view that connects near-term factory orders and known demand with longer-range fiscal targets and scenario assumptions.",
      label: "Project 03",
      status: "Demand plan bridged",
      visual: "forecast",
      progress: 0.42
    },
    {
      title: "Nike apparel graphic and logo detector",
      summary: "A VLM concept for identifying apparel graphic placements and logo details, such as a medium chest graphic and a small accent Swoosh near the back neck.",
      label: "Project 04",
      status: "Graphic regions found",
      visual: "vlm",
      progress: 0.68
    }
  ];

  var nodes = [
    { id: "factory", label: "Factory", x: 0.16, y: 0.5, type: "factory" },
    { id: "dc-a", label: "Distribution Center 1", x: 0.48, y: 0.25, type: "dc" },
    { id: "dc-b", label: "Distribution Center 2", x: 0.48, y: 0.5, type: "dc" },
    { id: "dc-c", label: "Distribution Center 3", x: 0.48, y: 0.75, type: "dc" }
  ];

  var links = [
    { from: "factory", to: "dc-a", key: "inA", kind: "inbound" },
    { from: "factory", to: "dc-b", key: "inB", kind: "inbound" },
    { from: "factory", to: "dc-c", key: "inC", kind: "inbound" },
    { from: "dc-a", to: { x: 0.88, y: 0.25 }, key: "outA", kind: "outbound" },
    { from: "dc-b", to: { x: 0.88, y: 0.5 }, key: "outB", kind: "outbound" },
    { from: "dc-c", to: { x: 0.88, y: 0.75 }, key: "outC", kind: "outbound" },
    { from: "dc-b", to: "dc-c", key: "divert", kind: "divert" }
  ];

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    cssWidth = Math.max(320, rect.width || 960);
    cssHeight = Math.max(320, rect.height || 620);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clampUnit(value) {
    return Math.max(0, Math.min(1, value));
  }

  function nodeById(id) {
    return nodes.find(function (node) { return node.id === id; });
  }

  function point(node) {
    return { x: node.x * cssWidth, y: node.y * cssHeight };
  }

  function endpointPoint(endpoint) {
    if (typeof endpoint === "string") {
      return point(nodeById(endpoint));
    }
    return { x: endpoint.x * cssWidth, y: endpoint.y * cssHeight };
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function smooth(t) {
    return t * t * (3 - 2 * t);
  }

  function scenario(progress) {
    if (progress < 0.48) {
      var rawT = progress / 0.48;
      var greenHold = clampUnit(rawT / 0.32);
      var overloadT = clampUnit((rawT - 0.32) / 0.68);
      var loadB = rawT < 0.32 ? mix(0.72, 0.82, smooth(greenHold)) : mix(0.82, 1.38, smooth(overloadT));
      var inboundB = rawT < 0.32 ? mix(0.54, 0.66, smooth(greenHold)) : mix(0.66, 1.08, smooth(overloadT));
      var outboundB = rawT < 0.32 ? 0.62 : mix(0.62, 0.42, smooth(overloadT));
      return {
        name: "Factory overfeeds DC 2",
        load: {
          factory: 0.76,
          "dc-a": 0.68,
          "dc-b": loadB,
          "dc-c": 0.38
        },
        flows: {
          inA: 0.56,
          inB: inboundB,
          inC: 0.24,
          outA: 0.54,
          outB: outboundB,
          outC: 0.32,
          divert: 0
        },
        stress: smooth(overloadT)
      };
    }

    var recoverT = smooth((progress - 0.48) / 0.52);
    return {
      name: "Flow diverts to underused DC 3",
      load: {
        factory: 0.76,
        "dc-a": 0.68,
        "dc-b": mix(1.38, 0.78, recoverT),
        "dc-c": mix(0.38, 0.74, recoverT)
      },
      flows: {
        inA: 0.56,
        inB: mix(1.08, 0.62, recoverT),
        inC: mix(0.24, 0.66, recoverT),
        outA: 0.54,
        outB: mix(0.42, 0.58, recoverT),
        outC: mix(0.32, 0.6, recoverT),
        divert: mix(0.1, 0.8, recoverT)
      },
      stress: 1 - recoverT * 0.75
    };
  }

  function updateStoryFromScroll() {
    if (!reelSection) return;

    var rect = reelSection.getBoundingClientRect();
    var scrollable = Math.max(1, rect.height - window.innerHeight);
    var rawProgress = clampUnit((0 - rect.top) / scrollable);
    var stepIndex = Math.min(projects.length - 1, Math.floor(rawProgress * projects.length));
    var step = projects[stepIndex];

    targetProgress = step.progress;
    if (stepIndex === activeStep) return;

    activeStep = stepIndex;
    if (kickerEl) kickerEl.textContent = step.label;
    if (titleEl) titleEl.textContent = step.title;
    if (summaryEl) summaryEl.textContent = step.summary;
    if (stageEl) stageEl.textContent = step.status;
    if (progressEl) progressEl.style.width = (((stepIndex + 1) / projects.length) * 100).toFixed(1) + "%";
    if (mediaEl) mediaEl.classList.toggle("show-capacity", step.visual === "capacity");
    if (projectVisualEl) {
      projectVisualEl.className = "project-visual visual-" + step.visual;
    }
    stepEls.forEach(function (el, idx) {
      el.classList.toggle("active", idx === stepIndex);
    });
  }

  function colorForLoad(load) {
    if (load >= 1.04) return "#ef4444";
    if (load >= 0.92) return "#fbbf24";
    return "#22c55e";
  }

  function activeShare(link, scene) {
    return scene.flows && Number.isFinite(scene.flows[link.key]) ? scene.flows[link.key] : 0.6;
  }

  function addParticles(scene, dt) {
    links.forEach(function (link) {
      var volume = activeShare(link, scene);
      var chance = volume * dt * (link.kind === "divert" ? 5.8 : (link.kind === "inbound" ? 3.3 : 2.4));
      if (Math.random() < chance) {
        particles.push({
          link: link,
          t: 0,
          speed: (link.kind === "outbound" ? 0.12 : 0.18) + Math.random() * 0.08,
          size: 2.3 + Math.random() * 2.2
        });
      }
    });

    particles = particles.filter(function (particle) {
      var penalty = particle.link.kind === "outbound" ? scene.stress * 0.08 : 0;
      particle.t += dt * Math.max(0.08, particle.speed - penalty);
      return particle.t <= 1;
    });
  }

  function seedParticles(scene) {
    particles = [];
    links.forEach(function (link) {
      var volume = activeShare(link, scene);
      if (link.kind === "divert" && volume < 0.06) return;

      var count = Math.max(2, Math.round(volume * (link.kind === "inbound" ? 10 : 7)));
      for (var i = 0; i < count; i += 1) {
        particles.push({
          link: link,
          t: (i + 1) / (count + 1),
          speed: (link.kind === "outbound" ? 0.12 : 0.18) + Math.random() * 0.08,
          size: 2.3 + Math.random() * 2.2
        });
      }
    });
  }

  function drawBackground() {
    ctx.fillStyle = "#050507";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.strokeStyle = "rgba(228, 228, 231, 0.05)";
    ctx.lineWidth = 1;
    var step = 42;
    for (var x = 0; x < cssWidth; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssHeight);
      ctx.stroke();
    }
    for (var y = 0; y < cssHeight; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
    }
  }

  function drawLink(link, scene) {
    var from = endpointPoint(link.from);
    var to = endpointPoint(link.to);
    var share = activeShare(link, scene);
    if (link.kind === "divert" && share < 0.06) return;

    var width = 3 + share * (link.kind === "inbound" ? 11 : (link.kind === "divert" ? 8 : 7));
    var isConstrainedOutbound = link.kind === "outbound" && link.from === "dc-b" && scene.stress > 0.35;

    ctx.strokeStyle = link.kind === "divert"
      ? "rgba(103, 232, 249, 0.76)"
      : (isConstrainedOutbound ? "rgba(239, 68, 68, 0.62)" : (link.kind === "inbound" ? "rgba(34, 197, 94, 0.58)" : "rgba(103, 232, 249, 0.42)"));
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    if (link.kind === "divert") {
      var c1 = { x: from.x + cssWidth * 0.12, y: from.y + cssHeight * 0.06 };
      var c2 = { x: to.x + cssWidth * 0.12, y: to.y - cssHeight * 0.06 };
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
    } else if (link.kind === "outbound") {
      ctx.lineTo(to.x, to.y);
    } else {
      ctx.bezierCurveTo(mix(from.x, to.x, 0.45), from.y, mix(from.x, to.x, 0.62), to.y, to.x, to.y);
    }
    ctx.stroke();

    if (isConstrainedOutbound) {
      ctx.strokeStyle = "rgba(239, 68, 68, 0.18)";
      ctx.lineWidth = width + 8;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }

  function drawParticles(scene) {
    particles.forEach(function (particle) {
      var from = endpointPoint(particle.link.from);
      var to = endpointPoint(particle.link.to);
      var t = smooth(particle.t);
      var x;
      var y;
      if (particle.link.kind === "divert") {
        var c1 = { x: from.x + cssWidth * 0.12, y: from.y + cssHeight * 0.06 };
        var c2 = { x: to.x + cssWidth * 0.12, y: to.y - cssHeight * 0.06 };
        var a = { x: mix(from.x, c1.x, t), y: mix(from.y, c1.y, t) };
        var b = { x: mix(c1.x, c2.x, t), y: mix(c1.y, c2.y, t) };
        var c = { x: mix(c2.x, to.x, t), y: mix(c2.y, to.y, t) };
        var d = { x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) };
        var e = { x: mix(b.x, c.x, t), y: mix(b.y, c.y, t) };
        x = mix(d.x, e.x, t);
        y = mix(d.y, e.y, t);
      } else if (particle.link.kind === "outbound") {
        x = mix(from.x, to.x, t);
        y = mix(from.y, to.y, t);
      } else {
        x = mix(from.x, to.x, t);
        y = mix(mix(from.y, to.y, t), from.y + (to.y - from.y) * t, 0.5);
      }
      var stress = particle.link.kind === "outbound" ? scene.stress : 0;

      ctx.fillStyle = particle.link.kind === "divert" ? "#67e8f9" : (stress > 0.55 ? "#fca5a5" : (particle.link.kind === "inbound" ? "#bbf7d0" : "#a5f3fc"));
      ctx.beginPath();
      ctx.arc(x, y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawNode(node, scene) {
    var p = point(node);
    var load = scene.load[node.id] || 0.7;
    var color = node.type === "factory" ? "#22c55e" : colorForLoad(load);
    if (node.type !== "factory" && load < 0.52) color = "#38bdf8";
    var radius = node.type === "factory" ? 38 : 42 + Math.max(0, Math.min(1, load - 0.55)) * 18;

    ctx.shadowColor = color;
    ctx.shadowBlur = load >= 1.04 ? 28 : 14;
    ctx.fillStyle = load >= 1.04 ? "rgba(127, 29, 29, 0.5)" : (load < 0.52 ? "rgba(8, 47, 73, 0.45)" : "#111113");
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    drawNodeLabel(node, p);
  }

  function drawNodeLabel(node, p) {
    ctx.fillStyle = "#e4e4e7";
    ctx.font = node.type === "factory" ? "700 13px Inter, system-ui, sans-serif" : "700 10px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (node.type === "factory") {
      ctx.fillText(node.label, p.x, p.y);
    } else {
      ctx.fillText("Distribution", p.x, p.y - 5);
      ctx.fillText("Center " + node.label.slice(-1), p.x, p.y + 8);
    }
    ctx.textBaseline = "alphabetic";
  }

  function drawLabels(scene) {
    return scene;
  }

  function drawRoundRect(x, y, width, height, radius, fill, stroke) {
    var r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawSceneLabel(text, x, y, size, color, align) {
    ctx.fillStyle = color || "#e4e4e7";
    ctx.font = "700 " + (size || 13) + "px Inter, system-ui, sans-serif";
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y);
    ctx.textBaseline = "alphabetic";
  }

  function drawArrow(fromX, fromY, toX, toY, color) {
    var angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - 12 * Math.cos(angle - 0.45), toY - 12 * Math.sin(angle - 0.45));
    ctx.lineTo(toX - 12 * Math.cos(angle + 0.45), toY - 12 * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  function drawMiniBar(x, y, width, height, value, color) {
    drawRoundRect(x, y, width, height, 999, "rgba(39, 39, 42, 0.9)", "rgba(228, 228, 231, 0.08)");
    drawRoundRect(x, y + height * (1 - value), width, height * value, 999, color, null);
  }

  function drawProjectHeader(title, subtitle) {
    drawRoundRect(26, 26, Math.min(420, cssWidth - 52), 56, 999, "rgba(9, 9, 11, 0.78)", "rgba(228, 228, 231, 0.12)");
    drawSceneLabel(title, 48, 49, 13, "#e4e4e7", "left");
    drawSceneLabel(subtitle, 48, 67, 10, "#a1a1aa", "left");
  }

  function drawSizeCurveScene(timestamp) {
    var t = (timestamp % 5200) / 5200;
    var cleanse = smooth(clampUnit((t - 0.12) / 0.42));
    var curve = smooth(clampUnit((t - 0.44) / 0.42));
    drawBackground();

    var leftX = cssWidth * 0.09;
    var midX = cssWidth * 0.47;
    var rightX = cssWidth * 0.68;
    var baseY = cssHeight * 0.72;
    var rows = [
      { name: "Tee A", sales: 0.58, lost: 0.28, discount: 0.18 },
      { name: "Fleece B", sales: 0.72, lost: 0.12, discount: 0.25 },
      { name: "Short C", sales: 0.46, lost: 0.36, discount: 0.08 },
      { name: "Polo D", sales: 0.62, lost: 0.16, discount: 0.14 }
    ];

    drawSceneLabel("sales history", leftX + 118, cssHeight * 0.2, 12, "#d4d4d8");
    rows.forEach(function (row, i) {
      var y = cssHeight * 0.27 + i * 54;
      drawRoundRect(leftX, y, 236, 34, 8, "rgba(24, 24, 27, 0.86)", "rgba(228, 228, 231, 0.09)");
      drawSceneLabel(row.name, leftX + 14, y + 18, 10, "#a1a1aa", "left");
      drawRoundRect(leftX + 72, y + 12, 104 * row.sales, 10, 999, "#22c55e", null);
      drawRoundRect(leftX + 72 + 104 * row.sales + 5, y + 12, 52 * row.lost * cleanse, 10, 999, "#67e8f9", null);
      ctx.strokeStyle = "rgba(239, 68, 68, " + (0.25 + cleanse * 0.55) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(leftX + 188, y + 7);
      ctx.lineTo(leftX + 218, y + 27);
      ctx.moveTo(leftX + 218, y + 7);
      ctx.lineTo(leftX + 188, y + 27);
      ctx.stroke();
    });

    drawArrow(leftX + 270, cssHeight * 0.38, midX - 36, cssHeight * 0.38, "rgba(103, 232, 249, 0.76)");
    drawRoundRect(midX - 28, cssHeight * 0.29, 126, 120, 12, "rgba(8, 47, 73, 0.46)", "rgba(103, 232, 249, 0.34)");
    drawSceneLabel("impute", midX + 35, cssHeight * 0.34, 12, "#67e8f9");
    drawSceneLabel("lost sales", midX + 35, cssHeight * 0.38, 12, "#67e8f9");
    drawSceneLabel("remove", midX + 35, cssHeight * 0.46, 12, "#fca5a5");
    drawSceneLabel("discount noise", midX + 35, cssHeight * 0.5, 12, "#fca5a5");
    drawArrow(midX + 124, cssHeight * 0.38, rightX - 34, cssHeight * 0.38, "rgba(34, 197, 94, 0.76)");

    drawSceneLabel("size distribution", rightX + 118, cssHeight * 0.2, 12, "#d4d4d8");
    var labels = ["XS", "S", "M", "L", "XL"];
    var raw = [0.25, 0.5, 0.95, 0.62, 0.28];
    var fixed = [0.18, 0.58, 0.9, 0.72, 0.36];
    labels.forEach(function (label, i) {
      var value = mix(raw[i], fixed[i], curve);
      var x = rightX + i * 44;
      drawMiniBar(x, baseY - 178, 24, 178, value, i === 2 ? "#22c55e" : "#67e8f9");
      drawSceneLabel(label, x + 12, baseY + 24, 10, "#a1a1aa");
    });

    ctx.strokeStyle = "rgba(34, 197, 94, 0.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    labels.forEach(function (_label, i) {
      var value = mix(raw[i], fixed[i], curve);
      var x = rightX + i * 44 + 12;
      var y = baseY - 178 * value;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    drawSceneLabel("less stockout", rightX + 70, baseY - 218, 11, "#bbf7d0");
    drawSceneLabel("less overbuy", rightX + 164, baseY - 218, 11, "#bbf7d0");
  }

  function drawForecastScene(timestamp) {
    var t = (timestamp % 6200) / 6200;
    var solve = smooth(clampUnit((t - 0.16) / 0.58));
    var pulse = 0.5 + Math.sin(t * Math.PI * 2) * 0.5;
    drawBackground();

    var graphX = cssWidth * 0.12;
    var graphY = cssHeight * 0.18;
    var graphW = cssWidth * 0.74;
    var graphH = cssHeight * 0.6;
    var bridgeStart = 0.34;
    var bridgeEnd = 0.88;

    drawRoundRect(graphX, graphY, graphW, graphH, 16, "rgba(9, 9, 11, 0.58)", "rgba(228, 228, 231, 0.12)");
    drawSceneLabel("supply and demand forecast", graphX + 22, graphY + 24, 13, "#e4e4e7", "left");
    drawSceneLabel("known facts", graphX + graphW * 0.18, graphY + graphH + 30, 11, "#a1a1aa");
    drawSceneLabel("scenario bridge", graphX + graphW * 0.61, graphY + graphH + 30, 11, "#67e8f9");
    drawSceneLabel("fiscal target", graphX + graphW * 0.9, graphY + graphH + 30, 11, "#fde68a");

    ctx.fillStyle = "rgba(103, 232, 249, 0.08)";
    ctx.fillRect(graphX + graphW * bridgeStart, graphY + 46, graphW * (bridgeEnd - bridgeStart), graphH - 82);
    ctx.strokeStyle = "rgba(103, 232, 249, 0.26)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 8]);
    [bridgeStart, bridgeEnd].forEach(function (p) {
      var x = graphX + graphW * p;
      ctx.beginPath();
      ctx.moveTo(x, graphY + 46);
      ctx.lineTo(x, graphY + graphH - 36);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    [0.14, 0.32, 0.5, 0.68, 0.86].forEach(function (p, i) {
      var x = graphX + graphW * p;
      ctx.strokeStyle = "rgba(228, 228, 231, 0.08)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, graphY + 54);
      ctx.lineTo(x, graphY + graphH - 48);
      ctx.stroke();
      drawSceneLabel(["0m", "6m", "9m", "12m", "18m"][i], x, graphY + graphH - 22, 10, "#71717a");
    });

    [0.22, 0.44, 0.66, 0.88].forEach(function (p) {
      var y = graphY + graphH * p;
      ctx.strokeStyle = "rgba(228, 228, 231, 0.07)";
      ctx.beginPath();
      ctx.moveTo(graphX + 42, y);
      ctx.lineTo(graphX + graphW - 42, y);
      ctx.stroke();
    });

    function graphPoint(p) {
      return {
        x: graphX + graphW * (0.08 + p[0] * 0.84),
        y: graphY + graphH * (0.82 - p[1] * 0.62)
      };
    }

    function drawGraphCurve(points, color, width) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width || 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      points.forEach(function (p, i) {
        var point = graphPoint(p);
        if (i === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
    }

    var demandPoints = [[0, 0.46], [0.16, 0.53], [0.32, 0.61], [0.52, 0.7], [0.72, 0.75], [1, 0.8]];
    var supplyPoints = [
      [0, 0.56],
      [0.16, 0.59],
      [0.32, 0.55],
      [0.52, mix(0.43, 0.63, solve)],
      [0.72, mix(0.45, 0.7, solve)],
      [1, mix(0.55, 0.78, solve)]
    ];
    var rawSupplyPoints = [[0.32, 0.55], [0.52, 0.43], [0.72, 0.45], [1, 0.55]];

    drawGraphCurve(rawSupplyPoints, "rgba(239, 68, 68, " + (0.34 * (1 - solve)) + ")", 3);
    drawGraphCurve(demandPoints, "rgba(103, 232, 249, 0.9)", 5);
    drawGraphCurve(supplyPoints, "rgba(34, 197, 94, 0.92)", 5);

    var target = graphPoint([0.98, 0.8]);
    ctx.strokeStyle = "rgba(251, 191, 36, 0.68)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 7]);
    ctx.beginPath();
    ctx.moveTo(graphX + graphW * bridgeEnd, target.y);
    ctx.lineTo(graphX + graphW - 38, target.y);
    ctx.stroke();
    ctx.setLineDash([]);

    drawRoundRect(target.x - 46, target.y - 20, 92, 40, 999, "rgba(113, 63, 18, 0.6)", "rgba(251, 191, 36, 0.38)");
    drawSceneLabel("target", target.x, target.y, 11, "#fde68a");

    var marker = graphPoint([mix(0.34, 0.88, solve), mix(0.48, 0.72, solve)]);
    drawRoundRect(marker.x - 50, marker.y - 25, 100, 50, 999, "rgba(9, 9, 11, 0.88)", "rgba(103, 232, 249, 0.34)");
    drawSceneLabel("bridge", marker.x, marker.y - 5, 11, "#e4e4e7");
    drawSceneLabel("scenario", marker.x, marker.y + 12, 10, "#67e8f9");

    drawRoundRect(graphX + 24, graphY + graphH - 94, 206, 38, 999, "rgba(9, 9, 11, 0.74)", "rgba(228, 228, 231, 0.1)");
    drawRoundRect(graphX + 42, graphY + graphH - 80, 34, 8, 999, "#22c55e", null);
    drawSceneLabel("supply", graphX + 88, graphY + graphH - 76, 10, "#d4d4d8", "left");
    drawRoundRect(graphX + 138, graphY + graphH - 80, 34, 8, 999, "#67e8f9", null);
    drawSceneLabel("demand", graphX + 184, graphY + graphH - 76, 10, "#d4d4d8", "left");

    var chipY = graphY + graphH + 58;
    drawSceneLabel("bridge inputs", graphX + 60, chipY + 12, 11, "#a1a1aa", "left");
    [
      ["factory orders", "#22c55e"],
      ["booked demand", "#67e8f9"],
      ["inventory", "#a78bfa"]
    ].forEach(function (item, i) {
      var x = graphX + 150 + i * 142;
      drawRoundRect(x, chipY, 130, 24, 999, "rgba(9, 9, 11, 0.72)", "rgba(228, 228, 231, 0.09)");
      ctx.fillStyle = item[1];
      ctx.beginPath();
      ctx.arc(x + 16, chipY + 12, 4 + (i === Math.floor(pulse * 4) ? 1.5 : 0), 0, Math.PI * 2);
      ctx.fill();
      drawSceneLabel(item[0], x + 28, chipY + 12, 10, "#d4d4d8", "left");
    });
  }

  function drawVlmScene(timestamp) {
    var t = (timestamp % 4800) / 4800;
    var scan = smooth(clampUnit(t / 0.72));
    var found = smooth(clampUnit((t - 0.28) / 0.42));
    drawBackground();

    var shirtX = cssWidth * 0.39;
    var shirtY = cssHeight * 0.17;
    var bodyW = cssWidth * 0.24;
    var bodyH = cssHeight * 0.6;
    ctx.fillStyle = "rgba(35, 35, 39, 0.98)";
    ctx.strokeStyle = "rgba(228, 228, 231, 0.16)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shirtX + bodyW * 0.34, shirtY);
    ctx.lineTo(shirtX + bodyW * 0.12, shirtY + bodyH * 0.08);
    ctx.lineTo(shirtX - bodyW * 0.16, shirtY + bodyH * 0.19);
    ctx.quadraticCurveTo(shirtX - bodyW * 0.26, shirtY + bodyH * 0.25, shirtX - bodyW * 0.22, shirtY + bodyH * 0.36);
    ctx.lineTo(shirtX - bodyW * 0.08, shirtY + bodyH * 0.52);
    ctx.quadraticCurveTo(shirtX, shirtY + bodyH * 0.6, shirtX + bodyW * 0.12, shirtY + bodyH * 0.54);
    ctx.lineTo(shirtX + bodyW * 0.2, shirtY + bodyH * 0.95);
    ctx.quadraticCurveTo(shirtX + bodyW * 0.22, shirtY + bodyH, shirtX + bodyW * 0.3, shirtY + bodyH);
    ctx.lineTo(shirtX + bodyW * 0.7, shirtY + bodyH);
    ctx.quadraticCurveTo(shirtX + bodyW * 0.78, shirtY + bodyH, shirtX + bodyW * 0.8, shirtY + bodyH * 0.95);
    ctx.lineTo(shirtX + bodyW * 0.88, shirtY + bodyH * 0.54);
    ctx.quadraticCurveTo(shirtX + bodyW, shirtY + bodyH * 0.6, shirtX + bodyW * 1.08, shirtY + bodyH * 0.52);
    ctx.lineTo(shirtX + bodyW * 1.22, shirtY + bodyH * 0.36);
    ctx.quadraticCurveTo(shirtX + bodyW * 1.26, shirtY + bodyH * 0.25, shirtX + bodyW * 1.16, shirtY + bodyH * 0.19);
    ctx.lineTo(shirtX + bodyW * 0.88, shirtY + bodyH * 0.08);
    ctx.lineTo(shirtX + bodyW * 0.66, shirtY);
    ctx.quadraticCurveTo(shirtX + bodyW * 0.5, shirtY + bodyH * 0.1, shirtX + bodyW * 0.34, shirtY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    drawRoundRect(shirtX + bodyW * 0.39, shirtY + bodyH * 0.015, bodyW * 0.22, bodyH * 0.07, 999, "#050507", "rgba(228, 228, 231, 0.12)");

    var graphicBox = {
      x: shirtX + bodyW * 0.31,
      y: shirtY + bodyH * 0.34,
      w: bodyW * 0.38,
      h: bodyH * 0.25
    };
    var logoBox = {
      x: shirtX + bodyW * 0.69,
      y: shirtY + bodyH * 0.2,
      w: bodyW * 0.13,
      h: bodyH * 0.052
    };
    drawRoundRect(graphicBox.x, graphicBox.y, graphicBox.w, graphicBox.h, 8, "rgba(8, 47, 73, 0.34)", "rgba(103, 232, 249, 0.16)");
    ctx.strokeStyle = "rgba(34, 197, 94, " + (0.2 + found * 0.72) + ")";
    ctx.lineWidth = 3;
    drawRoundRect(graphicBox.x, graphicBox.y, graphicBox.w, graphicBox.h, 8, null, ctx.strokeStyle);
    ctx.strokeStyle = "rgba(103, 232, 249, " + (0.2 + found * 0.72) + ")";
    drawRoundRect(logoBox.x, logoBox.y, logoBox.w, logoBox.h, 999, null, ctx.strokeStyle);

    var scanY = shirtY + scan * bodyH;
    ctx.strokeStyle = "rgba(103, 232, 249, 0.82)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(shirtX - bodyW * 0.55, scanY);
    ctx.lineTo(shirtX + bodyW * 1.55, scanY);
    ctx.stroke();

    var leftPanelX = cssWidth * 0.1;
    drawSceneLabel("image input", leftPanelX + 82, cssHeight * 0.22, 12, "#d4d4d8");
    [0.18, 0.35, 0.52].forEach(function (offset, i) {
      drawRoundRect(leftPanelX, cssHeight * offset, 164, 74, 10, "rgba(24, 24, 27, 0.78)", "rgba(228, 228, 231, 0.09)");
      drawRoundRect(leftPanelX + 16, cssHeight * offset + 15, 38, 44, 8, "rgba(39, 39, 42, 0.95)", "rgba(228, 228, 231, 0.1)");
      drawRoundRect(leftPanelX + 70, cssHeight * offset + 18, 72, 8, 999, i === 1 ? "#22c55e" : "rgba(113, 113, 122, 0.8)", null);
      drawRoundRect(leftPanelX + 70, cssHeight * offset + 38, 48, 8, 999, i === 1 ? "#67e8f9" : "rgba(113, 113, 122, 0.55)", null);
    });
    drawArrow(leftPanelX + 188, cssHeight * 0.42, shirtX - 70, cssHeight * 0.42, "rgba(103, 232, 249, 0.62)");

    var rightPanelX = cssWidth * 0.72;
    drawSceneLabel("structured output", rightPanelX + 92, cssHeight * 0.22, 12, "#d4d4d8");
    [["chest graphic", "#22c55e"], ["small neck logo", "#67e8f9"], ["placement size", "#fbbf24"]].forEach(function (item, i) {
      var y = cssHeight * 0.3 + i * 62;
      drawRoundRect(rightPanelX, y, 184, 42, 8, "rgba(9, 9, 11, 0.76)", "rgba(228, 228, 231, 0.1)");
      ctx.fillStyle = item[1];
      ctx.beginPath();
      ctx.arc(rightPanelX + 20, y + 21, 5 + found * 2, 0, Math.PI * 2);
      ctx.fill();
      drawSceneLabel(item[0], rightPanelX + 36, y + 22, 11, "#e4e4e7", "left");
    });
  }

  function drawProjectScene(stepIndex, timestamp) {
    if (stepIndex === 1) {
      drawSizeCurveScene(timestamp);
    } else if (stepIndex === 2) {
      drawForecastScene(timestamp);
    } else {
      drawVlmScene(timestamp);
    }
  }

  function draw(timestamp) {
    if (!last) last = timestamp;
    var dt = Math.min(0.05, (timestamp - last) / 1000);
    last = timestamp;

    updateStoryFromScroll();
    if (activeStep === 0) {
      visualProgress = ((timestamp + animationOffset) % 9000) / 9000;
      var scene = scenario(visualProgress);
      if (stageEl) stageEl.textContent = scene.name;

      addParticles(scene, dt);
      drawBackground();
      links.forEach(function (link) { drawLink(link, scene); });
      drawParticles(scene);
      nodes.forEach(function (node) { drawNode(node, scene); });
      drawLabels(scene);
    } else {
      drawProjectScene(activeStep, timestamp);
    }

    requestAnimationFrame(draw);
  }

  resizeCanvas();
  updateStoryFromScroll();
  seedParticles(scenario(visualProgress));
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("scroll", updateStoryFromScroll, { passive: true });
  requestAnimationFrame(draw);
})();
