# Pokedex Explorer

An interactive scatterplot for exploring Pokémon stats, built with [D3.js](https://d3js.org/) (v7).

> **Note:** This is a school project. I'll be using what I learned here in my other personal projects later down the line.

## What it does

Each circle is one Pokémon. You choose what the chart shows:

- **X-axis and Y-axis:** any of HP, Attack, Defense, Special Attack, Special Defense, Speed, Total, Height (m), or Weight (kg).
- **Dot size:** one of the ratio stats (`hp_over_total`, `attack_over_total`, `defense_over_total`, `SPA_over_total`, `SPD_over_total`, `speed_over_total`, `Height_over_weight`). Dot area is proportional to the value.
- **Color:** primary type.
- **Trend line:** a black least-squares regression line over the visible dots. It redraws whenever you change an axis, the dot size, or the type filter.

## Interactions

- Change the X, Y, or dot size drop-downs and the chart animates to the new view.
- Hover a dot for the Pokémon's name, type, and the values being plotted. The hovered dot gets an outline.
- Click a type in the legend to hide or show it. Smaller dots are drawn on top of larger ones so overlapping dots stay hover-able.

## Running it

`pokedex.csv` is loaded with `d3.csv`, so the page needs to be served over HTTP. Opening the HTML file directly won't work in most browsers.

```bash
# from the project folder
python -m http.server 8000
```

Then open <http://localhost:8000/pokedex_display.html>.

## Files

| File | Purpose |
| --- | --- |
| `pokedex_display.html` | Page layout, controls, and chart container |
| `pokedex_code.js` | D3 code: scales, axes, dots, legend, tooltip, trend line |
| `pokedex_styles.css` | Styling |
| `pokedex.csv` | Pokémon dataset (one row per Pokémon) |

## Built with

- HTML, CSS, JavaScript
- D3.js v7 (loaded from the jsDelivr CDN)

## TODO

- [ ] **Update Data Set**
  - Could be a more robust dataset.  Would like to add the evolution as a field.  
