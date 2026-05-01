'use client';

/**
 * Admin Product Import Page
 * 
 * Workflow for creating products from external URLs:
 * 1. Paste product URL
 * 2. View extracted data and confidence
 * 3. Review potential duplicates
 * 4. Approve, merge, or reject
 */

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

// ============================================================================
// TYPES
// ============================================================================

interface ExtractedData {
  item_number?: string;
  sku?: string;
  mpn?: string;
  upc?: string;
  title?: string;
  description?: string;
  brand?: string;
  manufacturer?: string;
  material?: string;
  size?: string;
  sizes_available?: string[];
  color?: string;
  colors_available?: string[];
  thickness_mil?: number;
  pack_size?: number;
  units_per_box?: number;
  boxes_per_case?: number;
  total_units_per_case?: number;
  powder_free?: boolean;
  latex_free?: boolean;
  sterile?: boolean;
  exam_grade?: boolean;
  food_safe?: boolean;
  price?: number;
  spec_table?: Record<string, string>;
}

interface PotentialDuplicate {
  canonical_product_id: string;
  product_name: string;
  similarity_score: number;
  match_reasons: string[];
}

interface ProductCandidate {
  id: string;
  source_url: string;
  source_domain: string;
  status: string;
  extracted_data: ExtractedData;
  overall_confidence: number;
  field_confidence: Record<string, number>;
  extraction_reasoning: string;
  extraction_sources: string[];
  extraction_warnings: string[];
  potential_duplicates: PotentialDuplicate[];
  duplicate_confidence: number;
  created_at: string;
}

interface ImportResult {
  candidate_id: string;
  status: string;
  candidate: ProductCandidate;
  duplicates: PotentialDuplicate[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function ProductImportPage() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  
  // Review state
  const [pendingCandidates, setPendingCandidates] = useState<ProductCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<ProductCandidate | null>(null);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  
  // Import handler
  const handleImport = useCallback(async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }
    
    setLoading(true);
    setError(null);
    setImportResult(null);
    
    try {
      const response = await fetch('/admin/api/product-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', url: url.trim() }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || 'Import failed');
        return;
      }
      
