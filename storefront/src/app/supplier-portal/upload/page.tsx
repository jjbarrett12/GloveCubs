'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ============================================================================
// TYPES
// ============================================================================

interface ParsedRow {
  row_number: number;
  raw_data: Record<string, string>;
  extracted: ExtractedProduct;
  normalized: NormalizedProduct;
  validation: ValidationResult;
  status: 'valid' | 'warning' | 'error';
}

interface ExtractedProduct {
  sku?: string;
  product_name?: string;
  price?: number;
  case_pack?: number;
  box_quantity?: number;
  unit_of_measure?: string;
  material?: string;
  size?: string;
  lead_time_days?: number;
  moq?: number;
  shipping_notes?: string;
  confidence: Record<string, number>;
}

interface NormalizedProduct {
  matched_product_id?: string;
  matched_product_name?: string;
  match_confidence: number;
  match_method: string;
  price_normalized: number;
  price_per_unit: number;
  pack_size_normalized: number;
}

interface ValidationResult {
  is_valid: boolean;
  warnings: Array<{ type: string; message: string; field?: string; details?: Record<string, unknown> }>;
  errors: Array<{ type: string; message: string; field?: string }>;
}

interface UploadResult {
  upload_id: string;
  status: string;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  rows: ParsedRow[];
}

// ============================================================================
// COMPONENTS
// ============================================================================

function StatusBadge({ status }: { status: 'valid' | 'warning' | 'error' }) {
  const colors = {
    valid: 'bg-green-100 text-green-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
  };
  
  return <Badge className={colors[status]}>{status}</Badge>;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'bg-green-100 text-green-800' 
    : pct >= 60 ? 'bg-yellow-100 text-yellow-800' 
    : 'bg-red-100 text-red-800';
  
  return <Badge className={color}>{pct}%</Badge>;
}

function MatchMethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    exact_sku: 'bg-green-600 text-white',
    fuzzy_name: 'bg-blue-500 text-white',
    attribute_match: 'bg-yellow-500 text-black',
    ai_inference: 'bg-purple-500 text-white',
    no_match: 'bg-red-500 text-white',
  };
  
  return <Badge className={colors[method] || 'bg-gray-400'}>{method.replace('_', ' ')}</Badge>;
}

function WarningIcon() {
  return (
    <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
    </svg>
  );
}

