// Built from Project 2 (scatterplot, dot size, trend line) plus:
//   Project 3: aggregation with d3.rollup, scaleBand, sorting, bar chart vs dot plot
//   Project 4: histogram, hover interval/count, status line, and bin-count selector
//   Extra: ascending/descending sort button for chart 2, packed bubble chart of Pokemon counts per type
const chartWidth = 800, chartHeight = 420;
const chartMargins = { top: 30, right: 30, bottom: 80, left: 70 };
const plotWidth = chartWidth - chartMargins.left - chartMargins.right;
const plotHeight = chartHeight - chartMargins.top - chartMargins.bottom;
const tooltip = d3.select("#tooltip");

const numericVariableOptions = [
  { key: "HP", label: "HP" }, { key: "Attack", label: "Attack" }, { key: "Defense", label: "Defense" },
  { key: "Special_Attack", label: "Special Attack" }, { key: "Special_Defense", label: "Special Defense" },
  { key: "Speed", label: "Speed" }, { key: "Total", label: "Total (base stat sum)" },
  { key: "Height_m", label: "Height (m)" }, { key: "Weight_kg", label: "Weight (kg)" }
];
const pointSizeVariableOptions = [
  { key: "hp_over_total", label: "HP / Total" }, { key: "attack_over_total", label: "Attack / Total" },
  { key: "defense_over_total", label: "Defense / Total" }, { key: "SPA_over_total", label: "Special Attack / Total" },
  { key: "SPD_over_total", label: "Special Defense / Total" }, { key: "speed_over_total", label: "Speed / Total" },
  { key: "Height_over_weight", label: "Height / Weight" }
];

// ---------- shared chart scaffolding ----------
function createChartScaffold(chartSelector) {
  const chartSvg = d3.select(chartSelector).attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
  const g = chartSvg.append("g").attr("transform", `translate(${chartMargins.left},${chartMargins.top})`);
  return {
    g,
    xAxisG: g.append("g").attr("class", "axis").attr("transform", `translate(0,${plotHeight})`),
    yAxisG: g.append("g").attr("class", "axis"),
    xLabel: g.append("text").attr("class", "axis-label").attr("x", plotWidth / 2).attr("y", plotHeight + 70).attr("text-anchor", "middle"),
    yLabel: g.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)").attr("x", -plotHeight / 2).attr("y", -50).attr("text-anchor", "middle")
  };
}
const scatterChart = createChartScaffold("#scatter"), typeSummaryChart = createChartScaffold("#bar"), histogramChart = createChartScaffold("#hist");
const scatterplotPointsGroup = scatterChart.g.append("g");
const scatterplotTrendLine = scatterChart.g.append("line").attr("class", "trend-line").attr("pointer-events", "none").style("display", "none");
const typeBarsGroup = typeSummaryChart.g.append("g");
const dotPlotGuidesGroup = typeSummaryChart.g.append("g");
const dotPlotMarkersGroup = typeSummaryChart.g.append("g");
const histogramBarsGroup = histogramChart.g.append("g");
const bubbleWidth = 800, bubbleHeight = 520;
const bubbleGroup = d3.select("#bubble").attr("viewBox", `0 0 ${bubbleWidth} ${bubbleHeight}`).append("g");
let sortAscending = false;  // chart 2 sort direction (toggled by the button)

function showTooltip(event, tooltipHtml) { tooltip.classed("hidden", false).html(tooltipHtml); moveTooltip(event); }
function moveTooltip(event) { tooltip.style("left", (event.pageX + 14) + "px").style("top", (event.pageY - 10) + "px"); }
function hideTooltip() { tooltip.classed("hidden", true); }
function rotateCategoryAxisLabels(axisGroup) { axisGroup.selectAll("text").attr("transform", "rotate(-35)").style("text-anchor", "end"); }
function populateSelectOptions(chartSelector, items, defaultValue) {
  d3.select(chartSelector).selectAll("option").data(items).join("option").attr("value", d => d.key).text(d => d.label);
  d3.select(chartSelector).property("value", defaultValue);
}

