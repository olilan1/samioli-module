import { vi } from 'vitest';
import { GamePF2e } from 'foundry-pf2e';

// Define global foundry mock
(globalThis as unknown as { foundry: typeof foundry }).foundry = {
  applications: {
    api: {
      DialogV2: class {},
      ApplicationV2: class {},
      HandlebarsApplicationMixin: (Base: unknown) => Base,
    },
    handlebars: {
      renderTemplate: () => {},
    },
    ux: {
      FormDataExtended: class {},
    },
  },
  // Shape mocks follow Foundry's geometry contract (client/data/shapes.mjs): every shape exposes an
  // `origin` getter, which for emanations and polygons differs from the shape's raw x/y.
  data: {
    BaseShapeData: class BaseShapeData {},
    PolygonShapeData: class PolygonShapeData {
      points: number[];
      rotation = 0;
      private readonly sourceOrigin?: { x: number; y: number };
      constructor(data?: { points?: number[]; origin?: { x: number; y: number } }) {
        this.points = data?.points ?? [];
        this.sourceOrigin = data?.origin;
      }
      get origin(): { x: number; y: number } | undefined {
        if (this.sourceOrigin) return { ...this.sourceOrigin };
        if (this.points.length < 2) return undefined;
        // Foundry falls back to the polygon centroid.
        let sumX = 0;
        let sumY = 0;
        const count = this.points.length / 2;
        for (let i = 0; i < this.points.length; i += 2) {
          sumX += this.points[i];
          sumY += this.points[i + 1];
        }
        return { x: sumX / count, y: sumY / count };
      }
    },
    EllipseShapeData: class EllipseShapeData {
      x: number;
      y: number;
      radiusX: number;
      radiusY: number;
      rotation: number;
      constructor(data?: {
        x?: number; y?: number; radiusX?: number; radiusY?: number; rotation?: number;
      }) {
        this.x = data?.x ?? 0;
        this.y = data?.y ?? 0;
        this.radiusX = data?.radiusX ?? 0;
        this.radiusY = data?.radiusY ?? 0;
        this.rotation = data?.rotation ?? 0;
      }
      get origin() {
        return { x: this.x, y: this.y };
      }
    },
    CircleShapeData: class CircleShapeData {
      x: number;
      y: number;
      radius: number;
      rotation = 0;
      constructor(data?: { x?: number; y?: number; radius?: number }) {
        this.x = data?.x ?? 0;
        this.y = data?.y ?? 0;
        this.radius = data?.radius ?? 0;
      }
      get origin() {
        return { x: this.x, y: this.y };
      }
    },
    RectangleShapeData: class RectangleShapeData {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation: number;
      constructor(data?: {
        x?: number; y?: number; width?: number; height?: number; rotation?: number;
      }) {
        this.x = data?.x ?? 0;
        this.y = data?.y ?? 0;
        this.width = data?.width ?? 0;
        this.height = data?.height ?? 0;
        this.rotation = data?.rotation ?? 0;
      }
      get origin() {
        return { x: this.x, y: this.y };
      }
    },
    LineShapeData: class LineShapeData {
      x: number;
      y: number;
      length: number;
      width: number;
      rotation: number;
      constructor(data?: {
        x?: number; y?: number; length?: number; width?: number; rotation?: number;
      }) {
        this.x = data?.x ?? 0;
        this.y = data?.y ?? 0;
        this.length = data?.length ?? 0;
        this.width = data?.width ?? 0;
        this.rotation = data?.rotation ?? 0;
      }
      get origin() {
        return { x: this.x, y: this.y };
      }
    },
    TokenShapeData: class TokenShapeData {
      x: number;
      y: number;
      width: number;
      height: number;
      rotation = 0;
      constructor(data?: { x?: number; y?: number; width?: number; height?: number }) {
        this.x = data?.x ?? 0;
        this.y = data?.y ?? 0;
        this.width = data?.width ?? 1;
        this.height = data?.height ?? 1;
      }
      // Foundry resolves a token shape's origin to the token's centre.
      get origin() {
        const gridSize = 100;
        return {
          x: this.x + (this.width * gridSize) / 2,
          y: this.y + (this.height * gridSize) / 2
        };
      }
    },
    EmanationShapeData: class EmanationShapeData {
      base: { origin?: { x: number; y: number } } | undefined;
      radius: number;
      rotation = 0;
      constructor(data?: { base?: { origin?: { x: number; y: number } }; radius?: number }) {
        this.base = data?.base;
        this.radius = data?.radius ?? 0;
      }
      // Delegates to the base shape, so a token-based emanation centres on the token.
      get origin() {
        return this.base?.origin;
      }
    },
  },
  utils: {
    deepClone: <T>(val: T): T => structuredClone(val),
  },
} as unknown as typeof foundry;

// Define global Hooks mock
(globalThis as unknown as { Hooks: typeof Hooks }).Hooks = {
  on: vi.fn(),
  once: vi.fn(),
} as unknown as typeof Hooks;

// Define global RegionDocument mock
(globalThis as unknown as { RegionDocument: unknown }).RegionDocument = class {};
(globalThis as unknown as { AmbientLightDocument: unknown }).AmbientLightDocument = class {
  static create = vi.fn().mockResolvedValue({ id: 'light-id' });
};

// Define a minimal game mock so top-level code executing imports does not crash
(globalThis as unknown as { game: GamePF2e }).game = {
  modules: {
    get: vi.fn().mockReturnValue({ active: true }),
  },
} as unknown as GamePF2e;

// Define chainable Sequence mock via Proxy
const createSequenceProxy = (): unknown => {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'play') return () => Promise.resolve();
      if (prop === 'then') return undefined; // Prevent promise chaining issues
      return () => proxy;
    }
  };
  const proxy = new Proxy({}, handler);
  return proxy;
};
(globalThis as unknown as { Sequence: unknown }).Sequence = function () {
  return createSequenceProxy();
};

// Define a minimal canvas mock
(globalThis as unknown as { canvas: unknown }).canvas = {
  grid: { size: 100, distance: 5 },
  scene: { regions: { get: () => undefined, some: () => false, deleteEmbeddedDocuments: vi.fn() } },
  tokens: { placeables: [] }
};
