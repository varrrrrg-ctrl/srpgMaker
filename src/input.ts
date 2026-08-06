import { MAP_HEIGHT, MAP_WIDTH, type Position } from './types';

const TAP_CANCEL_DISTANCE = 8;

interface PointerStart {
  x: number;
  y: number;
}

export const canvasCellFromPointer = (canvas: HTMLCanvasElement, event: PointerEvent): Position | null => {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((event.clientX - rect.left) / (rect.width / MAP_WIDTH));
  const y = Math.floor((event.clientY - rect.top) / (rect.height / MAP_HEIGHT));

  if (x < 0 || x >= MAP_WIDTH || y < 0 || y >= MAP_HEIGHT) return null;
  return { x, y };
};

export const bindGridTap = (canvas: HTMLCanvasElement, onTap: (position: Position) => void): void => {
  let pointerStart: PointerStart | null = null;

  canvas.addEventListener('pointerdown', (event) => {
    pointerStart = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;

    const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
    pointerStart = null;
    if (distance >= TAP_CANCEL_DISTANCE) return;

    const cell = canvasCellFromPointer(canvas, event);
    if (cell) onTap(cell);
  });

  canvas.addEventListener('pointercancel', () => {
    pointerStart = null;
  });
};