function DropZone({ onFileSelect, disabled }: { onFileSelect: (file: File) => void; disabled: boolean }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  
  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);
  
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  }, [onFileSelect]);
  
  const handleClick = () => {
    inputRef.current?.click();
  };
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
  };
  
  return (
    <div
      className={`
        border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors
        ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
      onDragOver={!disabled ? handleDragOver : undefined}
      onDragLeave={!disabled ? handleDragLeave : undefined}
      onDrop={!disabled ? handleDrop : undefined}
      onClick={!disabled ? handleClick : undefined}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={handleChange}
        disabled={disabled}
      />
      <div className="text-4xl mb-4">📄</div>
      <p className="text-lg font-medium text-gray-700">
        Drop your file here or click to browse
      </p>
      <p className="text-sm text-gray-500 mt-2">
        Supports CSV, XLSX, and price sheets
      </p>
    </div>
  );
}

// ============================================================================
// ROW DETAIL MODAL
// ============================================================================

function RowDetailModal({
  row,
  onClose,
  onCorrect,
}: {
  row: ParsedRow | null;
  onClose: () => void;
  onCorrect: (corrections: Partial<ExtractedProduct>) => Promise<void>;
}) {
  const [corrections, setCorrections] = useState<Partial<ExtractedProduct>>({});
  const [saving, setSaving] = useState(false);
  
  if (!row) return null;
  
  const handleSave = async () => {
    if (Object.keys(corrections).length === 0) {
      onClose();
      return;
    }
    
    setSaving(true);
    try {
      await onCorrect(corrections);
      onClose();
    } finally {
      setSaving(false);
    }
  };
  
  return (
    <Dialog open={!!row} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Row {row.row_number} Details</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Status */}
          <div className="flex items-center gap-2">
            <StatusBadge status={row.status} />
            <MatchMethodBadge method={row.normalized.match_method} />
            <ConfidenceBadge confidence={row.normalized.match_confidence} />
          </div>
          
          {/* Warnings and Errors */}
          {(row.validation.warnings.length > 0 || row.validation.errors.length > 0) && (
            <div className="space-y-2">
              {row.validation.errors.map((err, i) => (
                <div key={`err-${i}`} className="flex items-start gap-2 p-2 bg-red-50 rounded text-red-800 text-sm">
                  <ErrorIcon />
                  <span>{err.message}</span>
                </div>
              ))}
              {row.validation.warnings.map((warn, i) => (
                <div key={`warn-${i}`} className="flex items-start gap-2 p-2 bg-yellow-50 rounded text-yellow-800 text-sm">
                  <WarningIcon />
                  <div>
                    <span>{warn.message}</span>
                    {warn.details && (
                      <pre className="mt-1 text-xs bg-yellow-100 p-1 rounded overflow-x-auto">
                        {JSON.stringify(warn.details, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Matched Product */}
          {row.normalized.matched_product_id && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-600 font-medium">Matched to:</p>
              <p className="font-semibold">{row.normalized.matched_product_name}</p>
              <p className="text-xs text-gray-500">ID: {row.normalized.matched_product_id}</p>
            </div>
          )}
          
          {/* Extracted Fields */}
          <div>
            <h4 className="font-medium mb-3">Extracted Fields</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600">SKU</label>
                <Input
                  value={corrections.sku ?? row.extracted.sku ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, sku: e.target.value })}
                  placeholder="No SKU"
                />
                {row.extracted.confidence.sku && (
                  <span className="text-xs text-gray-500">{(row.extracted.confidence.sku * 100).toFixed(0)}% confidence</span>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-600">Price ($)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={corrections.price ?? row.extracted.price ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, price: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Product Name</label>
                <Input
                  value={corrections.product_name ?? row.extracted.product_name ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, product_name: e.target.value })}
                  placeholder="No name"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Case Pack</label>
                <Input
                  type="number"
                  value={corrections.case_pack ?? row.extracted.case_pack ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, case_pack: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Material</label>
                <Input
                  value={corrections.material ?? row.extracted.material ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, material: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Size</label>
                <Input
                  value={corrections.size ?? row.extracted.size ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, size: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Lead Time (days)</label>
                <Input
                  type="number"
                  value={corrections.lead_time_days ?? row.extracted.lead_time_days ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, lead_time_days: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600">MOQ</label>
                <Input
                  type="number"
                  value={corrections.moq ?? row.extracted.moq ?? ''}
                  onChange={(e) => setCorrections({ ...corrections, moq: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </div>
          
          {/* Raw Data */}
          <div>
            <h4 className="font-medium mb-2">Original Data</h4>
            <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
              {JSON.stringify(row.raw_data, null, 2)}
            </pre>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : Object.keys(corrections).length > 0 ? 'Save & Re-validate' : 'Close'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SupplierFeedUploadPage() {
  const router = useRouter();
  const [stage, setStage] = useState<'upload' | 'processing' | 'preview' | 'committing' | 'done'>('upload');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [selectedRow, setSelectedRow] = useState<ParsedRow | null>(null);
  const [filter, setFilter] = useState<'all' | 'valid' | 'warning' | 'error'>('all');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [commitResult, setCommitResult] = useState<{ committed: number; created: number; updated: number; skipped: number } | null>(null);
  
  const handleFileSelect = async (file: File) => {
    setStage('processing');
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const res = await fetch('/supplier-portal/api/feed-upload', {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      const result = await res.json();
      setUploadResult(result.data);
      setStage('preview');
      
      // Select all valid/warning rows by default
      const validRowNumbers: number[] = result.data.rows
        .filter((r: ParsedRow) => r.status !== 'error')
        .map((r: ParsedRow) => r.row_number);
      setSelectedRows(new Set(validRowNumbers));
    } catch (error) {
      console.error('Upload failed:', error);
      setStage('upload');
      alert(error instanceof Error ? error.message : 'Upload failed');
    }
  };
  
  const handleCorrect = async (corrections: Partial<ExtractedProduct>) => {
    if (!selectedRow || !uploadResult) return;
    
    const res = await fetch('/supplier-portal/api/feed-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'correct',
        upload_id: uploadResult.upload_id,
        row_number: selectedRow.row_number,
        corrections,
      }),
    });
    
    if (res.ok) {
      const result = await res.json();
      
      // Update the row in our state
      setUploadResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          rows: prev.rows.map(r => 
            r.row_number === selectedRow.row_number ? result.data : r
          ),
        };
      });
    }
  };
  
  const handleCommit = async () => {
    if (!uploadResult) return;
    
    setStage('committing');
    
    try {
      const res = await fetch('/supplier-portal/api/feed-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          upload_id: uploadResult.upload_id,
          row_numbers: Array.from(selectedRows),
        }),
      });
      
      if (!res.ok) {
        throw new Error('Commit failed');
      }
      
      const result = await res.json();
      setCommitResult(result.data);
      setStage('done');
    } catch (error) {
      console.error('Commit failed:', error);
      setStage('preview');
      alert('Commit failed. Please try again.');
    }
  };
  
  const toggleRowSelection = (rowNum: number) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(rowNum)) {
        next.delete(rowNum);
      } else {
        next.add(rowNum);
      }
      return next;
    });
  };
  
  const selectAllVisible = () => {
    const filteredRows = uploadResult?.rows.filter(r => filter === 'all' || r.status === filter) || [];
    const rowNums: number[] = filteredRows.map(r => r.row_number);
    setSelectedRows(new Set(rowNums));
  };
  
  const deselectAll = () => {
    setSelectedRows(new Set());
  };
  
  const filteredRows = uploadResult?.rows.filter(r => filter === 'all' || r.status === filter) || [];
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Supplier Portal</h1>
            <p className="text-sm text-gray-500">Feed Upload</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/supplier-portal/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </header>
      
      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Upload Stage */}
        {stage === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload Price Sheet</CardTitle>
            </CardHeader>
            <CardContent>
              <DropZone onFileSelect={handleFileSelect} disabled={false} />
              
              <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">Supported Formats</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• <strong>CSV</strong> - Comma-separated values</li>
                  <li>• <strong>XLSX</strong> - Excel spreadsheet</li>
                  <li>• <strong>Price sheets</strong> - We'll auto-detect columns</li>
                </ul>
                <p className="mt-3 text-xs text-blue-700">
                  Column headers we recognize: SKU, Product Name, Price, Case Pack, Box Quantity, Lead Time, MOQ, Material, Size
                </p>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Processing Stage */}
        {stage === 'processing' && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-lg font-medium text-gray-700">Processing your file...</p>
              <p className="text-sm text-gray-500 mt-2">Parsing, extracting, and validating data</p>
            </CardContent>
          </Card>
        )}
        
        {/* Preview Stage */}
        {stage === 'preview' && uploadResult && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <Card className="bg-white">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold">{uploadResult.total_rows}</p>
                  <p className="text-sm text-gray-600">Total Rows</p>
                </CardContent>
              </Card>
              <Card className="bg-green-50">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-green-600">{uploadResult.valid_rows}</p>
                  <p className="text-sm text-gray-600">Valid</p>
                </CardContent>
              </Card>
              <Card className="bg-yellow-50">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-yellow-600">{uploadResult.warning_rows}</p>
                  <p className="text-sm text-gray-600">Warnings</p>
                </CardContent>
              </Card>
              <Card className="bg-red-50">
                <CardContent className="pt-6 text-center">
                  <p className="text-3xl font-bold text-red-600">{uploadResult.error_rows}</p>
                  <p className="text-sm text-gray-600">Errors</p>
                </CardContent>
              </Card>
            </div>
            
            {/* Rows Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Preview & Correct</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">
                      {selectedRows.size} selected
                    </span>
                    <Button variant="outline" size="sm" onClick={selectAllVisible}>
                      Select All
                    </Button>
                    <Button variant="outline" size="sm" onClick={deselectAll}>
                      Deselect All
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="flex gap-2 mb-4">
                  <Button 
                    variant={filter === 'all' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setFilter('all')}
                  >
                    All ({uploadResult.total_rows})
                  </Button>
                  <Button 
                    variant={filter === 'valid' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setFilter('valid')}
                  >
                    Valid ({uploadResult.valid_rows})
                  </Button>
                  <Button 
                    variant={filter === 'warning' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setFilter('warning')}
                  >
                    Warnings ({uploadResult.warning_rows})
                  </Button>
                  <Button 
                    variant={filter === 'error' ? 'default' : 'outline'} 
                    size="sm"
                    onClick={() => setFilter('error')}
                  >
                    Errors ({uploadResult.error_rows})
                  </Button>
                </div>
                
                {/* Table */}
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="w-10 p-3 text-left">
                          <input 
                            type="checkbox" 
                            checked={selectedRows.size === filteredRows.length && filteredRows.length > 0}
                            onChange={(e) => e.target.checked ? selectAllVisible() : deselectAll()}
                          />
                        </th>
                        <th className="p-3 text-left">#</th>
                        <th className="p-3 text-left">Status</th>
                        <th className="p-3 text-left">Product</th>
                        <th className="p-3 text-left">Match</th>
                        <th className="p-3 text-left">Price</th>
                        <th className="p-3 text-left">Pack</th>
                        <th className="p-3 text-left">Issues</th>
                        <th className="p-3 text-left"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map(row => (
                        <tr 
                          key={row.row_number} 
                          className={`border-t ${
                            row.status === 'error' ? 'bg-red-50' : 
                            row.status === 'warning' ? 'bg-yellow-50' : ''
                          }`}
                        >
                          <td className="p-3">
                            <input 
                              type="checkbox"
                              checked={selectedRows.has(row.row_number)}
                              onChange={() => toggleRowSelection(row.row_number)}
                              disabled={row.status === 'error'}
                            />
                          </td>
                          <td className="p-3">{row.row_number}</td>
                          <td className="p-3">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="p-3">
                            <div className="max-w-xs truncate">
                              {row.extracted.product_name || row.extracted.sku || '-'}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              <MatchMethodBadge method={row.normalized.match_method} />
                              {row.normalized.match_confidence > 0 && (
                                <span className="text-xs text-gray-500">
                                  {(row.normalized.match_confidence * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            ${row.extracted.price?.toFixed(2) || '-'}
                          </td>
                          <td className="p-3">
                            {row.extracted.case_pack || '-'}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1">
                              {row.validation.errors.length > 0 && (
                                <span title={row.validation.errors.map(e => e.message).join('\n')}>
                                  <ErrorIcon />
                                </span>
                              )}
                              {row.validation.warnings.length > 0 && (
                                <span title={row.validation.warnings.map(w => w.message).join('\n')}>
                                  <WarningIcon />
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedRow(row)}
                            >
                              View/Edit
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Actions */}
                <div className="flex items-center justify-between mt-6 pt-4 border-t">
                  <Button variant="outline" onClick={() => setStage('upload')}>
                    Start Over
                  </Button>
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-gray-600">
                      {selectedRows.size} rows will be committed
                    </p>
                    <Button 
                      onClick={handleCommit}
                      disabled={selectedRows.size === 0}
                    >
                      Commit Selected Offers
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Committing Stage */}
        {stage === 'committing' && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-lg font-medium text-gray-700">Committing offers...</p>
            </CardContent>
          </Card>
        )}
        
        {/* Done Stage */}
        {stage === 'done' && commitResult && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-5xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-green-600 mb-4">Upload Complete!</h2>
              
              <div className="grid grid-cols-3 gap-4 max-w-md mx-auto mb-8">
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{commitResult.created}</p>
                  <p className="text-sm text-gray-600">Created</p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{commitResult.updated}</p>
                  <p className="text-sm text-gray-600">Updated</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-600">{commitResult.skipped}</p>
                  <p className="text-sm text-gray-600">Skipped</p>
                </div>
              </div>
              
              <div className="flex justify-center gap-4">
                <Button variant="outline" onClick={() => setStage('upload')}>
                  Upload Another
                </Button>
                <Button onClick={() => router.push('/supplier-portal/offers')}>
                  View Offers
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      
      {/* Row Detail Modal */}
      <RowDetailModal
        row={selectedRow}
        onClose={() => setSelectedRow(null)}
        onCorrect={handleCorrect}
      />
    </div>
  );
}