// ---------- state ----------
let data = [], types = [], selectedPrimaryTypes = null;
const pokemonTypeColors = {"Bug":"#94bc4a","Dark":"#736c75","Dragon":"#6a7baf","Electric":"#e5c531","Fairy":"#e69eac","Fighting":"#c56e56","Fire":"#e8844a","Flying":"#9aa8d8","Ghost":"#846ab6","Grass":"#71c558","Ground":"#cc9f4f","Ice":"#70cbd4","Normal":"#aab09f","Poison":"#b468b7","Psychic":"#e5709b","Rock":"#b2a061","Steel":"#89a1b0","Water":"#539ae2"};
const color = type => pokemonTypeColors[type] || "#888888";
const getSelectedControlValue = id => d3.select(id).property("value");
const findOptionMetadata = (list, key) => list.find(v => v.key === key);

function getVisiblePokemon() {
  const gen = getSelectedControlValue("#genSelect");
  return data.filter(d =>
    (gen === "all" || String(d.Generation) === gen) &&
    (selectedPrimaryTypes === null || selectedPrimaryTypes.has(d.Type_I)));
}

// ---------- data loading and derived statistics ----------
function preparePokemonData(rows) {
  rows.forEach(d => {  // derive the ratio columns so any compatible CSV works
    const t = d.Total;
    d.hp_over_total ??= d.HP / t; d.attack_over_total ??= d.Attack / t; d.defense_over_total ??= d.Defense / t;
    d.SPA_over_total ??= d.Special_Attack / t; d.SPD_over_total ??= d.Special_Defense / t;
    d.speed_over_total ??= d.Speed / t; d.Height_over_weight ??= d.Height_m / d.Weight_kg;
  });
  return rows;
}

function initializeExplorer(rows) {
  data = preparePokemonData(rows);
  selectedPrimaryTypes = null;
  types = Array.from(new Set(data.map(d => d.Type_I))).sort();

  const gens = Array.from(new Set(data.map(d => d.Generation))).sort((a, b) => a - b);
  populateSelectOptions("#genSelect", [{ key: "all", label: "All generations" }, ...gens.map(g => ({ key: String(g), label: "Generation " + g }))], "all");
  populateSelectOptions("#xSelect", numericVariableOptions, "Attack"); populateSelectOptions("#ySelect", numericVariableOptions, "Defense");
  populateSelectOptions("#zSelect", pointSizeVariableOptions, "hp_over_total"); populateSelectOptions("#statSelect", numericVariableOptions, "Total");

  const items = d3.select("#legend").selectAll(".legend-item").data(types).join("div").attr("class", "legend-item")
    .on("click", (event, type) => {
      if (selectedPrimaryTypes === null) selectedPrimaryTypes = new Set(types);
      selectedPrimaryTypes.has(type) ? selectedPrimaryTypes.delete(type) : selectedPrimaryTypes.add(type);
      if (selectedPrimaryTypes.size === types.length) selectedPrimaryTypes = null;
      renderAllCharts();
    });
  items.selectAll("*").remove();
  items.append("span").attr("class", "legend-swatch").style("background-color", d => color(d));
  items.append("span").text(d => d);
  renderAllCharts();
}

d3.csv("pokedex.csv", d3.autoType).then(initializeExplorer);

["#genSelect", "#xSelect", "#ySelect", "#zSelect", "#statSelect", "#markSelect"].forEach(id => d3.select(id).on("change", renderAllCharts));
d3.select("#binRange").on("input", renderAllCharts);

function updateSortButtonLabel() {
  d3.select("#sortDirBtn").text(sortAscending ? "Order: Ascending ↑" : "Order: Descending ↓");
}
// Sensible default when switching modes: biggest first for values, A to Z for names
d3.select("#sortSelect").on("change", () => {
  sortAscending = getSelectedControlValue("#sortSelect") === "alpha";
  updateSortButtonLabel(); renderAllCharts();
});
d3.select("#sortDirBtn").on("click", () => { sortAscending = !sortAscending; updateSortButtonLabel(); renderAllCharts(); });

