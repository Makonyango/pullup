export interface Point2D {
  x: number; // East-West meters from origin
  z: number; // North-South meters from origin
}

export interface RoadSegment3D {
  id: string;
  name: string;
  lanes: number;
  widthMeters: number;
  hasMurramShoulder: boolean;
  points: Point2D[];
}

export interface BuildingFootprint3D {
  id: string;
  name?: string;
  heightMeters: number;
  polygon: Point2D[];
}

export interface NairobiMapSceneData {
  corridorName: string;
  originLat: number;
  originLon: number;
  roads: RoadSegment3D[];
  buildings: BuildingFootprint3D[];
  stages: { name: string; position: Point2D }[];
}

// Convert GPS (lat, lon) to local 3D meters relative to a Nairobi origin point
export function gpsToLocalMeters(
  lat: number,
  lon: number,
  originLat: number,
  originLon: number
): Point2D {
  const metersPerDegLat = 110574;
  const metersPerDegLon = 111320 * Math.cos((originLat * Math.PI) / 180);
  return {
    x: (lon - originLon) * metersPerDegLon,
    z: -(lat - originLat) * metersPerDegLat, // -Z is North in Three.js
  };
}

// Built-in Authentic Nairobi Corridors (Real GPS geometry around Nairobi CBD & Uhuru Hwy)
export const NAIROBI_PRESETS: Record<
  string,
  { label: string; lat: number; lon: number; radiusMeters: number }
> = {
  moi_avenue: {
    label: 'Moi Avenue & Archives (CBD)',
    lat: -1.2848,
    lon: 36.8249,
    radiusMeters: 450,
  },
  uhuru_highway: {
    label: 'Uhuru Highway & Haile Selassie',
    lat: -1.2905,
    lon: 36.8185,
    radiusMeters: 550,
  },
  tom_mboya: {
    label: 'Tom Mboya Street & Odeon',
    lat: -1.2833,
    lon: 36.8267,
    radiusMeters: 400,
  },
  ngong_road: {
    label: 'Ngong Road (Adams - Prestige)',
    lat: -1.3001,
    lon: 36.7845,
    radiusMeters: 550,
  },
};

// Fallback road & building network if offline or Overpass API is busy
function buildFallbackNairobiScene(
  corridorName: string,
  originLat: number,
  originLon: number
): NairobiMapSceneData {
  const mainRoad: RoadSegment3D = {
    id: 'fallback-main',
    name: corridorName,
    lanes: 4,
    widthMeters: 14,
    hasMurramShoulder: true,
    points: [
      { x: 0, z: 120 },
      { x: 0, z: 0 },
      { x: 8, z: -150 },
      { x: 25, z: -320 },
      { x: 25, z: -520 },
      { x: -10, z: -720 },
    ],
  };

  const crossStreet: RoadSegment3D = {
    id: 'fallback-cross',
    name: 'Haile Selassie / Harambee Junction',
    lanes: 2,
    widthMeters: 9,
    hasMurramShoulder: false,
    points: [
      { x: -180, z: -150 },
      { x: 8, z: -150 },
      { x: 200, z: -150 },
    ],
  };

  const buildings: BuildingFootprint3D[] = [
    {
      id: 'b1',
      name: 'Kenya National Archives',
      heightMeters: 18,
      polygon: [
        { x: 14, z: -20 },
        { x: 38, z: -20 },
        { x: 38, z: -55 },
        { x: 14, z: -55 },
      ],
    },
    {
      id: 'b2',
      name: 'Hilton / Ambassadeur Block',
      heightMeters: 36,
      polygon: [
        { x: -42, z: -30 },
        { x: -14, z: -30 },
        { x: -14, z: -80 },
        { x: -42, z: -80 },
      ],
    },
    {
      id: 'b3',
      name: 'Times Tower Zone',
      heightMeters: 65,
      polygon: [
        { x: 38, z: -220 },
        { x: 72, z: -220 },
        { x: 72, z: -265 },
        { x: 38, z: -265 },
      ],
    },
    {
      id: 'b4',
      name: 'Stage Kiosks & Shops',
      heightMeters: 12,
      polygon: [
        { x: -24, z: -210 },
        { x: 4, z: -210 },
        { x: 4, z: -275 },
        { x: -24, z: -275 },
      ],
    },
  ];

  return {
    corridorName,
    originLat,
    originLon,
    roads: [mainRoad, crossStreet],
    buildings,
    stages: [
      { name: 'Archives Stage', position: { x: 5, z: -35 } },
      { name: 'Railways / Roundabout Stage', position: { x: 20, z: -310 } },
      { name: 'Nyayo Stadium Stage', position: { x: -4, z: -690 } },
    ],
  };
}

// Import Real Nairobi Street Geometry + 3D Buildings from OpenStreetMap Overpass API
export async function importNairobiStreet3D(
  corridorName: string,
  originLat: number,
  originLon: number,
  radiusMeters = 450
): Promise<NairobiMapSceneData> {
  const query = `
    [out:json][timeout:12];
    (
      way["highway"~"^(trunk|primary|secondary|tertiary|unclassified)$"](around:${radiusMeters},${originLat},${originLon});
      way["building"](around:${Math.min(radiusMeters, 300)},${originLat},${originLon});
    );
    out body;
    >;
    out skel qt;
  `;

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });
    if (!response.ok) throw new Error('Overpass API error');
    const data = await response.json();

    const nodes = new Map<number, { lat: number; lon: number }>();
    for (const el of data.elements || []) {
      if (el.type === 'node') {
        nodes.set(el.id, { lat: el.lat, lon: el.lon });
      }
    }

    const roads: RoadSegment3D[] = [];
    const buildings: BuildingFootprint3D[] = [];
    const stages: { name: string; position: Point2D }[] = [];

    for (const el of data.elements || []) {
      if (el.type !== 'way' || !Array.isArray(el.nodes)) continue;
      const pts: Point2D[] = [];
      for (const nodeId of el.nodes) {
        const n = nodes.get(nodeId);
        if (n) pts.push(gpsToLocalMeters(n.lat, n.lon, originLat, originLon));
      }
      if (pts.length < 2) continue;

      const tags = el.tags || {};
      if (tags.highway) {
        const lanes = Math.min(4, Math.max(2, Number(tags.lanes) || 2));
        roads.push({
          id: `road-${el.id}`,
          name: tags.name || corridorName,
          lanes,
          widthMeters: lanes * 3.5,
          hasMurramShoulder: tags.highway === 'trunk' || tags.highway === 'primary',
          points: pts,
        });

        if (tags.name && stages.length < 5 && pts.length >= 2) {
          stages.push({
            name: `${tags.name} Stage`,
            position: pts[Math.floor(pts.length / 2)],
          });
        }
      } else if (tags.building && pts.length >= 3) {
        const levels = Number(tags['building:levels']) || 2;
        buildings.push({
          id: `bld-${el.id}`,
          name: tags.name,
          heightMeters: Math.min(85, Math.max(6, levels * 3.8)),
          polygon: pts,
        });
      }
    }

    if (roads.length === 0) {
      return buildFallbackNairobiScene(corridorName, originLat, originLon);
    }

    return {
      corridorName,
      originLat,
      originLon,
      roads,
      buildings,
      stages:
        stages.length > 0
          ? stages
          : [{ name: `${corridorName} Stage`, position: roads[0].points[0] }],
    };
  } catch {
    return buildFallbackNairobiScene(corridorName, originLat, originLon);
  }
}