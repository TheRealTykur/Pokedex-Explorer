#!/usr/bin/env python3
"""Interactive Pokémon map PNG -> GeoJSON line tracer.

Usage:
    python converter.py path/to/map.png

Uses Tkinter (usually included with Python) and Pillow for PNG display.
Trace walkable paths as polylines, calibrate the tile grid from two adjacent
tile centers, and export the lines as GeoJSON in custom tile coordinates.
"""
from __future__ import annotations

import argparse
import json
import math
import tkinter as tk
from tkinter import filedialog, messagebox, simpledialog
from pathlib import Path

try:
    from PIL import Image, ImageTk
except ImportError as exc:
    raise SystemExit(
        "Pillow is required. Install it with: python -m pip install pillow"
    ) from exc


class MapTracer:
    def __init__(self, root: tk.Tk, image_path: Path):
        self.root = root
        self.image_path = image_path
        self.image = Image.open(image_path).convert("RGB")
        self.photo = ImageTk.PhotoImage(self.image)
        self.width, self.height = self.image.size

        self.root.title(f"Pokémon Map GeoJSON Tracer - {image_path.name}")
        self.root.geometry("1100x850")

        self.canvas = tk.Canvas(root, background="#252525", cursor="crosshair")
        self.xbar = tk.Scrollbar(root, orient="horizontal", command=self.canvas.xview)
        self.ybar = tk.Scrollbar(root, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(xscrollcommand=self.xbar.set, yscrollcommand=self.ybar.set)

        self.toolbar = tk.Frame(root, padx=6, pady=6)
        self.toolbar.pack(side="top", fill="x")
        self.canvas.pack(side="left", fill="both", expand=True)
        self.ybar.pack(side="right", fill="y")
        self.xbar.pack(side="bottom", fill="x")
        self.toolbar.lift()

        self.mode = tk.StringVar(value="trace")
        self.feature_type = tk.StringVar(value="path")
        self.status = tk.StringVar(value="Not calibrated. Choose Calibrate and click two adjacent tile centers.")
        self.grid_size: float | None = None
        self.grid_origin: tuple[float, float] | None = None
        self.calibration_clicks: list[tuple[float, float]] = []
        self.current_points: list[tuple[float, float]] = []
        self.features: list[dict] = []
        self.drawn_ids: list[int] = []
        self.snap_enabled = tk.BooleanVar(value=True)
        self.next_id = 1

        tk.Button(self.toolbar, text="Calibrate tile grid", command=self.start_calibration).pack(side="left")
        tk.Button(self.toolbar, text="Trace path", command=self.start_trace).pack(side="left", padx=(6, 0))
        tk.Label(self.toolbar, text="Feature:").pack(side="left", padx=(10, 3))
        tk.OptionMenu(self.toolbar, self.feature_type, "path", "corridor", "connection").pack(side="left")
        tk.Checkbutton(self.toolbar, text="Snap to tile centers", variable=self.snap_enabled).pack(side="left", padx=8)
        tk.Button(self.toolbar, text="Finish line (Enter)", command=self.finish_line).pack(side="left", padx=3)
        tk.Button(self.toolbar, text="Undo point (Backspace)", command=self.undo_point).pack(side="left", padx=3)
        tk.Button(self.toolbar, text="Undo line", command=self.undo_line).pack(side="left", padx=3)
        tk.Button(self.toolbar, text="Export GeoJSON", command=self.export_geojson).pack(side="left", padx=3)

        self.image_item = self.canvas.create_image(0, 0, anchor="nw", image=self.photo)
        self.canvas.configure(scrollregion=(0, 0, self.width, self.height))
        self.canvas.bind("<Button-1>", self.on_click)
        self.root.bind("<Return>", lambda _e: self.finish_line())
        self.root.bind("<BackSpace>", lambda _e: self.undo_point())
        self.root.bind("<Escape>", lambda _e: self.cancel_current_line())
        self.root.bind("<Control-s>", lambda _e: self.export_geojson())
        self.root.bind("<MouseWheel>", self.on_mousewheel)
        self.root.bind("<Shift-MouseWheel>", self.on_shift_mousewheel)
        self.update_status()

    def on_mousewheel(self, event):
        # Scroll vertically; Shift+wheel scrolls horizontally.
        self.canvas.yview_scroll(int(-event.delta / 120), "units")

    def on_shift_mousewheel(self, event):
        self.canvas.xview_scroll(int(-event.delta / 120), "units")

    def canvas_point(self, event) -> tuple[float, float]:
        return self.canvas.canvasx(event.x), self.canvas.canvasy(event.y)

    def start_calibration(self):
        self.mode.set("calibrate")
        self.calibration_clicks = []
        self.status.set(
            "Calibration: click the center of one tile, then the center of an immediately adjacent tile."
        )

    def start_trace(self):
        if self.grid_size is None or self.grid_origin is None:
            messagebox.showwarning("Calibration required", "Calibrate the tile grid before tracing.")
            return
        self.mode.set("trace")
        self.status.set("Trace mode: click successive points along a walkable path. Enter finishes; Esc cancels.")

    def on_click(self, event):
        x, y = self.canvas_point(event)
        if not (0 <= x < self.width and 0 <= y < self.height):
            return
        if self.mode.get() == "calibrate":
            self.calibration_clicks.append((x, y))
            self.canvas.create_oval(x-4, y-4, x+4, y+4, outline="#ff3030", width=2, tags=("calibration",))
            if len(self.calibration_clicks) == 2:
                self.complete_calibration()
            return
        if self.mode.get() != "trace":
            return
        if self.snap_enabled.get():
            x, y = self.snap_pixel(x, y)
        self.current_points.append((x, y))
        r = 3
        self.canvas.create_oval(x-r, y-r, x+r, y+r, fill="#00aaff", outline="", tags=("current",))
        if len(self.current_points) > 1:
            x0, y0 = self.current_points[-2]
            self.canvas.create_line(x0, y0, x, y, fill="#00aaff", width=2, tags=("current",))
        self.update_status()

    def complete_calibration(self):
        (x1, y1), (x2, y2) = self.calibration_clicks
        distance = math.hypot(x2 - x1, y2 - y1)
        if distance < 2:
            messagebox.showerror("Invalid calibration", "The two points are too close. Please calibrate again.")
            self.start_calibration()
            return
        # The two clicks must be centers of horizontally or vertically adjacent tiles.
        dx, dy = abs(x2-x1), abs(y2-y1)
        if min(dx, dy) > distance * 0.35:
            answer = messagebox.askyesno(
                "Diagonal calibration?",
                "These points are diagonal or not aligned. Use their distance as one tile width anyway?"
            )
            if not answer:
                self.start_calibration()
                return
        self.grid_size = distance
        # First selected tile center is custom coordinate (0, 0).
        self.grid_origin = (x1, y1)
        self.mode.set("trace")
        self.canvas.create_line(x1, y1, x2, y2, fill="#ff3030", width=2, tags=("calibration",))
        self.status.set(f"Calibrated tile spacing to {distance:.2f} px. First clicked tile center is coordinate (0, 0).")
        self.update_status()

    def snap_pixel(self, x: float, y: float) -> tuple[float, float]:
        assert self.grid_size is not None and self.grid_origin is not None
        ox, oy = self.grid_origin
        s = self.grid_size
        return ox + round((x-ox)/s)*s, oy + round((y-oy)/s)*s

    def pixel_to_game(self, x: float, y: float) -> list[float]:
        assert self.grid_size is not None and self.grid_origin is not None
        ox, oy = self.grid_origin
        # Game coordinates: x increases right, y increases upward.
        gx = (x - ox) / self.grid_size
        gy = (oy - y) / self.grid_size
        return [round(gx, 4), round(gy, 4)]

    def finish_line(self):
        if len(self.current_points) < 2:
            if self.current_points:
                messagebox.showinfo("More points needed", "A line needs at least two points.")
            return
        coords = [self.pixel_to_game(x, y) for x, y in self.current_points]
        # Remove consecutive duplicate coordinates caused by snapping.
        clean = []
        for coord in coords:
            if not clean or coord != clean[-1]:
                clean.append(coord)
        if len(clean) < 2:
            messagebox.showwarning("Line too short", "Snapping collapsed this line to one point. Add points farther apart.")
            return
        feature_id = f"{self.feature_type.get()}_{self.next_id:03d}"
        self.features.append({
            "type": "Feature",
            "properties": {
                "id": feature_id,
                "feature_type": self.feature_type.get(),
                "source": self.image_path.name,
            },
            "geometry": {"type": "LineString", "coordinates": clean},
        })
        self.next_id += 1
        # Keep finished lines visible in green.
        if len(self.current_points) >= 2:
            coords_px = self.current_points
            for p0, p1 in zip(coords_px, coords_px[1:]):
                self.canvas.create_line(*p0, *p1, fill="#00cc66", width=2, tags=("finished",))
        self.canvas.delete("current")
        self.current_points = []
        self.status.set(f"Saved {feature_id}. {len(self.features)} line(s) ready for export.")
        self.update_status()

    def undo_point(self):
        if not self.current_points:
            return
        self.current_points.pop()
        self.redraw_overlay()

    def undo_line(self):
        if self.current_points:
            self.cancel_current_line()
            return
        if self.features:
            removed = self.features.pop()
            self.next_id = max(1, self.next_id - 1)
            self.status.set(f"Removed {removed['properties']['id']}.")
            self.redraw_overlay()
        self.update_status()

    def cancel_current_line(self):
        self.current_points = []
        self.canvas.delete("current")
        self.update_status()

    def redraw_overlay(self):
        self.canvas.delete("finished")
        self.canvas.delete("current")
        for feature in self.features:
            pixel_points = []
            for gx, gy in feature["geometry"]["coordinates"]:
                ox, oy = self.grid_origin
                pixel_points.append((ox + gx*self.grid_size, oy - gy*self.grid_size))
            for p0, p1 in zip(pixel_points, pixel_points[1:]):
                self.canvas.create_line(*p0, *p1, fill="#00cc66", width=2, tags=("finished",))
        for x, y in self.current_points:
            self.canvas.create_oval(x-3, y-3, x+3, y+3, fill="#00aaff", outline="", tags=("current",))
        for p0, p1 in zip(self.current_points, self.current_points[1:]):
            self.canvas.create_line(*p0, *p1, fill="#00aaff", width=2, tags=("current",))
        self.update_status()

    def update_status(self):
        self.root.title(
            f"Pokémon Map GeoJSON Tracer - {self.image_path.name} | "
            f"{len(self.features)} saved line(s), {len(self.current_points)} current point(s)"
        )

    def export_geojson(self):
        if self.grid_size is None:
            messagebox.showwarning("Not calibrated", "Calibrate the tile grid before exporting.")
            return
        if self.current_points:
            if messagebox.askyesno("Finish current line?", "A line is still in progress. Finish it before exporting?"):
                self.finish_line()
            else:
                return
        if not self.features:
            messagebox.showinfo("Nothing to export", "Trace at least one line first.")
            return
        default_name = self.image_path.with_suffix(".geojson").name
        output = filedialog.asksaveasfilename(
            title="Export GeoJSON",
            defaultextension=".geojson",
            initialfile=default_name,
            filetypes=[("GeoJSON", "*.geojson"), ("JSON", "*.json")],
        )
        if not output:
            return
        data = {
            "type": "FeatureCollection",
            "name": self.image_path.stem,
            "features": self.features,
            "metadata": {
                "coordinate_system": "custom_pokemon_tile_grid",
                "units": "tiles",
                "tile_size_pixels": round(self.grid_size, 4),
                "pixel_origin": [round(self.grid_origin[0], 4), round(self.grid_origin[1], 4)],
                "axis_convention": "x right, y up; first calibration point is (0, 0)",
                "source_image": self.image_path.name,
            },
        }
        try:
            Path(output).write_text(json.dumps(data, indent=2), encoding="utf-8")
        except OSError as exc:
            messagebox.showerror("Export failed", str(exc))
            return
        messagebox.showinfo("Export complete", f"Exported {len(self.features)} line(s) to:\n{output}")


def main():
    parser = argparse.ArgumentParser(description="Trace walkable lines on a Pokémon map PNG and export GeoJSON.")
    parser.add_argument("image", nargs="?", help="Input PNG map")
    args = parser.parse_args()

    image_path = Path(args.image) if args.image else None
    if image_path is None:
        # Ask for the image after the Tk root exists.
        root = tk.Tk()
        root.withdraw()
        selected = filedialog.askopenfilename(
            title="Choose Pokémon map PNG",
            filetypes=[("PNG images", "*.png"), ("Image files", "*.png *.jpg *.jpeg *.bmp")],
        )
        root.destroy()
        if not selected:
            return
        image_path = Path(selected)
    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")

    root = tk.Tk()
    MapTracer(root, image_path)
    root.mainloop()


if __name__ == "__main__":
    main()
