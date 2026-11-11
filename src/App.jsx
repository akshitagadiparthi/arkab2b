import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { 
  Boxes, TrendingUp, AlertTriangle, Truck, Receipt, 
  Search, PlusCircle, CheckCircle2, DollarSign 
} from 'lucide-react';

// ARKA SOLAR SUPABASE CONNECTION
const SUPABASE_URL = 'https://leresophavdacittfheg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_k8ybBxm-5-4RLlsc5NpRtA_QsYJTSKj';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default function App() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [items, setItems] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);

  // Form states
  const [inwardForm, setInwardForm] = useState({
    vendor: 'Tata Power Solar',
    invoiceNo: '',
    ewayBill: '',
    itemId: '',
    qty: '',
    rate: '',
    freight: '',
    hamaliAmount: '',
  });

  const [dcrForm, setDcrForm] = useState({
    purchaseId: '',
    dcrNo: '',
    palletNo: '',
    serialListRaw: '',
  });

  const [searchSerial, setSearchSerial] = useState('');
  const [serialSearchResult, setSerialSearchResult] = useState(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      const { data: itemsData } = await supabase.from('items').select('*');
      const { data: purchaseData } = await supabase
        .from('purchases')
        .select('*, purchase_expenses(*)')
        .order('created_at', { ascending: false });

      if (itemsData) {
        setItems(itemsData);
        if (itemsData.length > 0 && !inwardForm.itemId) {
          setInwardForm(prev => ({ ...prev, itemId: itemsData[0].id }));
        }
      }
      if (purchaseData) setPurchases(purchaseData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // Morning Inward + Petty Unloading Submission
  async function handleInwardSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: purchase, error: pError } = await supabase.from('purchases').insert([{
        vendor_name: inwardForm.vendor,
        invoice_no: inwardForm.invoiceNo,
        eway_bill_no: inwardForm.ewayBill,
        freight_charges: parseFloat(inwardForm.freight) || 0,
        dcr_status: 'PENDING'
      }]).select().single();

      if (pError) throw pError;

      const baseRate = parseFloat(inwardForm.rate) || 0;
      const totalQty = parseFloat(inwardForm.qty) || 1;
      const extraCost = ((parseFloat(inwardForm.freight) || 0) + (parseFloat(inwardForm.hamaliAmount) || 0)) / totalQty;
      const landedUnitRate = baseRate + extraCost;

      await supabase.from('purchase_line_items').insert([{
        purchase_id: purchase.id,
        item_id: inwardForm.itemId,
        quantity_received: totalQty,
        base_unit_rate: baseRate,
        landed_unit_rate: landedUnitRate
      }]);

      if (parseFloat(inwardForm.hamaliAmount) > 0) {
        await supabase.from('purchase_expenses').insert([{
          purchase_id: purchase.id,
          expense_type: 'Hamali/Labor',
          amount: parseFloat(inwardForm.hamaliAmount),
          payment_mode: 'Cash',
          notes: 'Unloading charges logged at gate'
        }]);
      }

      alert('Stock successfully logged! DCR certificate can be added this evening.');
      fetchInitialData();
      setInwardForm({
        vendor: 'Tata Power Solar', invoiceNo: '', ewayBill: '',
        itemId: items[0]?.id || '', qty: '', rate: '', freight: '', hamaliAmount: ''
      });
    } catch (err) {
      alert(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Evening DCR & Serial Number Batch Upload
  async function handleDcrSubmit(e) {
    e.preventDefault();
    if (!dcrForm.purchaseId) return alert('Select the purchase invoice from this morning!');
    setLoading(true);

    try {
      const serials = dcrForm.serialListRaw
        .split(/[\n,]+/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

      const { data: pItems } = await supabase
        .from('purchase_line_items')
        .select('item_id')
        .eq('purchase_id', dcrForm.purchaseId)
        .single();

      const serialObjects = serials.map(sn => ({
        serial_number: sn,
        pallet_number: dcrForm.palletNo || 'PALLET-GEN',
        item_id: pItems.item_id,
        purchase_id: dcrForm.purchaseId,
        status: 'IN_STOCK'
      }));

      const { error: insertErr } = await supabase.from('serial_numbers').insert(serialObjects);
      if (insertErr) throw insertErr;

      await supabase.from('purchases').update({
        dcr_number: dcrForm.dcrNo,
        dcr_received_at: new Date().toISOString()
      }).eq('id', dcrForm.purchaseId);

      const { data: verifyResult, error: funcErr } = await supabase.rpc('verify_dcr_batch', {
        target_purchase_id: dcrForm.purchaseId
      });

      if (funcErr) throw funcErr;

      if (verifyResult.status === 'SUCCESS') {
        alert(`Success! Clean match: All ${verifyResult.actual} serials verified against invoice.`);
      } else {
        alert(`IRREGULARITY DETECTED: Expected ${verifyResult.expected} panels, but DCR had ${verifyResult.actual} serial numbers!`);
      }

      fetchInitialData();
      setDcrForm({ purchaseId: '', dcrNo: '', palletNo: '', serialListRaw: '' });
    } catch (err) {
      alert(`Upload Failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Search Panel Serials
  async function handleSearchSerial(e) {
    e.preventDefault();
    const { data, error } = await supabase
      .from('serial_numbers')
      .select('*, items(name), purchases(vendor_name, invoice_no, dcr_number)')
      .eq('serial_number', searchSerial.trim())
      .single();

    if (error || !data) {
      alert('Serial Number not found in system!');
      setSerialSearchResult(null);
    } else {
      setSerialSearchResult(data);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-amber-500 p-2 rounded-lg text-slate-950">
            <Boxes className="h-6 w-6 font-bold" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">ARKA SOLAR POWER</h1>
            <p className="text-xs text-slate-400">Executive B2B Inventory & DCR Portal</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-700 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Higher Management Portal</span>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/50 px-6 space-x-4">
        {[
          { id: 'inventory', label: 'Inventory & Purchases', icon: Boxes },
          { id: 'inward', label: 'Morning Inward (+ Petty Cash)', icon: Truck },
          { id: 'dcr', label: 'Evening DCR & Serials', icon: Receipt },
          { id: 'search', label: 'Serial & DISCOM Lookup', icon: Search }
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-4 px-3 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id 
                  ? 'border-amber-500 text-amber-400' 
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'inventory' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700">
                <span className="text-xs uppercase text-slate-400 font-semibold">Active SKU Master</span>
                <p className="text-2xl font-bold mt-1 text-slate-100">{items.length} Products</p>
                <span className="text-xs text-amber-400 mt-2 block">Panels, Inverters, BOS</span>
              </div>
              <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700">
                <span className="text-xs uppercase text-slate-400 font-semibold">Total Inward Invoices</span>
                <p className="text-2xl font-bold mt-1 text-slate-100">{purchases.length} Batches</p>
                <span className="text-xs text-emerald-400 mt-2 block">Tata Power & Manufacturers</span>
              </div>
              <div className="bg-slate-800/60 p-5 rounded-xl border border-slate-700">
                <span className="text-xs uppercase text-slate-400 font-semibold">Pending DCR Certificates</span>
                <p className="text-2xl font-bold mt-1 text-amber-400">
                  {purchases.filter(p => p.dcr_status === 'PENDING').length} Batches Pending
                </p>
                <span className="text-xs text-slate-400 mt-2 block">Awaiting evening certificate</span>
              </div>
            </div>

            <div className="bg-slate-800/60 rounded-xl border border-slate-700 overflow-hidden">
              <div className="p-4 border-b border-slate-700">
                <h3 className="text-base font-semibold">Recent Inward Shipments & DCR Audit Status</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-900/50 text-slate-400 uppercase text-xs">
                    <tr>
                      <th className="py-3 px-4">Vendor</th>
                      <th className="py-3 px-4">Invoice No</th>
                      <th className="py-3 px-4">e-Way Bill</th>
                      <th className="py-3 px-4">Petty Exp. (Hamali)</th>
                      <th className="py-3 px-4">DCR Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {purchases.map(p => {
                      const pettyTotal = p.purchase_expenses?.reduce((acc, curr) => acc + parseFloat(curr.amount), 0) || 0;
                      return (
                        <tr key={p.id} className="hover:bg-slate-700/30">
                          <td className="py-3 px-4 font-medium text-slate-200">{p.vendor_name}</td>
                          <td className="py-3 px-4">{p.invoice_no}</td>
                          <td className="py-3 px-4 text-xs font-mono">{p.eway_bill_no || 'N/A'}</td>
                          <td className="py-3 px-4 text-amber-300 font-mono">₹{pettyTotal}</td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center space-x-1 ${
                              p.dcr_status === 'VERIFIED' ? 'bg-emerald-500/20 text-emerald-400' :
                              p.dcr_status === 'MISMATCH_FLAGGED' ? 'bg-red-500/20 text-red-400 font-bold' :
                              'bg-amber-500/20 text-amber-400'
                            }`}>
                              {p.dcr_status === 'MISMATCH_FLAGGED' && <AlertTriangle className="w-3 h-3 mr-1" />}
                              <span>{p.dcr_status}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'inward' && (
          <div className="max-w-2xl mx-auto bg-slate-800/60 p-6 rounded-xl border border-slate-700">
            <h2 className="text-lg font-bold mb-1">Morning Stock Entry (Gate Inward)</h2>
            <p className="text-sm text-slate-400 mb-6">Log physical pallet arrivals right as the truck unloads.</p>

            <form onSubmit={handleInwardSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase text-slate-400 mb-1">Vendor Name</label>
                  <input
                    type="text"
                    required
                    value={inwardForm.vendor}
                    onChange={e => setInwardForm({...inwardForm, vendor: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase text-slate-400 mb-1">Manufacturer Invoice No</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. TPS-INV-9921"
                    value={inwardForm.invoiceNo}
                    onChange={e => setInwardForm({...inwardForm, invoiceNo: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase text-slate-400 mb-1">e-Way Bill Number</label>
                  <input
                    type="text"
                    placeholder="12-digit e-Way bill"
                    value={inwardForm.ewayBill}
                    onChange={e => setInwardForm({...inwardForm, ewayBill: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase text-slate-400 mb-1">Item / Component</label>
                  <select
                    value={inwardForm.itemId}
                    onChange={e => setInwardForm({...inwardForm, itemId: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                  >
                    {items.map(it => (
                      <option key={it.id} value={it.id}>{it.name} ({it.uom})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase text-slate-400 mb-1">Total Quantity Received</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 620"
                    value={inwardForm.qty}
                    onChange={e => setInwardForm({...inwardForm, qty: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase text-slate-400 mb-1">Base Rate (₹ / Unit)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="Base purchase price"
                    value={inwardForm.rate}
                    onChange={e => setInwardForm({...inwardForm, rate: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                  />
                </div>
              </div>

              <div className="border-t border-slate-700 pt-4 mt-2">
                <h4 className="text-xs uppercase text-amber-400 font-bold mb-3 flex items-center space-x-1">
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Petty Cash & Unloading (Landed Cost Additions)</span>
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase text-slate-400 mb-1">Hamali / Unloading Labor (₹ Cash)</label>
                    <input
                      type="number"
                      placeholder="e.g. 2500"
                      value={inwardForm.hamaliAmount}
                      onChange={e => setInwardForm({...inwardForm, hamaliAmount: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase text-slate-400 mb-1">Local Freight / Tempo (₹)</label>
                    <input
                      type="number"
                      placeholder="e.g. 4000"
                      value={inwardForm.freight}
                      onChange={e => setInwardForm({...inwardForm, freight: e.target.value})}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-4 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 rounded-lg flex items-center justify-center space-x-2"
              >
                <PlusCircle className="w-5 h-5" />
                <span>{loading ? 'Processing...' : 'Accept Inward & Update Stock'}</span>
              </button>
            </form>
          </div>
        )}

        {activeTab === 'dcr' && (
          <div className="max-w-2xl mx-auto bg-slate-800/60 p-6 rounded-xl border border-slate-700">
            <h2 className="text-lg font-bold mb-1">Evening DCR & Serial Number Audit</h2>
            <p className="text-sm text-slate-400 mb-6">Attach manufacturer DCR serials and run the mismatch detector.</p>

            <form onSubmit={handleDcrSubmit} className="space-y-4">
              <div>
                <label className="block text-xs uppercase text-slate-400 mb-1">Select Inward Invoice</label>
                <select
                  required
                  value={dcrForm.purchaseId}
                  onChange={e => setDcrForm({...dcrForm, purchaseId: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                >
                  <option value="">-- Choose Purchase Invoice from Morning --</option>
                  {purchases.filter(p => p.dcr_status === 'PENDING').map(p => (
                    <option key={p.id} value={p.id}>{p.vendor_name} - Inv: {p.invoice_no}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase text-slate-400 mb-1">DCR Certificate Number</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. DCR-TATA-2026-881"
                    value={dcrForm.dcrNo}
                    onChange={e => setDcrForm({...dcrForm, dcrNo: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase text-slate-400 mb-1">Pallet Number / Tag</label>
                  <input
                    type="text"
                    placeholder="e.g. PALLET-01"
                    value={dcrForm.palletNo}
                    onChange={e => setDcrForm({...dcrForm, palletNo: e.target.value})}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase text-slate-400 mb-1">
                  Paste Pallet Serial Numbers (Separated by Newline or Commas)
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="SN20260001&#10;SN20260002&#10;SN20260003..."
                  value={dcrForm.serialListRaw}
                  onChange={e => setDcrForm({...dcrForm, serialListRaw: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-3 rounded-lg flex items-center justify-center space-x-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>{loading ? 'Auditing Batch...' : 'Audit & Commit Serials'}</span>
              </button>
            </form>
          </div>
        )}

        {activeTab === 'search' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-slate-800/60 p-6 rounded-xl border border-slate-700">
              <h2 className="text-lg font-bold mb-1">DISCOM & Customer Serial Verification</h2>
              <p className="text-sm text-slate-400 mb-4">Instant lookup when installers or DISCOM inspectors require certificate traces.</p>

              <form onSubmit={handleSearchSerial} className="flex gap-2">
                <input
                  type="text"
                  required
                  placeholder="Enter panel serial number..."
                  value={searchSerial}
                  onChange={e => setSearchSerial(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm font-mono"
                />
                <button
                  type="submit"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 rounded-lg flex items-center space-x-1"
                >
                  <Search className="w-4 h-4" />
                  <span>Trace</span>
                </button>
              </form>
            </div>

            {serialSearchResult && (
              <div className="bg-slate-800 p-6 rounded-xl border border-emerald-500/40 space-y-3">
                <div className="flex items-center space-x-2 text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Verified Serial Number Entry</span>
                </div>
                <div className="text-sm space-y-1.5 pt-2 border-t border-slate-700">
                  <p><strong className="text-slate-400">Serial:</strong> <span className="font-mono text-amber-400">{serialSearchResult.serial_number}</span></p>
                  <p><strong className="text-slate-400">Component:</strong> {serialSearchResult.items?.name}</p>
                  <p><strong className="text-slate-400">Pallet Box:</strong> {serialSearchResult.pallet_number}</p>
                  <p><strong className="text-slate-400">DCR Certificate No:</strong> {serialSearchResult.purchases?.dcr_number || 'Pending Certificate'}</p>
                  <p><strong className="text-slate-400">Source Invoice:</strong> {serialSearchResult.purchases?.invoice_no} ({serialSearchResult.purchases?.vendor_name})</p>
                  <p><strong className="text-slate-400">Status:</strong> <span className="uppercase text-xs font-bold text-emerald-300">{serialSearchResult.status}</span></p>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
