import { Point } from "foundry-pf2e/foundry/common/_types.mjs";
import { MeasuredTemplateType } from "foundry-pf2e/foundry/common/constants.mjs";

/**
 * Type suitable for passing to RegionDocument.create
 */
export interface CustomRegionData {
    name?: string;
    shapes?: object[];
    color?: `#${string}`;
    flags?: { [x: string]: { [x: string]: unknown } };
    [key: string]: unknown;
}

/**
 * Backward-compatibility alias for CustomRegionData / legacy MeasuredTemplateData
 */
export type CustomTemplateData = CustomRegionData;

/**
 * Type suitable for use as the parameter in Sequencer crosshair callbacks
 */
export interface CrosshairUpdatable {
  updateCrosshair(options: object): void;
  x: number;  
  y: number;  
  source: Point;  
}

declare module "foundry-pf2e" {
    interface RegionDocumentPF2e {
        testPoint?: (point: Point & { elevation?: number }) => boolean;
        bounds?: { x: number; y: number; width: number; height: number; center: Point };
        tokens?: Set<TokenPF2e>;
    }
}
