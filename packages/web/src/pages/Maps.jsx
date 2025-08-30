import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '@vineyard/shared';
import MobileNavigation from '../components/MobileNavigation';
import {blocksService, tasksService, observationsService, parcelsService, companiesService, spatialAreasService, vineyardRowsService, api} from '@vineyard/shared';
import * as turf from '@turf/turf';
import SlidingEditForm from '../components/SlidingEditForm';
import SpatialAreaSlidingEditForm from '../components/SpatialAreasSlidingEditForm';

mapboxgl.accessToken = 'pk.eyJ1IjoicGV0ZXRheWxvciIsImEiOiJjbTRtaHNxcHAwZDZ4MmxwbjZkeXNneTZnIn0.RJ9B3Q3-t_-gFrEkgshH9Q';

function Maps() {
  const adminEmail = 'pete.taylor@auxein.co.nz'
  const [initialFitDone, setInitialFitDone] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const mapContainer = useRef(null);
  const map = useRef(null);
  const drawControl = useRef(null);
  const { user } = useAuth();
  const [apiStatus, setApiStatus] = useState('Loading...');
  const [blockCount, setBlockCount] = useState(0);
  const [ownBlockCount, setOwnBlockCount] = useState(0);
  const [mapStyle, setMapStyle] = useState('mapbox://styles/mapbox/satellite-streets-v12');
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawingCoordinates, setDrawingCoordinates] = useState(null);
  const [newBlockInfo, setNewBlockInfo] = useState({
    block_name: '',
    variety: '',
    area: 0,
    centroid_longitude: null,
    centroid_latitude: null
  });
  const [showDrawingForm, setShowDrawingForm] = useState(false);
  const [blocksData, setBlocksData] = useState(null);
  const [blockOpacity, setBlockOpacity] = useState(0.6); // Default opacity
  const [isSplitting, setIsSplitting] = useState(false);
  const [selectedBlockForSplit, setSelectedBlockForSplit] = useState(null);
  const [splitLine, setSplitLine] = useState(null);
  const splitControlRef = useRef(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editSpatialAreaData, setEditSpatialAreaData] = useState(null);
  const [showEditSpatialAreaForm, setShowEditSpatialAreaForm] = useState(false);
  const [editBlockData, setEditBlockData] = useState(null);
  // Map style options
  const mapStyles = [
    { id: 'mapbox://styles/mapbox/streets-v12', name: 'Streets' },
    { id: 'mapbox://styles/mapbox/satellite-streets-v12', name: 'Satellite' },
    { id: 'mapbox://styles/mapbox/navigation-night-v1', name: 'Night' },
    { id: 'mapbox://styles/mapbox/outdoors-v12', name: 'Outdoors' }, 
    { id: 'mapbox://styles/mapbox/satellite-v9', name: '3D Satellite', is3D: true },
    { id: 'mapbox://styles/mapbox/outdoors-v12-3d', name: '3D Outdoors', is3D: true, baseStyle: 'mapbox://styles/mapbox/outdoors-v12' }
  ];
  const [is3DMode, setIs3DMode] = useState(false);
  const [terrainExaggeration, setTerrainExaggeration] = useState(1);
  const [parcelsData, setParcelsData] = useState(null);
  const [showParcelsLayer, setShowParcelsLayer] = useState(false);
  const [parcelOpacity, setParcelOpacity] = useState(0.4);
  const [isLoadingParcels, setIsLoadingParcels] = useState(false);
  const [parcelCount, setParcelCount] = useState(0);
  const [assignedParcelCount, setAssignedParcelCount] = useState(0);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [selectedParcelForAssignment, setSelectedParcelForAssignment] = useState(null);
  const [availableCompanies, setAvailableCompanies] = useState([]);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [assignmentFormData, setAssignmentFormData] = useState({
    company_id: '',
    ownership_type: 'full',
    ownership_percentage: 100.0,
    verification_method: 'manual',
    notes: ''
  });
  const [showBlockAssignmentModal, setShowBlockAssignmentModal] = useState(false);
  const [selectedBlockForAssignment, setSelectedBlockForAssignment] = useState(null);
  const [blockAssignmentFormData, setBlockAssignmentFormData] = useState({
    company_id: '',
    notes: ''
  });
  const [isMapping, setIsMapping] = useState(false);
  const [mappingType, setMappingType] = useState(''); 
  const [spatialAreaType, setSpatialAreaType] = useState('');
  const [spatialAreasData, setSpatialAreasData] = useState(null);
  const [showSpatialAreasLayer, setShowSpatialAreasLayer] = useState(true);
  const [spatialAreaOpacity, setSpatialAreaOpacity] = useState(0.5);
  const [spatialAreaCount, setSpatialAreaCount] = useState(0);
  const [showBackgroundDim, setShowBackgroundDim] = useState(true);

  const handleCreateRows = async (rowCreationData) => {
    try {
      const result = await vineyardRowsService.bulkCreateRows(rowCreationData);
      // Handle success - show message, reload data, etc.
      return result;
    } catch (error) {
      // Handle error
      throw error;
    }
  };

  // Handle map style change
  const handleStyleChange = (styleId) => {
    if (map.current) {
      const selectedStyle = mapStyles.find(s => s.id === styleId);
      const newIs3D = selectedStyle?.is3D || false;
      
      setMapStyle(styleId);
      
      // Update 3D mode if style requires it
      if (newIs3D !== is3DMode) {
        setIs3DMode(newIs3D);
      }
      
      // Use baseStyle if available, otherwise use the styleId
      const actualStyleId = selectedStyle?.baseStyle || styleId;
      map.current.setStyle(actualStyleId);
      
      // Adjust pitch based on 3D mode
      setTimeout(() => {
        map.current.easeTo({
          pitch: newIs3D ? 45 : 0,
          duration: 1500
        });
      }, 100);
    }
  };

  const add3DTerrain = () => {
    if (!map.current) return;
    
    try {
      console.log('Adding 3D terrain...');
      
      // Add terrain source
      map.current.addSource('mapbox-dem', {
        'type': 'raster-dem',
        'url': 'mapbox://mapbox.mapbox-terrain-dem-v1',
        'tileSize': 512,
        'maxzoom': 14
      });
      
      // Add the terrain layer
      map.current.setTerrain({ 
        'source': 'mapbox-dem', 
        'exaggeration': terrainExaggeration 
      });
      
      // Add sky layer for better 3D effect
      map.current.addLayer({
        'id': 'sky',
        'type': 'sky',
        'paint': {
          'sky-type': 'atmosphere',
          'sky-atmosphere-sun': [0.0, 0.0],
          'sky-atmosphere-sun-intensity': 15
        }
      });
      
      // Add some lighting effects
      map.current.setLight({
        'color': 'rgba(255, 255, 255, 1)',
        'intensity': 0.4,
        'position': [1.5, 90, 80]
      });
      
      console.log('3D terrain added successfully');
      setApiStatus('3D terrain enabled');
    } catch (error) {
      console.error('Error adding 3D terrain:', error);
      setApiStatus('Error enabling 3D terrain');
    }
  };

  const remove3DTerrain = () => {
    if (!map.current) return;
    
    try {
      console.log('Removing 3D terrain...');
      
      // Remove terrain
      map.current.setTerrain(null);
      
      // Remove sky layer
      if (map.current.getLayer('sky')) {
        map.current.removeLayer('sky');
      }
      
      // Remove terrain source
      if (map.current.getSource('mapbox-dem')) {
        map.current.removeSource('mapbox-dem');
      }
      
      // Reset lighting
      map.current.setLight({});
      
      console.log('3D terrain removed');
      setApiStatus('3D terrain disabled');
    } catch (error) {
      console.error('Error removing 3D terrain:', error);
    }
  };

  const toggle3DMode = () => {
    const newIs3D = !is3DMode;
    setIs3DMode(newIs3D);
    
    if (newIs3D) {
      add3DTerrain();
      map.current.easeTo({
        pitch: 45,
        bearing: 0,
        duration: 1500
      });
    } else {
      remove3DTerrain();
      map.current.easeTo({
        pitch: 0,
        bearing: 0,
        duration: 1500
      });
    }
  };

  const updateTerrainExaggeration = (value) => {
    const exaggeration = parseFloat(value);
    setTerrainExaggeration(exaggeration);
    
    if (map.current && map.current.getTerrain()) {
      map.current.setTerrain({
        'source': 'mapbox-dem',
        'exaggeration': exaggeration
      });
    }
  };

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.ctrlKey) {
        switch(e.key) {
          case '3':
            e.preventDefault();
            toggle3DMode();
            break;
          case 'r':
            if (is3DMode) {
              e.preventDefault();
              // Reset camera rotation
              map.current.easeTo({
                bearing: 0,
                pitch: 45,
                duration: 1000
              });
            }
            break;
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [is3DMode]);

  const handleOpacityChange = (opacity) => {
    setBlockOpacity(opacity);
  };

  const toggleSplitMode = () => {
    setIsSplitting(!isSplitting);
    if (!isSplitting) {
      setApiStatus('Split mode enabled. Select a block, then draw a line through it.');
    } else {
      setApiStatus('Split mode disabled.');
      setSelectedBlockForSplit(null);
      setSplitLine(null);
      drawControl.current?.deleteAll();
      // Reset any highlight styling
      if (map.current && map.current.getLayer('vineyard-blocks-fill')) {
        map.current.setPaintProperty('vineyard-blocks-fill', 'fill-opacity', blockOpacity);
      }
    }
  };

  // Touch handling state
  const touchStartTime = useRef(null);
  const touchStartPosition = useRef(null);
  const isLongPress = useRef(false);
  const currentPopup = useRef(null);

  const spatialAreaTypes = [
    { value: 'paddock', label: 'Paddock' },
    { value: 'orchard', label: 'Orchard' },
    { value: 'plantation_forestry', label: 'Plantation Forestry' },
    { value: 'native_forest', label: 'Native Forest' },
    { value: 'infrastructure_zone', label: 'Infrastructure Zone' },
    { value: 'waterway', label: 'Waterway' },
    { value: 'wetland', label: 'Wetland' },
    { value: 'conservation_area', label: 'Conservation Area' },
    { value: 'waste_management', label: 'Waste Management' }
  ];

  const startMapping = () => {
    setIsMapping(true);
    setApiStatus('Draw your area on the map');
    
  };

  // Initialize map
  useEffect(() => {
    if (map.current) return;

      setTimeout(() => {
        map.current = new mapboxgl.Map({
          container: mapContainer.current,
          style: mapStyle,
          center: [172.6148, -43.5272],
          zoom: 8,
          pitch: is3DMode ? 45 : 0, // Tilt the map for 3D effect
          bearing: 0,
          antialias: true // Better rendering for 3D
        });

      map.current.once('style.load', () => {
        console.log('Style loaded, setting up 3D and layers');
        
        // Add 3D terrain if enabled
        if (is3DMode) {
          setTimeout(() => add3DTerrain(), 100);
        }
      
      // Add background dimming for non-admin users
      if (user?.email !== adminEmail) {
        addBackgroundDimming();
      }
      
      // Load blocks data only if we don't have it yet
      if (blocksData) {
        console.log('Blocks data exists, adding to map');
        addBlocksToMap(blocksData, user?.company_id);
        loadSpatialAreasData();
      } else {
        console.log('No blocks data yet, will load from API');
        loadBlocksData();
        loadSpatialAreasData();
      }
      if (spatialAreasData) {
        console.log('Spatial areas data exists, adding to map');
        addSpatialAreasToMap(spatialAreasData, user?.company_id);
      } else {
        console.log('No spatial areas data yet, will load from API');
        loadSpatialAreasData();
      }
    });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Add geolocate control
      map.current.addControl(
        new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        }),
        'top-right'
      );

      // Add geocoder (search) control
      map.current.addControl(
        new MapboxGeocoder({
          accessToken: mapboxgl.accessToken,
          mapboxgl: mapboxgl,
          placeholder: 'Search for locations...',
          proximity: {
            longitude: 175.3103,
            latitude: -43.5320
          }
        }),
        'top'
      );

      // Add drawing control
      drawControl.current = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
          polygon: true,
        },

        styles: [
          // Style for vertices
          {
            id: 'gl-draw-polygon-fill-inactive',
            type: 'fill',
            filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'Polygon']],
            paint: {
              'fill-color': '#58e23c',
              'fill-outline-color': '#58e23c',
              'fill-opacity': 0.5
            }
          },
          // Style for the polygon when active
          {
            id: 'gl-draw-polygon-fill-active',
            type: 'fill',
            filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
            paint: {
              'fill-color': '#58e23c',
              'fill-outline-color': '#58e23c',
              'fill-opacity': 0.5
            }
          },
          // Vertex style
          {
            id: 'gl-draw-polygon-midpoint',
            type: 'circle',
            filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
            paint: {
              'circle-radius': 4,
              'circle-color': '#58e23c'
            }
          },
          // Line style
          {
            id: 'gl-draw-line-inactive',
            type: 'line',
            filter: ['all', ['==', 'active', 'false'], ['==', '$type', 'LineString']],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#ff0000',
              'line-width': 3
            }
          },
          // Active line style
          {
            id: 'gl-draw-line-active',
            type: 'line',
            filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
            layout: {
              'line-cap': 'round',
              'line-join': 'round'
            },
            paint: {
              'line-color': '#ff0000',
              'line-width': 3
            }
          },
          // Vertex point style
          {
            id: 'gl-draw-point-point-stroke-inactive',
            type: 'circle',
            filter: [
              'all',
              ['==', 'active', 'false'],
              ['==', '$type', 'Point'],
              ['==', 'meta', 'vertex']
            ],
            paint: {
              'circle-radius': 6,
              'circle-opacity': 1,
              'circle-color': '#fff',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#58e23c'
            }
          },
          {
            id: 'gl-draw-point-inactive',
            type: 'circle',
            filter: [
              'all',
              ['==', 'active', 'false'],
              ['==', '$type', 'Point'],
              ['==', 'meta', 'vertex']
            ],
            paint: {
              'circle-radius': 4,
              'circle-color': '#58e23c'
            }
          },
          {
            id: 'gl-draw-point-stroke-active',
            type: 'circle',
            filter: [
              'all',
              ['==', '$type', 'Point'],
              ['==', 'active', 'true'],
              ['==', 'meta', 'vertex']
            ],
            paint: {
              'circle-radius': 8,
              'circle-color': '#fff',
              'circle-stroke-width': 2,
              'circle-stroke-color': '#58e23c'
            }
          },
          {
            id: 'gl-draw-point-active',
            type: 'circle',
            filter: [
              'all',
              ['==', '$type', 'Point'],
              ['==', 'meta', 'active'],
              ['==', 'active', 'true']
            ],
            paint: {
              'circle-radius': 6,
              'circle-color': '#58e23c'
            }
          }
        ]
      });
      
      map.current.addControl(drawControl.current, 'top-right');

      // Register draw events
      map.current.on('draw.create', handleDrawCreate);
      map.current.on('draw.delete', handleDrawDelete);
      map.current.on('draw.update', handleDrawUpdate);


      // Listen for style load events to reload layers
      const handleStyleLoad = () => {
        console.log('Style changed, reloading layers and 3D if needed');
        if (is3DMode) {
          setTimeout(() => add3DTerrain(), 200);
        }
        if (blocksData) {
          console.log('Blocks data exists, adding to map');
          addBlocksToMap(blocksData, user?.company_id);
        } else {
          console.log('No blocks data yet, will load from API');
          loadBlocksData();
          loadSpatialAreasData();
        }
      };

      map.current.on('style.load', handleStyleLoad);

      map.current.on('zoomstart', (e) => {
        if (e.originalEvent) {
          setUserInteracted(true);
        }
      });

    }, 100);

    return () => map.current?.remove();
  }, []);

  // Update opacity when it changes
  useEffect(() => {
    if (map.current && map.current.getLayer('vineyard-blocks-fill')) {
      map.current.setPaintProperty('vineyard-blocks-fill', 'fill-opacity', blockOpacity);
    }
  }, [blockOpacity]);

  // Handle newly drawn polygon or line
  const handleDrawCreate = (e) => {
    if (e.features.length > 0) {
      const feature = e.features[0];
      
      if (isSplitting && feature.geometry.type === 'LineString') {
        // Handle split line (existing code)
        console.log('Split line drawn:', feature.geometry);
        setSplitLine(feature.geometry);
        
        if (selectedBlockForSplit) {
          console.log('Performing block split...');
          performBlockSplit();
        } else {
          setApiStatus('Please select a block to split first');
        }
      } else if (feature.geometry.type === 'Polygon' && !isSplitting) {
        // Handle new polygon - check if we're in mapping mode or regular block creation
        console.log('Drawn polygon:', JSON.stringify(feature.geometry));
        
        const area = turf.area(feature.geometry) / 10000;
        const centroid = turf.centroid(feature.geometry);
        const centroidCoords = centroid.geometry.coordinates;
        
        setDrawingCoordinates(feature.geometry);
        setMappingType('');
        setNewBlockInfo(prev => ({ 
          ...prev, 
          area: parseFloat(area.toFixed(2)),
          centroid_longitude: centroidCoords[0],
          centroid_latitude: centroidCoords[1]
        }));
        
        // Show the drawing form
        setShowDrawingForm(true);
        setIsDrawing(true);

      }
    }
  };

  const handleDrawUpdate = (e) => {
    if (e.features.length > 0 && !isSplitting) {
      const polygon = e.features[0];
      console.log('Updated polygon:', JSON.stringify(polygon.geometry));
      
      const area = turf.area(polygon.geometry) / 10000;
      const centroid = turf.centroid(polygon.geometry);
      const centroidCoords = centroid.geometry.coordinates;
      
      setDrawingCoordinates(polygon.geometry);
      setNewBlockInfo(prev => ({ 
        ...prev, 
        area: parseFloat(area.toFixed(2)),
        centroid_longitude: centroidCoords[0],
        centroid_latitude: centroidCoords[1]
      }));
    }
  };

  const handleDrawDelete = () => {
    if (!isSplitting) {
      setDrawingCoordinates(null);
      setNewBlockInfo({
        block_name: '',
        variety: '',
        area: 0,
        centroid_longitude: null,
        centroid_latitude: null
      });
      setShowDrawingForm(false);
      setIsDrawing(false);
    }
  };

  const performBlockSplit = async () => {
    console.log('performBlockSplit called');
    console.log('selectedBlockForSplit:', selectedBlockForSplit);
    console.log('splitLine:', splitLine);
    
    if (!selectedBlockForSplit || !splitLine) {
      setApiStatus('Error: No block or split line selected');
      return;
    }

    try {
      setApiStatus('Splitting block...');
      
      // Use blocksService to split the block
      const response = await blocksService.splitBlock(
        selectedBlockForSplit.properties.id,
        splitLine
      );
      
      console.log('Split response:', response);
      
      if (response && response.new_blocks) {
        setApiStatus(
          `Block split successfully into ${response.new_blocks.length} parts`
        );
        
        // Reset split mode
        setIsSplitting(false);
        setSelectedBlockForSplit(null);
        setSplitLine(null);
        drawControl.current.deleteAll();
        
        // Update the button state
        document.querySelector('.split-block-btn')?.classList.remove('active');
        
        // Reload blocks
        loadBlocksData();
      }
      
    } catch (error) {
      console.error('Error splitting block:', error);
      setApiStatus(`Error splitting block: ${error.response?.data?.detail || error.message}`);
      drawControl.current.deleteAll();
    }
  };

  const handleNewBlockSubmit = async (e) => {
    e.preventDefault();
    
    if (!drawingCoordinates) {
      alert('Please draw a vineyard block on the map first');
      return;
    }
    
    try {
      setApiStatus('Creating new block...');
      
      const blockData = {
        block_name: newBlockInfo.block_name,
        variety: newBlockInfo.variety,
        area: newBlockInfo.area,
        centroid_longitude: newBlockInfo.centroid_longitude,
        centroid_latitude: newBlockInfo.centroid_latitude,
        company_id: user?.company_id,
        geometry: {
          type: drawingCoordinates.type,
          coordinates: drawingCoordinates.coordinates
        }
      };
      
      console.log('Sending block data with geometry:', blockData);
      
      // Use blocksService to create the block
      const response = await blocksService.createBlock(blockData);
      
      if (response) {
        setApiStatus(`Block created successfully: ${response.block_name}`);
        drawControl.current.deleteAll();
        setShowDrawingForm(false);
        setIsDrawing(false);
        
        loadBlocksData();
      }
    } catch (error) {
      console.error('Error creating block:', error);
      setApiStatus(`Error creating block: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleNewSpatialAreaSubmit = async (e) => {
    e.preventDefault();
    
    if (!drawingCoordinates) {
      alert('Please draw an area on the map first');
      return;
    }
    
    if (!spatialAreaType) {
      alert('Please select an area type');
      return;
    }
    
    try {
      setApiStatus('Creating new spatial area...');
      
      const spatialAreaData = {
        area_type: spatialAreaType,
        name: newBlockInfo.block_name, // Using the same field for name
        description: newBlockInfo.variety || '', // Using variety field for description
        area_hectares: newBlockInfo.area,
        geometry: {
          type: drawingCoordinates.type,
          coordinates: drawingCoordinates.coordinates
        },
        company_id: user?.company_id
      };
      
      console.log('Sending spatial area data:', spatialAreaData);
      
      // Use spatialAreasService to create the area
      const response = await spatialAreasService.createSpatialArea(spatialAreaData);
      
      if (response) {
        setApiStatus(`Spatial area created successfully: ${response.name}`);
        drawControl.current.deleteAll();
        setShowDrawingForm(false);
        setIsDrawing(false);
        setIsMapping(false);
        setMappingType('');
        setSpatialAreaType('');
        setNewBlockInfo({
          block_name: '',
          variety: '',
          area: 0,
          centroid_longitude: null,
          centroid_latitude: null
        });
        
        // Reload spatial areas
        loadSpatialAreasData();
      }
    } catch (error) {
      console.error('Error creating spatial area:', error);
      setApiStatus(`Error creating spatial area: ${error.response?.data?.detail || error.message}`);
    }
  };

  const loadBlocksData = async () => {
    if (!map.current || !user) {
      console.log('Map or user not available, cannot load blocks');
      return;
    }
    
    // Prevent multiple simultaneous loads
    if (loadBlocksData.isLoading) {
      console.log('Blocks already loading, skipping...');
      return;
    }
    
    try {
      loadBlocksData.isLoading = true;
      console.log('Starting blocks data loading');
      setApiStatus('Loading blocks...');
      
      const response = await blocksService.getBlocksGeoJSON();
      console.log('API response received:', response?.features?.length || 0, 'features');
      
      if (response && response.features) {
        const features = response.features;
        setBlockCount(features.length);
        
        const userCompanyId = user.company_id;
        const ownedBlocks = features.filter(feature => 
          Number(feature.properties.company_id) === Number(userCompanyId)
        );
        setOwnBlockCount(ownedBlocks.length);
        
        setApiStatus(`Loaded ${features.length} blocks (${ownedBlocks.length} owned)`);
        setBlocksData(response);
        
        console.log('Blocks data set, map will update via useEffect');
      } else {
        console.log('No blocks found in response');
        setApiStatus('No blocks found');
      }
    } catch (error) {
      console.error('Error loading blocks:', error);
      if (error.response?.status === 401) {
        setApiStatus('Please login to view blocks');
      } else if (error.response?.status === 500) {
        setApiStatus('Server error - check backend logs');
      } else {
        setApiStatus(`Error: ${error.response?.data?.detail || error.message}`);
      }
    } finally {
      loadBlocksData.isLoading = false;
    }
  };

  const loadSpatialAreasData = async () => {
    if (!map.current || !user) {
      console.log('Map or user not available, cannot load spatial areas');
      return;
    }
    
    // Prevent multiple simultaneous loads
    if (loadSpatialAreasData.isLoading) {
      console.log('Spatial areas already loading, skipping...');
      return;
    }

    try {
      loadSpatialAreasData.isLoading = true;
      console.log('Loading spatial areas data');
      setApiStatus('Loading spatial areas...');
      
      const response = await spatialAreasService.getSpatialAreasGeoJSON();
      console.log('Spatial areas response received:', response?.features?.length || 0, 'features');
      
      if (response && response.features) {
        const features = response.features;
        const userCompanyId = user.company_id;
        const isAdmin = user?.email === adminEmail;
        
        if (isAdmin) {
          // Admin sees all spatial areas
          setSpatialAreaCount(features.length);
          setApiStatus(`Loaded ${features.length} spatial areas (all companies)`);
          console.log(`Admin loaded ${features.length} total spatial areas`);
        } else {
          // Regular users see only their company's areas
          const companyAreas = features.filter(feature => 
            Number(feature.properties.company_id) === Number(userCompanyId)
          );
          setSpatialAreaCount(companyAreas.length);
          setApiStatus(`Loaded ${companyAreas.length} spatial areas`);
          console.log(`User loaded ${companyAreas.length} company spatial areas from ${features.length} total`);
        }
        
        // Always store ALL the data - filtering happens in addSpatialAreasToMap
        setSpatialAreasData(response);
        
        // Add areas to map - with retry logic
        const addToMap = () => {
          if (map.current && map.current.isStyleLoaded()) {
            console.log('Adding spatial areas to map now');
            addSpatialAreasToMap(response, userCompanyId);
          } else {
            console.log('Map not ready, retrying spatial areas in 100ms');
            setTimeout(addToMap, 100);
          }
        };
        
        addToMap();
        
      } else {
        console.log('No spatial areas found');
        setApiStatus('No spatial areas found');
        setSpatialAreasData({
          type: 'FeatureCollection',
          features: []
        });
      }
    } catch (error) {
      console.error('Error loading spatial areas:', error);
      setApiStatus(`Error loading spatial areas: ${error.response?.data?.detail || error.message}`);
    } finally {
      loadSpatialAreasData.isLoading = false;
    }
  };

  const addSpatialAreasToMap = (geojsonData, userCompanyId) => {
    if (!map.current) {
      console.log('Map not available, cannot add spatial areas');
      return;
    }

    console.log('Adding spatial areas to map');

    try {
      // Remove existing spatial area layers if they exist
      if (map.current.getLayer('spatial-areas-fill')) {
        map.current.removeLayer('spatial-areas-fill');
      }
      if (map.current.getLayer('spatial-areas-outline')) {
        map.current.removeLayer('spatial-areas-outline');
      }
      if (map.current.getLayer('spatial-areas-labels')) {
        map.current.removeLayer('spatial-areas-labels');
      }
      if (map.current.getSource('spatial-areas')) {
        map.current.removeSource('spatial-areas');
      }

      const isAdmin = user?.email === adminEmail;
      let filteredFeatures = geojsonData.features;

      // FIX: Admin should see ALL spatial areas, not filter by company
      if (!isAdmin) {
        // Only filter for non-admin users
        filteredFeatures = geojsonData.features.filter(
          feature => Number(feature.properties.company_id) === Number(userCompanyId)
        );
      }
      // If admin, use all features without filtering

      console.log(`Admin: ${isAdmin}, Total features: ${geojsonData.features.length}, Filtered features: ${filteredFeatures.length}`);

      const filteredGeoJSON = {
        type: 'FeatureCollection',
        features: filteredFeatures
      };

      map.current.addSource('spatial-areas', {
        type: 'geojson',
        data: filteredGeoJSON
      });

      const findLayerPosition = () => {
        if (map.current.getLayer('vineyard-blocks-fill')) {
          return 'vineyard-blocks-fill';
        }
        if (map.current.getLayer('land-parcels-fill')) {
          return 'land-parcels-fill';
        }
        return null;
      };

      const beforeLayer = findLayerPosition();
      console.log('Adding spatial areas before layer:', beforeLayer || 'top');

      // Add fill layer with color coding based on area type
      const layerConfig = {
        id: 'spatial-areas-fill',
        type: 'fill',
        source: 'spatial-areas',
        paint: {
          'fill-color': [
            'match',
            ['get', 'area_type'],
            'paddock', '#22c55e',
            'orchard', '#f59e0b',
            'plantation_forestry', '#059669',
            'native_forest', '#065f46',
            'infrastructure_zone', '#6b7280',
            'waterway', '#3b82f6',
            'wetland', '#06b6d4',
            'conservation_area', '#10b981',
            'waste_management', '#dc2626',
            '#9ca3af' // default color
          ],
          'fill-opacity': spatialAreaOpacity
        },
        layout: {
          'visibility': showSpatialAreasLayer ? 'visible' : 'none'
        }
      };

      if (beforeLayer) {
        map.current.addLayer(layerConfig, beforeLayer);
      } else {
        map.current.addLayer(layerConfig);
      }

      // Add outline layer
      const outlineConfig = {
        id: 'spatial-areas-outline',
        type: 'line',
        source: 'spatial-areas',
        paint: {
          'line-color': '#1f2937',
          'line-width': 1,
          'line-opacity': 0.7,
          'line-dasharray': [2, 2]
        },
        layout: {
          'visibility': showSpatialAreasLayer ? 'visible' : 'none'
        }
      };

      const outlineBeforeLayer = map.current.getLayer('vineyard-blocks-outline') ? 'vineyard-blocks-outline' : null;
      
      if (outlineBeforeLayer) {
        map.current.addLayer(outlineConfig, outlineBeforeLayer);
      } else {
        map.current.addLayer(outlineConfig);
      }

      // Add labels for spatial areas
      map.current.addLayer({
        id: 'spatial-areas-labels',
        type: 'symbol',
        source: 'spatial-areas',
        minzoom: 12,
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 15,
          'text-offset': [0, 0],
          'text-anchor': 'center',
          'visibility': showSpatialAreasLayer ? 'visible' : 'none'
        },
        paint: {
          'text-color': '#1f2937',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2
        }
      });

      // Add click handler for spatial areas
      map.current.off('click', 'spatial-areas-fill');
      map.current.on('click', 'spatial-areas-fill', handleSpatialAreaClick);

      // Mouse hover effects
      map.current.off('mouseenter', 'spatial-areas-fill');
      map.current.off('mouseleave', 'spatial-areas-fill');
      
      map.current.on('mouseenter', 'spatial-areas-fill', () => {
        if (!('ontouchstart' in window)) {
          map.current.getCanvas().style.cursor = 'pointer';
        }
      });

      map.current.on('mouseleave', 'spatial-areas-fill', () => {
        if (!('ontouchstart' in window)) {
          map.current.getCanvas().style.cursor = '';
        }
      });

      console.log(`Added ${filteredFeatures.length} spatial areas to map`);

    } catch (error) {
      console.error('Error adding spatial areas to map:', error);
      console.error('Error details:', error.message);
    }
  };

  const handleSpatialAreaClick = (e) => {
    console.log('Spatial area clicked:', e.features[0]);
    
    // Prevent default map behavior
    e.preventDefault();
    
    // Close any existing popup
    if (currentPopup.current) {
      currentPopup.current.remove();
      currentPopup.current = null;
    }
    
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const properties = feature.properties;
      const userCompanyId = user?.company_id;
      const isOwnedArea = Number(properties.company_id) === Number(userCompanyId);
      
      // Find the area type label
      const areaTypeLabel = spatialAreaTypes.find(t => t.value === properties.area_type)?.label || properties.area_type;
      
      let popupContent;
      if (isOwnedArea || user?.email === adminEmail) {
        popupContent = `
          <div class="map-popup spatial-area owned">
            <h3>${properties.name || 'Unnamed Area'}</h3>
            <div class="area-type-badge ${properties.area_type}">
              ${areaTypeLabel}
            </div>
            <div class="popup-details">
              ${properties.description ? `<div class="description">${properties.description}</div>` : ''}
              <div><strong>Area:</strong> ${typeof properties.area_hectares === 'number' ? `${properties.area_hectares.toFixed(2)} ha` : 'Unknown'}</div>
              <div><strong>ID:</strong> ${properties.id || 'Unknown'}</div>
              ${properties.created_at ? `<div><strong>Created:</strong> ${new Date(properties.created_at).toLocaleDateString()}</div>` : ''}
            </div>
            <div class="popup-actions">
              <button onclick="handleEditSpatialArea(${properties.id})" class="edit-btn">
                Edit Details
              </button>
            </div>
          </div>
        `;
      } else {
        // Should not happen for regular users, but just in case
        popupContent = `
          <div class="map-popup spatial-area other">
            <h3>${properties.name || 'Unnamed Area'}</h3>
            <div class="area-type-badge ${properties.area_type}">
              ${areaTypeLabel}
            </div>
            <div class="popup-company-notice">This area belongs to another company</div>
          </div>
        `;
      }
      
      // Create popup
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: 'min(90vw, 350px)',
        className: 'spatial-area-popup',
        anchor: 'top'
      })
        .setLngLat(e.lngLat)
        .setHTML(popupContent)
        .addTo(map.current);
      
      currentPopup.current = popup;
    }
  };

const handleEditSpatialArea = (spatialAreaId) => {
  window.dispatchEvent(new CustomEvent('openEditSpatialAreaForm', {
    detail: { spatialAreaId }
  }));
};

// Make the function globally available for the popup button onclick
window.handleEditSpatialArea = handleEditSpatialArea
  
const handleSpatialAreaUpdate = async (spatialAreaId, updateData) => {
  try {
    const response = await spatialAreasService.updateSpatialArea(spatialAreaId, updateData);
    setApiStatus('Spatial area updated successfully!');
    
    // Reload spatial areas to show updated data
    loadSpatialAreasData();
  } catch (error) {
    throw error; // Let the form component handle the error display
  }
};

// Add this state for available parent areas (near your other state declarations)
const [availableParentAreas, setAvailableParentAreas] = useState([]);

// Add this function to load parent areas when needed
const loadAvailableParentAreas = async () => {
  try {
    const response = await spatialAreasService.getCompanySpatialAreas();
    if (response && response.spatial_areas) {
      setAvailableParentAreas(response.spatial_areas);
    }
  } catch (error) {
    console.error('Error loading parent areas:', error);
  }
};


useEffect(() => {
  if (map.current && map.current.getLayer && map.current.getLayer('spatial-areas-fill')) {
    const visibility = showSpatialAreasLayer ? 'visible' : 'none';
    console.log('Setting spatial areas visibility to:', visibility);
    
    try {
      map.current.setLayoutProperty('spatial-areas-fill', 'visibility', visibility);
      map.current.setLayoutProperty('spatial-areas-outline', 'visibility', visibility);
      map.current.setLayoutProperty('spatial-areas-labels', 'visibility', visibility);
    } catch (error) {
      console.error('Error setting spatial areas visibility:', error);
    }
  } else if (showSpatialAreasLayer && spatialAreasData && user) {
    // If layers don't exist but we want them visible and have data, try to add them
    console.log('Spatial areas layers missing but should be visible, attempting to add');
    addSpatialAreasToMap(spatialAreasData, user.company_id);
  }
}, [showSpatialAreasLayer, spatialAreasData, user]);


// Separate useEffect to handle blocksData updates
useEffect(() => {
  if (map.current && map.current.isStyleLoaded() && blocksData && user?.company_id) {
    console.log('Blocks data updated, refreshing map');
    addBlocksToMap(blocksData, user.company_id);
  }
}, [blocksData, user?.company_id]);

const loadParcelsData = async (forceLoad = false) => {
  console.log('🔍 Step 4 - loadParcelsData called for:', {
    user: user?.email,
    companyId: user?.company_id,
    isAdmin: user?.email === adminEmail
  });
  
  if (!map.current || !user) {
    console.log('Map or user not available, cannot load parcels');
    return;
  }
  
  try {
    setIsLoadingParcels(true);
    
    const currentZoom = map.current.getZoom();
    const minZoom = 12;
    const isAdmin = user?.email === adminEmail;
    
    if (currentZoom < minZoom && !forceLoad) {
      setApiStatus(`Zoom to level ${minZoom} or higher to load parcels (current: ${currentZoom.toFixed(1)})`);
      setParcelsData({
        type: "FeatureCollection",
        features: [],
        metadata: { count: 0, zoom_too_low: true }
      });
      setParcelCount(0);
      setAssignedParcelCount(0);
      setIsLoadingParcels(false);
      return;
    }
    
    setApiStatus('Loading parcels...');
    
    let response;
    
    if (isAdmin) {
      // Admin loads all parcels
      console.log('🔍 Loading ALL parcels for admin');
      response = await parcelsService.loadParcelsForViewport(map.current, minZoom, false);
    } else {
      // Regular users load only their company's parcels
      console.log('🔍 Loading company parcels for user company:', user.company_id);
      
      if (!user.company_id) {
        console.error('❌ User has no company_id');
        setApiStatus('No company assigned to user');
        return;
      }
      
      response = await parcelsService.loadCompanyParcelsForViewport(
        user.company_id,
        map.current,
        minZoom
      );
    }
    
    console.log('🔍 Parcels response:', response);
    
    if (response && response.features) {
      const features = response.features;
      setParcelCount(features.length);
      setAssignedParcelCount(features.length);
      
      if (response.metadata?.zoom_too_low) {
        setApiStatus(response.metadata.message);
      } else {
        const userType = isAdmin ? 'total' : 'your company\'s';
        setApiStatus(`Loaded ${features.length} ${userType} parcels`);
      }
      
      setParcelsData(response);
      addParcelsToMap(response);
      if (user?.email !== adminEmail) {
        console.log('Triggering background dimming with fresh parcel data');
        setTimeout(() => {
          addBackgroundDimming(response); // Pass the response directly
        }, 100);
      }
    } else {
      setApiStatus('No parcels found');
      setParcelCount(0);
      setAssignedParcelCount(0);
    }
  
  } catch (error) {
    console.error('❌ Error loading parcels:', error);
    setApiStatus(`Error loading parcels: ${error.response?.data?.detail || error.message}`);
  } finally {
    setIsLoadingParcels(false);
  }


};

const loadAvailableCompanies = async () => {
  try {
    console.log('Loading available companies...');
    setIsLoadingCompanies(true);
    
    const response = await companiesService.getAllCompanies();
    console.log('Raw companies response:', response);
    console.log('Response type:', typeof response);
    console.log('Response keys:', Object.keys(response || {}));
    
    // Handle different possible response structures
    let companies = [];
    
    if (Array.isArray(response)) {
      // Direct array
      companies = response;
    } else if (response && Array.isArray(response.companies)) {
      // { companies: [...] }
      companies = response.companies;
    } else if (response && Array.isArray(response.data)) {
      // { data: [...] }
      companies = response.data;
    } else if (response && Array.isArray(response.results)) {
      // { results: [...] }
      companies = response.results;
    } else if (response && typeof response === 'object') {
      // Try to find any array property in the response
      const possibleArrays = Object.values(response).filter(Array.isArray);
      if (possibleArrays.length > 0) {
        companies = possibleArrays[0];
        console.log('Found array in response:', possibleArrays[0]);
      } else {
        console.error('No array found in response object:', response);
        companies = [];
      }
    } else {
      console.error('Unexpected companies response structure:', response);
      companies = [];
    }
    
    console.log('Final companies array:', companies);
    console.log('Companies count:', companies.length);
    
    setAvailableCompanies(companies);
    
  } catch (error) {
    console.error('Error loading companies:', error);
    setApiStatus(`Error loading companies: ${error.message}`);
    setAvailableCompanies([]); // Ensure it's always an array
  } finally {
    setIsLoadingCompanies(false);
  }
};

const handleAssignParcel = async (parcelProperties) => {
  console.log('Assign parcel clicked:', parcelProperties);
  
  // Set the selected parcel
  setSelectedParcelForAssignment(parcelProperties);
  
  // Reset form data
  setAssignmentFormData({
    company_id: '',
    ownership_type: 'full',
    ownership_percentage: 100.0,
    verification_method: 'manual',
    notes: ''
  });
  
  // Load companies if not already loaded
  if (availableCompanies.length === 0) {
    await loadAvailableCompanies();
  }
  
  // Show assignment modal
  setShowAssignmentModal(true);
};

const handleConfirmAssignment = async () => {
  if (!selectedParcelForAssignment || !assignmentFormData.company_id) {
    setApiStatus('Please select a company');
    return;
  }
  
  try {
    setApiStatus('Assigning parcel to company...');
    
    const assignmentData = {
      company_id: parseInt(assignmentFormData.company_id),
      ownership_type: assignmentFormData.ownership_type,
      ownership_percentage: parseFloat(assignmentFormData.ownership_percentage),
      verification_method: assignmentFormData.verification_method,
      notes: assignmentFormData.notes || `Assigned via map interface to parcel ${selectedParcelForAssignment.linz_id}`
    };
    
    // Validate assignment data
    parcelsService.validateAssignmentData(assignmentData);
    
    const response = await parcelsService.assignParcelToCompany(
      selectedParcelForAssignment.id,
      assignmentData
    );
    
    if (response) {
      setApiStatus(`Successfully assigned parcel to ${response.company_name}`);
      
      // Close modal
      setShowAssignmentModal(false);
      setSelectedParcelForAssignment(null);
      
      // Reload parcels to show updated assignment
      await loadParcelsData(true);
    }
  } catch (error) {
    console.error('Error assigning parcel:', error);
    setApiStatus(`Error assigning parcel: ${error.response?.data?.detail || error.message}`);
  }
};

const handleRemoveParcelAssignment = async (parcelId, companyId) => {
  if (!parcelId || !companyId) {
    setApiStatus('Invalid parcel or company information');
    return;
  }
  
  // Show confirmation dialog
  const confirmed = window.confirm(
    'Are you sure you want to remove this parcel assignment? This action cannot be undone.'
  );
  
  if (!confirmed) {
    return;
  }
  
  try {
    setApiStatus('Removing parcel assignment...');
    
    const response = await parcelsService.removeParcelAssignment(parcelId, companyId);
    
    if (response) {
      setApiStatus(`Successfully removed assignment from ${response.company_name}`);
      
      // Reload parcels to show updated assignment
      await loadParcelsData(true);
    }
  } catch (error) {
    console.error('Error removing parcel assignment:', error);
    setApiStatus(`Error removing assignment: ${error.response?.data?.detail || error.message}`);
  }
};

const handleCancelAssignment = () => {
  setShowAssignmentModal(false);
  setSelectedParcelForAssignment(null);
  setAssignmentFormData({
    company_id: '',
    ownership_type: 'full',
    ownership_percentage: 100.0,
    verification_method: 'manual',
    notes: ''
  });
};

// Add automatic reloading when map moves (with debouncing)
const loadParcelsDebounced = useRef(null);

const handleAssignBlock = async (blockProperties) => {
  console.log('Assign block clicked:', blockProperties);
  
  // Only allow admin
  if (user?.email !== adminEmail) {
    setApiStatus('Only administrators can assign blocks');
    return;
  }
  
  try {
    // Set the selected block
    setSelectedBlockForAssignment(blockProperties);
    
    // Reset form data
    setBlockAssignmentFormData({
      company_id: '',
      notes: ''
    });
    
    // Load companies if not already loaded
    if (availableCompanies.length === 0) {
      await loadAvailableCompanies();
    }
    
    // Show assignment modal
    setShowBlockAssignmentModal(true);
    
  } catch (error) {
    console.error('Error in handleAssignBlock:', error);
    setApiStatus('Error opening block assignment form');
  }
};

const handleConfirmBlockAssignment = async () => {
  if (!selectedBlockForAssignment || !blockAssignmentFormData.company_id) {
    setApiStatus('Please select a company');
    return;
  }
  
  try {
    setApiStatus('Assigning block to company...');
    
    const companyId = parseInt(blockAssignmentFormData.company_id);
    
    const response = await blocksService.assignBlock(
      selectedBlockForAssignment.id,
      companyId
    );
    
    if (response) {
      const company = availableCompanies.find(c => c.id === companyId);
      setApiStatus(`Successfully assigned block to ${company?.name || `Company ${companyId}`}`);
      
      // Close modal
      setShowBlockAssignmentModal(false);
      setSelectedBlockForAssignment(null);
      
      // Reload blocks to show updated assignment
      await loadBlocksData();
    }
  } catch (error) {
    console.error('Error assigning block:', error);
    setApiStatus(`Error assigning block: ${error.response?.data?.detail || error.message}`);
  }
};

const handleCancelBlockAssignment = () => {
  setShowBlockAssignmentModal(false);
  setSelectedBlockForAssignment(null);
  setBlockAssignmentFormData({
    company_id: '',
    notes: ''
  });
};

useEffect(() => {
  if (!map.current || user?.email !== adminEmail) return;
  
  const handleMapMove = () => {
    if (!showParcelsLayer) return;
    
    // Debounce the loading to avoid too many requests
    if (loadParcelsDebounced.current) {
      clearTimeout(loadParcelsDebounced.current);
    }
    
    loadParcelsDebounced.current = setTimeout(() => {
      loadParcelsData();
    }, 1000); // Wait 1 second after user stops moving map
  };
  
  const handleZoomEnd = () => {
    if (showParcelsLayer) {
      loadParcelsData();
    }
  };
  
  if (showParcelsLayer) {
    map.current.on('moveend', handleMapMove);
    map.current.on('zoomend', handleZoomEnd);
  }
  
  return () => {
    if (map.current) {
      map.current.off('moveend', handleMapMove);
      map.current.off('zoomend', handleZoomEnd);
    }
    if (loadParcelsDebounced.current) {
      clearTimeout(loadParcelsDebounced.current);
    }
  };
}, [showParcelsLayer, user]);


useEffect(() => {
  if (!map.current || !user) return;
  
  const loadData = () => {
    console.log('Initial load triggered');
    loadBlocksData();
  };
  
  if (map.current.loaded()) {
    console.log('Map already loaded, loading blocks');
    loadData();
  } else {
    console.log('Map not loaded yet, setting up load event');
    map.current.once('load', loadData);
  }
  
  return () => {
    if (map.current) {
      map.current.off('load', loadData);
    }
  };
}, [user]);



// Helper to detect when drawing mode is active
useEffect(() => {
  if (drawControl.current && isMapping) {
    // Listen for mode changes to provide better feedback
    const handleModeChange = (e) => {
      if (e.mode === 'draw_polygon') {
        setApiStatus('Click on the map to start drawing. Double-click to complete the polygon.');
      }
    };
    if (isMapping) {
      setApiStatus('Click the polygon tool (square icon) in the top right, then draw your area. Double-click to complete.');
    }
  }
}, [isMapping]);

// Load spatial areas when component mounts or user changes
useEffect(() => {
  if (user && map.current) {
    loadSpatialAreasData();
  }
}, [user]);

// Handle spatial areas layer visibility toggle
useEffect(() => {
  if (map.current && map.current.getLayer('spatial-areas-fill')) {
    const visibility = showSpatialAreasLayer ? 'visible' : 'none';
    map.current.setLayoutProperty('spatial-areas-fill', 'visibility', visibility);
    map.current.setLayoutProperty('spatial-areas-outline', 'visibility', visibility);
    map.current.setLayoutProperty('spatial-areas-labels', 'visibility', visibility);
  }
}, [showSpatialAreasLayer]);

// Update spatial area opacity when it changes
useEffect(() => {
  if (map.current && map.current.getLayer('spatial-areas-fill')) {
    map.current.setPaintProperty('spatial-areas-fill', 'fill-opacity', spatialAreaOpacity);
  }
}, [spatialAreaOpacity]);

// Reload spatial areas when map style changes
useEffect(() => {
  if (map.current && spatialAreasData && user) {
    const handleStyleLoad = () => {
      if (spatialAreasData) {
        addSpatialAreasToMap(spatialAreasData, user.company_id);
      }
    };
    
    map.current.on('style.load', handleStyleLoad);
    
    return () => {
      map.current.off('style.load', handleStyleLoad);
    };
  }
}, [mapStyle, spatialAreasData, user]);

// Get user's current location
useEffect(() => {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        });
      },
      (error) => {
        console.error('Error getting location:', error);
      }
    );
  }
}, []);

useEffect(() => {
  if (map.current && map.current.getLayer('land-parcels-fill')) {
    const visibility = showParcelsLayer ? 'visible' : 'none';
    map.current.setLayoutProperty('land-parcels-fill', 'visibility', visibility);
    map.current.setLayoutProperty('land-parcels-outline', 'visibility', visibility);
  }
}, [showParcelsLayer]);

// Update parcel opacity when it changes
useEffect(() => {
  if (map.current && map.current.getLayer('land-parcels-fill')) {
    map.current.setPaintProperty('land-parcels-fill', 'fill-opacity', parcelOpacity);
  }
}, [parcelOpacity]);

// Load parcels when user changes and is admin
useEffect(() => {
  if (map.current && showParcelsLayer) {
    console.log('Triggering parcel load for user:', user.email);
    loadParcelsData();
  }
}, [showParcelsLayer]);

useEffect(() => {
  // Auto-show parcels for regular users (non-admin)
  if (user && user.email !== adminEmail && map.current) {
    console.log('Auto-enabling parcels for regular user:', user.email);
    setShowParcelsLayer(true);
    // Also trigger loading if map is ready
    if (map.current) {
      console.log('Map ready, loading parcels for regular user');
      setTimeout(() => loadParcelsData(), 500); // Small delay to ensure state is updated
    }
  }
}, [user]);

useEffect(() => {
  if (user?.email === adminEmail && availableCompanies.length === 0) {
    loadAvailableCompanies();
  }
}, [user]);


const handleBlockUpdate = async (blockId, updateData) => {
  try {
    const response = await blocksService.updateBlock(blockId, updateData);
    setApiStatus('Block updated successfully!');
    
    // Reload blocks to show updated data
    loadBlocksData();
  } catch (error) {
    throw error; // Let the form component handle the error display
  }
};

useEffect(() => {
  const handleOpenEditSpatialAreaForm = async (e) => {
    console.log('Opening edit form for spatial area:', e.detail.spatialAreaId);
    
    try {
      // Fetch full spatial area details
      const spatialAreaDetails = await spatialAreasService.getSpatialAreaById(e.detail.spatialAreaId);
      setEditSpatialAreaData(spatialAreaDetails);
      
      // Load available parent areas
      await loadAvailableParentAreas();
      
      setShowEditSpatialAreaForm(true);
    } catch (error) {
      console.error('Error loading spatial area details:', error);
      setApiStatus('Failed to load spatial area details');
    }
  };

  window.addEventListener('openEditSpatialAreaForm', handleOpenEditSpatialAreaForm);

  return () => {
    window.removeEventListener('openEditSpatialAreaForm', handleOpenEditSpatialAreaForm);
  };
}, []);

useEffect(() => {
  const handleOpenEditForm = async (e) => {
    console.log('Opening edit form for block:', e.detail.blockId);
    
    try {
      // Fetch full block details
      const blockDetails = await blocksService.getBlockById(e.detail.blockId);
      setEditBlockData(blockDetails);
      setShowEditForm(true);
    } catch (error) {
      console.error('Error loading block details:', error);
      setApiStatus('Failed to load block details');
    }
  };

  window.addEventListener('openEditForm', handleOpenEditForm);

  return () => {
    window.removeEventListener('openEditForm', handleOpenEditForm);
  };
}, []);

  const handleTouchStart = (e) => {
    const now = Date.now();
    const touch = e.originalEvent?.touches?.[0] || e.originalEvent?.changedTouches?.[0];
    
    console.log('Touch start triggered:', { hasTouch: !!touch, timestamp: now });
    
    if (touch) {
      touchStartTime.current = now;
      touchStartPosition.current = { x: touch.clientX, y: touch.clientY };
      isLongPress.current = false;
      
      // Set up long press detection
      setTimeout(() => {
        if (touchStartTime.current === now) {
          isLongPress.current = true;
          console.log('Long press detected');
        }
      }, 500);
    }
    
    // Add visual feedback for touch
    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      console.log('Touch start on block:', feature.properties.id);
      
      map.current.setPaintProperty('vineyard-blocks-fill', 'fill-opacity', [
        'case',
        ['==', ['get', 'id'], feature.properties.id],
        0.8,
        blockOpacity
      ]);
      
      // Reset after a short delay
      setTimeout(() => {
        if (map.current && map.current.getPaintProperty) {
          map.current.setPaintProperty('vineyard-blocks-fill', 'fill-opacity', blockOpacity);
        }
      }, 200);
    }
  };

  const handleTouchEnd = (e) => {
    console.log('Touch end triggered with features:', e.features?.length);
    
    const now = Date.now();
    const touch = e.originalEvent?.changedTouches?.[0];
    
    if (touchStartTime.current && touchStartPosition.current && touch) {
      const touchDuration = now - touchStartTime.current;
      const touchDistance = Math.sqrt(
        Math.pow(touch.clientX - touchStartPosition.current.x, 2) + 
        Math.pow(touch.clientY - touchStartPosition.current.y, 2)
      );
      
      // Consider it a tap if:
      // - Duration is less than 500ms (not a long press)
      // - Movement is less than 10 pixels (not a drag)
      const isTap = touchDuration < 500 && touchDistance < 10;
      
      console.log('Touch end analysis:', {
        duration: touchDuration,
        distance: touchDistance,
        isTap,
        isLongPress: isLongPress.current,
        featuresCount: e.features?.length,
        hasFeatures: !!(e.features && e.features.length > 0)
      });
      
      if (isTap && e.features && e.features.length > 0) {
        console.log('Valid tap detected, calling handleBlockInteraction');
        // Prevent the click event from also firing
        if (e.originalEvent) {
          e.originalEvent.preventDefault();
          e.originalEvent.stopPropagation();
        }
        
        // Store the event data before the timeout to avoid losing it
        const eventData = {
          ...e,
          features: e.features,
          lngLat: e.lngLat,
          originalEvent: e.originalEvent,
          preventDefault: () => {}
        };
        
        // Add a small delay to ensure touch feedback is visible, then show popup
        setTimeout(() => {
          console.log('Calling handleBlockInteraction with preserved features:', eventData.features?.length);
          handleBlockInteraction(eventData, 'touch');
        }, 150);
      } else {
        console.log('Tap not valid or no features');
      }
    } else {
      console.log('Missing touch data:', {
        hasTouchStartTime: !!touchStartTime.current,
        hasTouchStartPosition: !!touchStartPosition.current,
        hasTouch: !!touch
      });
    }
    
    // Reset touch state
    touchStartTime.current = null;
    touchStartPosition.current = null;
    isLongPress.current = false;
  };

// Enhanced block interaction handler for both click and touch
const handleBlockInteraction = (e, eventType = 'click') => {
  console.log(`Block ${eventType} event:`, {
    eventType,
    featuresCount: e.features?.length,
    originalEventType: e.originalEvent?.type,
    isTouchEvent: e.originalEvent instanceof TouchEvent
  });

  // Close any existing popup first
  if (currentPopup.current) {
    currentPopup.current.remove();
    currentPopup.current = null;
  }

  // Prevent default map navigation
  if (e.preventDefault) {
    e.preventDefault();
  }
  
  if (e.features && e.features.length > 0) {
    const feature = e.features[0];
    const properties = feature.properties;
    const userCompanyId = user?.company_id;
    const isOwnedBlock = Number(properties.company_id) === Number(userCompanyId);

    if (isSplitting) {
      // Handle block selection for splitting
      console.log('Block selected for splitting:', feature);
      setSelectedBlockForSplit(feature);
      setApiStatus(`Selected block "${properties.block_name}" for splitting. Now draw a line through it.`);
      
      // Highlight the selected block
      map.current.setPaintProperty('vineyard-blocks-fill', 'fill-opacity', [
        'case',
        ['==', ['get', 'id'], properties.id],
        0.8,
        blockOpacity
      ]);
      
      return;
    }

    // Create unique function names that will be available for cleanup
    const editFunctionName = `openEditForm_${properties.id}_${Date.now()}`;
    const assignBlockFunctionName = `assignBlock_${properties.id}_${Date.now()}`;

    // Create popup content
    let popupContent;
    
    if (isOwnedBlock) {
    
      window[editFunctionName] = () => {
        console.log('Opening edit form for block:', properties.id);
        window.dispatchEvent(new CustomEvent('openEditForm', { 
          detail: { blockId: properties.id } 
        }));
        if (currentPopup.current) {
          currentPopup.current.remove();
          currentPopup.current = null;
        }
      };

      popupContent = `
        <div class="map-popup owned mobile-optimized">
          <h3>${properties.block_name || 'Unnamed Block'}</h3>
          <div class="popup-details">
            <div><strong>Variety:</strong> ${properties.variety || 'Unknown'}</div>
            <div><strong>Area:</strong> ${typeof properties.area === 'number' ? `${properties.area.toFixed(2)} ha` : 'Unknown'}</div>
            <div><strong>Region:</strong> ${properties.region || 'Unknown'}</div>
            <div><strong>Winery:</strong> ${properties.winery || 'Unknown'}</div>
            <div><strong>Organic:</strong> ${properties.organic ? 'Yes' : 'No'}</div>
            <div><strong>ID:</strong> ${properties.id || 'Unknown'}</div>
            ${properties.planted_date ? `<div><strong>Planted:</strong> ${properties.planted_date}</div>` : ''}
          </div>
          <div class="popup-actions mobile-actions">
            <button 
              onclick="window.${editFunctionName}()" 
              class="popup-button mobile-button touch-friendly"
              ontouchstart="">
              Edit Details
            </button>
          </div>
        </div>
      `;
      
    } else {
      // Block belongs to another company or is unassigned
      if (user?.email === adminEmail) {
        window[assignBlockFunctionName] = () => {
          console.log('Assign block clicked for block:', properties);
          handleAssignBlock(properties);
          if (currentPopup.current) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        };
        
        const currentOwnerText = properties.company_id 
          ? `Currently assigned to Company #${properties.company_id}`
          : 'Unassigned';
        
        popupContent = `
          <div class="map-popup other mobile-optimized">
            <h3>${properties.block_name || 'Unnamed Block'}</h3>
            <div class="popup-company-notice">${currentOwnerText}</div>
            <div class="popup-details limited">
              <div><strong>Variety:</strong> ${properties.variety || 'Unknown'}</div>
              <div><strong>Region:</strong> ${properties.region || 'Unknown'}</div>
              <div><strong>Area:</strong> ${typeof properties.area === 'number' ? `${properties.area.toFixed(2)} ha` : 'Unknown'}</div>
              <div><strong>ID:</strong> ${properties.id}</div>
            </div>
            <div class="popup-actions mobile-actions">
              <button 
                onclick="window.${assignBlockFunctionName}()" 
                class="popup-button assign-button mobile-button touch-friendly"
                ontouchstart="">
                ${properties.company_id ? 'Reassign Block' : 'Assign Block'}
              </button>
            </div>
          </div>
        `;
      } else {
        // Regular users see read-only view
        popupContent = `
          <div class="map-popup other mobile-optimized">
            <h3>${properties.block_name || 'Unnamed Block'}</h3>
            <div class="popup-company-notice">This block belongs to another company</div>
            <div class="popup-details limited">
              <div><strong>Variety:</strong> ${properties.variety || 'Unknown'}</div>
              <div><strong>Region:</strong> ${properties.region || 'Unknown'}</div>
              <div><strong>Area:</strong> ${typeof properties.area === 'number' ? `${properties.area.toFixed(2)} ha` : 'Unknown'}</div>
            </div>
          </div>
        `;
      }
    }

    // Create popup with mobile-friendly options
    const popup = new mapboxgl.Popup({
      closeButton: true,
      closeOnClick: true, // Allow closing by clicking elsewhere
      closeOnMove: false,  // Don't close when map moves slightly
      maxWidth: 'min(90vw, 400px)', // Responsive width
      className: 'mobile-friendly-popup',
      anchor: 'top', // Better positioning on mobile
      focusAfterOpen: false // Prevent focus issues on mobile
    })
      .setLngLat(e.lngLat)
      .setHTML(popupContent);

    // Store reference to current popup
    currentPopup.current = popup;
    
    // Store function names for cleanup
    popup._functionNames = [
      editFunctionName,
      assignBlockFunctionName
    ].filter(name => window[name]); // Only store functions that were actually created
    
    // Add to map
    popup.addTo(map.current);

    // Add touch-friendly close behavior
    popup.on('open', () => {
      // Add event listeners for better mobile interaction
      const popupElement = popup.getElement();
      if (popupElement) {
        // Prevent map interaction when touching popup
        popupElement.addEventListener('touchstart', (e) => {
          e.stopPropagation();
        });
        popupElement.addEventListener('touchmove', (e) => {
          e.stopPropagation();
        });
        popupElement.addEventListener('touchend', (e) => {
          e.stopPropagation();
        });
      }
    });

    popup.on('close', () => {
      // Clean up reference
      if (currentPopup.current === popup) {
        currentPopup.current = null;
      }
      
      // Clean up any temporary styling
      if (isSplitting && selectedBlockForSplit) {
        map.current.setPaintProperty('vineyard-blocks-fill', 'fill-opacity', blockOpacity);
      }
      
      // Clean up function references using stored names
      if (popup._functionNames) {
        popup._functionNames.forEach(name => {
          if (window[name]) {
            delete window[name];
          }
        });
      }
    });
  }
};

  const handleParcelClick = (e) => {
    console.log('Parcel click event:', e);

    // Only allow admin to interact with parcels
    if (user?.email !== adminEmail) {
      return;
    }

    // Close any existing popup first
    if (currentPopup.current) {
      currentPopup.current.remove();
      currentPopup.current = null;
    }

    if (e.features && e.features.length > 0) {
      const feature = e.features[0];
      const properties = feature.properties;

      // Create unique function names for cleanup
      const assignFunctionName = `assignParcel_${properties.id}_${Date.now()}`;
      const removeFunctionName = `removeAssignment_${properties.id}_${Date.now()}`;

      // Create popup content based on assignment status
      let popupContent;
      
      if (properties.has_assignment) {
        // Parcel is already assigned
        window[removeFunctionName] = () => {
          console.log('Remove assignment clicked for parcel:', properties.id);
          handleRemoveParcelAssignment(properties.id, properties.assigned_company_id);
          if (currentPopup.current) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        };

        popupContent = `
          <div class="map-popup parcel assigned mobile-optimized">
            <h3>Land Parcel</h3>
            <div class="popup-details">
              <div><strong>LINZ ID:</strong> ${properties.linz_id}</div>
              <div><strong>Appellation:</strong> ${properties.appellation || 'Unknown'}</div>
              <div><strong>Land District:</strong> ${properties.land_district || 'Unknown'}</div>
              <div><strong>Area:</strong> ${properties.area_hectares ? `${properties.area_hectares.toFixed(2)} ha` : 'Unknown'}</div>
              <div><strong>Intent:</strong> ${properties.parcel_intent || 'Unknown'}</div>
            </div>
            <div class="assignment-status assigned">
              <strong>Assigned to:</strong> ${properties.assigned_company_name}
            </div>
            <div class="popup-actions mobile-actions">
              <button 
                onclick="window.${removeFunctionName}()" 
                class="popup-button remove-button mobile-button touch-friendly"
                ontouchstart="">
                Remove Assignment
              </button>
            </div>
          </div>
        `;
      } else {
        // Parcel is unassigned
        window[assignFunctionName] = () => {
          console.log('Assign parcel clicked for parcel:', properties.id);
          handleAssignParcel(properties);
          if (currentPopup.current) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        };

        popupContent = `
          <div class="map-popup parcel unassigned mobile-optimized">
            <h3>Land Parcel</h3>
            <div class="popup-details">
              <div><strong>LINZ ID:</strong> ${properties.linz_id}</div>
              <div><strong>Appellation:</strong> ${properties.appellation || 'Unknown'}</div>
              <div><strong>Land District:</strong> ${properties.land_district || 'Unknown'}</div>
              <div><strong>Area:</strong> ${properties.area_hectares ? `${properties.area_hectares.toFixed(2)} ha` : 'Unknown'}</div>
              <div><strong>Intent:</strong> ${properties.parcel_intent || 'Unknown'}</div>
            </div>
            <div class="assignment-status unassigned">
              <strong>Status:</strong> Unassigned
            </div>
            <div class="popup-actions mobile-actions">
              <button 
                onclick="window.${assignFunctionName}()" 
                class="popup-button assign-button mobile-button touch-friendly"
                ontouchstart="">
                Assign to Company
              </button>
            </div>
          </div>
        `;
      }

      // Create popup
      const popup = new mapboxgl.Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: 'min(90vw, 400px)',
        className: 'mobile-friendly-popup',
        anchor: 'top',
        focusAfterOpen: false
      })
        .setLngLat(e.lngLat)
        .setHTML(popupContent);

      // Store reference and function names for cleanup
      currentPopup.current = popup;
      popup._functionNames = [assignFunctionName, removeFunctionName].filter(name => window[name]);
      
      popup.addTo(map.current);

      popup.on('close', () => {
        if (currentPopup.current === popup) {
          currentPopup.current = null;
        }
        
        // Clean up function references
        if (popup._functionNames) {
          popup._functionNames.forEach(name => {
            if (window[name]) {
              delete window[name];
            }
          });
        }
      });
    }
    };

  const addBlocksToMap = (geojsonData, userCompanyId) => {
    if (!map.current) {
      console.log('Map not available, cannot add blocks');
      return;
    }

    console.log('Adding blocks to map, style loaded:', map.current.isStyleLoaded());

    const addLayers = () => {
      try {
        console.log('Adding layers to map');
        
        if (map.current.getLayer('vineyard-blocks-fill')) {
          map.current.removeLayer('vineyard-blocks-fill');
        }
        if (map.current.getLayer('vineyard-blocks-outline')) {
          map.current.removeLayer('vineyard-blocks-outline');
        }
        if (map.current.getLayer('blocks-labels')) {
          map.current.removeLayer('blocks-labels');
        }
        if (map.current.getSource('vineyard-blocks')) {
          map.current.removeSource('vineyard-blocks');
        }

        map.current.addSource('vineyard-blocks', {
          type: 'geojson',
          data: geojsonData
        });

        map.current.addLayer({
          id: 'vineyard-blocks-fill',
          type: 'fill',
          source: 'vineyard-blocks',
          paint: {
            'fill-color': [
              'case',
              ['==', ['get', 'company_id'], userCompanyId],
              '#58e23c',
              '#3b82f6'
            ],
            'fill-opacity': blockOpacity
          }
        });

        map.current.addLayer({
          id: 'vineyard-blocks-outline',
          type: 'line',
          source: 'vineyard-blocks',
          paint: {
            'line-color': '#ffffff',
            'line-width': [
              'case',
              ['==', ['get', 'company_id'], userCompanyId],
              1.5,
              0.8
            ],
            'line-opacity': 0.8
          }
        });

        const isAdmin = user?.email === adminEmail;

        map.current.addLayer({
          id: 'blocks-labels',
          type: 'symbol',
          source: 'vineyard-blocks',
          minzoom: 12,
          filter: isAdmin ? 
            // Admin sees all blocks
            ['has', 'block_name'] :
            // Regular users see only their company's blocks
            ['==', ['get', 'company_id'], userCompanyId],
          layout: {
            'text-field': ['get', 'block_name'],
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 0],
            'text-anchor': 'center'
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2
          }
        });;

        // Remove existing click handlers first
        map.current.off('click', 'vineyard-blocks-fill');
        map.current.off('touchstart', 'vineyard-blocks-fill');
        map.current.off('touchend', 'vineyard-blocks-fill');

        // Add a universal click handler that checks for all feature types
        map.current.on('click', (e) => {
          // Query all features at the click point
          const allFeatures = map.current.queryRenderedFeatures(e.point, {
            layers: [
              'spatial-areas-fill',
              'vineyard-blocks-fill', 
              'land-parcels-fill'
            ].filter(layerId => map.current.getLayer(layerId)) // Only include layers that exist
          });
          
          console.log('Click detected, features found:', allFeatures.length);
          allFeatures.forEach((feature, index) => {
            console.log(`Feature ${index}:`, feature.layer.id, feature.properties);
          });
          
          // Separate features by type
          const spatialFeatures = allFeatures.filter(f => f.layer.id === 'spatial-areas-fill');
          const blockFeatures = allFeatures.filter(f => f.layer.id === 'vineyard-blocks-fill');
          const parcelFeatures = allFeatures.filter(f => f.layer.id === 'land-parcels-fill');
          
          // Handle based on what was clicked - prioritize the most specific feature
          if (blockFeatures.length > 0 && spatialFeatures.length > 0) {
            // Both block and spatial area - check which is more specific
            console.log('Both block and spatial area clicked');
            
            // You can choose logic here:
            // Option 1: Always prefer blocks
            // Option 2: Check which has smaller area
            // Option 3: Show both in a combined popup
            
            // For now, let's prefer blocks but make sure spatial areas are still accessible
            handleBlockInteraction({
              ...e,
              features: blockFeatures
            }, 'click');
            
          } else if (blockFeatures.length > 0) {
            console.log('Block only clicked');
            if (!(e.originalEvent instanceof TouchEvent)) {
              handleBlockInteraction({
                ...e,
                features: blockFeatures
              }, 'click');
            }
            
          } else if (spatialFeatures.length > 0) {
            console.log('Spatial area only clicked');
            handleSpatialAreaClick({
              ...e,
              features: spatialFeatures
            });
            
          } else if (parcelFeatures.length > 0 && user?.email === adminEmail) {
            console.log('Parcel only clicked');
            handleParcelClick({
              ...e,
              features: parcelFeatures
            });
            
          } else {
            // Close any existing popup if clicking on empty space
            if (currentPopup.current) {
              currentPopup.current.remove();
              currentPopup.current = null;
            }
          }
        });

        // Also handle touch events separately for mobile
        map.current.on('touchend', (e) => {
          // Same logic as click but for touch
          const allFeatures = map.current.queryRenderedFeatures(e.point, {
            layers: [
              'spatial-areas-fill',
              'vineyard-blocks-fill', 
              'land-parcels-fill'
            ].filter(layerId => map.current.getLayer(layerId))
          });
          
          const spatialFeatures = allFeatures.filter(f => f.layer.id === 'spatial-areas-fill');
          const blockFeatures = allFeatures.filter(f => f.layer.id === 'vineyard-blocks-fill');
          
          if (blockFeatures.length > 0 && spatialFeatures.length === 0) {
            handleTouchEnd({
              ...e,
              features: blockFeatures
            });
          } else if (spatialFeatures.length > 0) {
            // Handle spatial area touch
            handleSpatialAreaClick({
              ...e,
              features: spatialFeatures
            });
          }
        });

        // Add click handler for map background to close popups
        map.current.off('click'); // Remove any existing general click handlers first
        map.current.on('click', (e) => {
          // Only close popup if we didn't click on a block
          const features = map.current.queryRenderedFeatures(e.point, {
            layers: ['vineyard-blocks-fill']
          });
          
          if (currentPopup.current && features.length === 0) {
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        });
        map.current.on('touchend', (e) => {
          // Only close popup if we didn't touch a block and popup exists
          if (currentPopup.current && (!e.features || e.features.length === 0)) {
            console.log('Touch on map background, closing popup');
            currentPopup.current.remove();
            currentPopup.current = null;
          }
        });

        if (geojsonData.features.length > 0) {
          if (!userInteracted || !initialFitDone) {
            const companyBlocks = geojsonData.features.filter(
              feature => Number(feature.properties.company_id) === Number(userCompanyId)
            );
            
            if (companyBlocks.length > 0) {
              const firstBlock = companyBlocks[0];
              
              if (firstBlock.properties.centroid_longitude && firstBlock.properties.centroid_latitude) {
                map.current.flyTo({
                  center: [
                    firstBlock.properties.centroid_longitude,
                    firstBlock.properties.centroid_latitude
                  ],
                  zoom: 15,
                  speed: 0.8,
                  essential: true
                });
              } else {
                const bounds = new mapboxgl.LngLatBounds();
                
                if (firstBlock.geometry.type === 'Polygon') {
                  firstBlock.geometry.coordinates[0].forEach(coord => {
                    bounds.extend(coord);
                  });
                  
                  map.current.fitBounds(bounds, { 
                    padding: 100,
                    maxZoom: 15
                  });
                }
              }
            } else {
              const bounds = new mapboxgl.LngLatBounds();
              geojsonData.features.forEach(feature => {
                if (feature.geometry.type === 'Polygon') {
                  feature.geometry.coordinates[0].forEach(coord => {
                    bounds.extend(coord);
                  });
                }
              });
              
              map.current.fitBounds(bounds, { 
                padding: 50,
                maxZoom: 16
              });
            }
            
            setInitialFitDone(true);
          }
        }

        setApiStatus(prevStatus => `${prevStatus.split(' - ')[0]}`);
      } catch (error) {
        console.error('Error adding layers:', error);
      }
    };

    const maxRetries = 5;
    let retryCount = 0;
    
    const tryAddLayers = () => {
      if (map.current.isStyleLoaded()) {
        console.log('Style loaded, adding layers now');
        addLayers();
      } else if (retryCount < maxRetries) {
        console.log(`Style not loaded yet, retry ${retryCount + 1}/${maxRetries}`);
        retryCount++;
        setTimeout(tryAddLayers, 200);
      } else {
        console.log('Failed to add layers after max retries');
        map.current.once('style.load', () => {
          console.log('Final attempt to add layers on style.load event');
          addLayers();
        });
      }
    };
    
    tryAddLayers();
  };

  const addParcelsToMap = (geojsonData) => {
    if (!map.current) {
      console.log('Map not available, cannot add parcels');
      return;
    }

    console.log('Adding parcels to map, style loaded:', map.current.isStyleLoaded());

    const addParcelLayers = () => {
      try {
        console.log('Adding parcel layers to map');
        
        // Remove existing parcel layers if they exist
        if (map.current.getLayer('land-parcels-fill')) {
          map.current.removeLayer('land-parcels-fill');
        }
        if (map.current.getLayer('land-parcels-outline')) {
          map.current.removeLayer('land-parcels-outline');
        }
        if (map.current.getSource('land-parcels')) {
          map.current.removeSource('land-parcels');
        }

        map.current.addSource('land-parcels', {
          type: 'geojson',
          data: geojsonData
        });

        // Fill layer for parcels
        map.current.addLayer({
          id: 'land-parcels-fill',
          type: 'fill',
          source: 'land-parcels',
          paint: {
            'fill-color': [
              'case',
              ['get', 'has_assignment'],
              '#000000',  // Transparent assigned parcels
              '#94a3b8'   // Light gray for unassigned parcels
            ],
            'line-width': [
              'case',
              ['get', 'has_assignment'],
              4.5, // Thick border for assigned
              0    // No border for unassigned
            ],
            'fill-opacity': 0
          },
          layout: {
            'visibility': showParcelsLayer ? 'visible' : 'none'
          }
        });

        // Outline layer for parcels
        map.current.addLayer({
          id: 'land-parcels-outline',
          type: 'line',
          source: 'land-parcels',
          paint: {
            'line-color': [
              'case',
              ['get', 'has_assignment'],
              '#000000',  // Black outline for assigned
              '#64748b'   // Gray outline for unassigned
            ],
            'line-width': 2.5,
            'line-opacity': 1
          },
          layout: {
            'visibility': showParcelsLayer ? 'visible' : 'none'
          }
        });

        // Add click handler for parcels (admin only)
        if (user?.email === adminEmail) {
          map.current.on('click', 'land-parcels-fill', handleParcelClick);
          
          // Mouse hover effects
          map.current.on('mouseenter', 'land-parcels-fill', () => {
            if (!('ontouchstart' in window)) {
              map.current.getCanvas().style.cursor = 'pointer';
            }
          });

          map.current.on('mouseleave', 'land-parcels-fill', () => {
            if (!('ontouchstart' in window)) {
              map.current.getCanvas().style.cursor = '';
            }
          });
        }

        console.log('Parcel layers added successfully');
        
      } catch (error) {
        console.error('Error adding parcel layers:', error);
      }
    };

    const maxRetries = 5;
    let retryCount = 0;
    
    const tryAddParcelLayers = () => {
      if (map.current.isStyleLoaded()) {
        console.log('Style loaded, adding parcel layers now');
        addParcelLayers();
      } else if (retryCount < maxRetries) {
        console.log(`Style not loaded yet, retry ${retryCount + 1}/${maxRetries}`);
        retryCount++;
        setTimeout(tryAddParcelLayers, 200);
      } else {
        console.log('Failed to add parcel layers after max retries');
        map.current.once('style.load', () => {
          console.log('Final attempt to add parcel layers on style.load event');
          addParcelLayers();
        });
      }
    };
    
    tryAddParcelLayers();
  };

  const addBackgroundDimming = (parcelsDataOverride = null) => {
    if (!map.current || user?.email === adminEmail) {
      console.log('Skipping background dimming - admin user or no map');
      return;
    }
    
    try {
      // Remove existing dimming layers
      if (map.current.getLayer('background-dim-layer')) {
        map.current.removeLayer('background-dim-layer');
      }
      if (map.current.getSource('background-dim')) {
        map.current.removeSource('background-dim');
      }

      const userCompanyId = user?.company_id;
      
      if (!userCompanyId) {
        console.log('No company ID for user, skipping background dimming');
        return;
      }

      // Use override data if provided, otherwise use state
      const currentParcelsData = parcelsDataOverride || parcelsData;

      console.log('=== BACKGROUND DIMMING DEBUG ===');
      console.log('User company ID:', userCompanyId);
      console.log('User email:', user?.email);
      console.log('Is admin:', user?.email === adminEmail);
      console.log('Using override data:', !!parcelsDataOverride);
      console.log('Parcels data available:', !!currentParcelsData);
      console.log('Parcels features count:', currentParcelsData?.features?.length || 0);

      // Log the actual parcels data structure
      if (currentParcelsData?.features?.length > 0) {
        console.log('First parcel structure:', {
          properties: Object.keys(currentParcelsData.features[0].properties),
          geometry_type: currentParcelsData.features[0].geometry?.type,
          sample_parcel: currentParcelsData.features[0].properties
        });
      }

      let userParcels = [];
      
      if (currentParcelsData && currentParcelsData.features) {
        if (user?.email === adminEmail) {
          // Admin: filter parcels by company_id
          userParcels = currentParcelsData.features.filter(parcel => 
            Number(parcel.properties.company_id) === Number(userCompanyId) ||
            Number(parcel.properties.assigned_company_id) === Number(userCompanyId)
          );
          console.log('Admin mode: filtered', userParcels.length, 'parcels from', currentParcelsData.features.length, 'total');
        } else {
          // Regular user: ALL parcels should be theirs (loadCompanyParcelsForViewport pre-filtered)
          userParcels = currentParcelsData.features;
          console.log('Regular user mode: using all', userParcels.length, 'pre-filtered parcels');
        }
        
        // Debug the parcels
        userParcels.forEach((parcel, index) => {
          console.log(`Parcel ${index + 1}:`, {
            linz_id: parcel.properties.linz_id || parcel.properties.id,
            company_id: parcel.properties.company_id,
            assigned_company_id: parcel.properties.assigned_company_id,
            has_assignment: parcel.properties.has_assignment,
            geometry_type: parcel.geometry?.type,
            coordinates_length: parcel.geometry?.coordinates?.[0]?.length,
            area_hectares: parcel.properties.area_hectares
          });
        });
      }

      console.log(`Creating background dimming with ${userParcels.length} parcel holes`);

      if (userParcels.length === 0) {
        console.log('No user parcels found, creating basic dimming layer');
        // Create basic dimming without holes
        map.current.addSource('background-dim', {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-180, -85],
                [180, -85],
                [180, 85],
                [-180, 85],
                [-180, -85]
              ]]
            }
          }
        });
      } else {
        // Create dimming with holes
        console.log('Creating dimming with parcel holes...');
        
        // Start with world polygon (clockwise for exterior ring)
        let worldPolygon = [
          [
            [-180, -85],
            [180, -85],
            [180, 85],
            [-180, 85],
            [-180, -85]
          ]
        ];

        // Add user parcels as holes
        let holesAdded = 0;
        userParcels.forEach((parcel, index) => {
          try {
            const parcelId = parcel.properties.linz_id || parcel.properties.id || `parcel-${index}`;
            console.log(`Processing parcel ${index + 1}/${userParcels.length}: ${parcelId}`);
            
            if (parcel.geometry && parcel.geometry.type === 'Polygon') {
              // Get the outer ring of the parcel
              const originalRing = parcel.geometry.coordinates[0];
              
              if (originalRing && originalRing.length >= 4) {
                // Create hole by reversing the winding order (counter-clockwise for holes)
                const hole = [...originalRing].reverse();
                worldPolygon.push(hole);
                holesAdded++;
                
                console.log(`✓ Added hole ${holesAdded} for ${parcelId}`);
                console.log(`  Original ring: ${originalRing.length} points`);
                console.log(`  First point: [${originalRing[0][0].toFixed(4)}, ${originalRing[0][1].toFixed(4)}]`);
                console.log(`  Hole first point: [${hole[0][0].toFixed(4)}, ${hole[0][1].toFixed(4)}]`);
              } else {
                console.log(`❌ Skipping parcel ${parcelId} - invalid ring:`, originalRing?.length);
              }
              
            } else if (parcel.geometry && parcel.geometry.type === 'MultiPolygon') {
              console.log(`Processing MultiPolygon for ${parcelId}...`);
              parcel.geometry.coordinates.forEach((polygon, polyIndex) => {
                const originalRing = polygon[0]; // First ring of each polygon
                if (originalRing && originalRing.length >= 4) {
                  const hole = [...originalRing].reverse();
                  worldPolygon.push(hole);
                  holesAdded++;
                  console.log(`✓ Added hole ${holesAdded} for multipolygon ${parcelId}.${polyIndex + 1}`);
                }
              });
            } else {
              console.log(`❌ Skipping parcel ${parcelId} - invalid geometry:`, parcel.geometry?.type);
            }
          } catch (error) {
            console.error(`Error processing parcel ${index}:`, error);
          }
        });

        console.log(`Final polygon: 1 outer ring + ${holesAdded} holes = ${worldPolygon.length} total rings`);

        // Create the dimming source
        const dimGeometry = {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: worldPolygon
          }
        };

        map.current.addSource('background-dim', {
          type: 'geojson',
          data: dimGeometry
        });
      }

      // Add the dimming layer at the bottom
      const beforeLayer = getFirstVisibleLayer();
      console.log('Adding dimming layer before:', beforeLayer || 'top');

      map.current.addLayer({
        id: 'background-dim-layer',
        type: 'fill',
        source: 'background-dim',
        paint: {
          'fill-color': '#000000',
          'fill-opacity': 0.6  
        },
        layout: {
          'visibility': showBackgroundDim ? 'visible' : 'none'
        }
      }, beforeLayer);
      
      console.log('✅ Background dimming layer added successfully');
      console.log('=== END DEBUG ===');
      
    } catch (error) {
      console.error('❌ Error adding background dimming:', error);
      console.error('Error details:', error.message);
    }
  };

  const getFirstVisibleLayer = () => {
    const possibleLayers = [
      'spatial-areas-fill',
      'vineyard-blocks-fill', 
      'land-parcels-fill'
    ];
    
    for (const layerId of possibleLayers) {
      if (map.current.getLayer(layerId)) {
        return layerId;
      }
    }
    return null; // Add to top if no other layers exist
  };

  useEffect(() => {
    if (map.current && map.current.getLayer('background-dim-layer')) {
      const visibility = showBackgroundDim ? 'visible' : 'none';
      map.current.setLayoutProperty('background-dim-layer', 'visibility', visibility);
    }
  }, [showBackgroundDim]);

  return (
    <div className="maps-page">
      <div className="sidebar">
        <div className="sidebar-content">
          <h3>Map Controls</h3>
          
          {/* Enhanced Map Style Control with 3D indicators */}
          <div className="control-section">
            <h4>Map Style</h4>
            <div className="style-buttons">
              {mapStyles.map((style) => (
                <button
                  key={style.id}
                  className={`style-button ${mapStyle === style.id ? 'active' : ''} ${style.is3D ? 'has-3d' : ''}`}
                  onClick={() => handleStyleChange(style.id)}
                  title={style.is3D ? `${style.name} (3D Terrain)` : style.name}
                >
                  {style.name}
                  {style.is3D && <span className="3d-indicator">🏔️</span>}
                </button>
              ))}
            </div>
          </div>

          {/* 3D Terrain Controls */}
          <div className="control-section">
            <h4>3D Terrain</h4>
            
            <button
              className={`tool-button terrain-toggle ${is3DMode ? 'active' : ''}`}
              onClick={toggle3DMode}
            >
              <span className="button-icon">{is3DMode ? '🗻' : '🏔️'}</span>
              {is3DMode ? 'Disable 3D' : 'Enable 3D'}
            </button>
            
            {is3DMode && (
              <div className="terrain-controls">
                <div className="control-group">
                  <label>Terrain Height</label>
                  <div className="slider-control">
                    <input
                      type="range"
                      min="0.5"
                      max="2"
                      step="0.1"
                      value={terrainExaggeration}
                      onChange={(e) => updateTerrainExaggeration(e.target.value)}
                      className="terrain-slider"
                    />
                    <span className="slider-value">{terrainExaggeration}x</span>
                  </div>
                </div>
                
                <div className="terrain-info">
                  <small>🎮 Controls:</small>
                  <small>• Ctrl+Drag: Rotate view</small>
                  <small>• Ctrl+R: Reset rotation</small>
                </div>
              </div>
            )}
          </div>

          {/* Opacity Control */}
          <div className="control-section">
            <h4>Block Opacity</h4>
            <div className="opacity-control">
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={blockOpacity}
                onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
                className="opacity-slider"
              />
              <span className="opacity-value">{Math.round(blockOpacity * 100)}%</span>
            </div>
          </div>

          {/* Block Tools */}
          <div className="control-section">
            <h4>Mapping Tools</h4>
            <button
              className={`tool-button map-button ${isMapping ? 'active' : ''}`}
              onClick={startMapping}
              disabled={isSplitting}
            >
              <span className="button-icon">✏️</span>
              Map New Area
            </button>
            
            {/* Your existing split button */}
            <button
              className={`tool-button split-button ${isSplitting ? 'active' : ''}`}
              onClick={toggleSplitMode}
              disabled={isMapping}
              style={{ marginTop: '8px' }}
            >
              {isSplitting ? 'Exit Split Mode' : 'Split Block'}
            </button>
          </div>
          
          {user?.email !== adminEmail && (
          <div className="control-section">
            <h4>Map Focus</h4>
            <label className="layer-toggle">
              <input
                type="checkbox"
                checked={showBackgroundDim}
                onChange={(e) => setShowBackgroundDim(e.target.checked)}
              />
              Highlight Your Areas
            </label>
            <small>Dims areas outside your assigned parcels</small>
          </div>
        )}

          <div className="control-section">
            <h4>{user?.email === adminEmail ? 'Admin Tools' : 'Your Land Parcels'}</h4>
            
            {user?.email === adminEmail ? (
              // Admin controls (existing)
              <div className="admin-subsection">
                <h5>Land Parcels</h5>
                <label className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={showParcelsLayer}
                    onChange={(e) => setShowParcelsLayer(e.target.checked)}
                  />
                  Show Parcels Layer
                </label>
                
                <div className="parcel-info">
                  <small>Parcels load at zoom level 12+</small>
                  {parcelCount > 0 && (
                    <small>
                      View: {parcelCount} parcels ({assignedParcelCount} assigned)
                    </small>
                  )}
                </div>
                
                {showParcelsLayer && (
                  <div className="opacity-control">
                    <label>Parcel Opacity</label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={parcelOpacity}
                      onChange={(e) => setParcelOpacity(parseFloat(e.target.value))}
                      className="opacity-slider"
                    />
                    <span className="opacity-value">{Math.round(parcelOpacity * 100)}%</span>
                  </div>
                )}
                
                <div className="admin-subsection">
                  <h5>Block Assignment</h5>
                  <small>Click any block to assign it to a company</small>
                  <small>Companies loaded: {availableCompanies.length}</small>
                </div>
              </div>
            ) : (
              // Regular user controls
              <div className="user-parcel-controls">
                <label className="layer-toggle">
                  <input
                    type="checkbox"
                    checked={showParcelsLayer}
                    onChange={(e) => setShowParcelsLayer(e.target.checked)}
                  />
                  Show Your Parcels
                </label>
                
                <div className="parcel-info">
                  <small>Your assigned land parcels</small>
                  {parcelCount > 0 && (
                    <small>You have {parcelCount} assigned parcels</small>
                  )}
                </div>
                
                {showParcelsLayer && (
                  <div className="opacity-control">
                    <label>Parcel Visibility</label>
                    <input
                      type="range"
                      min="0.3"
                      max="1"
                      step="0.1"
                      value={parcelOpacity}
                      onChange={(e) => setParcelOpacity(parseFloat(e.target.value))}
                      className="opacity-slider"
                    />
                    <span className="opacity-value">{Math.round(parcelOpacity * 100)}%</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Parcel Assignment Modal - Fixed version */}
          {showAssignmentModal && selectedParcelForAssignment && (
            <div className="assignment-modal-overlay">
              <div className="assignment-modal">
                <h3>Assign Parcel to Company</h3>
                
                <div className="parcel-info-section">
                  <h4>Parcel Information</h4>
                  <div className="parcel-details">
                    <div><strong>LINZ ID:</strong> {selectedParcelForAssignment.linz_id}</div>
                    <div><strong>Appellation:</strong> {selectedParcelForAssignment.appellation || 'Unknown'}</div>
                    <div><strong>Land District:</strong> {selectedParcelForAssignment.land_district || 'Unknown'}</div>
                    <div><strong>Area:</strong> {selectedParcelForAssignment.area_hectares ? `${selectedParcelForAssignment.area_hectares.toFixed(2)} ha` : 'Unknown'}</div>
                    <div><strong>Intent:</strong> {selectedParcelForAssignment.parcel_intent || 'Unknown'}</div>
                  </div>
                </div>
                
                <form onSubmit={(e) => { e.preventDefault(); handleConfirmAssignment(); }}>
                  <div className="form-group">
                    <label htmlFor="company_id">Select Company *</label>
                    <select
                      id="company_id"
                      value={assignmentFormData.company_id}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, company_id: e.target.value }))}
                      required
                      disabled={isLoadingCompanies}
                    >
                      <option value="">
                        {isLoadingCompanies ? 'Loading companies...' : 'Select a company'}
                      </option>
                      {/* Add array check here */}
                      {Array.isArray(availableCompanies) && availableCompanies.map(company => (
                        <option key={company.id} value={company.id}>
                          {company.name} {company.company_number ? `(${company.company_number})` : ''}
                        </option>
                      ))}
                    </select>
                    {/* Add debug info */}
                    <small style={{color: 'red', fontSize: '12px'}}>
                      Debug: Companies type: {typeof availableCompanies}, Length: {Array.isArray(availableCompanies) ? availableCompanies.length : 'Not array'}
                    </small>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="ownership_type">Ownership Type</label>
                    <select
                      id="ownership_type"
                      value={assignmentFormData.ownership_type}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, ownership_type: e.target.value }))}
                    >
                      <option value="full">Full Ownership</option>
                      <option value="partial">Partial Ownership</option>
                      <option value="leased">Leased</option>
                      <option value="disputed">Disputed</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="ownership_percentage">Ownership Percentage</label>
                    <input
                      type="number"
                      id="ownership_percentage"
                      min="0"
                      max="100"
                      step="0.1"
                      value={assignmentFormData.ownership_percentage}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, ownership_percentage: parseFloat(e.target.value) }))}
                    />
                    <small>Percentage of ownership (0-100%)</small>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="verification_method">Verification Method</label>
                    <select
                      id="verification_method"
                      value={assignmentFormData.verification_method}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, verification_method: e.target.value }))}
                    >
                      <option value="manual">Manual Assignment</option>
                      <option value="landonline">Land Online</option>
                      <option value="title_deed">Title Deed</option>
                      <option value="survey">Survey</option>
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="assignment_notes">Notes (Optional)</label>
                    <textarea
                      id="assignment_notes"
                      rows="3"
                      value={assignmentFormData.notes}
                      onChange={(e) => setAssignmentFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Add any notes about this assignment..."
                    />
                  </div>
                  
                  <div className="form-actions">
                    <button 
                      type="button" 
                      onClick={handleCancelAssignment} 
                      className="cancel-button"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="assign-button"
                      disabled={!assignmentFormData.company_id || isLoadingCompanies}
                    >
                      Assign Parcel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Block Assignment Modal */}
          {showBlockAssignmentModal && selectedBlockForAssignment && (
            <div className="assignment-modal-overlay">
              <div className="assignment-modal">
                <h3>Assign Block to Company</h3>
                
                <div className="parcel-info-section">
                  <h4>Block Information</h4>
                  <div className="parcel-details">
                    <div><strong>Block Name:</strong> {selectedBlockForAssignment.block_name || 'Unnamed Block'}</div>
                    <div><strong>Variety:</strong> {selectedBlockForAssignment.variety || 'Unknown'}</div>
                    <div><strong>Area:</strong> {selectedBlockForAssignment.area ? `${selectedBlockForAssignment.area.toFixed(2)} ha` : 'Unknown'}</div>
                    <div><strong>Region:</strong> {selectedBlockForAssignment.region || 'Unknown'}</div>
                    <div><strong>Current Owner:</strong> {selectedBlockForAssignment.company_id ? `Company #${selectedBlockForAssignment.company_id}` : 'Unassigned'}</div>
                    <div><strong>Block ID:</strong> {selectedBlockForAssignment.id}</div>
                  </div>
                </div>
                
                <form onSubmit={(e) => { e.preventDefault(); handleConfirmBlockAssignment(); }}>
                  <div className="form-group">
                    <label htmlFor="block_company_id">Select Company *</label>
                    <select
                      id="block_company_id"
                      value={blockAssignmentFormData.company_id}
                      onChange={(e) => setBlockAssignmentFormData(prev => ({ ...prev, company_id: e.target.value }))}
                      required
                      disabled={isLoadingCompanies}
                    >
                      <option value="">
                        {isLoadingCompanies ? 'Loading companies...' : 'Select a company'}
                      </option>
                      {Array.isArray(availableCompanies) && availableCompanies.map(company => (
                        <option key={company.id} value={company.id}>
                          {company.name} {company.company_number ? `(${company.company_number})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="block_assignment_notes">Notes (Optional)</label>
                    <textarea
                      id="block_assignment_notes"
                      rows="3"
                      value={blockAssignmentFormData.notes}
                      onChange={(e) => setBlockAssignmentFormData(prev => ({ ...prev, notes: e.target.value }))}
                      placeholder="Add any notes about this block assignment..."
                    />
                  </div>
                  
                  <div className="assignment-warning">
                    <p><strong>⚠️ Note:</strong> This will {selectedBlockForAssignment.company_id ? 'transfer' : 'assign'} management of this block to the selected company.</p>
                  </div>
                  
                  <div className="form-actions">
                    <button 
                      type="button" 
                      onClick={handleCancelBlockAssignment} 
                      className="cancel-button"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="assign-button"
                      disabled={!blockAssignmentFormData.company_id || isLoadingCompanies}
                    >
                      {selectedBlockForAssignment.company_id ? 'Reassign Block' : 'Assign Block'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Statistics */}
          <div className="control-section">
          <h4>Statistics</h4>
          <div className="stats">
            <div className="stat-item">
              <span className="stat-label">Vineyard Blocks:</span>
              <span className="stat-value">{ownBlockCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Mapped Areas:</span>
              <span className="stat-value">{spatialAreaCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">LINZ Land Parcels:</span>
              <span className="stat-value">{parcelCount}</span>
            </div>
            {user?.email === adminEmail && (
              <div className="stat-item">
                <span className="stat-label">Total Blocks:</span>
                <span className="stat-value">{blockCount}</span>
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      <div className="maps-container">
        <div ref={mapContainer} className="map-container" />

        {/* Status bar */}
        <div className="map-status-bar">
          <span>{apiStatus}</span>
          {isSplitting && (
            <span className="split-mode-indicator">Split Mode Active</span>
          )}
        </div>

        {/* Drawing Form */}
        {showDrawingForm && (
          <div className="drawing-form-container">
            <div className="drawing-form">
              <h3>New Area</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                if (mappingType === 'block') {
                  handleNewBlockSubmit(e);
                } else if (mappingType === 'spatial_area') {
                  handleNewSpatialAreaSubmit(e);
                }
              }}>
                {/* Type Selection - only show if not already selected */}
                {!mappingType && (
                  <div className="form-group">
                    <label>What type of area is this?</label>
                    <div className="type-selection-buttons">
                      <button
                        type="button"
                        className={`type-button ${mappingType === 'block' ? 'active' : ''}`}
                        onClick={() => setMappingType('block')}
                      >
                        Vineyard Block
                      </button>
                      <button
                        type="button"
                        className={`type-button ${mappingType === 'spatial_area' ? 'active' : ''}`}
                        onClick={() => setMappingType('spatial_area')}
                      >
                        Spatial Area
                      </button>
                    </div>
                  </div>
                )}

                {/* Show appropriate form based on type */}
                {mappingType === 'block' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="block_name">Block Name</label>
                      <input
                        type="text"
                        id="block_name"
                        value={newBlockInfo.block_name}
                        onChange={(e) => setNewBlockInfo(prev => ({ ...prev, block_name: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="variety">Variety</label>
                      <input
                        type="text"
                        id="variety"
                        value={newBlockInfo.variety}
                        onChange={(e) => setNewBlockInfo(prev => ({ ...prev, variety: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                {mappingType === 'spatial_area' && (
                  <>
                    <div className="form-group">
                      <label htmlFor="area_type">Area Type</label>
                      <select
                        id="area_type"
                        value={spatialAreaType}
                        onChange={(e) => setSpatialAreaType(e.target.value)}
                        required
                      >
                        <option value="">Select area type...</option>
                        {spatialAreaTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="area_name">Area Name</label>
                      <input
                        type="text"
                        id="area_name"
                        value={newBlockInfo.block_name}
                        onChange={(e) => setNewBlockInfo(prev => ({ ...prev, block_name: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor="description">Description (Optional)</label>
                      <textarea
                        id="description"
                        rows="2"
                        value={newBlockInfo.variety || ''}
                        onChange={(e) => setNewBlockInfo(prev => ({ ...prev, variety: e.target.value }))}
                        placeholder="Describe this area..."
                      />
                    </div>
                  </>
                )}

                {/* Common fields for both types */}
                <div className="form-group">
                  <label htmlFor="area">Area (hectares)</label>
                  <input
                    type="number"
                    id="area"
                    value={newBlockInfo.area}
                    step="0.01"
                    readOnly
                  />
                  <small>Area calculated from drawn polygon</small>
                </div>
                
                <div className="form-actions">
                  <button type="button" onClick={() => {
                    drawControl.current.deleteAll();
                    setShowDrawingForm(false);
                    setIsMapping(false);
                    setMappingType('');
                    setSpatialAreaType('');
                    setNewBlockInfo({
                      block_name: '',
                      variety: '',
                      area: 0,
                      centroid_longitude: null,
                      centroid_latitude: null
                    });
                  }} className="cancel-button">
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="create-button"
                    disabled={!mappingType || (mappingType === 'spatial_area' && !spatialAreaType)}
                  >
                    Create {mappingType === 'block' ? 'Block' : 'Area'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <MobileNavigation />
      
      <SlidingEditForm
        isOpen={showEditForm}
        onClose={() => {
          setShowEditForm(false);
          setEditBlockData(null);
        }}
        blockData={editBlockData}
        onSubmit={handleBlockUpdate}
        onCreateRows={handleCreateRows}
      />
      <SpatialAreaSlidingEditForm
        isOpen={showEditSpatialAreaForm}  // Fixed: was showSpatialEditForm
        onClose={() => {
          setShowEditSpatialAreaForm(false);  // Fixed: was showSpatialEditForm(false)
          setEditSpatialAreaData(null);  // Fixed: was setEditSpatialData(null)
        }}
        spatialAreaData={editSpatialAreaData}  // Fixed: was spatialAreaData
        onSubmit={handleSpatialAreaUpdate}  // You need to create this function
        availableParentAreas={availableParentAreas}  // You need to populate this
      />
      
      {/* Add mobile-specific styles */}
      <style jsx>{`
        .maps-page {
          display: flex;
          height: 90vh;
        }

        .sidebar {
          width: 600px;
          background: #ffffff;
          border-right: 1px solid #e5e7eb;
          box-shadow: 2px 0 4px rgba(0,0,0,0.1);
          overflow-y: auto;
          z-index: 10;
        }

        .sidebar-content {
          padding: 20px;
        }

        .sidebar h3 {
          margin: 0 0 20px 0;
          font-size: 18px;
          font-weight: 600;
          color: #374151;
        }

        .control-section {
          margin-bottom: 24px;
          padding-bottom: 16px;
          border-bottom: 1px solid #f3f4f6;
        }

        .control-section:last-child {
          border-bottom: none;
        }

        .control-section h4 {
          margin: 0 0 12px 0;
          font-size: 14px;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .style-buttons {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }

        .style-button {
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          background:rgb(170, 89, 89);
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .style-button:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .style-button.active {
          background: #3b82f6;
          color: white;
          border-color: #3b82f6;
        }

        .opacity-control {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .opacity-slider {
          flex: 1;
          height: 6px;
          background: #e5e7eb;
          border-radius: 3px;
          outline: none;
          cursor: pointer;
        }

        .opacity-slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          background: #3b82f6;
          border-radius: 50%;
          cursor: pointer;
        }

        .opacity-value {
          font-size: 12px;
          font-weight: 500;
          color: #6b7280;
          min-width: 35px;
        }

        .tool-button {
          width: 100%;
          padding: 10px 16px;
          border: 1px solid #d1d5db;
          background: #3b82f6;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tool-button:hover {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .tool-button.active {
          background: #ef4444;
          color: white;
          border-color: #ef4444;
        }

        .stats {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .stat-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: #f9fafb;
          border-radius: 6px;
        }

        .stat-label {
          font-size: 13px;
          color: #6b7280;
        }

        .stat-value {
          font-size: 14px;
          font-weight: 600;
          color: #374151;
        }

        .action-button {
          width: 100%;
          padding: 10px 16px;
          margin-bottom: 8px;
          border: 1px solid #3b82f6;
          background: #ffffff;
          color: #3b82f6;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-button:hover {
          background: #3b82f6;
          color: white;
        }

        .action-button:last-child {
          margin-bottom: 0;
        }

        .maps-container {
          flex: 1;
          position: relative;
        }

        .map-container {
          width: 100%;
          height: 100%;
        }

        .map-status-bar {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: rgba(255, 255, 255, 0.95);
          padding: 8px 16px;
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          font-size: 13px;
          color: #374151;
          backdrop-filter: blur(4px);
        }

        .split-mode-indicator {
          margin-left: 12px;
          padding: 4px 8px;
          background: #ef4444;
          color: white;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }

        .mobile-friendly-popup .mapboxgl-popup-content {
          padding: 16px;
          min-width: 280px;
          max-width: min(90vw, 400px);
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        }

        .mobile-friendly-popup .popup-button.touch-friendly {
          padding: 14px 18px;
          margin: 6px 0;
          min-height: 48px;
          font-size: 16px;
          border-radius: 8px;
          border: none;
          cursor: pointer;
          transition: all 0.2s ease;
          -webkit-tap-highlight-color: transparent;
        }

        .mobile-friendly-popup .popup-button.touch-friendly:active {
          transform: scale(0.95);
          background-color: rgba(0,0,0,0.1);
        }

        .mobile-friendly-popup .popup-actions.mobile-actions {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 16px;
        }

        .mobile-friendly-popup .mapboxgl-popup-close-button {
          font-size: 20px;
          padding: 8px;
          width: 32px;
          height: 32px;
          line-height: 16px;
        }

        /* Claim Dialog Styles */
        .claim-dialog-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .claim-dialog {
          background: white;
          padding: 24px;
          border-radius: 12px;
          max-width: 500px;
          margin: 20px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        }

        .claim-warning {
          margin: 16px 0;
        }

        .block-info {
          background: #f9fafb;
          padding: 12px;
          border-radius: 6px;
          margin: 12px 0;
        }

        .dialog-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }

        .cancel-button {
          padding: 10px 20px;
          border: 1px solid #d1d5db;
          background: white;
          border-radius: 6px;
          cursor: pointer;
        }

        .claim-confirm-button {
          padding: 10px 20px;
          border: none;
          background: #ef4444;
          color: white;
          border-radius: 6px;
          cursor: pointer;
        }

        /* Drawing Form Styles */
        .drawing-form-container {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 1000;
          background: white;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          max-width: 400px;
        }

        .drawing-form {
          padding: 24px;
        }

        .form-group {
          margin-bottom: 16px;
        }

        .form-group label {
          display: block;
          margin-bottom: 4px;
          font-weight: 500;
          color: #374151;
        }

        .form-group input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 14px;
        }

        .coordinates-display {
          background: #f9fafb;
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 13px;
        }

        .form-actions {
          display: flex;
          gap: 12px;
          justify-content: flex-end;
          margin-top: 20px;
        }

        .create-button {
          padding: 10px 20px;
          border: none;
          background: #3b82f6;
          color: white;
          border-radius: 6px;
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .sidebar {
            display: none;
          }
          
          .maps-container {
            width: 100%;
          }

          .map-container {
            touch-action: pan-x pan-y;
          }
          
          .mobile-friendly-popup .mapboxgl-popup-content {
            font-size: 14px;
          }
          
          .mobile-friendly-popup h3 {
            font-size: 18px;
            margin-bottom: 12px;
          }

          .drawing-form-container {
            top: 10px;
            right: 10px;
            left: 10px;
            max-width: none;
          }
          
          .assignment-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
          }

          .assignment-modal {
            background: white;
            border-radius: 8px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          }

          .assignment-modal h3 {
            margin: 0 0 20px 0;
            color: #1f2937;
            font-size: 1.25rem;
          }

          .parcel-info-section {
            background: #f8fafc;
            border-radius: 6px;
            padding: 16px;
            margin-bottom: 20px;
          }

          .parcel-info-section h4 {
            margin: 0 0 12px 0;
            color: #374151;
            font-size: 1rem;
          }

          .parcel-details {
            display: grid;
            gap: 8px;
            font-size: 0.9rem;
          }

          .parcel-details div {
            display: flex;
            justify-content: space-between;
          }

          .parcel-details strong {
            color: #374151;
            margin-right: 12px;
          }

          .form-group {
            margin-bottom: 16px;
          }

          .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 500;
            color: #374151;
          }

          .form-group select,
          .form-group input,
          .form-group textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #d1d5db;
            border-radius: 4px;
            font-size: 14px;
          }

          .form-group select:focus,
          .form-group input:focus,
          .form-group textarea:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
          }

          .form-group small {
            display: block;
            margin-top: 4px;
            color: #6b7280;
            font-size: 12px;
          }

          .form-actions {
            display: flex;
            gap: 12px;
            justify-content: flex-end;
            margin-top: 24px;
            padding-top: 16px;
            border-top: 1px solid #e5e7eb;
          }

          .cancel-button {
            padding: 10px 20px;
            border: 1px solid #d1d5db;
            background: white;
            color: #374151;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }

          .cancel-button:hover {
            background: #f9fafb;
          }

          .assign-button {
            padding: 10px 20px;
            border: none;
            background: #3b82f6;
            color: white;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
          }

          .assign-button:hover:not(:disabled) {
            background: #2563eb;
          }

          .assign-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
          }

          /* Parcel popup styles */
          .map-popup.parcel.assigned .assignment-status.assigned {
            background: #dcfce7;
            color: #166534;
            padding: 8px;
            border-radius: 4px;
            margin: 12px 0;
            font-size: 14px;
          }

          .map-popup.parcel.unassigned .assignment-status.unassigned {
            background: #fef3c7;
            color:rgb(144, 201, 79);
            padding: 8px;
            border-radius: 4px;
            margin: 12px 0;
            font-size: 14px;
          }

          .popup-button.assign-button {
            background: #059669;
            color: white;
          }

          .popup-button.assign-button:hover {
            background: #047857;
          }

          .popup-button.remove-button {
            background: #dc2626;
            color: white;
          }

          .popup-button.remove-button:hover {
            background: #b91c1c;
          }
          
          .tool-button.map-button {
            background: #10b981;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }

          .tool-button.map-button:hover:not(:disabled) {
            background: #059669;
          }

          .tool-button.map-button.active {
            background: #059669;
            box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.3);
          }

          .tool-button.map-button:disabled {
            background: #9ca3af;
            cursor: not-allowed;
          }

          .button-icon {
            font-size: 16px;
          }

          .type-selection-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
            margin-top: 8px;
          }

          .type-button {
            padding: 12px;
            border: 2px solid #e5e7eb;
            background: white;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .type-button:hover {
            background: #f9fafb;
            border-color: #9ca3af;
          }

          .type-button.active {
            background: #3b82f6;
            color: white;
            border-color: #3b82f6;
          }
          .style-button.has-3d {
            position: relative;
          }
          
          .3d-indicator {
            font-size: 10px;
            position: absolute;
            top: 2px;
            right: 2px;
          }
          
          .terrain-toggle {
            width: 100%;
            margin-bottom: 10px;
          }
          
          .terrain-controls {
            background: #f8f9fa;
            border-radius: 4px;
            padding: 10px;
            margin-top: 10px;
          }
          
          .control-group {
            margin-bottom: 10px;
          }
          
          .slider-control {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          
          .terrain-slider {
            flex: 1;
          }
          
          .slider-value {
            min-width: 35px;
            font-size: 12px;
            font-weight: bold;
          }
          
          .terrain-info {
            border-top: 1px solid #e9ecef;
            padding-top: 8px;
            margin-top: 8px;
          }
          
          .terrain-info small {
            display: block;
            line-height: 1.3;
            color: #6c757d;
          }
          
          .camera-buttons {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 6px;
          }
          
          .camera-button {
            padding: 6px 8px;
            font-size: 11px;
            border: 1px solid #dee2e6;
            background: white;
            border-radius: 3px;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .camera-button:hover {
            background: #e9ecef;
            transform: translateY(-1px);
          }
          
          .terrain-toggle.active {
            background: #28a745;
            color: white;
          }
        }
      `}</style>
    </div>
  );
}

export default Maps;