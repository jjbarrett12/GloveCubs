import type { Topology } from "topojson-specification";
import usStates10m from "us-atlas/states-10m.json";

/** Bundled U.S. Census TopoJSON — no runtime CDN fetch. */
export const US_STATES_TOPOLOGY = usStates10m as unknown as Topology;
