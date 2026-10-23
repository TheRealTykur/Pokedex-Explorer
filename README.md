# Pokédex Explorer v2

## Project purpose

Pokédex Explorer is an interactive data-visualization project built with **D3.js**. It lets users explore Pokémon statistics, compare average statistics across primary Pokémon types, and examine the distribution of a selected statistic. The charts share filters so that users can narrow the dataset and compare the same subset across different visualizations.

The project combines three visualization techniques:

1. A scatterplot with configurable axes, point sizes, Pokémon type colors, and a linear trend line.
2. A bar chart or dot plot summarizing a selected statistic by primary type.
3. A histogram showing how frequently values occur within numeric intervals.

## Project files

- `pokedex_display.html`: Defines the page, chart containers, input controls, and loads D3.js, the stylesheet, and application JavaScript.
- `pokedex_code.js`: Loads and prepares the data, handles controls and filtering, and renders all three charts.
- `pokedex_styles.css`: Provides page layout, chart styling, legend styling, and tooltip styling.
- `pokedex.csv`: The dataset used by the application. It is loaded automatically; there is no CSV upload control.

## How to run

Keep all four files in the same directory. Open `pokedex_display.html` in a browser. The page loads D3.js from jsDelivr, so an internet connection is required for that library. If your browser blocks loading the local CSV when opening the HTML directly, serve the directory with a local web server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/pokedex_display.html`.

## Shared filters and controls

### Generation selector

The `#genSelect` control filters Pokémon to a selected generation or shows all generations. Its change event calls `renderAllCharts()`, which updates the shared status text and redraws all three visualizations using the filtered data.

### Pokémon type legend

The legend is generated from the primary types in the dataset. Clicking a type toggles it in or out of the selected set. Clicking all types returns the view to the unfiltered type selection. Type colors come from the `pokemonTypeColors` lookup, so a given primary type uses a consistent color throughout the charts.

### Shared rendering flow

`renderAllCharts()` is the main update function. It:

1. Calls `getVisiblePokemon()` to apply the generation and primary-type filters.
2. Updates `#status` with the number of Pokémon shown and the active filters.
3. Updates the legend's dimmed appearance to indicate excluded types.
4. Calls `renderScatterplot()`, `renderTypeSummaryChart()`, and `renderHistogram()` with the same filtered rows.

This shared flow keeps the charts consistent when a user changes a filter.

## Graph 1: Scatterplot

The scatterplot compares two numeric Pokémon attributes, with a third attribute controlling each point's size.

### Controls

- **X (`#xSelect`)**: Selects the statistic plotted horizontally.
- **Y (`#ySelect`)**: Selects the statistic plotted vertically.
- **Dot size (`#zSelect`)**: Selects a ratio used to scale each point's radius.

The available numeric variables include HP, Attack, Defense, Special Attack, Special Defense, Speed, Total base stats, Height, and Weight. The size choices are derived ratios such as HP divided by Total and Speed divided by Total.

### Important calls and what they do

- `renderScatterplot(visiblePokemon)`: Main function that builds and updates the scatterplot from the currently filtered Pokémon.
- `d3.scaleLinear()`: Maps the selected X and Y values to positions in the chart.
- `d3.scaleSqrt()`: Maps the selected size variable to circle radius. Square-root scaling helps the visual area of circles represent differences more reasonably than a direct linear radius scale.
- `d3.axisBottom()` and `d3.axisLeft()`: Draw the horizontal and vertical axes.
- `scatterplotPointsGroup.selectAll("circle").data(...).join("circle")`: Creates circles for Pokémon, updates existing circles, and removes circles that are no longer in the filtered data.
- `color(pokemon.Type_I)`: Assigns each point the fixed color for its primary type.
- `calculateLinearRegression(points, xKey, yKey)`: Computes the least-squares linear regression slope and intercept for the currently visible points.
- `scatterplotTrendLine`: Displays the regression line when there are enough valid points to calculate it.
- `showTooltip()` and the mouse event handlers: Show Pokémon name, types, selected values, and the value controlling point size when the pointer hovers over a point.

The trend line is descriptive: it shows the overall linear relationship between the selected X and Y variables and does not imply causation.

## Graph 2: Average statistic by primary type

This chart compares the average of one selected statistic for each primary Pokémon type. The user can display the summary as bars or as a dot plot and can sort the types by average value or alphabetically.

### Controls

- **Stat (`#statSelect`)**: Selects the numeric statistic to summarize.
- **Mark (`#markSelect`)**: Switches between a bar chart and a dot plot.
- **Sort (`#sortSelect`)**: Sorts by average value or alphabetically by type.

