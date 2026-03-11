// maps-v2/hooks/useBlockSplit.js — State machine for block split flow
import { useReducer, useCallback } from 'react';
import * as turf from '@turf/turf';
import { blocksService } from '@vineyard/shared';

/**
 * Split states:
 *   idle → selecting → drawing_line → confirming → processing → idle
 */
const STATES = {
  IDLE: 'idle',
  SELECTING: 'selecting',
  DRAWING_LINE: 'drawing_line',
  CONFIRMING: 'confirming',
  PROCESSING: 'processing',
};

const initialState = {
  status: STATES.IDLE,
  block: null,        // the block feature to split
  splitLine: null,    // the drawn LineString feature
  error: null,
  statusMessage: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'START_SPLIT':
      return {
        ...state,
        status: STATES.SELECTING,
        block: null,
        splitLine: null,
        error: null,
        statusMessage: 'Click on a block to split it.',
      };

    case 'SELECT_BLOCK':
      return {
        ...state,
        status: STATES.DRAWING_LINE,
        block: action.block,
        statusMessage: `Draw a line through "${action.block.properties?.block_name || 'block'}" to split it.`,
      };

    case 'LINE_DRAWN':
      return {
        ...state,
        status: STATES.CONFIRMING,
        splitLine: action.line,
        statusMessage: 'Confirm the split or cancel.',
      };

    case 'CONFIRM':
      return {
        ...state,
        status: STATES.PROCESSING,
        error: null,
        statusMessage: 'Processing split...',
      };

    case 'SPLIT_SUCCESS':
      return { ...initialState };

    case 'SPLIT_ERROR':
      return {
        ...state,
        status: STATES.CONFIRMING,
        error: action.error,
        statusMessage: `Split failed: ${action.error}`,
      };

    case 'CANCEL':
      return { ...initialState };

    default:
      return state;
  }
}

/**
 * Validates that a split line properly intersects a block polygon.
 * Returns { valid, error }.
 */
function validateSplitLine(blockFeature, lineFeature) {
  try {
    const block = blockFeature.geometry || blockFeature;
    const line = lineFeature.geometry || lineFeature;

    // Check line intersects block boundary
    const blockBoundary = turf.polygonToLine(
      block.type === 'Feature' ? block : { type: 'Feature', geometry: block, properties: {} }
    );
    const intersections = turf.lineIntersect(
      { type: 'Feature', geometry: line, properties: {} },
      blockBoundary
    );

    if (!intersections.features || intersections.features.length < 2) {
      return { valid: false, error: 'Split line must cross the block boundary at least twice.' };
    }

    // Check line length is reasonable (at least 5m)
    const length = turf.length(
      { type: 'Feature', geometry: line, properties: {} },
      { units: 'meters' }
    );
    if (length < 5) {
      return { valid: false, error: 'Split line is too short (minimum 5m).' };
    }

    return { valid: true, error: null };
  } catch (err) {
    return { valid: false, error: `Validation error: ${err.message}` };
  }
}

/**
 * Hook that manages the block split workflow.
 *
 * @param {Function} onSuccess - called after successful split (to refresh blocks)
 * @returns split state machine API
 */
export default function useBlockSplit(onSuccess) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const startSplit = useCallback(() => {
    dispatch({ type: 'START_SPLIT' });
  }, []);

  const selectBlock = useCallback((blockFeature) => {
    dispatch({ type: 'SELECT_BLOCK', block: blockFeature });
  }, []);

  const lineDrawn = useCallback((lineFeature) => {
    if (!state.block) return;

    const { valid, error } = validateSplitLine(state.block, lineFeature);
    if (!valid) {
      dispatch({ type: 'SPLIT_ERROR', error });
      return;
    }

    dispatch({ type: 'LINE_DRAWN', line: lineFeature });
  }, [state.block]);

  const confirmSplit = useCallback(async () => {
    if (!state.block || !state.splitLine) return;

    dispatch({ type: 'CONFIRM' });

    try {
      const blockId = state.block.properties?.id;
      const splitLineGeoJSON = state.splitLine.type === 'Feature'
        ? state.splitLine
        : { type: 'Feature', geometry: state.splitLine.geometry || state.splitLine, properties: {} };

      await blocksService.splitBlock(blockId, splitLineGeoJSON);
      dispatch({ type: 'SPLIT_SUCCESS' });
      onSuccess?.();
    } catch (err) {
      dispatch({ type: 'SPLIT_ERROR', error: err.message || 'Split failed' });
    }
  }, [state.block, state.splitLine, onSuccess]);

  const cancel = useCallback(() => {
    dispatch({ type: 'CANCEL' });
  }, []);

  return {
    splitState: state,
    splitStatus: state.status,
    isSplitting: state.status !== STATES.IDLE,
    isProcessing: state.status === STATES.PROCESSING,
    isConfirming: state.status === STATES.CONFIRMING,
    isDrawingLine: state.status === STATES.DRAWING_LINE,
    isSelecting: state.status === STATES.SELECTING,
    splitBlock: state.block,
    splitError: state.error,
    statusMessage: state.statusMessage,
    startSplit,
    selectBlock,
    lineDrawn,
    confirmSplit,
    cancel,
    STATES,
  };
}
