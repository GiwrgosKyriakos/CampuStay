export interface LatLng {
  latitude: number;
  longitude: number;
}

export function calculatePolygonArea(coordinates: LatLng[]): number {
  if (!coordinates || coordinates.length < 3) return 0;

  const radius = 6378137;
  let area = 0;
  for (let index = 0; index < coordinates.length; index += 1) {
    const first = coordinates[index];
    const second = coordinates[(index + 1) % coordinates.length];
    area +=
      ((second.longitude - first.longitude) * (Math.PI / 180)) *
      (2 + Math.sin((first.latitude * Math.PI) / 180) + Math.sin((second.latitude * Math.PI) / 180));
  }

  return Math.abs((area * radius * radius) / 2);
}

export function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  if (!polygon || polygon.length < 3) return false;

  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index++) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects =
      current.longitude > point.longitude !== previous.longitude > point.longitude &&
      point.latitude <
        ((previous.latitude - current.latitude) * (point.longitude - current.longitude)) /
          (previous.longitude - current.longitude) +
          current.latitude;

    if (intersects) inside = !inside;
  }

  return inside;
}
