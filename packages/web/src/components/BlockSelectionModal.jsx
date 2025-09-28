import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Play, X, MapPin } from 'lucide-react';
import { observationService, blocksService } from '@vineyard/shared';

export default function BlockSelectionModal({ open, plan, onClose, onStartRun }) {
  const [blocks, setBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const [showOnlyTargets, setShowOnlyTargets] = useState(false);
  const [allBlocks, setAllBlocks] = useState([]);

  // Load blocks when modal opens
  useEffect(() => {
    if (!open || !plan) {
      // Reset state when modal closes
      setBlocks([]);
      setAllBlocks([]);
      setSelectedBlockId(null);
      setConflicts([]);
      setLoading(false);
      setChecking(false);
      setError(null);
      setShowOnlyTargets(false);
      return;
    }
    
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        
        const blocksRes = await blocksService.getCompanyBlocks();
        if (!mounted) return;
        
        const blocksList = Array.isArray(blocksRes) ? blocksRes : blocksRes?.blocks ?? blocksRes?.items ?? [];
        setAllBlocks(blocksList);
        
        // Initially show only plan targets if they exist
        const planBlockIds = (plan.targets || []).map(t => t.block_id).filter(Boolean);
        const targetBlocks = planBlockIds.length > 0 
          ? blocksList.filter(b => planBlockIds.includes(b.id || b.block_id))
          : [];
        
        // If no targets defined or user wants all blocks, show all
        const initialBlocks = targetBlocks.length > 0 ? targetBlocks : blocksList;
        setBlocks(initialBlocks);
        
        // If no targets exist, default to showing all blocks
        if (targetBlocks.length === 0) {
          setShowOnlyTargets(false);
        }
        
        // Auto-select first block if only one available
        if (initialBlocks.length === 1) {
          setSelectedBlockId(initialBlocks[0].id || initialBlocks[0].block_id);
        }
        
      } catch (e) {
        console.error('Failed to load blocks:', e);
        if (mounted) setError('Failed to load blocks');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [open, plan]);

  // Filter blocks based on toggle
  useEffect(() => {
    if (!allBlocks.length) return;
    
    const planBlockIds = (plan?.targets || []).map(t => t.block_id).filter(Boolean);
    
    if (showOnlyTargets && planBlockIds.length > 0) {
      const targetBlocks = allBlocks.filter(b => planBlockIds.includes(b.id || b.block_id));
      setBlocks(targetBlocks);
    } else {
      setBlocks(allBlocks);
    }
    
    // Clear selection when changing filter
    setSelectedBlockId(null);
  }, [showOnlyTargets, allBlocks, plan?.targets]);

  // Check for conflicts when block is selected
  useEffect(() => {
    if (!open || !selectedBlockId || !plan?.id) {
      return;
    }
    
    let mounted = true;
    (async () => {
      try {
        setChecking(true);
        setConflicts([]);
        
        const conflictsRes = await observationService.checkRunConflicts(
          plan.id, 
          selectedBlockId, 
          plan.company_id
        );
        
        if (!mounted) return;
        
        const conflictsList = Array.isArray(conflictsRes) ? conflictsRes : conflictsRes?.conflicts ?? [];
        setConflicts(conflictsList);
        
      } catch (e) {
        console.warn('Failed to check conflicts:', e);
        // Don't show error to user, just continue
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    
    return () => { mounted = false; };
  }, [open, selectedBlockId, plan?.id, plan?.company_id]);

  // Handle escape key - always register this effect
  useEffect(() => {
    if (!open) return;
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleStartRun = () => {
    if (!selectedBlockId || conflicts.length > 0) return;
    onStartRun(selectedBlockId);
  };

  const hasConflicts = conflicts.length > 0;
  const canStart = selectedBlockId && !hasConflicts && !checking;

  if (!open || !plan) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 9999
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          width: 'min(500px, 95vw)',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: 20
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Play size={20} style={{ color: '#2563eb' }} />
            Start Run: {plan.name}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: '#6b7280'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>
            Loading available blocks...
          </div>
        )}

        {error && (
          <div style={{ 
            padding: 12, 
            background: '#fef2f2', 
            border: '1px solid #fecaca', 
            borderRadius: 8, 
            color: '#dc2626',
            marginBottom: 16
          }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <label style={{ fontWeight: 500 }}>
                  Select Block for Observation Run:
                </label>
                
                {(plan?.targets || []).length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 6, 
                      fontSize: 13, 
                      cursor: 'pointer',
                      color: '#6b7280'
                    }}>
                      <input
                        type="checkbox"
                        checked={showOnlyTargets}
                        onChange={(e) => setShowOnlyTargets(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      Show only plan targets ({(plan.targets || []).length} blocks)
                    </label>
                  </div>
                )}
              </div>
              
              {blocks.length === 0 && !loading && (
                <div style={{ 
                  padding: 16, 
                  background: '#f9fafb', 
                  border: '1px solid #e5e7eb', 
                  borderRadius: 8, 
                  color: '#6b7280' 
                }}>
                  {showOnlyTargets 
                    ? "No target blocks configured for this plan. Uncheck 'Show only plan targets' to see all blocks."
                    : "No blocks available for your company"
                  }
                </div>
              )}

              {blocks.length > 0 && (
                <>
                  <div style={{ 
                    fontSize: 12, 
                    color: '#6b7280', 
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span>
                      Showing {blocks.length} of {allBlocks.length} company blocks
                    </span>
                    {!showOnlyTargets && (plan?.targets || []).length > 0 && (
                      <span style={{ fontSize: 11, fontStyle: 'italic' }}>
                        Note: You're selecting blocks outside the original plan targets
                      </span>
                    )}
                  </div>
                  
                  <div style={{ 
                    display: 'grid', 
                    gap: 8,
                    maxHeight: '300px',
                    overflowY: 'auto',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 8
                  }}>
                    {blocks.map(block => {
                      const blockId = block.id || block.block_id;
                      const blockName = block.name || block.block_name || `Block ${blockId}`;
                      const variety = block.variety || block.variety_name || block.cultivar || '';
                      const isTarget = (plan?.targets || []).some(t => t.block_id === blockId);
                      
                      return (
                        <label
                          key={blockId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: 12,
                            border: selectedBlockId === blockId ? '2px solid #2563eb' : '1px solid #e5e7eb',
                            borderRadius: 8,
                            cursor: 'pointer',
                            background: selectedBlockId === blockId ? '#eff6ff' : '#fff',
                            position: 'relative'
                          }}
                        >
                          <input
                            type="radio"
                            name="block"
                            value={blockId}
                            checked={selectedBlockId === blockId}
                            onChange={() => setSelectedBlockId(blockId)}
                            style={{ cursor: 'pointer' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ 
                              fontWeight: 500, 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: 6,
                              marginBottom: 2
                            }}>
                              <MapPin size={14} />
                              {blockName}
                              {isTarget && (
                                <span style={{
                                  fontSize: 10,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  background: '#dbeafe',
                                  color: '#1e40af',
                                  fontWeight: 'normal'
                                }}>
                                  TARGET
                                </span>
                              )}
                            </div>
                            {variety && (
                              <div style={{ fontSize: 13, color: '#6b7280' }}>{variety}</div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Conflict Warning */}
            {checking && selectedBlockId && (
              <div style={{ 
                padding: 12, 
                background: '#fef3c7', 
                border: '1px solid #f59e0b', 
                borderRadius: 8, 
                marginBottom: 16,
                fontSize: 14
              }}>
                Checking for active runs on this block...
              </div>
            )}

            {hasConflicts && (
              <div style={{ 
                padding: 12, 
                background: '#fef2f2', 
                border: '1px solid #fecaca', 
                borderRadius: 8, 
                marginBottom: 16
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#dc2626', fontWeight: 500, marginBottom: 8 }}>
                  <AlertTriangle size={16} />
                  Cannot Start Run
                </div>
                <div style={{ fontSize: 14, color: '#7f1d1d', marginBottom: 8 }}>
                  This block has an active observation run that must be completed first:
                </div>
                {conflicts.map(conflict => (
                  <div key={conflict.id} style={{ 
                    padding: 8, 
                    background: '#fff', 
                    border: '1px solid #f3f4f6', 
                    borderRadius: 6,
                    fontSize: 13
                  }}>
                    <div style={{ fontWeight: 500 }}>Run #{conflict.id}: {conflict.name}</div>
                    <div style={{ color: '#6b7280' }}>
                      Plan: {conflict.plan_name} • Started: {new Date(conflict.observed_at_start || conflict.created_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #d1d5db',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: 'pointer',
                  color: '#374151'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleStartRun}
                disabled={!canStart}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 8,
                  background: canStart ? '#2563eb' : '#9ca3af',
                  color: '#fff',
                  cursor: canStart ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Play size={16} />
                {checking ? 'Checking...' : 'Start Run'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}