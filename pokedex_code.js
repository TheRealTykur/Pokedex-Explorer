const svg = d3.select("#chart");
const tooltip = d3.select("#tooltip");
const legendDiv = d3.select("#legend");

const width = 800;
const height = 500;

const margin = {
  top: 30,
  right: 30,
  bottom: 60,
  left: 70
};

const innerWidth = width - margin.left - margin.right;
const innerHeight = height - margin.top - margin.bottom;

const g = svg.append("g")
  .attr("transform", `translate(${margin.left},${margin.top})`);

const xAxisG = g.append("g")
  .attr("class", "axis x-axis")
  .attr("transform", `translate(0,${innerHeight})`);

const yAxisG = g.append("g")
  .attr("class", "axis y-axis");

const xLabel = g.append("text")
  .attr("class", "axis-label")
  .attr("x", innerWidth / 2)
  .attr("y", innerHeight + 45)
  .attr("text-anchor", "middle");

const yLabel = g.append("text")
  .attr("class", "axis-label")
  .attr("transform", "rotate(-90)")
  .attr("x", -innerHeight / 2)
  .attr("y", -50)
  .attr("text-anchor", "middle");

const dotsG = g.append("g")
  .attr("class", "dots");

const trendLine = g.append("line")
  .attr("class", "trend-line")
  .attr("stroke", "black")
  .attr("stroke-width", 2)
  .attr("pointer-events", "none")
  .style("display", "none");

const numericVars = [
  { key: "HP", label: "HP" },
  { key: "Attack", label: "Attack" },
  { key: "Defense", label: "Defense" },
  { key: "Special_Attack", label: "Special Attack" },
  { key: "Special_Defense", label: "Special Defense" },
  { key: "Speed", label: "Speed" },
  { key: "Total", label: "Total (base stat sum)" },
  { key: "Height_m", label: "Height (m)" },
  { key: "Weight_kg", label: "Weight (kg)" }
];

const dotScale = [
  { key: "hp_over_total", label: "HP / Total" },
  { key: "attack_over_total", label: "Attack / Total" },
  { key: "defense_over_total", label: "Defenes / Total" },
  { key: "SPA_over_total", label: "Special Attack / Total" },
  { key: "SPD_over_total", label: "Special Defense / Total" },
  { key: "speed_over_total", label: "Speed / Total" },
  { key: "Height_over_weight", label: "Height / Weight" }
];

let activeTypes = null;

