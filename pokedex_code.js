// =====================================================================
// Pokedex Explorer v2 - pokedex_code.js
// =====================================================================
// One shared dataset (pokedex.csv) drives four linked D3 charts:
//   1. Scatterplot        (Project 2): pick X / Y / dot size, with a linear trend line
//   2. Bar / dot plot     (Project 3): average of a stat per primary type, with sorting
//   3. Histogram          (Project 4): distribution of the same stat, adjustable bin count
//   4. Bubble chart       (extra):     how many Pokemon belong to each primary type
// Two shared filters (generation dropdown + clickable type legend) apply to ALL charts.
//
// Techniques used:
//   Project 2: scales, axes, transitions, dot size, linear regression
//   Project 3: aggregation with d3.rollup, scaleBand, sorting, bar chart vs dot plot
//   Project 4: histogram (d3.bin), hover interval/count, status line, bin-count slider
//   Extra:     ascending/descending sort button for chart 2, packed bubble chart (d3.pack)
// =====================================================================

// ---------- chart dimensions ----------
// Charts 1-3 share one SVG size. The "margins" leave room around the plot area
// for axis ticks and axis labels; the plot area itself is what is left over.
const chartWidth = 800, chartHeight = 420;
const chartMargins = { top: 30, right: 30, bottom: 80, left: 70 };
const plotWidth = chartWidth - chartMargins.left - chartMargins.right;    // drawable width inside the margins
const plotHeight = chartHeight - chartMargins.top - chartMargins.bottom;  // drawable height inside the margins

// The single floating tooltip <div> defined in index.html (shown/hidden by the helpers below)
const tooltip = d3.select("#tooltip");

// ---------- dropdown option lists ----------
// Each entry is { key: CSV column name, label: text shown to the user }.
// Numeric columns the user can choose for the scatterplot axes and for the stat in charts 2 and 3
const numericVariableOptions = [
  { key: "HP", label: "HP" }, { key: "Attack", label: "Attack" }, { key: "Defense", label: "Defense" },
  { key: "Special_Attack", label: "Special Attack" }, { key: "Special_Defense", label: "Special Defense" },
  { key: "Speed", label: "Speed" }, { key: "Total", label: "Total (base stat sum)" },
  { key: "Height_m", label: "Height (m)" }, { key: "Weight_kg", label: "Weight (kg)" }
];
// Ratio columns that can control dot size in the scatterplot
// (each stat divided by Total, plus Height divided by Weight)
const pointSizeVariableOptions = [
  { key: "hp_over_total", label: "HP / Total" }, { key: "attack_over_total", label: "Attack / Total" },
  { key: "defense_over_total", label: "Defense / Total" }, { key: "SPA_over_total", label: "Special Attack / Total" },
  { key: "SPD_over_total", label: "Special Defense / Total" }, { key: "speed_over_total", label: "Speed / Total" },
  { key: "Height_over_weight", label: "Height / Weight" }
];

// ---------- shared chart scaffolding ----------
// Builds the parts every x/y chart needs: an <svg> viewBox (so it scales responsively),
// a <g> shifted by the margins, empty x and y axis groups, and two axis-label <text> elements.
// Returns handles to those pieces so each render function can fill them in later.
function createChartScaffold(chartSelector) {
  const chartSvg = d3.select(chartSelector).attr("viewBox", `0 0 ${chartWidth} ${chartHeight}`);
  // Everything is drawn inside this group, which sits inside the margins
  const g = chartSvg.append("g").attr("transform", `translate(${chartMargins.left},${chartMargins.top})`);
  return {
    g,
    // x axis hangs off the bottom edge of the plot area
    xAxisG: g.append("g").attr("class", "axis").attr("transform", `translate(0,${plotHeight})`),
    // y axis sits on the left edge (no transform needed)
    yAxisG: g.append("g").attr("class", "axis"),
    // x axis title, centered under the plot (render functions adjust y as needed)
    xLabel: g.append("text").attr("class", "axis-label").attr("x", plotWidth / 2).attr("y", plotHeight + 70).attr("text-anchor", "middle"),
    // y axis title, rotated to run vertically along the left side
    yLabel: g.append("text").attr("class", "axis-label").attr("transform", "rotate(-90)").attr("x", -plotHeight / 2).attr("y", -50).attr("text-anchor", "middle")
  };
}
// One scaffold per chart (the bubble chart has no axes, so it is set up separately below)
const scatterChart = createChartScaffold("#scatter"), typeSummaryChart = createChartScaffold("#bar"), histogramChart = createChartScaffold("#hist");

