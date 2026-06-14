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
} as unknown as typeof foundry;

// Define global Hooks mock
(globalThis as unknown as { Hooks: typeof Hooks }).Hooks = {
  on: vi.fn(),
  once: vi.fn(),
} as unknown as typeof Hooks;

// Define a minimal game mock so top-level code executing imports does not crash
(globalThis as unknown as { game: GamePF2e }).game = {
  modules: {
    get: vi.fn().mockReturnValue({ active: true }),
  },
} as unknown as GamePF2e;