function linearFit(points, xKey, yKey) {
  const n = points.length;
  if (n < 2) return null;
  const mx = d3.mean(points, d => d[xKey]);
  const my = d3.mean(points, d => d[yKey]);
  let sxy = 0, sxx = 0;
  for (const d of points) {
    sxy += (d[xKey] - mx) * (d[yKey] - my);
    sxx += (d[xKey] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

d3.csv("pokedex.csv", d3.autoType).then(data => {

  const xSelect = d3.select("#xSelect");
  const ySelect = d3.select("#ySelect");
  const zSelect = d3.select("#zSelect");

  xSelect.selectAll("option")
    .data(numericVars)
    .join("option")
    .attr("value", d => d.key)
    .text(d => d.label);

  ySelect.selectAll("option")
    .data(numericVars)
    .join("option")
    .attr("value", d => d.key)
    .text(d => d.label);

  zSelect.selectAll("option")
    .data(dotScale)
    .join("option")
    .attr("value", d => d.key)
    .text(d => d.label);

  xSelect.property("value", "Attack");
  ySelect.property("value", "Defense");
  zSelect.property("value", "hp_over_total");

  const types = Array.from(new Set(data.map(d => d.Type_I))).sort();
  const color = d3.scaleOrdinal()
    .domain(types)
    .range(d3.schemeTableau10.concat(d3.schemeSet3));

  const legendItems = legendDiv.selectAll(".legend-item")
    .data(types)
    .join("div")
    .attr("class", "legend-item")
    .on("click", (event, type) => {
      if (activeTypes === null) {
        activeTypes = new Set(types);
      }
      if (activeTypes.has(type)) {
        activeTypes.delete(type);
      } else {
        activeTypes.add(type);
      }
      if (activeTypes.size === types.length) activeTypes = null;
      render();
    });

  legendItems.append("span")
    .attr("class", "legend-swatch")
    .style("background-color", d => color(d));

  legendItems.append("span")
    .text(d => d);

  function render() {
    const xKey = xSelect.property("value");
    const yKey = ySelect.property("value");
    const zKey = zSelect.property("value");
    const xMeta = numericVars.find(v => v.key === xKey);
    const yMeta = numericVars.find(v => v.key === yKey);
    const zMeta = dotScale.find(v => v.key === zKey);

    const x = d3.scaleLinear()
      .domain(d3.extent(data, d => d[xKey])).nice()
      .range([0, innerWidth]);

    const y = d3.scaleLinear()
      .domain(d3.extent(data, d => d[yKey])).nice()
      .range([innerHeight, 0]);

    const r = d3.scaleSqrt()
      .domain(d3.extent(data, d => d[zKey]))
      .range([3, 14]);
    const radius = d => Number.isFinite(d[zKey]) ? r(d[zKey]) : 5; // fallback for missing values

    xAxisG.transition().duration(500).call(d3.axisBottom(x));
    yAxisG.transition().duration(500).call(d3.axisLeft(y));

    xLabel.text(xMeta.label);
    yLabel.text(yMeta.label);

    legendItems.classed("dimmed", d => activeTypes !== null && !activeTypes.has(d));

    dotsG.selectAll("circle")
      .data(data, d => d.Pokemon)
      .join("circle")
      .attr("class", "dot")
      .on("mouseover", (event, d) => {
        d3.select(event.currentTarget)
          .attr("stroke", "black")
          .attr("stroke-width", 2);
        tooltip.classed("hidden", false)
          .html(
            `<strong>${d.Pokemon}</strong><br>` +
            `Type: ${d.Type_I}${d["Type II"] && d["Type II"] !== "N/A" ? " / " + d["Type II"] : ""}<br>` +
            `${xMeta.label}: ${d[xKey]}<br>` +
            `${yMeta.label}: ${d[yKey]}<br>` +
            `Size (${zMeta.label}): ${d[zKey]}`
          );
      })
      .on("mousemove", (event) => {
        tooltip
          .style("left", (event.pageX + 14) + "px")
          .style("top", (event.pageY - 10) + "px");
      })
      .on("mouseout", (event) => {
        d3.select(event.currentTarget).attr("stroke", null);
        tooltip.classed("hidden", true);
      })
      // Draw biggest dots first so smaller ones sit on top and stay hoverable
      .sort((a, b) => d3.descending(radius(a), radius(b)))
      .transition()
      .duration(500)
      .attr("cx", d => x(d[xKey]))
      .attr("cy", d => y(d[yKey]))
      .attr("r", radius)
      .attr("fill", d => color(d.Type_I))
      .attr("fill-opacity", 0.75)
      .style("display", d => (activeTypes !== null && !activeTypes.has(d.Type_I)) ? "none" : null);

    // Trend line over the currently visible (unfiltered) points
    const visible = data.filter(d =>
      (activeTypes === null || activeTypes.has(d.Type_I)) &&
      Number.isFinite(d[xKey]) && Number.isFinite(d[yKey])
    );
    const fit = linearFit(visible, xKey, yKey);

    if (fit) {
      const [x0, x1] = d3.extent(visible, d => d[xKey]);
      trendLine
        .style("display", null)
        .transition()
        .duration(500)
        .attr("x1", x(x0))
        .attr("y1", y(fit.slope * x0 + fit.intercept))
        .attr("x2", x(x1))
        .attr("y2", y(fit.slope * x1 + fit.intercept));
    } else {
      trendLine.style("display", "none");
    }
  }

  render();

  xSelect.on("change", render);
  ySelect.on("change", render);
  zSelect.on("change", render);
});