function renderAllCharts() {
  const vis = getVisiblePokemon();
  const gen = getSelectedControlValue("#genSelect");
  d3.select("#status").text(`${vis.length} of ${data.length} Pokemon shown | ${gen === "all" ? "All generations" : "Generation " + gen} | ` +
    (selectedPrimaryTypes === null ? "all types" : selectedPrimaryTypes.size + " types"));
  d3.select("#legend").selectAll(".legend-item").classed("dimmed", d => selectedPrimaryTypes !== null && !selectedPrimaryTypes.has(d));
  renderScatterplot(vis); renderTypeSummaryChart(vis); renderHistogram(vis); renderBubbleChart(vis);
}

// ---------- 1. scatterplot (Project 2) ----------
function calculateLinearRegression(points, xKey, yKey) {
  if (points.length < 2) return null;
  const mx = d3.mean(points, d => d[xKey]), my = d3.mean(points, d => d[yKey]);
  let sxy = 0, sxx = 0;
  for (const d of points) { sxy += (d[xKey] - mx) * (d[yKey] - my); sxx += (d[xKey] - mx) ** 2; }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

function renderScatterplot(vis) {
  const xKey = getSelectedControlValue("#xSelect"), yKey = getSelectedControlValue("#ySelect"), zKey = getSelectedControlValue("#zSelect");
  const xM = findOptionMetadata(numericVariableOptions, xKey), yM = findOptionMetadata(numericVariableOptions, yKey), zM = findOptionMetadata(pointSizeVariableOptions, zKey);
  const x = d3.scaleLinear().domain(d3.extent(data, d => d[xKey])).nice().range([0, plotWidth]);
  const y = d3.scaleLinear().domain(d3.extent(data, d => d[yKey])).nice().range([plotHeight, 0]);
  const r = d3.scaleSqrt().domain(d3.extent(data, d => d[zKey])).range([3, 14]);
  const radius = d => Number.isFinite(d[zKey]) ? r(d[zKey]) : 5;

  scatterChart.xAxisG.transition().duration(500).call(d3.axisBottom(x));
  scatterChart.yAxisG.transition().duration(500).call(d3.axisLeft(y));
  scatterChart.xLabel.text(xM.label).attr("y", plotHeight + 45); scatterChart.yLabel.text(yM.label);

  scatterplotPointsGroup.selectAll("circle").data(vis, d => d.Pokemon).join("circle").attr("class", "dot")
    .on("mouseover", (event, d) => {
      d3.select(event.currentTarget).attr("stroke", "black").attr("stroke-width", 2);
      showTooltip(event, `<strong>${d.Pokemon}</strong><br>Type: ${d.Type_I}${d["Type II"] && d["Type II"] !== "N/A" ? " / " + d["Type II"] : ""}<br>` +
        `${xM.label}: ${d[xKey]}<br>${yM.label}: ${d[yKey]}<br>Size (${zM.label}): ${d3.format(".3f")(d[zKey])}`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", event => { d3.select(event.currentTarget).attr("stroke", null); hideTooltip(); })
    .sort((a, b) => d3.descending(radius(a), radius(b)))
    .transition().duration(500)
    .attr("cx", d => x(d[xKey])).attr("cy", d => y(d[yKey])).attr("r", radius)
    .attr("fill", d => color(d.Type_I)).attr("fill-opacity", 0.75);

  const pts = vis.filter(d => Number.isFinite(d[xKey]) && Number.isFinite(d[yKey]));
  const fit = calculateLinearRegression(pts, xKey, yKey);
  if (fit) {
    const [x0, x1] = d3.extent(pts, d => d[xKey]);
    scatterplotTrendLine.style("display", null).transition().duration(500)
      .attr("x1", x(x0)).attr("y1", y(fit.slope * x0 + fit.intercept))
      .attr("x2", x(x1)).attr("y2", y(fit.slope * x1 + fit.intercept));
  } else scatterplotTrendLine.style("display", "none");
}

// ---------- 2. bar chart / dot plot by type (Project 3) ----------
function renderTypeSummaryChart(vis) {
  const key = getSelectedControlValue("#statSelect"), mark = getSelectedControlValue("#markSelect"), sortBy = getSelectedControlValue("#sortSelect");
  const label = findOptionMetadata(numericVariableOptions, key).label;

  // AGGREGATE: one row per primary type
  const rows = Array.from(
    d3.rollup(vis, v => ({ mean: d3.mean(v, d => d[key]), min: d3.min(v, d => d[key]), max: d3.max(v, d => d[key]), count: v.length }), d => d.Type_I),
    ([type, s]) => ({ type, ...s }));
  // SORT: by value (rank is visible) or alphabetically (easy lookup), in the direction set by the button
  const compare = sortBy === "value" ? (a, b) => d3.ascending(a.mean, b.mean) : (a, b) => d3.ascending(a.type, b.type);
  rows.sort(sortAscending ? compare : (a, b) => compare(b, a));

  const x = d3.scaleBand().domain(rows.map(d => d.type)).range([0, plotWidth]).padding(0.25);
  // Bars encode LENGTH, so the baseline must be 0. Dots encode POSITION only, so the axis may zoom in.
  const lo = mark === "bars" ? 0 : Math.max(0, (d3.min(rows, d => d.mean) ?? 0) * 0.9);
  const y = d3.scaleLinear().domain([lo, d3.max(rows, d => d.mean) ?? 1]).nice().range([plotHeight, 0]);

  typeSummaryChart.xAxisG.transition().duration(500).call(d3.axisBottom(x)); rotateCategoryAxisLabels(typeSummaryChart.xAxisG);
  typeSummaryChart.yAxisG.transition().duration(500).call(d3.axisLeft(y));
  typeSummaryChart.xLabel.text("Primary type").attr("y", plotHeight + 72);
  typeSummaryChart.yLabel.text(`Average ${label}` + (mark === "dots" ? " (axis does not start at 0)" : ""));

  const tip = d => `<strong>${d.type}</strong><br>Average ${label}: ${d.mean.toFixed(1)}<br>Pokemon: ${d.count}<br>Range: ${d.min} to ${d.max}`;
  const bars = mark === "bars" ? rows : [], dots = mark === "dots" ? rows : [];

  typeBarsGroup.selectAll(".bar").data(bars, d => d.type).join(
    enter => enter.append("rect").attr("class", "bar").attr("y", plotHeight).attr("height", 0)
  ).on("mouseenter", (e, d) => showTooltip(e, tip(d))).on("mousemove", moveTooltip).on("mouseleave", hideTooltip)
    .transition().duration(500)
    .attr("x", d => x(d.type)).attr("width", x.bandwidth())
    .attr("fill", d => color(d.type))
    .attr("y", d => y(d.mean)).attr("height", d => plotHeight - y(d.mean));

  dotPlotGuidesGroup.selectAll("line").data(dots, d => d.type).join("line").attr("class", "dot-guide")
    .attr("x1", d => x(d.type) + x.bandwidth() / 2).attr("x2", d => x(d.type) + x.bandwidth() / 2)
    .attr("y1", 0).attr("y2", plotHeight);
  dotPlotMarkersGroup.selectAll("circle").data(dots, d => d.type).join("circle").attr("r", 8)
    .attr("fill", d => color(d.type))
    .on("mouseenter", (e, d) => showTooltip(e, tip(d))).on("mousemove", moveTooltip).on("mouseleave", hideTooltip)
    .transition().duration(500)
    .attr("cx", d => x(d.type) + x.bandwidth() / 2).attr("cy", d => y(d.mean));
}

// ---------- 3. histogram (Project 4) ----------
function renderHistogram(vis) {
  const key = getSelectedControlValue("#statSelect"), label = findOptionMetadata(numericVariableOptions, key).label;
  const nBins = +getSelectedControlValue("#binRange");
  d3.select("#binLabel").text(nBins);
  histogramBarsGroup.selectAll("*").remove();
  const values = vis.map(d => d[key]).filter(Number.isFinite);

  if (values.length === 0 || d3.min(values) === d3.max(values)) {
    d3.select("#histStatus").text("Not enough varied values to draw a histogram for this selection.");
    histogramChart.xAxisG.selectAll("*").remove(); histogramChart.yAxisG.selectAll("*").remove(); return;
  }
  const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([0, plotWidth]);
  const bins = d3.bin().domain(x.domain()).thresholds(x.ticks(nBins))(values);
  const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([plotHeight, 0]);

  histogramBarsGroup.selectAll(".hbar").data(bins).join("rect").attr("class", "hbar")
    .attr("x", d => x(d.x0)).attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))
    .attr("height", d => plotHeight - y(d.length))
    .attr("fill", "#3182bd")
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("fill", "#9ecae1");
      showTooltip(event, `<strong>Interval: ${d.x0} – ${d.x1}</strong><br><strong>Count: ${d.length}</strong>`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", function () {
      d3.select(this).attr("fill", "#3182bd");
      hideTooltip();
    });

  histogramChart.xAxisG.call(d3.axisBottom(x)); histogramChart.yAxisG.call(d3.axisLeft(y));
  histogramChart.xLabel.text(label).attr("y", plotHeight + 45); histogramChart.yLabel.text("Count (number of Pokemon)");
  d3.select("#histStatus").text(`${label} | ${values.length} observations | ${bins.length} bins | mean ${d3.mean(values).toFixed(1)}, median ${d3.median(values).toFixed(1)}`);
}

// ---------- 4. bubble chart: number of Pokemon per primary type ----------
function renderBubbleChart(vis) {
  // AGGREGATE: count per primary type, biggest first so the largest bubbles pack toward the center
  const counts = Array.from(d3.rollup(vis, v => v.length, d => d.Type_I), ([type, count]) => ({ type, count }))
    .sort((a, b) => d3.descending(a.count, b.count));
  const nodes = counts.length === 0 ? [] :
    d3.pack().size([bubbleWidth, bubbleHeight]).padding(4)(d3.hierarchy({ children: counts }).sum(d => d.count)).leaves();
  // Area is proportional to the count (d3.pack sums values into area)

  d3.select("#bubbleStatus").text(nodes.length === 0 ? "No Pokemon match the current filters." :
    `${vis.length} Pokemon across ${nodes.length} primary types | bubble area = number of Pokemon`);

  const bubbles = bubbleGroup.selectAll(".bubble").data(nodes, d => d.data.type).join(enter => {
    const g = enter.append("g").attr("class", "bubble").attr("transform", d => `translate(${d.x},${d.y})`);
    g.append("circle").attr("r", 0).attr("fill", d => color(d.data.type));
    g.append("text").attr("class", "bubble-label bubble-name");
    g.append("text").attr("class", "bubble-label bubble-count");
    return g;
  });

  bubbles
    .on("mouseenter", (e, d) => showTooltip(e, `<strong>${d.data.type}</strong><br>Pokemon: ${d.data.count}<br>` +
      `Share of shown: ${d3.format(".1%")(d.data.count / vis.length)}`))
    .on("mousemove", moveTooltip).on("mouseleave", hideTooltip);

  bubbles.transition().duration(500).attr("transform", d => `translate(${d.x},${d.y})`);
  bubbles.select("circle").transition().duration(500).attr("r", d => d.r).attr("fill", d => color(d.data.type));

  // Labels: name + count when the bubble is big enough, count only when small, nothing when tiny
  bubbles.select(".bubble-name").text(d => d.r >= 26 ? d.data.type : "")
    .attr("y", "-0.1em").style("font-size", d => Math.min(16, d.r / 3.2) + "px");
  bubbles.select(".bubble-count").text(d => d.r >= 12 ? d.data.count : "")
    .attr("y", d => d.r >= 26 ? "1.1em" : "0.35em").style("font-size", d => Math.min(14, Math.max(9, d.r / 3.6)) + "px")
    .style("font-weight", "normal");
}
