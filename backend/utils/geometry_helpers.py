# utils/geometry_helpers.py 

from typing import Optional, Dict, Any
from geoalchemy2.shape import from_shape
from shapely.geometry import shape, LineString
from fastapi import HTTPException

def geojson_to_geometry(geojson_dict: Optional[Dict[str, Any]]):
    """Convert GeoJSON dict to SQLAlchemy geometry"""
    if not geojson_dict:
        return None
    
    try:
        # Validate it's a LineString
        geom = shape(geojson_dict)
        if not isinstance(geom, LineString):
            raise ValueError("Geometry must be a LineString for vineyard rows")
        
        # Basic validation - must have at least 2 points
        if len(geom.coords) < 2:
            raise ValueError("LineString must have at least 2 coordinate points")
        
        return from_shape(geom, srid=4326)
    except Exception as e:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid geometry: {str(e)}"
        )

def validate_linestring(coordinates: list) -> bool:
    """
    Validate LineString coordinates.
    
    Args:
        coordinates: List of coordinate pairs [[lng, lat], [lng, lat], ...]
    
    Returns:
        bool: True if valid, False otherwise
    """
    if not coordinates or len(coordinates) < 2:
        return False
    
    for coord in coordinates:
        if not isinstance(coord, (list, tuple)) or len(coord) != 2:
            return False
        
        lng, lat = coord
        if not (-180 <= lng <= 180) or not (-90 <= lat <= 90):
            return False
    
    return True

def calculate_row_length(geometry) -> Optional[float]:
    """
    Calculate the length of a row from its geometry.
    
    Args:
        geometry: GeoAlchemy2 geometry object
    
    Returns:
        float: Length in meters (approximate)
    """
    try:
        from geoalchemy2.shape import to_shape
        from pyproj import Geod
        
        # Convert to shapely geometry
        line = to_shape(geometry)
        
        if not isinstance(line, LineString):
            return None
        
        # Use geodesic calculation for accurate distance
        geod = Geod(ellps='WGS84')
        
        total_length = 0
        coords = list(line.coords)
        
        for i in range(len(coords) - 1):
            lon1, lat1 = coords[i]
            lon2, lat2 = coords[i + 1]
            
            # Calculate distance between consecutive points
            _, _, distance = geod.inv(lon1, lat1, lon2, lat2)
            total_length += distance
        
        return round(total_length, 2)
    
    except Exception as e:
        logger.error(f"Error calculating row length: {str(e)}")
        return None

def create_row_geometry_from_endpoints(start_point: Dict[str, float], 
                                     end_point: Dict[str, float]) -> Dict[str, Any]:
    """
    Create a LineString GeoJSON from start and end points.
    
    Args:
        start_point: Dict with 'lat' and 'lng' keys
        end_point: Dict with 'lat' and 'lng' keys
    
    Returns:
        GeoJSON LineString
    """
    return {
        "type": "LineString",
        "coordinates": [
            [start_point["lng"], start_point["lat"]],
            [end_point["lng"], end_point["lat"]]
        ]
    }

def interpolate_row_positions(block_geometry, row_count: int) -> list:
    """
    Generate evenly spaced row positions within a block polygon.
    
    Args:
        block_geometry: GeoAlchemy2 geometry object (Polygon)
        row_count: Number of rows to create
    
    Returns:
        List of LineString geometries for rows
    """
    try:
        from geoalchemy2.shape import to_shape
        import numpy as np
        
        # Convert to shapely geometry
        polygon = to_shape(block_geometry)
        
        if not isinstance(polygon, Polygon):
            return []
        
        # Get the bounding box
        minx, miny, maxx, maxy = polygon.bounds
        
        # Create parallel lines from west to east (or customize based on row orientation)
        row_geometries = []
        
        # Generate evenly spaced Y coordinates
        y_positions = np.linspace(miny, maxy, row_count)
        
        for y in y_positions:
            # Create a line that crosses the entire bounding box
            line = LineString([(minx - 0.001, y), (maxx + 0.001, y)])
            
            # Intersect with the polygon to get the actual row within the block
            intersection = line.intersection(polygon)
            
            if intersection and not intersection.is_empty:
                if isinstance(intersection, LineString):
                    row_geometries.append(intersection)
                # Handle MultiLineString case (if polygon has holes)
                elif hasattr(intersection, 'geoms'):
                    # Take the longest segment
                    longest = max(intersection.geoms, key=lambda x: x.length)
                    row_geometries.append(longest)
        
        return row_geometries
    
    except Exception as e:
        logger.error(f"Error interpolating row positions: {str(e)}")
        return []