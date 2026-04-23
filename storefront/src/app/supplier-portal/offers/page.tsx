'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

// ============================================================================
// TYPES
// ============================================================================

interface SupplierOffer {
  id: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  price: number;
  case_pack?: number;
  box_quantity?: number;
  lead_time_days?: number;
  moq?: number;
  shipping_notes?: string;
  is_active: boolean;
  updated_at: string;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku?: string;
  has_offer: boolean;
}

// ============================================================================
// COMPONENTS
// ============================================================================

function FreshnessBadge({ updatedAt }: { updatedAt: string }) {
  const daysOld = Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000));
  
  if (daysOld < 7) {
    return <Badge className="bg-green-100 text-green-800">Fresh</Badge>;
  } else if (daysOld < 30) {
    return <Badge className="bg-yellow-100 text-yellow-800">Aging ({daysOld}d)</Badge>;
  } else {
    return <Badge className="bg-red-100 text-red-800">Stale ({daysOld}d)</Badge>;
  }
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function SupplierOffersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState<SupplierOffer[]>([]);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState<'all' | 'active' | 'stale'>('active');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  
  // Edit dialog
  const [editingOffer, setEditingOffer] = useState<SupplierOffer | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editCasePack, setEditCasePack] = useState('');
  const [editBoxQty, setEditBoxQty] = useState('');
  const [editLeadTime, setEditLeadTime] = useState('');
  const [editMoq, setEditMoq] = useState('');
  const [editShipping, setEditShipping] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Add new offer
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [newCasePack, setNewCasePack] = useState('');
  const [newBoxQty, setNewBoxQty] = useState('');
  const [newLeadTime, setNewLeadTime] = useState('');
  const [newMoq, setNewMoq] = useState('');
  const [newShipping, setNewShipping] = useState('');
  
  useEffect(() => {
    loadOffers();
  }, [filter, page]);
  
  async function loadOffers() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'list',
        active_only: filter === 'active' || filter === 'stale' ? 'true' : 'false',
        stale_only: filter === 'stale' ? 'true' : 'false',
        limit: '20',
        offset: String(page * 20),
      });
      
      if (search) {
        params.set('search', search);
      }
      
      const res = await fetch(`/supplier-portal/api/offers?${params}`);
      
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/supplier-portal/login');
          return;
        }
        throw new Error('Failed to load offers');
      }
      
      const data = await res.json();
      setOffers(data.offers);
      setTotal(data.total);
    } catch (error) {
      console.error('Failed to load offers:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function searchProducts(term: string) {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    
    try {
      const res = await fetch(`/supplier-portal/api/offers?action=search-products&search=${encodeURIComponent(term)}`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.data);
      }
    } catch (error) {
      console.error('Search failed:', error);
    }
  }
  
  function openEditDialog(offer: SupplierOffer) {
    setEditingOffer(offer);
    setEditPrice(String(offer.price));
    setEditCasePack(offer.case_pack ? String(offer.case_pack) : '');
    setEditBoxQty(offer.box_quantity ? String(offer.box_quantity) : '');
    setEditLeadTime(offer.lead_time_days ? String(offer.lead_time_days) : '');
    setEditMoq(offer.moq ? String(offer.moq) : '');
    setEditShipping(offer.shipping_notes || '');
  }
  
  async function saveOffer() {
    if (!editingOffer) return;
    
    setSaving(true);
    try {
      const res = await fetch('/supplier-portal/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          offer_id: editingOffer.id,
          updates: {
            price: parseFloat(editPrice),
            case_pack: editCasePack ? parseInt(editCasePack) : undefined,
            box_quantity: editBoxQty ? parseInt(editBoxQty) : undefined,
            lead_time_days: editLeadTime ? parseInt(editLeadTime) : undefined,
            moq: editMoq ? parseInt(editMoq) : undefined,
            shipping_notes: editShipping || undefined,
          },
        }),
      });
      
      if (res.ok) {
        setEditingOffer(null);
        loadOffers();
      }
    } catch (error) {
      console.error('Failed to save offer:', error);
    } finally {
      setSaving(false);
    }
  }
  
  async function createOffer() {
    if (!selectedProduct || !newPrice) return;
    
    setSaving(true);
    try {
      const res = await fetch('/supplier-portal/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          offer: {
            product_id: selectedProduct.id,
            price: parseFloat(newPrice),
            case_pack: newCasePack ? parseInt(newCasePack) : undefined,
            box_quantity: newBoxQty ? parseInt(newBoxQty) : undefined,
            lead_time_days: newLeadTime ? parseInt(newLeadTime) : undefined,
            moq: newMoq ? parseInt(newMoq) : undefined,
            shipping_notes: newShipping || undefined,
          },
        }),
      });
      
      if (res.ok) {
        setShowAddDialog(false);
        setSelectedProduct(null);
        setNewPrice('');
        setNewCasePack('');
        setNewBoxQty('');
        setNewLeadTime('');
        setNewMoq('');
        setNewShipping('');
        loadOffers();
      }
    } catch (error) {
      console.error('Failed to create offer:', error);
    } finally {
      setSaving(false);
    }
  }
  
  async function toggleOfferActive(offer: SupplierOffer) {
    try {
      const res = await fetch('/supplier-portal/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: offer.is_active ? 'deactivate' : 'reactivate',
          offer_id: offer.id,
        }),
      });
      
      if (res.ok) {
        loadOffers();
      }
    } catch (error) {
      console.error('Failed to toggle offer:', error);
    }
  }
  
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Supplier Portal</h1>
            <p className="text-sm text-gray-500">Offer Management</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => router.push('/supplier-portal/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
        
        {/* Navigation */}
        <nav className="max-w-7xl mx-auto px-4 flex gap-6 border-t border-gray-100">
          <button 
            className="py-3 text-gray-600 hover:text-gray-900 text-sm"
            onClick={() => router.push('/supplier-portal/dashboard')}
          >
            Dashboard
          </button>
          <button className="py-3 border-b-2 border-blue-600 text-blue-600 font-medium text-sm">
            Offers
          </button>
          <button 
            className="py-3 text-gray-600 hover:text-gray-900 text-sm"
            onClick={() => router.push('/supplier-portal/competitiveness')}
          >
            Competitiveness
          </button>
          <button 
            className="py-3 text-gray-600 hover:text-gray-900 text-sm"
            onClick={() => router.push('/supplier-portal/feed-health')}
          >
            Feed Health
          </button>
        </nav>
      </header>
      
      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your Offers ({total})</CardTitle>
            <Button onClick={() => setShowAddDialog(true)}>Add New Offer</Button>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex gap-4 mb-4">
              <div className="flex gap-2">
                <Button 
                  variant={filter === 'active' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => { setFilter('active'); setPage(0); }}
                >
                  Active
                </Button>
                <Button 
                  variant={filter === 'stale' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => { setFilter('stale'); setPage(0); }}
                >
                  Stale
                </Button>
                <Button 
                  variant={filter === 'all' ? 'default' : 'outline'} 
                  size="sm"
                  onClick={() => { setFilter('all'); setPage(0); }}
                >
                  All
                </Button>
              </div>
              <Input
                placeholder="Search by SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadOffers()}
                className="max-w-xs"
              />
            </div>
            
            {/* Offers List */}
            {loading ? (
              <p className="text-gray-500">Loading offers...</p>
            ) : offers.length === 0 ? (
              <p className="text-gray-500">No offers found</p>
            ) : (
              <div className="space-y-2">
                {offers.map(offer => (
                  <div 
                    key={offer.id} 
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      offer.is_active ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          {offer.product_name || `Product ${offer.product_id.slice(0, 8)}...`}
                        </p>
                        {offer.sku && <Badge variant="outline">{offer.sku}</Badge>}
                        {!offer.is_active && <Badge className="bg-gray-200 text-gray-600">Inactive</Badge>}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        <span>Case: {offer.case_pack || '-'}</span>
                        <span>Box Qty: {offer.box_quantity || '-'}</span>
                        <span>Lead: {offer.lead_time_days ? `${offer.lead_time_days}d` : '-'}</span>
                        <span>MOQ: {offer.moq || '-'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-lg font-bold">${offer.price.toFixed(2)}</p>
                        <FreshnessBadge updatedAt={offer.updated_at} />
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => openEditDialog(offer)}
                        >
                          Edit
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => toggleOfferActive(offer)}
                        >
                          {offer.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Pagination */}
            {total > 20 && (
              <div className="flex justify-center gap-2 mt-4">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  Previous
                </Button>
                <span className="py-2 px-4 text-sm text-gray-600">
                  Page {page + 1} of {Math.ceil(total / 20)}
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * 20 >= total}
                >
                  Next
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      
      {/* Edit Dialog */}
      <Dialog open={!!editingOffer} onOpenChange={() => setEditingOffer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Price ($)</label>
              <Input 
                type="number" 
                step="0.01"
                value={editPrice} 
                onChange={(e) => setEditPrice(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Case Pack</label>
                <Input 
                  type="number"
                  value={editCasePack} 
                  onChange={(e) => setEditCasePack(e.target.value)}
                  placeholder="e.g., 100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Box Quantity</label>
                <Input 
                  type="number"
                  value={editBoxQty} 
                  onChange={(e) => setEditBoxQty(e.target.value)}
                  placeholder="e.g., 10"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Lead Time (days)</label>
                <Input 
                  type="number"
                  value={editLeadTime} 
                  onChange={(e) => setEditLeadTime(e.target.value)}
                  placeholder="e.g., 3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">MOQ</label>
                <Input 
                  type="number"
                  value={editMoq} 
                  onChange={(e) => setEditMoq(e.target.value)}
                  placeholder="e.g., 1"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Shipping Notes</label>
              <Input 
                value={editShipping} 
                onChange={(e) => setEditShipping(e.target.value)}
                placeholder="e.g., Ships from warehouse A"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingOffer(null)}>Cancel</Button>
            <Button onClick={saveOffer} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add New Offer Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Offer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedProduct ? (
              <div>
                <label className="block text-sm font-medium mb-1">Search Product</label>
                <Input 
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    searchProducts(e.target.value);
                  }}
                  placeholder="Search by name or SKU..."
                />
                {searchResults.length > 0 && (
                  <div className="mt-2 border rounded-lg max-h-60 overflow-auto">
                    {searchResults.map(product => (
                      <button
                        key={product.id}
                        className="w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0"
                        onClick={() => setSelectedProduct(product)}
                        disabled={product.has_offer}
                      >
                        <p className="font-medium">{product.name}</p>
                        {product.sku && <p className="text-sm text-gray-500">SKU: {product.sku}</p>}
                        {product.has_offer && (
                          <Badge className="mt-1 bg-gray-200 text-gray-600">Already have offer</Badge>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="font-medium">{selectedProduct.name}</p>
                  {selectedProduct.sku && <p className="text-sm text-gray-600">SKU: {selectedProduct.sku}</p>}
                  <Button 
                    variant="link" 
                    size="sm" 
                    className="p-0 h-auto"
                    onClick={() => setSelectedProduct(null)}
                  >
                    Change product
                  </Button>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Price ($) *</label>
                  <Input 
                    type="number" 
                    step="0.01"
                    value={newPrice} 
                    onChange={(e) => setNewPrice(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Case Pack</label>
                    <Input 
                      type="number"
                      value={newCasePack} 
                      onChange={(e) => setNewCasePack(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Box Quantity</label>
                    <Input 
                      type="number"
                      value={newBoxQty} 
                      onChange={(e) => setNewBoxQty(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Lead Time (days)</label>
                    <Input 
                      type="number"
                      value={newLeadTime} 
                      onChange={(e) => setNewLeadTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">MOQ</label>
                    <Input 
                      type="number"
                      value={newMoq} 
                      onChange={(e) => setNewMoq(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Shipping Notes</label>
                  <Input 
                    value={newShipping} 
                    onChange={(e) => setNewShipping(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button 
              onClick={createOffer} 
              disabled={saving || !selectedProduct || !newPrice}
            >
              {saving ? 'Creating...' : 'Create Offer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
