# app/utils/geometry.py
from geojson_pydantic import Point, Polygon
from typing import Optional

def point_to_wkt(point: Optional[Point]) -> Optional[str]:
    """Convert a GeoJSON Point to WKT format for PostGIS"""
    if not point:
        return None
    
    return f"POINT({point.coordinates[0]} {point.coordinates[1]})"

def polygon_to_wkt(polygon: Optional[Polygon]) -> Optional[str]:
    """Convert a GeoJSON Polygon to WKT format for PostGIS"""
    if not polygon or not polygon.coordinates:
        return None
    
    # Handle exterior ring (first coordinate array)
    exterior_ring = polygon.coordinates[0]
    if not exterior_ring or len(exterior_ring) < 3:
        return None
    
    # Format exterior ring coordinates
    exterior_coords = ', '.join([f"{coord[0]} {coord[1]}" for coord in exterior_ring])
    
    # Handle interior rings (holes) if they exist
    if len(polygon.coordinates) > 1:
        interior_rings = []
        for ring in polygon.coordinates[1:]:
            if ring and len(ring) >= 3:
                interior_coords = ', '.join([f"{coord[0]} {coord[1]}" for coord in ring])
                interior_rings.append(f"({interior_coords})")
        
        if interior_rings:
            all_rings = f"({exterior_coords}), " + ', '.join(interior_rings)
        else:
            all_rings = f"({exterior_coords})"
    else:
        all_rings = f"({exterior_coords})"
    
    return f"POLYGON({all_rings})"