// Dedicated layers (<g> groups) for each chart's marks so they keep a stable drawing order
const scatterplotPointsGroup = scatterChart.g.append("g");   // the scatterplot dots
const scatterplotTrendLine = scatterChart.g.append("line")   // the regression line, drawn on top of the dots
  .attr("class", "trend-line").attr("pointer-events", "none").style("display", "none");
const typeBarsGroup = typeSummaryChart.g.append("g");        // chart 2 bars
const dotPlotGuidesGroup = typeSummaryChart.g.append("g");   // chart 2 dot-plot vertical guide lines (behind the dots)
const dotPlotMarkersGroup = typeSummaryChart.g.append("g");  // chart 2 dot-plot circles
const histogramBarsGroup = histogramChart.g.append("g");     // chart 3 bars

// Bubble chart (chart 4): a plain SVG with no axes, so no margins are needed
const bubbleWidth = 800, bubbleHeight = 520;
const bubbleGroup = d3.select("#bubble").attr("viewBox", `0 0 ${bubbleWidth} ${bubbleHeight}`).append("g");

// Chart 2 sort direction. false = descending (largest / Z first), true = ascending.
// Flipped by the "Order" button; reset when the Sort dropdown changes (see event wiring below).
let sortAscending = false;

// ---------- tooltip helpers ----------
// Show the tooltip with some HTML and place it next to the mouse
function showTooltip(event, tooltipHtml) { tooltip.classed("hidden", false).html(tooltipHtml); moveTooltip(event); }
// Keep the tooltip just right of / above the cursor (pageX/pageY are relative to the whole page)
function moveTooltip(event) { tooltip.style("left", (event.pageX + 14) + "px").style("top", (event.pageY - 10) + "px"); }
// Hide the tooltip (CSS class .hidden sets display: none)
function hideTooltip() { tooltip.classed("hidden", true); }

// ---------- small utility helpers ----------
// Tilt the category labels on a band-scale x axis so long type names don't overlap
function rotateCategoryAxisLabels(axisGroup) { axisGroup.selectAll("text").attr("transform", "rotate(-35)").style("text-anchor", "end"); }
// Fill a <select> with <option>s from a list of {key, label} items and choose the default
function populateSelectOptions(chartSelector, items, defaultValue) {
  d3.select(chartSelector).selectAll("option").data(items).join("option").attr("value", d => d.key).text(d => d.label);
  d3.select(chartSelector).property("value", defaultValue);
}

// ---------- state ----------
// data:                  every Pokemon row from the CSV (never filtered)
// types:                 sorted list of unique primary types (drives the legend)
// selectedPrimaryTypes:  null = every type is shown (no legend filter), otherwise a Set of the
//                        types currently switched on in the legend
let data = [], types = [], selectedPrimaryTypes = null;
// Official-ish type colors, used by every chart and the legend swatches
const pokemonTypeColors = {"Bug":"#94bc4a","Dark":"#736c75","Dragon":"#6a7baf","Electric":"#e5c531","Fairy":"#e69eac","Fighting":"#c56e56","Fire":"#e8844a","Flying":"#9aa8d8","Ghost":"#846ab6","Grass":"#71c558","Ground":"#cc9f4f","Ice":"#70cbd4","Normal":"#aab09f","Poison":"#b468b7","Psychic":"#e5709b","Rock":"#b2a061","Steel":"#89a1b0","Water":"#539ae2"};
// Look up a type's color, falling back to gray if the type is not in the table above
const color = type => pokemonTypeColors[type] || "#888888";
// Read the current value of a form control by its CSS selector, e.g. "#genSelect"
const getSelectedControlValue = id => d3.select(id).property("value");
// Find the {key, label} entry for a given key in one of the option lists
const findOptionMetadata = (list, key) => list.find(v => v.key === key);

