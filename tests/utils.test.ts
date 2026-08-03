import { getTokensInEmanation, hasLineOfEffect } from "../src/areatargeting.ts";
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { deleteItemFromActor, getRegionOrigin } from "../src/utils.ts";
import { TokenPF2e } from 'foundry-pf2e';

const regionWith = (shape: unknown) => ({ shapes: [shape] } as any);

describe('utils: getRegionOrigin', () => {
  it('returns the centre for circle and ellipse shapes', () => {
    const ellipse = new (foundry.data.EllipseShapeData as any)({ x: 100, y: 200, radiusX: 50, radiusY: 50 });
    expect(getRegionOrigin(regionWith(ellipse))).toEqual({ x: 100, y: 200 });

    const circle = new (foundry.data.CircleShapeData as any)({ x: 120, y: 240, radius: 50 });
    expect(getRegionOrigin(regionWith(circle))).toEqual({ x: 120, y: 240 });
  });

  it('returns the top-left for rectangle shapes', () => {
    const rectangle = new (foundry.data.RectangleShapeData as any)({ x: 300, y: 400, width: 100, height: 100 });
    expect(getRegionOrigin(regionWith(rectangle))).toEqual({ x: 300, y: 400 });
  });

  it('returns the line origin, which PF2e uses for line areas', () => {
    const line = new (foundry.data.LineShapeData as any)({ x: 55, y: 65, length: 300, width: 100, rotation: 90 });
    expect(getRegionOrigin(regionWith(line))).toEqual({ x: 55, y: 65 });
  });

  it('returns the centroid for a polygon, not its first vertex', () => {
    const polygon = new (foundry.data.PolygonShapeData as any)({ points: [0, 0, 100, 0, 100, 100, 0, 100] });
    expect(getRegionOrigin(regionWith(polygon))).toEqual({ x: 50, y: 50 });
  });

  it('honours an explicit polygon origin when present', () => {
    const polygon = new (foundry.data.PolygonShapeData as any)({
      points: [0, 0, 100, 0, 100, 100],
      origin: { x: 12, y: 34 }
    });
    expect(getRegionOrigin(regionWith(polygon))).toEqual({ x: 12, y: 34 });
  });

  it('returns null for an empty polygon', () => {
    const polygon = new (foundry.data.PolygonShapeData as any)({ points: [] });
    expect(getRegionOrigin(regionWith(polygon))).toBeNull();
  });

  it('resolves an emanation to the centre of its base token, not the top-left', () => {
    // A 2x2 token whose top-left is (500, 600) centres at (600, 700) on a 100px grid.
    const baseToken = new (foundry.data.TokenShapeData as any)({ x: 500, y: 600, width: 2, height: 2 });
    const emanation = new (foundry.data.EmanationShapeData as any)({ base: baseToken, radius: 300 });
    expect(getRegionOrigin(regionWith(emanation))).toEqual({ x: 600, y: 700 });
  });

  it('returns null when the region has no shapes', () => {
    expect(getRegionOrigin({ shapes: [] } as any)).toBeNull();
  });
});

describe('utils: getTokensInEmanation', () => {
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
          move: { testCollision: () => false }
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

    const result = getTokensInEmanation({ x: 100, y: 100 }, 30);
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

    const result = getTokensInEmanation({ x: 100, y: 100 }, 30);
    expect(result).toHaveLength(0);
  });

  it('excludes a token with no line of effect from the origin', () => {
    const token = {
      actor: { isOfType: () => true, isDead: false },
      document: { hidden: false },
      distanceTo: () => 10,
      footprint: [{ i: 1, j: 1 }]
    } as unknown as TokenPF2e;

    (globalThis as any).canvas.tokens.placeables = [token];
    (globalThis as any).CONFIG.Canvas.polygonBackends.move.testCollision = () => true;

    expect(getTokensInEmanation({ x: 0, y: 0 }, 30)).toHaveLength(0);
  });

});

describe('areatargeting: hasLineOfEffect', () => {
  beforeEach(() => {
    (globalThis as any).canvas = {
      grid: {
        getCenterPoint: (offset: { i: number; j: number }) =>
          ({ x: offset.j * 100 + 50, y: offset.i * 100 + 50 })
      }
    };
  });

  const tokenOccupying = (footprint: { i: number; j: number }[]) =>
    ({ footprint } as unknown as TokenPF2e);

  it('is true when the ray to the token reaches it', () => {
    (globalThis as any).CONFIG = {
      Canvas: { polygonBackends: { move: { testCollision: () => false } } }
    };

    expect(hasLineOfEffect({ x: 0, y: 0 }, tokenOccupying([{ i: 1, j: 1 }]))).toBe(true);
  });

  it('is false when every square is blocked', () => {
    (globalThis as any).CONFIG = {
      Canvas: { polygonBackends: { move: { testCollision: () => true } } }
    };

    expect(hasLineOfEffect({ x: 0, y: 0 }, tokenOccupying([{ i: 1, j: 1 }]))).toBe(false);
  });

  it('is true for a large token with one square reachable and one blocked', () => {
    // A creature half behind a wall is still affected: only one of its squares needs a clear line.
    (globalThis as any).CONFIG = {
      Canvas: {
        polygonBackends: {
          move: {
            testCollision: (_origin: unknown, target: { x: number; y: number }) => target.x === 250
          }
        }
      }
    };

    const large = tokenOccupying([{ i: 1, j: 1 }, { i: 1, j: 2 }]);
    expect(hasLineOfEffect({ x: 0, y: 0 }, large)).toBe(true);
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
