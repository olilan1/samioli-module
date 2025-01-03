/**
 * Type suitable for passing to MeasuredTemplateDocument.create
 */
export interface CustomTemplateData {
    t: MeasuredTemplateType,
    x: number,
    y: number
    width: number,
    distance: number,
    direction: number,
    fillColor: `#${string}`,
    borderColor: `#${string}`,
};

/**
 * Type suitable for use as the parameter in Sequencer crosshair callbacks
 */
export interface CrosshairUpdatable {
  updateCrosshair(options: object): void;
}