      setImportResult(data.data);
      setUrl('');
      loadPendingCandidates();
    } catch (err) {
      setError('Failed to import product');
    } finally {
      setLoading(false);
    }
  }, [url]);
  
  // Load pending candidates
  const loadPendingCandidates = useCallback(async () => {
    try {
      const response = await fetch('/admin/api/product-import?action=list');
      const data = await response.json();
      
      if (response.ok && data.data) {
        setPendingCandidates(data.data);
      }
    } catch {
      // Ignore error
    }
  }, []);
  
  // Approve handler
  const handleApprove = useCallback(async (candidate: ProductCandidate, mergeIntoId?: string) => {
    setApproving(true);
    
    try {
      const response = await fetch('/admin/api/product-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          candidate_id: candidate.id,
          merge_into_product_id: mergeIntoId,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setReviewDialogOpen(false);
        setSelectedCandidate(null);
        loadPendingCandidates();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to approve');
    } finally {
      setApproving(false);
    }
  }, [loadPendingCandidates]);
  
  // Reject handler
  const handleReject = useCallback(async (candidate: ProductCandidate, reason: string) => {
    setApproving(true);
    
    try {
      const response = await fetch('/admin/api/product-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reject',
          candidate_id: candidate.id,
          reason,
        }),
      });
      
      if (response.ok) {
        setReviewDialogOpen(false);
        setSelectedCandidate(null);
        loadPendingCandidates();
      }
    } catch {
      setError('Failed to reject');
    } finally {
      setApproving(false);
    }
  }, [loadPendingCandidates]);
  
  // Load on mount
  useState(() => {
    loadPendingCandidates();
  });
  
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link href="/admin" className="hover:text-gray-700">Admin</Link>
            <span>›</span>
            <span className="text-gray-900">Product Import</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Import Product from URL</h1>
          <p className="text-gray-600 mt-1">
            Paste a product URL to extract data and create a new product
          </p>
        </div>
        
        {/* Import Form */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Product URL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/product/..."
                className="flex-1"
                disabled={loading}
                onKeyDown={(e) => e.key === 'Enter' && handleImport()}
              />
              <Button onClick={handleImport} disabled={loading || !url.trim()}>
                {loading ? 'Importing...' : 'Import'}
              </Button>
            </div>
            
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Import Result */}
        {importResult && (
          <ImportResultCard
            result={importResult}
            onReview={(c) => {
              setSelectedCandidate(c);
              setReviewDialogOpen(true);
            }}
          />
        )}
        
        {/* Pending Candidates */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pending Review</CardTitle>
            <Button variant="outline" size="sm" onClick={loadPendingCandidates}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {pendingCandidates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No candidates pending review
              </div>
            ) : (
              <div className="space-y-3">
                {pendingCandidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    onClick={() => {
                      setSelectedCandidate(candidate);
                      setReviewDialogOpen(true);
                    }}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Review Dialog */}
        {selectedCandidate && (
          <ReviewDialog
            open={reviewDialogOpen}
            onClose={() => {
              setReviewDialogOpen(false);
              setSelectedCandidate(null);
            }}
            candidate={selectedCandidate}
            onApprove={(mergeId) => handleApprove(selectedCandidate, mergeId)}
            onReject={(reason) => handleReject(selectedCandidate, reason)}
            loading={approving}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function ImportResultCard({
  result,
  onReview,
}: {
  result: ImportResult;
  onReview: (candidate: ProductCandidate) => void;
}) {
  const { candidate, duplicates } = result;
  const data = candidate.extracted_data;
  
  return (
    <Card className="mb-8 border-green-200 bg-green-50/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-green-800">Import Successful</CardTitle>
          <ConfidenceBadge confidence={candidate.overall_confidence} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Extracted Data */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">Extracted Product</h3>
            <div className="space-y-2 text-sm">
              <DataRow label="Title" value={data.title} />
              <DataRow label="SKU" value={data.sku || data.item_number} />
              <DataRow label="MPN" value={data.mpn} />
              <DataRow label="Brand" value={data.brand} />
              <DataRow label="Material" value={data.material} />
              <DataRow label="Size" value={data.size} />
              <DataRow label="Pack Size" value={data.pack_size?.toString()} />
              <DataRow label="Color" value={data.color} />
            </div>
          </div>
          
          {/* Duplicates */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-3">
              Potential Duplicates
              {duplicates.length > 0 && (
                <Badge variant="outline" className="ml-2">
                  {duplicates.length}
                </Badge>
              )}
            </h3>
            {duplicates.length === 0 ? (
              <div className="text-sm text-gray-500">No duplicates detected</div>
            ) : (
              <div className="space-y-2">
                {duplicates.map((dup) => (
                  <div
                    key={dup.canonical_product_id}
                    className="p-2 bg-amber-50 border border-amber-200 rounded text-sm"
                  >
                    <div className="font-medium text-gray-900">{dup.product_name}</div>
                    <div className="text-amber-700">
                      {Math.round(dup.similarity_score * 100)}% match: {dup.match_reasons.join(', ')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="mt-6 flex gap-3">
          <Button onClick={() => onReview(candidate)}>
            Review & Approve
          </Button>
          <Button variant="outline" asChild>
            <a href={candidate.source_url} target="_blank" rel="noopener noreferrer">
              View Source
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CandidateRow({
  candidate,
  onClick,
}: {
  candidate: ProductCandidate;
  onClick: () => void;
}) {
  const data = candidate.extracted_data;
  
  return (
    <div
      onClick={onClick}
      className="p-4 bg-white border border-gray-200 rounded-lg cursor-pointer hover:border-blue-300 hover:bg-blue-50/30 transition-colors"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate">
            {data.title || 'Untitled Product'}
          </div>
          <div className="text-sm text-gray-500 truncate">
            {candidate.source_domain} • {new Date(candidate.created_at).toLocaleDateString()}
          </div>
          <div className="flex items-center gap-2 mt-2">
            {data.material && <Badge variant="outline">{data.material}</Badge>}
            {data.size && <Badge variant="outline">{data.size}</Badge>}
            {data.pack_size && <Badge variant="outline">{data.pack_size}ct</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-4">
          {candidate.potential_duplicates.length > 0 && (
            <Badge variant="destructive">
              {candidate.potential_duplicates.length} duplicate{candidate.potential_duplicates.length > 1 ? 's' : ''}
            </Badge>
          )}
          <ConfidenceBadge confidence={candidate.overall_confidence} />
        </div>
      </div>
    </div>
  );
}

function ReviewDialog({
  open,
  onClose,
  candidate,
  onApprove,
  onReject,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  candidate: ProductCandidate;
  onApprove: (mergeIntoId?: string) => void;
  onReject: (reason: string) => void;
  loading: boolean;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [selectedMerge, setSelectedMerge] = useState<string | null>(null);
  const data = candidate.extracted_data;
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review Product Candidate</DialogTitle>
        </DialogHeader>
        
        <Tabs defaultValue="extracted" className="mt-4">
          <TabsList>
            <TabsTrigger value="extracted">Extracted Data</TabsTrigger>
            <TabsTrigger value="duplicates">
              Duplicates ({candidate.potential_duplicates.length})
            </TabsTrigger>
            <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
            <TabsTrigger value="raw">Spec Table</TabsTrigger>
          </TabsList>
          
          <TabsContent value="extracted" className="mt-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <DataRow label="Title" value={data.title} fullWidth />
              <DataRow label="Description" value={data.description?.substring(0, 200)} fullWidth />
              <DataRow label="Item Number" value={data.item_number} />
              <DataRow label="SKU" value={data.sku} />
              <DataRow label="MPN" value={data.mpn} />
              <DataRow label="UPC" value={data.upc} />
              <DataRow label="Brand" value={data.brand} />
              <DataRow label="Manufacturer" value={data.manufacturer} />
              <DataRow label="Material" value={data.material} />
              <DataRow label="Size" value={data.size} />
              <DataRow label="Color" value={data.color} />
              <DataRow label="Thickness" value={data.thickness_mil ? `${data.thickness_mil} mil` : undefined} />
              <DataRow label="Pack Size" value={data.pack_size?.toString()} />
              <DataRow label="Units/Box" value={data.units_per_box?.toString()} />
              <DataRow label="Boxes/Case" value={data.boxes_per_case?.toString()} />
              <DataRow label="Total Units/Case" value={data.total_units_per_case?.toString()} />
              <DataRow label="Powder Free" value={data.powder_free ? 'Yes' : data.powder_free === false ? 'No' : undefined} />
              <DataRow label="Latex Free" value={data.latex_free ? 'Yes' : data.latex_free === false ? 'No' : undefined} />
              <DataRow label="Sterile" value={data.sterile ? 'Yes' : data.sterile === false ? 'No' : undefined} />
              <DataRow label="Exam Grade" value={data.exam_grade ? 'Yes' : data.exam_grade === false ? 'No' : undefined} />
              <DataRow label="Price" value={data.price ? `$${data.price.toFixed(2)}` : undefined} />
            </div>
            
            {/* Confidence breakdown */}
            <div className="mt-6">
              <h4 className="font-medium text-gray-900 mb-2">Field Confidence</h4>
              <div className="flex flex-wrap gap-2">
                {Object.entries(candidate.field_confidence).map(([field, conf]) => (
                  <Badge
                    key={field}
                    variant={conf >= 0.8 ? 'default' : conf >= 0.6 ? 'secondary' : 'outline'}
                  >
                    {field}: {Math.round(conf * 100)}%
                  </Badge>
                ))}
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="duplicates" className="mt-4">
            {candidate.potential_duplicates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No potential duplicates detected
              </div>
            ) : (
              <div className="space-y-3">
                {candidate.potential_duplicates.map((dup) => (
                  <div
                    key={dup.canonical_product_id}
                    className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                      selectedMerge === dup.canonical_product_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedMerge(
                      selectedMerge === dup.canonical_product_id ? null : dup.canonical_product_id
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{dup.product_name}</div>
                        <div className="text-sm text-gray-600 mt-1">
                          {dup.match_reasons.join(' • ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${
                          dup.similarity_score >= 0.9 ? 'text-red-600' :
                          dup.similarity_score >= 0.7 ? 'text-amber-600' :
                          'text-gray-600'
                        }`}>
                          {Math.round(dup.similarity_score * 100)}%
                        </div>
                        <div className="text-xs text-gray-500">similarity</div>
                      </div>
                    </div>
                    {selectedMerge === dup.canonical_product_id && (
                      <div className="mt-3 text-sm text-blue-600">
                        Click "Merge" to link to this product
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="reasoning" className="mt-4">
            <div className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Summary</h4>
                <p className="text-gray-600">{candidate.extraction_reasoning}</p>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Sources</h4>
                <div className="flex flex-wrap gap-2">
                  {candidate.extraction_sources.map((source, i) => (
                    <Badge key={i} variant="outline">{source}</Badge>
                  ))}
                </div>
              </div>
              
              {candidate.extraction_warnings.length > 0 && (
                <div>
                  <h4 className="font-medium text-amber-700 mb-2">Warnings</h4>
                  <ul className="list-disc list-inside text-amber-600 text-sm">
                    {candidate.extraction_warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Source URL</h4>
                <a
                  href={candidate.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline text-sm break-all"
                >
                  {candidate.source_url}
                </a>
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="raw" className="mt-4">
            {data.spec_table ? (
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(data.spec_table).map(([key, value]) => (
                    <tr key={key} className="border-b border-gray-100">
                      <td className="py-2 pr-4 font-medium text-gray-600">{key}</td>
                      <td className="py-2 text-gray-900">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-gray-500">
                No spec table extracted
              </div>
            )}
          </TabsContent>
        </Tabs>
        
        <DialogFooter className="mt-6 flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <Input
              placeholder="Rejection reason (optional)"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={() => onReject(rejectReason)}
              disabled={loading}
            >
              Reject
            </Button>
            {selectedMerge ? (
              <Button
                onClick={() => onApprove(selectedMerge)}
                disabled={loading}
              >
                {loading ? 'Merging...' : 'Merge'}
              </Button>
            ) : (
              <Button
                onClick={() => onApprove()}
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Product'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DataRow({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value?: string;
  fullWidth?: boolean;
}) {
  if (!value) return null;
  
  return (
    <div className={fullWidth ? 'col-span-2' : ''}>
      <span className="text-gray-500">{label}:</span>{' '}
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? 'bg-green-100 text-green-800' :
    pct >= 60 ? 'bg-yellow-100 text-yellow-800' :
    'bg-red-100 text-red-800';
    
  return (
    <Badge className={color}>
      {pct}% confidence
    </Badge>
  );
}
