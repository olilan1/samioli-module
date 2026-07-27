import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteItemFromActor, getRegionOrigin, getTokensWithinRadius } from '../src/utils.ts';
import { TokenPF2e } from 'foundry-pf2e';

describe('utils: getRegionOrigin', () => {
  it('returns { x, y } directly for object shapes with x and y properties', () => {
    const ellipse = new (foundry.data.EllipseShapeData as any)({ x: 100, y: 200, radiusX: 50, radiusY: 50 });
    expect(getRegionOrigin(ellipse)).toEqual({ x: 100, y: 200 });

    const rectangle = new (foundry.data.RectangleShapeData as any)({ x: 300, y: 400, width: 100, height: 100 });
    expect(getRegionOrigin(rectangle)).toEqual({ x: 300, y: 400 });
  });

  it('extracts origin from first coordinate pair for PolygonShapeData', () => {
    const polygon = new (foundry.data.PolygonShapeData as any)({ points: [150, 250, 300, 400, 500, 600] });
    expect(getRegionOrigin(polygon)).toEqual({ x: 150, y: 250 });
  });

  it('returns null for empty PolygonShapeData', () => {
    const polygon = new (foundry.data.PolygonShapeData as any)({ points: [] });
    expect(getRegionOrigin(polygon)).toBeNull();
  });

  it('recursively resolves nested base shape for EmanationShapeData', () => {
    const baseEllipse = new (foundry.data.EllipseShapeData as any)({ x: 500, y: 600 });
    const emanation = new (foundry.data.EmanationShapeData as any)({ base: baseEllipse });
    expect(getRegionOrigin(emanation)).toEqual({ x: 500, y: 600 });
  });

  it('handles RegionDocumentPF2e shapes collection', () => {
    const ellipse = new (foundry.data.EllipseShapeData as any)({ x: 750, y: 850 });
    const regionDoc = {
      shapes: [ellipse]
    } as any;
    expect(getRegionOrigin(regionDoc)).toEqual({ x: 750, y: 850 });
  });
});

describe('utils: getTokensWithinRadius', () => {
  beforeEach(() => {
    (globalThis as any).canvas = {
      scene: {},
      grid: {
        size: 100,
        distance: 5,
        getCenterPoint: (offset: { i: number; j: number }) => ({ x: offset.j * 100 + 50, y: offset.i * 100 + 50 })
      },
      tokens: {
        placeables: []
      }
    };
    (globalThis as any).CONFIG = {
      Canvas: {
        polygonBackends: {
          sight: {
            testCollision: () => false
          }
        }
      }
    };
  });

  it('returns tokens within specified radius', () => {
    const token1 = {
      center: { x: 100, y: 100 },
      actor: { isOfType: () => true, isDead: false },
      document: { hidden: false },
      distanceTo: () => 10,
      footprint: [{ i: 1, j: 1 }]
    } as unknown as TokenPF2e;

    const token2 = {
      center: { x: 1000, y: 1000 },
      actor: { isOfType: () => true, isDead: false },
      document: { hidden: false },
      distanceTo: () => 40,
      footprint: [{ i: 10, j: 10 }]
    } as unknown as TokenPF2e;

    (globalThis as any).canvas.tokens.placeables = [token1, token2];

    const result = getTokensWithinRadius({ x: 100, y: 100 }, 30);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(token1);
  });

  it('excludes dead, hidden, or non-creature tokens', () => {
    const deadToken = {
      center: { x: 100, y: 100 },
      actor: { isOfType: () => true, isDead: true },
      document: { hidden: false },
      distanceTo: () => 5
    } as unknown as TokenPF2e;

    const hiddenToken = {
      center: { x: 100, y: 100 },
      actor: { isOfType: () => true, isDead: false },
      document: { hidden: true },
      distanceTo: () => 5
    } as unknown as TokenPF2e;

    (globalThis as any).canvas.tokens.placeables = [deadToken, hiddenToken];

    const result = getTokensWithinRadius({ x: 100, y: 100 }, 30);
    expect(result).toHaveLength(0);
  });

  it('excludes tokens blocked by walls when checkWalls is true', () => {
    const unblockedToken = {
      center: { x: 100, y: 100 },
      actor: { isOfType: () => true, isDead: false },
      document: { hidden: false },
      distanceTo: () => 10,
      footprint: [{ i: 1, j: 1 }]
    } as unknown as TokenPF2e;

    const blockedToken = {
      center: { x: 200, y: 200 },
      actor: { isOfType: () => true, isDead: false },
      document: { hidden: false },
      distanceTo: () => 15,
      footprint: [{ i: 2, j: 2 }]
    } as unknown as TokenPF2e;

    (globalThis as any).canvas.tokens.placeables = [unblockedToken, blockedToken];

    (globalThis as any).CONFIG.Canvas.polygonBackends.sight.testCollision = (_origin: any, target: any) => {
      return target.x === 250 && target.y === 250; // Block target token space center
    };

    const result = getTokensWithinRadius({ x: 0, y: 0 }, 30, { checkWalls: true });
    expect(result).toContain(unblockedToken);
    expect(result).not.toContain(blockedToken);
  });
});

describe('utils: deleteItemFromActor', () => {
  it('returns false if item is null, undefined, or missing actor', async () => {
    expect(await deleteItemFromActor(null)).toBe(false);
    expect(await deleteItemFromActor(undefined)).toBe(false);
    expect(await deleteItemFromActor({ id: '1' } as any)).toBe(false);
  });

  it('returns false if item is missing from actor items collection', async () => {
    const mockItem = {
      id: 'item-1',
      actor: {
        items: new Map() // Empty collection
      }
    } as any;

    expect(await deleteItemFromActor(mockItem)).toBe(false);
  });

  it('deletes item and returns true if item exists on actor items collection', async () => {
    const deleteFn = vi.fn().mockResolvedValue({});
    const mockItem = {
      id: 'item-1',
      actor: {
        items: new Map([['item-1', {}]])
      },
      delete: deleteFn
    } as any;

    const result = await deleteItemFromActor(mockItem);
    expect(result).toBe(true);
    expect(deleteFn).toHaveBeenCalledTimes(1);
  });
});