### Important calls and what they do

- `renderTypeSummaryChart(visiblePokemon)`: Calculates the summary and draws the selected mark type.
- `d3.rollup()`: Groups visible Pokémon by `Type_I` and calculates each type's mean, minimum, maximum, and Pokémon count for the selected statistic.
- `d3.mean()`, `d3.min()`, and `d3.max()`: Calculate the summary values within each group.
- `rows.sort()`: Orders the type summaries based on the selected sorting option.
- `d3.scaleBand()`: Allocates a horizontal category position and width to each primary type.
- `d3.scaleLinear()`: Maps average statistic values to vertical positions.
- `d3.axisBottom()` and `d3.axisLeft()`: Draw the category and numeric axes.
- `typeBarsGroup`: Holds the bars when the bar-chart option is selected. Each bar uses the fixed color for its Pokémon type.
- `dotPlotGuidesGroup` and `dotPlotMarkersGroup`: Draw vertical reference guides and colored circles when the dot-plot option is selected.
- Tooltip event handlers: Show the type, average, Pokémon count, and minimum-to-maximum range.

For the bar chart, the vertical scale starts at zero because bar length encodes magnitude. The dot plot can use a narrower vertical domain because values are encoded by position rather than bar length; the axis label calls this out when applicable.

## Graph 3: Histogram

The histogram shows the distribution of the selected statistic across the currently visible Pokémon. It groups numeric values into intervals, or bins, and uses bar height to represent how many Pokémon fall within each interval.

### Controls

- **Bins (`#binRange`)**: Adjusts the approximate number of intervals used by the histogram. Increasing the number of bins shows a more detailed distribution; decreasing it groups values into broader intervals.
- The histogram uses the statistic selected in `#statSelect`, so it stays aligned with the statistic used by the type summary chart.

### Important calls and what they do

- `renderHistogram(visiblePokemon)`: Rebuilds the histogram from the filtered Pokémon.
- `vis.map(...).filter(Number.isFinite)`: Collects valid numeric values and excludes missing or non-numeric values.
- `d3.scaleLinear()`: Maps numeric values to horizontal positions and bin counts to vertical positions.
- `d3.bin().domain(...).thresholds(...)`: Divides the numeric domain into bins and counts the values in each interval.
- `d3.max(bins, bin => bin.length)`: Finds the largest bin count to set the vertical scale.
- `histogramBarsGroup.selectAll(".hbar").data(bins).join("rect")`: Creates one rectangle per bin.
- `#3182bd` and `#9ecae1`: Set the normal blue bar color and the lighter blue hover color, respectively.
- `showTooltip()`: Shows the interval boundaries and the number of Pokémon in the hovered bin.
- `d3.mean()` and `d3.median()`: Calculate summary statistics shown in `#histStatus`, along with the number of observations and bins.

If the selected values are missing or all identical, the histogram displays a status message instead of drawing a misleading distribution.

## Data preparation and type colors

`preparePokemonData(rows)` derives ratio columns used by the point-size selector when those columns are not already present. `initializeExplorer(rows)` stores the prepared data, builds the generation and variable selectors, creates the type legend, and triggers the initial render.

The data is loaded with:

```javascript
d3.csv("pokedex.csv", d3.autoType).then(initializeExplorer);
```

`d3.autoType` converts values that look numeric into JavaScript numbers. The `pokemonTypeColors` object defines the fixed color for each primary Pokémon type, and `color(type)` returns that color (or a neutral fallback for an unexpected type).

## Main D3.js concepts used

- **Selections** (`d3.select`, `selectAll`): Find and manipulate HTML and SVG elements.
- **Data joins** (`data`, `join`): Keep the marks in a chart synchronized with the current data.
- **Scales** (`scaleLinear`, `scaleBand`, `scaleSqrt`): Convert data values into visual positions, widths, and radii.
- **Axes** (`axisBottom`, `axisLeft`): Display scales as readable axes.
- **Aggregation** (`rollup`, `mean`, `min`, `max`, `median`): Summarize the data.
- **Transitions** (`transition`, `duration`): Animate updates when chart values change.
- **Events and tooltips**: Support interactive hover details and chart exploration.

## Notes

- All charts use the same active generation and primary-type filters.
- Pokémon type colors are fixed rather than assigned dynamically based on the current filtered data.
- The histogram uses blue bars (`#3182bd`) and a lighter blue hover color (`#9ecae1`).
- The charts are rendered in SVG, which D3 updates as the user changes controls.
