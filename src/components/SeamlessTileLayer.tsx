'use client';

import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

interface SeamlessTileLayerProps {
  url: string;
  subdomains?: string[];
  tileSize?: number;
  attribution?: string;
}

// Shared across instances/remounts so panning back over an area doesn't refetch tiles.
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Draws all visible tiles onto a single canvas instead of one <img> per tile.
 * Leaflet's default TileLayer promotes each tile image to its own GPU compositing
 * layer, which produces visible hairline seams between tiles in Chrome. Painting
 * everything into one canvas avoids per-tile layer compositing entirely.
 */
export default function SeamlessTileLayer({
  url,
  subdomains = ['a', 'b', 'c'],
  tileSize = 256,
  attribution,
}: SeamlessTileLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (attribution) {
      map.attributionControl.addAttribution(attribution);
    }

    const canvas = L.DomUtil.create('canvas', 'seamless-tile-canvas') as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) return;
    const ctx = context;

    canvas.style.position = 'absolute';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.pointerEvents = 'none';

    const pane = map.getPane('tilePane');
    pane?.appendChild(canvas);

    // Draw a buffer larger than the viewport so panning doesn't reveal blank
    // edges before the next redraw; Leaflet moves the whole pane (and thus this
    // canvas) via CSS transform during drag, so no redraw is needed mid-pan.
    const BUFFER = 1.5;
    let redrawScheduled = false;

    function getTileUrl(x: number, y: number, z: number) {
      const s = subdomains[Math.abs(x + y) % subdomains.length];
      return url
        .replace('{s}', s)
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y))
        .replace('{r}', '');
    }

    function loadTile(x: number, y: number, z: number): HTMLImageElement {
      const key = `${z}/${x}/${y}`;
      let img = imageCache.get(key);
      if (!img) {
        img = new Image();
        img.src = getTileUrl(x, y, z);
        img.onload = () => scheduleRedraw();
        imageCache.set(key, img);
      }
      return img;
    }

    function draw() {
      redrawScheduled = false;
      const zoom = Math.round(map.getZoom());
      const size = map.getSize();
      const canvasWidth = Math.ceil(size.x * BUFFER);
      const canvasHeight = Math.ceil(size.y * BUFFER);
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      canvas.style.width = `${canvasWidth}px`;
      canvas.style.height = `${canvasHeight}px`;

      const nwPoint = map.containerPointToLayerPoint([
        -((canvasWidth - size.x) / 2),
        -((canvasHeight - size.y) / 2),
      ]);
      L.DomUtil.setPosition(canvas, nwPoint);

      const topLeftMapPoint = nwPoint.add(map.getPixelOrigin());

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);

      const n = Math.pow(2, zoom);
      const startTileX = Math.floor(topLeftMapPoint.x / tileSize);
      const startTileY = Math.floor(topLeftMapPoint.y / tileSize);
      const endTileX = Math.ceil((topLeftMapPoint.x + canvasWidth) / tileSize);
      const endTileY = Math.ceil((topLeftMapPoint.y + canvasHeight) / tileSize);

      for (let tx = startTileX; tx <= endTileX; tx++) {
        const wrappedX = ((tx % n) + n) % n;
        for (let ty = startTileY; ty <= endTileY; ty++) {
          if (ty < 0 || ty >= n) continue;
          const img = loadTile(wrappedX, ty, zoom);
          if (!img.complete || img.naturalWidth === 0) continue;
          const drawX = Math.round(tx * tileSize - topLeftMapPoint.x);
          const drawY = Math.round(ty * tileSize - topLeftMapPoint.y);
          ctx.drawImage(img, drawX, drawY, tileSize, tileSize);
        }
      }
    }

    function scheduleRedraw() {
      if (redrawScheduled) return;
      redrawScheduled = true;
      requestAnimationFrame(draw);
    }

    map.on('moveend', scheduleRedraw);
    map.on('resize', scheduleRedraw);
    map.on('zoomend', scheduleRedraw);

    draw();

    return () => {
      map.off('moveend', scheduleRedraw);
      map.off('resize', scheduleRedraw);
      map.off('zoomend', scheduleRedraw);
      if (attribution) {
        map.attributionControl.removeAttribution(attribution);
      }
      canvas.remove();
    };
  }, [map, url, subdomains, tileSize, attribution]);

  return null;
}
