// A compile-time option: the texture edition never loads or applies elevation data.
export const TERRAIN_ENABLED =
  import.meta.env.VITE_EARTHTIME_TERRAIN !== "false";