// Apply the SHARED filters (generation dropdown + type legend) to the full dataset.
// Every chart calls this through renderAllCharts, so they always agree on what is "visible".
function getVisiblePokemon() {
  const gen = getSelectedControlValue("#genSelect");
  return data.filter(d =>
    (gen === "all" || String(d.Generation) === gen) &&                          // generation filter
    (selectedPrimaryTypes === null || selectedPrimaryTypes.has(d.Type_I)));     // type legend filter
}

// ---------- data loading and derived statistics ----------
// Make sure the ratio columns exist on every row. `??=` only fills a value when it is missing,
// so this does nothing for the current CSV (which already has them) but lets a leaner CSV work too.
function preparePokemonData(rows) {
  rows.forEach(d => {  // derive the ratio columns so any compatible CSV works
    const t = d.Total;
    d.hp_over_total ??= d.HP / t; d.attack_over_total ??= d.Attack / t; d.defense_over_total ??= d.Defense / t;
    d.SPA_over_total ??= d.Special_Attack / t; d.SPD_over_total ??= d.Special_Defense / t;
    d.speed_over_total ??= d.Speed / t; d.Height_over_weight ??= d.Height_m / d.Weight_kg;
  });
  return rows;
}

// Runs once, after the CSV has loaded: stores the data, builds every control, then draws everything.
function initializeExplorer(rows) {
  data = preparePokemonData(rows);
  selectedPrimaryTypes = null;  // start with no legend filter
  types = Array.from(new Set(data.map(d => d.Type_I))).sort();  // unique primary types, A to Z

  // Generation dropdown: "All generations" followed by each generation number found in the data
  const gens = Array.from(new Set(data.map(d => d.Generation))).sort((a, b) => a - b);
  populateSelectOptions("#genSelect", [{ key: "all", label: "All generations" }, ...gens.map(g => ({ key: String(g), label: "Generation " + g }))], "all");
  // Scatterplot X / Y dropdowns, dot-size dropdown, and the stat dropdown shared by charts 2 and 3
  populateSelectOptions("#xSelect", numericVariableOptions, "Attack"); populateSelectOptions("#ySelect", numericVariableOptions, "Defense");
  populateSelectOptions("#zSelect", pointSizeVariableOptions, "hp_over_total"); populateSelectOptions("#statSelect", numericVariableOptions, "Total");

  // Legend: one clickable item per primary type
  const items = d3.select("#legend").selectAll(".legend-item").data(types).join("div").attr("class", "legend-item")
    .on("click", (event, type) => {
      // First click: switch from "everything shown" to an explicit set that contains every type
      if (selectedPrimaryTypes === null) selectedPrimaryTypes = new Set(types);
      // Toggle the clicked type on/off
      selectedPrimaryTypes.has(type) ? selectedPrimaryTypes.delete(type) : selectedPrimaryTypes.add(type);
      // If every type is back on, go back to "no filter" so the status line reads "all types"
      if (selectedPrimaryTypes.size === types.length) selectedPrimaryTypes = null;
      renderAllCharts();
    });
  items.selectAll("*").remove();  // clear children so re-initializing never duplicates swatches/labels
  items.append("span").attr("class", "legend-swatch").style("background-color", d => color(d));  // colored dot
  items.append("span").text(d => d);                                                             // type name
  renderAllCharts();
}

// Load the CSV (d3.autoType turns numeric-looking text into numbers), then start the app
d3.csv("pokedex.csv", d3.autoType).then(initializeExplorer);

// ---------- event wiring ----------
// Any of these controls simply redraws everything (each chart reads the controls it needs)
["#genSelect", "#xSelect", "#ySelect", "#zSelect", "#statSelect", "#markSelect"].forEach(id => d3.select(id).on("change", renderAllCharts));
// "input" fires continuously while dragging the slider, so the histogram updates live
d3.select("#binRange").on("input", renderAllCharts);

