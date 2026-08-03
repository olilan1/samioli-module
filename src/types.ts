import { Point } from "foundry-pf2e/foundry/common/_types.mjs";

/**
 * Type suitable for use as the parameter in Sequencer crosshair callbacks
 */
export interface CrosshairUpdatable {
  updateCrosshair(options: object): void;
  controlIcon: { texture: PIXI.Texture };
  x: number;
  y: number;
  source: Point;
}

/**
 * The origin flag PF2e writes to a region when it places a spell area. Cast
 * `region.flags.pf2e?.origin` to this to read it: a Region's flags are typed as core's plain
 * `Record<string, Record<string, unknown>>`, not the PF2e-specific shape a ChatMessage gets.
 */
export interface RegionOriginFlag {
    actor?: string;
    slug?: string;
    uuid?: string;
    rollOptions?: string[];
}

/**
 * The geometry members of a region shape. Cast entries of `region.shapes` to this to read them:
 * they exist at runtime but are absent from the shape union in `@7h3laughingman/foundry-types`.
 */
export interface RegionShapeGeometry {
    /** The shape's kind: `circle`, `line`, `rectangle`, `emanation`, and so on. */
    type: string;
    /** The shape's origin: an emanation's base token centre, a polygon's centroid, otherwise x/y. */
    origin: Point;
    /** Rotation about the origin, in degrees. */
    rotation: number;
    /** Length in pixels. Line shapes only. */
    length?: number;
}

