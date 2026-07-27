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
  data: {
    BaseShapeData: class BaseShapeData {},
    PolygonShapeData: class PolygonShapeData {
      points: number[];
      constructor(data?: { points?: number[] }) {
        this.points = data?.points ?? [];
      }
    },
    EllipseShapeData: class EllipseShapeData {
      x: number;
      y: number;
      radiusX: number;
      radiusY: number;
      constructor(data?: { x?: number; y?: number; radiusX?: number; radiusY?: number }) {
        this.x = data?.x ?? 0;
        this.y = data?.y ?? 0;
        this.radiusX = data?.radiusX ?? 0;
        this.radiusY = data?.radiusY ?? 0;
      }
    },
    CircleShapeData: class CircleShapeData {
      x: number;
      y: number;
      radius: number;
      constructor(data?: { x?: number; y?: number; radius?: number }) {
        this.x = data?.x ?? 0;
        this.y = data?.y ?? 0;
        this.radius = data?.radius ?? 0;
      }
    },
    RectangleShapeData: class RectangleShapeData {
      x: number;
      y: number;
      width: number;
      height: number;
      constructor(data?: { x?: number; y?: number; width?: number; height?: number }) {
        this.x = data?.x ?? 0;
        this.y = data?.y ?? 0;
        this.width = data?.width ?? 0;
        this.height = data?.height ?? 0;
      }
    },
    EmanationShapeData: class EmanationShapeData {
      base: unknown;
      constructor(data?: { base?: unknown }) {
        this.base = data?.base;
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
  scene: { templates: { get: () => undefined }, regions: { get: () => undefined, some: () => false, deleteEmbeddedDocuments: vi.fn() } },
  tokens: { placeables: [] }
};