// Keep the sort button's text in sync with the sortAscending flag
function updateSortButtonLabel() {
  d3.select("#sortDirBtn").text(sortAscending ? "Order: Ascending ↑" : "Order: Descending ↓");
}
// Changing the Sort dropdown resets the direction to a sensible default for that mode:
// by value -> biggest first (descending); alphabetical -> A to Z (ascending).
d3.select("#sortSelect").on("change", () => {
  sortAscending = getSelectedControlValue("#sortSelect") === "alpha";
  updateSortButtonLabel(); renderAllCharts();
});
// The Order button flips the direction for whichever sort mode is selected
d3.select("#sortDirBtn").on("click", () => { sortAscending = !sortAscending; updateSortButtonLabel(); renderAllCharts(); });

// Central redraw: recompute the filtered data once, update the status line and legend, then redraw all four charts
function renderAllCharts() {
  const vis = getVisiblePokemon();
  const gen = getSelectedControlValue("#genSelect");
  // Status line above the legend, e.g. "151 of 1025 Pokemon shown | Generation 1 | all types"
  d3.select("#status").text(`${vis.length} of ${data.length} Pokemon shown | ${gen === "all" ? "All generations" : "Generation " + gen} | ` +
    (selectedPrimaryTypes === null ? "all types" : selectedPrimaryTypes.size + " types"));
  // Fade legend items for types that are currently switched off
  d3.select("#legend").selectAll(".legend-item").classed("dimmed", d => selectedPrimaryTypes !== null && !selectedPrimaryTypes.has(d));
  renderScatterplot(vis); renderTypeSummaryChart(vis); renderHistogram(vis); renderBubbleChart(vis);
}

