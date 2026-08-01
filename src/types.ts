import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

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

/**
 * The geometry members of a region shape. Cast entries of `region.shapes` to this to read them:
 * they exist at runtime but are absent from the shape union in `@7h3laughingman/foundry-types`.
 */
export interface RegionShapeGeometry {
    /** The shape's origin: an emanation's base token centre, a polygon's centroid, otherwise x/y. */
    origin: Point;
    /** Rotation about the origin, in degrees. */
    rotation: number;
    /** Length in pixels. Line shapes only. */
    length?: number;
}