// ---------- 1. scatterplot (Project 2) ----------
// Ordinary least-squares line y = slope * x + intercept through the points.
// Returns null when a line can't be fit (fewer than 2 points, or every x is identical).
function calculateLinearRegression(points, xKey, yKey) {
  if (points.length < 2) return null;
  const mx = d3.mean(points, d => d[xKey]), my = d3.mean(points, d => d[yKey]);  // means of x and y
  let sxy = 0, sxx = 0;  // sxy = sum of (dx * dy), sxx = sum of dx squared
  for (const d of points) { sxy += (d[xKey] - mx) * (d[yKey] - my); sxx += (d[xKey] - mx) ** 2; }
  if (sxx === 0) return null;  // vertical line: slope undefined
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

function renderScatterplot(vis) {
  // Which variables are selected, and their display labels
  const xKey = getSelectedControlValue("#xSelect"), yKey = getSelectedControlValue("#ySelect"), zKey = getSelectedControlValue("#zSelect");
  const xM = findOptionMetadata(numericVariableOptions, xKey), yM = findOptionMetadata(numericVariableOptions, yKey), zM = findOptionMetadata(pointSizeVariableOptions, zKey);
  // Scales are built from ALL data (not just visible rows) so the axes stay put while filtering
  const x = d3.scaleLinear().domain(d3.extent(data, d => d[xKey])).nice().range([0, plotWidth]);
  const y = d3.scaleLinear().domain(d3.extent(data, d => d[yKey])).nice().range([plotHeight, 0]);  // SVG y grows downward, so flip the range
  // scaleSqrt makes dot AREA (not radius) proportional to the value, which is the honest encoding
  const r = d3.scaleSqrt().domain(d3.extent(data, d => d[zKey])).range([3, 14]);
  const radius = d => Number.isFinite(d[zKey]) ? r(d[zKey]) : 5;  // fallback radius for missing values

  // Animate the axes and update their titles
  scatterChart.xAxisG.transition().duration(500).call(d3.axisBottom(x));
  scatterChart.yAxisG.transition().duration(500).call(d3.axisLeft(y));
  scatterChart.xLabel.text(xM.label).attr("y", plotHeight + 45); scatterChart.yLabel.text(yM.label);

  // One circle per visible Pokemon, keyed by name so existing dots move instead of being recreated
  scatterplotPointsGroup.selectAll("circle").data(vis, d => d.Pokemon).join("circle").attr("class", "dot")
    .on("mouseover", (event, d) => {
      d3.select(event.currentTarget).attr("stroke", "black").attr("stroke-width", 2);  // outline the hovered dot
      // Tooltip: name, type(s) (skip "N/A" second types), both axis values, and the dot-size value
      showTooltip(event, `<strong>${d.Pokemon}</strong><br>Type: ${d.Type_I}${d["Type II"] && d["Type II"] !== "N/A" ? " / " + d["Type II"] : ""}<br>` +
        `${xM.label}: ${d[xKey]}<br>${yM.label}: ${d[yKey]}<br>Size (${zM.label}): ${d3.format(".3f")(d[zKey])}`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseout", event => { d3.select(event.currentTarget).attr("stroke", null); hideTooltip(); })
    // Draw big dots first so small dots end up on top and stay hoverable
    .sort((a, b) => d3.descending(radius(a), radius(b)))
    .transition().duration(500)
    .attr("cx", d => x(d[xKey])).attr("cy", d => y(d[yKey])).attr("r", radius)
    .attr("fill", d => color(d.Type_I)).attr("fill-opacity", 0.75);  // slight transparency shows overlapping dots

  // Trend line: fit only the visible points that have valid x and y values
  const pts = vis.filter(d => Number.isFinite(d[xKey]) && Number.isFinite(d[yKey]));
  const fit = calculateLinearRegression(pts, xKey, yKey);
  if (fit) {
    // Draw the line from the smallest to the largest visible x
    const [x0, x1] = d3.extent(pts, d => d[xKey]);
    scatterplotTrendLine.style("display", null).transition().duration(500)
      .attr("x1", x(x0)).attr("y1", y(fit.slope * x0 + fit.intercept))
      .attr("x2", x(x1)).attr("y2", y(fit.slope * x1 + fit.intercept));
  } else scatterplotTrendLine.style("display", "none");  // nothing to fit, so hide the line
}

// ---------- 2. bar chart / dot plot by type (Project 3) ----------
// Average of the chosen stat for each primary type, shown as bars or as dots,
// sorted by the Sort dropdown in the direction chosen by the Order button.
function renderTypeSummaryChart(vis) {
  const key = getSelectedControlValue("#statSelect"), mark = getSelectedControlValue("#markSelect"), sortBy = getSelectedControlValue("#sortSelect");
  const label = findOptionMetadata(numericVariableOptions, key).label;

  // AGGREGATE: one row per primary type with its mean, min, max and Pokemon count
  const rows = Array.from(
    d3.rollup(vis, v => ({ mean: d3.mean(v, d => d[key]), min: d3.min(v, d => d[key]), max: d3.max(v, d => d[key]), count: v.length }), d => d.Type_I),
    ([type, s]) => ({ type, ...s }));
  // SORT: by value (rank is visible) or alphabetically (easy lookup), in the direction set by the button.
  // `compare` is written in ascending order; for descending we simply swap its arguments.
  const compare = sortBy === "value" ? (a, b) => d3.ascending(a.mean, b.mean) : (a, b) => d3.ascending(a.type, b.type);
  rows.sort(sortAscending ? compare : (a, b) => compare(b, a));

  // x: one evenly spaced band per type, in the sorted order above
  const x = d3.scaleBand().domain(rows.map(d => d.type)).range([0, plotWidth]).padding(0.25);
  // Bars encode LENGTH, so the baseline must be 0. Dots encode POSITION only, so the axis may zoom in.
  const lo = mark === "bars" ? 0 : Math.max(0, (d3.min(rows, d => d.mean) ?? 0) * 0.9);
  const y = d3.scaleLinear().domain([lo, d3.max(rows, d => d.mean) ?? 1]).nice().range([plotHeight, 0]);

  // Animate the x axis so the type labels slide along with the bars when the order changes,
  // then tilt the labels. The y axis animates when the stat or filters change.
  typeSummaryChart.xAxisG.transition().duration(500).call(d3.axisBottom(x)); rotateCategoryAxisLabels(typeSummaryChart.xAxisG);
  typeSummaryChart.yAxisG.transition().duration(500).call(d3.axisLeft(y));
  typeSummaryChart.xLabel.text("Primary type").attr("y", plotHeight + 72);
  // Warn viewers when the dot-plot y axis does not start at zero
  typeSummaryChart.yLabel.text(`Average ${label}` + (mark === "dots" ? " (axis does not start at 0)" : ""));

  // Tooltip text shared by bars and dots
  const tip = d => `<strong>${d.type}</strong><br>Average ${label}: ${d.mean.toFixed(1)}<br>Pokemon: ${d.count}<br>Range: ${d.min} to ${d.max}`;
  // Only one mark style is drawn at a time: the other gets an empty array, so its marks are removed
  const bars = mark === "bars" ? rows : [], dots = mark === "dots" ? rows : [];

  // BARS: new bars start at zero height on the baseline and grow; existing bars slide and resize
  typeBarsGroup.selectAll(".bar").data(bars, d => d.type).join(
    enter => enter.append("rect").attr("class", "bar").attr("y", plotHeight).attr("height", 0)
  ).on("mouseenter", (e, d) => showTooltip(e, tip(d))).on("mousemove", moveTooltip).on("mouseleave", hideTooltip)
    .transition().duration(500)
    .attr("x", d => x(d.type)).attr("width", x.bandwidth())
    .attr("fill", d => color(d.type))
    .attr("y", d => y(d.mean)).attr("height", d => plotHeight - y(d.mean));

  // DOT PLOT guide lines: a faint vertical line from the top to the baseline under each dot
  dotPlotGuidesGroup.selectAll("line").data(dots, d => d.type).join("line").attr("class", "dot-guide")
    .attr("x1", d => x(d.type) + x.bandwidth() / 2).attr("x2", d => x(d.type) + x.bandwidth() / 2)
    .attr("y1", 0).attr("y2", plotHeight);
  // DOT PLOT dots: centered in each band, vertical position = the average
  dotPlotMarkersGroup.selectAll("circle").data(dots, d => d.type).join("circle").attr("r", 8)
    .attr("fill", d => color(d.type))
    .on("mouseenter", (e, d) => showTooltip(e, tip(d))).on("mousemove", moveTooltip).on("mouseleave", hideTooltip)
    .transition().duration(500)
    .attr("cx", d => x(d.type) + x.bandwidth() / 2).attr("cy", d => y(d.mean));
}

// ---------- 3. histogram (Project 4) ----------
// Distribution of the stat chosen in the "Stat" dropdown (same one chart 2 uses).
function renderHistogram(vis) {
  const key = getSelectedControlValue("#statSelect"), label = findOptionMetadata(numericVariableOptions, key).label;
  const nBins = +getSelectedControlValue("#binRange");  // unary + converts the slider's text to a number
  d3.select("#binLabel").text(nBins);                   // show the slider's current value next to it
  histogramBarsGroup.selectAll("*").remove();           // simple approach: clear and redraw all bars each time
  const values = vis.map(d => d[key]).filter(Number.isFinite);  // drop missing values

  // Not enough data to bin: explain why and clear the axes instead of drawing an empty chart
  if (values.length === 0 || d3.min(values) === d3.max(values)) {
    d3.select("#histStatus").text("Not enough varied values to draw a histogram for this selection.");
    histogramChart.xAxisG.selectAll("*").remove(); histogramChart.yAxisG.selectAll("*").remove(); return;
  }
  const x = d3.scaleLinear().domain(d3.extent(values)).nice().range([0, plotWidth]);
  // x.ticks(nBins) picks "nice" bin edges, so the real bin count is only approximately nBins
  const bins = d3.bin().domain(x.domain()).thresholds(x.ticks(nBins))(values);
  const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([plotHeight, 0]);  // counts start at 0

  // One bar per bin. x0/x1 are the bin edges; the array length is the count of Pokemon in the bin.
  histogramBarsGroup.selectAll(".hbar").data(bins).join("rect").attr("class", "hbar")
    .attr("x", d => x(d.x0)).attr("y", d => y(d.length))
    .attr("width", d => Math.max(0, x(d.x1) - x(d.x0) - 1))  // minus 1px leaves a thin gap between bars
    .attr("height", d => plotHeight - y(d.length))
    .attr("fill", "#3182bd")
    .on("mouseenter", function (event, d) {
      d3.select(this).attr("fill", "#9ecae1");  // lighten the hovered bar
      showTooltip(event, `<strong>Interval: ${d.x0} – ${d.x1}</strong><br><strong>Count: ${d.length}</strong>`);
    })
    .on("mousemove", moveTooltip)
    .on("mouseleave", function () {
      d3.select(this).attr("fill", "#3182bd");  // restore the normal color
      hideTooltip();
    });

  histogramChart.xAxisG.call(d3.axisBottom(x)); histogramChart.yAxisG.call(d3.axisLeft(y));
  histogramChart.xLabel.text(label).attr("y", plotHeight + 45); histogramChart.yLabel.text("Count (number of Pokemon)");
  // Summary line under the heading: observations, bins actually used, mean and median
  d3.select("#histStatus").text(`${label} | ${values.length} observations | ${bins.length} bins | mean ${d3.mean(values).toFixed(1)}, median ${d3.median(values).toFixed(1)}`);
}

// ---------- 4. bubble chart: number of Pokemon per primary type ----------
// A packed bubble chart: each primary type is a circle whose AREA is the number of visible
// Pokemon of that type. It respects the shared generation and type-legend filters.
function renderBubbleChart(vis) {
  // AGGREGATE: count per primary type, biggest first so the largest bubbles pack toward the center
  const counts = Array.from(d3.rollup(vis, v => v.length, d => d.Type_I), ([type, count]) => ({ type, count }))
    .sort((a, b) => d3.descending(a.count, b.count));
  // d3.pack computes a circle (x, y, r) for every item so they fit in the chart without overlapping.
  // It needs a hierarchy, so wrap the counts in a root node; the circles we draw are its leaves.
  // With no data (filters hide everything) skip packing to avoid drawing a stray root circle.
  const nodes = counts.length === 0 ? [] :
    d3.pack().size([bubbleWidth, bubbleHeight]).padding(4)(d3.hierarchy({ children: counts }).sum(d => d.count)).leaves();
  // Area is proportional to the count (d3.pack sums values into area)

  // Caption under the heading
  d3.select("#bubbleStatus").text(nodes.length === 0 ? "No Pokemon match the current filters." :
    `${vis.length} Pokemon across ${nodes.length} primary types | bubble area = number of Pokemon`);

  // One <g> per type (keyed by type name so bubbles animate instead of being recreated).
  // Each group holds a circle plus two text labels (type name and count).
  const bubbles = bubbleGroup.selectAll(".bubble").data(nodes, d => d.data.type).join(enter => {
    // New bubbles appear at their final position with radius 0, then grow in below
    const g = enter.append("g").attr("class", "bubble").attr("transform", d => `translate(${d.x},${d.y})`);
    g.append("circle").attr("r", 0).attr("fill", d => color(d.data.type));
    g.append("text").attr("class", "bubble-label bubble-name");
    g.append("text").attr("class", "bubble-label bubble-count");
    return g;
  });

  // Hover tooltip: type, how many Pokemon, and the share of the currently shown Pokemon
  bubbles
    .on("mouseenter", (e, d) => showTooltip(e, `<strong>${d.data.type}</strong><br>Pokemon: ${d.data.count}<br>` +
      `Share of shown: ${d3.format(".1%")(d.data.count / vis.length)}`))
    .on("mousemove", moveTooltip).on("mouseleave", hideTooltip);

  // Animate each bubble to its new position and size when the filters change
  bubbles.transition().duration(500).attr("transform", d => `translate(${d.x},${d.y})`);
  bubbles.select("circle").transition().duration(500).attr("r", d => d.r).attr("fill", d => color(d.data.type));

  // Labels: name + count when the bubble is big enough, count only when small, nothing when tiny.
  // Font sizes scale with the radius so text fits inside the circle.
  bubbles.select(".bubble-name").text(d => d.r >= 26 ? d.data.type : "")
    .attr("y", "-0.1em").style("font-size", d => Math.min(16, d.r / 3.2) + "px");
  bubbles.select(".bubble-count").text(d => d.r >= 12 ? d.data.count : "")
    .attr("y", d => d.r >= 26 ? "1.1em" : "0.35em").style("font-size", d => Math.min(14, Math.max(9, d.r / 3.6)) + "px")
    .style("font-weight", "normal");
}
