"use client";

import { useEffect, useMemo, useState } from "react";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

const suppliers = [
  { name: "Rehab Supply Co.", signal: "EIN verified · PT catalog · 97% on-time" },
  { name: "Clinical Direct", signal: "ACH ready · 2-day Southeast lanes" },
  { name: "NeuroStim Supply", signal: "Electrotherapy specialist · certificate current" },
  { name: "PrimeMed Distributors", signal: "Thomasnet sourced · glove alternatives" },
  { name: "OrthoPro Wholesale", signal: "Bulk therapy equipment · stock confirmed" },
];

const orderSteps = [
  { label: "Invoice uploaded", detail: "Buyer sent current supplier invoice" },
  { label: "Draft order", detail: "Line items normalized for reorder" },
  { label: "Buyer review", detail: "Clinic confirms quantities and substitutions" },
  { label: "PO sent", detail: "Supplier orders placed" },
  { label: "Supplier confirmed", detail: "Awaiting confirmations" },
  { label: "Shipped", detail: "Tracking pending" },
  { label: "Reorder reminder", detail: "Scheduled for 30 days" },
];

function statusClass(status) {
  if (status === "Parsed") return "success";
  if (status === "Alternative" || status === "Needs review") return "warning";
  return "info";
}

function sumSelected(lineItems) {
  return lineItems.reduce((total, item) => total + item.selected.total, 0);
}

function sumPrevious(lineItems) {
  return lineItems.reduce((total, item) => total + item.oldUnitPrice * item.qty, 0);
}

function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true">
      <symbol id="icon-home" viewBox="0 0 24 24">
        <path d="M3 10.8 12 3l9 7.8v8.4a1.8 1.8 0 0 1-1.8 1.8h-4.5v-6.2H9.3V21H4.8A1.8 1.8 0 0 1 3 19.2v-8.4Z" />
      </symbol>
      <symbol id="icon-file-plus" viewBox="0 0 24 24">
        <path d="M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z" />
        <path d="M13 3.5V9h5" />
        <path d="M9 15h5.5M11.75 12.25v5.5" />
      </symbol>
      <symbol id="icon-file-text" viewBox="0 0 24 24">
        <path d="M6 3.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 5 20V5A1.5 1.5 0 0 1 6.5 3.5Z" />
        <path d="M13 3.5V9h5" />
        <path d="M8.5 13h7M8.5 16h7" />
      </symbol>
      <symbol id="icon-clipboard" viewBox="0 0 24 24">
        <path d="M8 5.5h8" />
        <path d="M9 3.5h6l1 2h2A1.5 1.5 0 0 1 19.5 7v13A1.5 1.5 0 0 1 18 21.5H6A1.5 1.5 0 0 1 4.5 20V7A1.5 1.5 0 0 1 6 5.5h2l1-2Z" />
        <path d="M8.5 11.5h7M8.5 15.5h7" />
      </symbol>
      <symbol id="icon-package" viewBox="0 0 24 24">
        <path d="m12 3 8 4.3v9.4L12 21l-8-4.3V7.3L12 3Z" />
        <path d="m4.5 7.6 7.5 4 7.5-4M12 12v8" />
      </symbol>
      <symbol id="icon-users" viewBox="0 0 24 24">
        <path d="M9.5 11a3.3 3.3 0 1 0 0-6.6 3.3 3.3 0 0 0 0 6.6Z" />
        <path d="M3.8 19.5c.7-3.2 2.8-5 5.7-5s5 1.8 5.7 5" />
        <path d="M16 11.2a2.7 2.7 0 1 0-.8-5.2M16.8 14.4c2.4.3 4 2 4.6 4.6" />
      </symbol>
      <symbol id="icon-chart" viewBox="0 0 24 24">
        <path d="M4 20.5h17" />
        <path d="M6.5 17V10M12 17V5M17.5 17v-8" />
        <path d="M5 20.5h14.5a1.5 1.5 0 0 0 1.5-1.5V4" />
      </symbol>
      <symbol id="icon-settings" viewBox="0 0 24 24">
        <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" />
        <path d="M19.4 13.5c.1-.5.1-1 .1-1.5s0-1-.1-1.5l2-1.5-2-3.4-2.4 1a8.6 8.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.6a8.6 8.6 0 0 0-2.6 1.5l-2.4-1-2 3.4 2 1.5c-.1.5-.1 1-.1 1.5s0 1 .1 1.5l-2 1.5 2 3.4 2.4-1a8.6 8.6 0 0 0 2.6 1.5l.4 2.6h4l.4-2.6a8.6 8.6 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5Z" />
      </symbol>
      <symbol id="icon-search" viewBox="0 0 24 24">
        <path d="M10.8 18.1a7.2 7.2 0 1 0 0-14.4 7.2 7.2 0 0 0 0 14.4Z" />
        <path d="m16 16 5 5" />
      </symbol>
      <symbol id="icon-cloud-upload" viewBox="0 0 24 24">
        <path d="M8 18.5H6.8a4.3 4.3 0 0 1-.8-8.5 6 6 0 0 1 11.4-1.8A4.8 4.8 0 0 1 18 18.5h-2" />
        <path d="M12 19V11" />
        <path d="m8.5 14.5 3.5-3.5 3.5 3.5" />
      </symbol>
      <symbol id="icon-store" viewBox="0 0 24 24">
        <path d="M4 10.5h16l-1.5-6h-13L4 10.5Z" />
        <path d="M5.5 10.5V20h13v-9.5" />
        <path d="M9 20v-5.5h6V20" />
        <path d="M4 10.5c.4 1.4 1.4 2.1 2.8 2.1s2.4-.7 2.8-2.1c.4 1.4 1.4 2.1 2.8 2.1s2.4-.7 2.8-2.1c.4 1.4 1.4 2.1 2.8 2.1s2.4-.7 2.8-2.1" />
      </symbol>
    </svg>
  );
}

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 52 38" aria-hidden="true">
      <path d="M2.5 25.3C2.5 15.9 8.5 5.2 15.4 5.2c6.7 0 10.7 10.6 10.7 20.1 0 4.5-2.9 7-7.1 7H9.6c-4.1 0-7.1-2.5-7.1-7Z" fill="#2F74FF" />
      <path d="M14 25.3C14 15.9 20 5.2 26 5.2s12 10.6 12 20.1c0 4.5-2.9 7-7.1 7h-9.8c-4.2 0-7.1-2.5-7.1-7Z" fill="#155DFC" />
      <path d="M26 25.3C26 15.9 32 5.2 38.6 5.2c6.9 0 12.9 10.6 12.9 20.1 0 4.5-2.9 7-7.1 7H35c-4.2 0-9-2.5-9-7Z" fill="#2A6DF7" />
    </svg>
  );
}

function Icon({ name, className = "nav-icon" }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${name}`} />
    </svg>
  );
}

export default function Home() {
  const [view, setViewState] = useState("landing");
  const [menuOpen, setMenuOpen] = useState(false);
  const [requests, setRequests] = useState([]);
  const [selectedRequestId, setSelectedRequestId] = useState(null);
  const [orderStep, setOrderStep] = useState(1);
  const [toast, setToast] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isDraggingInvoice, setIsDraggingInvoice] = useState(false);
  const [selectedInvoiceName, setSelectedInvoiceName] = useState("");
  const [catalog, setCatalog] = useState([]);
  const [catalogSource, setCatalogSource] = useState("loading");
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetch("/api/requests")
      .then((response) => response.json())
      .then(({ requests: nextRequests }) => {
        setRequests(nextRequests);
        setSelectedRequestId(nextRequests[0]?.id || null);
      });
  }, []);

  useEffect(() => {
    fetch("/api/catalog")
      .then((response) => response.json())
      .then(({ categories, source }) => {
        setCatalog(categories || []);
        setCatalogSource(source || "unknown");
      })
      .catch(() => {
        setCatalog([]);
        setCatalogSource("unavailable");
      });
  }, []);

  const selectedRequest = useMemo(() => {
    return requests.find((request) => request.id === selectedRequestId) || requests[0];
  }, [requests, selectedRequestId]);

  const lineItems = selectedRequest?.lineItems || [];
  const quoteTotal = sumSelected(lineItems);
  const previousTotal = sumPrevious(lineItems);
  const savings = Math.max(previousTotal - quoteTotal, 0);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const catalogMatches = useMemo(() => {
    if (!catalog.length) return [];

    if (!normalizedSearch) return catalog.slice(0, 5);

    return catalog.filter((category) => {
      const item = category.best_value_item || {};
      return [category.name, item.name, item.supplier_name, item.sku]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(normalizedSearch));
    });
  }, [catalog, normalizedSearch]);
  const catalogViewItems = normalizedSearch ? catalogMatches : catalog;

  function setView(nextView) {
    setViewState(nextView);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showToast(message) {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 2200);
  }

  function setInvoiceFile(fileInput, file) {
    if (!file || !fileInput) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Upload a PDF invoice for this demo");
      return;
    }

    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
    setSelectedInvoiceName(file.name);
  }

  function handleInvoiceDrop(event) {
    event.preventDefault();
    setIsDraggingInvoice(false);
    setInvoiceFile(event.currentTarget.querySelector('input[type="file"]'), event.dataTransfer.files?.[0]);
  }

  async function handleUpload(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setUploading(true);
    const response = await fetch("/api/requests", {
      method: "POST",
      body: formData,
    });

    setUploading(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      showToast(body.error || "Upload failed");
      return;
    }

    const { request } = await response.json();
    setRequests((current) => [request, ...current]);
    setSelectedRequestId(request.id);
    setOrderStep(1);
    showToast("Invoice saved and converted into a draft reorder");
    setView("order");
  }

  const navItems = [
    ["landing", "icon-home", "Dashboard"],
    ["upload", "icon-cloud-upload", "Upload Invoice"],
    ["catalog", "icon-search", "Catalog"],
    ["order", "icon-clipboard", "Orders"],
  ];

  return (
    <>
      <div className={`app-shell ${menuOpen ? "menu-open" : ""}`}>
        <aside className="sidebar">
          <div className="brand-block">
            <BrandMark />
            <h1>MedMKP</h1>
            <button
              className="mobile-menu-button"
              type="button"
              aria-label="Open menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((isOpen) => !isOpen)}
            >
              <span></span><span></span><span></span>
            </button>
          </div>

          <nav className="nav-tabs" aria-label="Primary navigation">
            {navItems.map(([target, icon, label], index) => (
              <button key={`${label}-${index}`} className={`nav-tab ${view === target ? "active" : ""}`} onClick={() => setView(target)}>
                <Icon name={icon} />
                <strong>{label}</strong>
              </button>
            ))}
          </nav>

          <button className="upload-button" onClick={() => setView("upload")} title="Upload invoice">
            <Icon name="icon-cloud-upload" className="button-icon" />
            Upload Invoice
          </button>

          <div className="org-panel">
            <div className="avatar">AK</div>
            <div>
              <h2>Alex Kim</h2>
              <p>Operations Director</p>
            </div>
          </div>
        </aside>

        <main>
          <section className="topbar">
            <label className="global-search">
              <Icon name="icon-search" className="search-icon" />
              <input
                type="search"
                placeholder="Search therapy bands, gloves, electrodes..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
              <kbd>⌘ K</kbd>
            </label>
            {normalizedSearch && (
              <SearchResults
                results={catalogMatches}
                onViewCatalog={() => setView("catalog")}
              />
            )}
            <div className="topbar-actions">
              <button className="secondary-action compact" onClick={() => setView("catalog")}>Catalog</button>
              <button className="secondary-action compact" onClick={() => setView("supplier")}>
                <Icon name="icon-store" className="button-icon" />
                For Suppliers
              </button>
              <button className="primary-action compact" data-testid="topbar-new-upload" onClick={() => setView("upload")}>New Upload</button>
            </div>
          </section>

          {view === "landing" && (
            <section className="view active" aria-labelledby="landingHeading">
              <div className="hero-grid">
                <div className="hero-copy">
                  <p className="pill">Buyer portal for clinics</p>
                  <h2 id="landingHeading">Upload an invoice. Turn it into a reorder.</h2>
                  <p>
                    MedMKP helps PT, chiro, and rehab offices reorder medical supplies
                    from a PDF invoice without rebuilding carts line by line.
                  </p>
                  <div className="hero-actions">
                    <button className="primary-action compact" onClick={() => setView("upload")}>
                      <Icon name="icon-cloud-upload" className="button-icon" />
                      Upload Invoice
                    </button>
                    <button className="secondary-action compact" onClick={() => setView("order")}>View Draft Order</button>
                  </div>
                  <div className="trust-row">
                    <span>PDF invoice intake</span>
                    <span>Canonical product matching</span>
                    <span>Buyer review before order</span>
                  </div>
                </div>
                <div className="demo-card">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Draft Reorder</p>
                      <h3>{selectedRequest?.clinic || "Northline Rehab"} May reorder</h3>
                    </div>
                    <span className="status-chip success">Ready to review</span>
                  </div>
                  <div className="mini-stats">
                    <div><strong>{lineItems.length || 6}</strong><span>line items</span></div>
                    <div><strong>10</strong><span>buyer categories</span></div>
                    <div><strong>{money.format(quoteTotal || 3958).replace(".00", "")}</strong><span>draft total</span></div>
                  </div>
                  <div className="quote-mini-list">
                    <div><span>Resistance bands</span><strong>Matched</strong></div>
                    <div><span>Reusable electrodes</span><strong>Exact brand</strong></div>
                    <div><span>Table paper</span><strong>Ready to reorder</strong></div>
                  </div>
                </div>
              </div>

              <div className="flow-steps">
                <div><strong>1</strong><span>Clinic uploads PDF invoice</span></div>
                <div><strong>2</strong><span>MedMKP extracts line items</span></div>
                <div><strong>3</strong><span>Products are matched and grouped</span></div>
                <div><strong>4</strong><span>Buyer reviews draft order</span></div>
              </div>

              <CatalogExplorer
                catalog={catalogMatches}
                source={catalogSource}
                hasSearch={Boolean(normalizedSearch)}
              />
            </section>
          )}

          {view === "catalog" && (
            <section className="view active" aria-labelledby="catalogPageHeading">
              <CatalogExplorer
                catalog={catalogViewItems}
                source={catalogSource}
                hasSearch={Boolean(normalizedSearch)}
                titleId="catalogPageHeading"
              />
            </section>
          )}

          {view === "upload" && (
            <section className="view active" data-testid="upload-view" aria-labelledby="uploadHeading">
              <div className="section-heading first">
                <div>
                  <h2 id="uploadHeading">Upload invoice or reorder need</h2>
                  <p>Start with the buyer's easiest input: a PDF invoice from their current supplier.</p>
                </div>
                <button className="secondary-action compact" onClick={() => setView("order")}>View Draft Order</button>
              </div>

              <form onSubmit={handleUpload} className="upload-layout">
                <div
                  className={`upload-dropzone ${isDraggingInvoice ? "dragging" : ""}`}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDraggingInvoice(true);
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setIsDraggingInvoice(false);
                    }
                  }}
                  onDrop={handleInvoiceDrop}
                >
                  <div className="upload-icon"><Icon name="icon-cloud-upload" /></div>
                  <h3>{isDraggingInvoice ? "Drop invoice to upload" : "Upload a PDF invoice"}</h3>
                  <p>The demo saves the file and turns it into normalized reorder line items for buyer review.</p>
                  <input
                    className="file-input"
                    data-testid="invoice-file-input"
                    name="file"
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    onChange={(event) => setSelectedInvoiceName(event.target.files?.[0]?.name || "")}
                  />
                  <span className={`selected-file ${selectedInvoiceName ? "show" : ""}`}>
                    {selectedInvoiceName || "Drag a PDF here or choose a file"}
                  </span>
                  <button className="primary-action compact" data-testid="save-parse-request" type="submit" disabled={uploading}>{uploading ? "Uploading..." : "Create Draft Order"}</button>
                </div>

                <div className="form-card">
                  <p className="eyebrow">Buyer Context</p>
                  <label>Clinic <input name="clinic" defaultValue="Northline Rehab" /></label>
                  <label>Buyer <input name="buyer" defaultValue="Alex Kim" /></label>
                  <label>Shipping address <input name="shippingAddress" defaultValue="500 Healthcare Blvd, Nashville, TN" /></label>
                  <label>Preference
                    <select name="preference" defaultValue="Exact brand if possible, alternatives allowed">
                      <option>Exact brand if possible, alternatives allowed</option>
                      <option>Exact brand only</option>
                      <option>Best equivalent at lowest total cost</option>
                    </select>
                  </label>
                </div>
              </form>

              <RequestPicker requests={requests} selectedRequestId={selectedRequestId} onSelect={setSelectedRequestId} />
              <ExtractedTable lineItems={lineItems} />
            </section>
          )}

          {view === "admin" && (
            <section className="view active" data-testid="admin-view" aria-labelledby="adminHeading">
              <div className="section-heading first">
                <div>
                  <h2 id="adminHeading">Admin dashboard</h2>
                  <p>Parse buyer uploads, normalize line items, and send RFQs to vetted suppliers.</p>
                </div>
                <button className="primary-action compact" onClick={() => { showToast("RFQs sent to 5 vetted suppliers"); setView("quote"); }}>Send RFQs</button>
              </div>

              <div className="metric-band">
                <div><strong>{lineItems.length || 0}</strong><span>items parsed</span></div>
                <div><strong>5</strong><span>suppliers matched</span></div>
                <div><strong>3</strong><span>exact brand matches</span></div>
                <div><strong>18%</strong><span>target savings</span></div>
              </div>

              <div className="admin-layout">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Canonical Product</th>
                        <th>Extracted From</th>
                        <th>Supplier Outreach</th>
                        <th>Needed By</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item) => (
                        <tr key={item.product}>
                          <td><strong>{item.product}</strong><br /><span>{item.qty} {item.unit}</span></td>
                          <td>{item.extractedFrom}</td>
                          <td>{item.outreach}</td>
                          <td>{item.neededBy}</td>
                          <td><span className={`status-chip ${statusClass(item.status)}`}>{item.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="ops-panel">
                  <p className="eyebrow">Supplier Vetting</p>
                  <h3>RFQ shortlist</h3>
                  <div className="supplier-list">
                    {suppliers.map((supplier) => (
                      <div className="supplier-card" key={supplier.name}>
                        <strong>{supplier.name}</strong>
                        <span>{supplier.signal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}

          {view === "quote" && (
            <section className="view active" aria-labelledby="quoteHeading">
              <div className="section-heading first">
                <div>
                  <h2 id="quoteHeading">Quote builder</h2>
                  <p>Build the buyer-facing quote chart from supplier responses and highlight best value.</p>
                </div>
                <button className="primary-action compact" onClick={() => setView("approval")}>Send Quote for Approval</button>
              </div>

              <div className="quote-layout">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Best Value</th>
                        <th>Lowest Price</th>
                        <th>Fastest Delivery</th>
                        <th>Recommended</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item) => (
                        <tr key={item.product}>
                          <td><strong>{item.product}</strong><br /><span>{item.qty} {item.unit}</span></td>
                          <td>{item.bestValue}</td>
                          <td>{item.lowest}</td>
                          <td>{item.fastest}</td>
                          <td><span className="status-chip success">{item.selected.supplier}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <aside className="decision-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Quote Summary</p>
                      <h3>{selectedRequest?.clinic || "Northline Rehab"}</h3>
                    </div>
                    <span>{money.format(quoteTotal)}</span>
                  </div>
                  <div className="summary-list">
                    <div><span>Previous spend</span><strong>{money.format(previousTotal)}</strong></div>
                    <div><span>MedMKP quote</span><strong>{money.format(quoteTotal)}</strong></div>
                    <div><span>Projected savings</span><strong className="positive">{money.format(savings)}</strong></div>
                    <div><span>Suppliers used</span><strong>3</strong></div>
                  </div>
                </aside>
              </div>
            </section>
          )}

          {view === "approval" && (
            <section className="view active" aria-labelledby="approvalHeading">
              <div className="section-heading first">
                <div>
                  <h2 id="approvalHeading">Buyer quote approval</h2>
                  <p>Show the buyer exactly where they save, where brands match, and where alternatives are recommended.</p>
                </div>
                <button className="primary-action compact" onClick={() => { setOrderStep(1); showToast("Quote approved. PO sent to suppliers."); setView("order"); }}>Approve & Pay</button>
              </div>

              <div className="approval-grid">
                <div className="approval-hero">
                  <p className="eyebrow">Quote #Q-20481</p>
                  <h3>You can save {money.format(savings)} on this reorder</h3>
                  <p>4 of 6 items have exact brand matches. 2 items use vetted equivalents with faster delivery.</p>
                  <div className="approval-box">
                    <div>
                      <strong>Buyer preference</strong>
                      <p>{selectedRequest?.preference || "Exact brand if possible, alternatives allowed"}</p>
                    </div>
                    <span>Ready</span>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Selected Supplier</th>
                        <th>Total</th>
                        <th>Why</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item) => (
                        <tr key={item.product}>
                          <td><strong>{item.product}</strong><br /><span>{item.qty} {item.unit}</span></td>
                          <td>{item.selected.supplier}</td>
                          <td>{money.format(item.selected.total)}</td>
                          <td>{item.selected.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {view === "order" && (
            <section className="view active" aria-labelledby="orderHeading">
              <div className="section-heading first">
                <div>
                  <h2 id="orderHeading">Draft order</h2>
                  <p>Review the invoice-derived reorder before committing. Quotes and RFQs can stay behind the scenes for now.</p>
                </div>
                <button className="secondary-action compact" onClick={() => setView("landing")}>Back to Start</button>
              </div>

              <div className="order-layout">
                <div className="status-card">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Draft #D-20481</p>
                      <h3>{selectedRequest?.clinic || "Northline Rehab"} May reorder</h3>
                    </div>
                    <span className="status-chip success">{orderSteps[orderStep].label}</span>
                  </div>
                  <ExtractedTable lineItems={lineItems} />
                  <div className="timeline">
                    {orderSteps.map((step, index) => (
                      <div className={`timeline-step ${index <= orderStep ? "done" : "pending"}`} key={step.label}>
                        <div className="timeline-dot">{index + 1}</div>
                        <div>
                          <strong>{step.label}</strong>
                          <span>{step.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <aside className="decision-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">Buyer Action</p>
                      <h3>{money.format(quoteTotal || 0)}</h3>
                    </div>
                  </div>
                  <p className="side-copy">Confirm quantities and substitutions, then MedMKP can place the order with the best available supplier path.</p>
                  <button className="primary-action" onClick={() => { const nextStep = Math.min(orderStep + 1, orderSteps.length - 1); setOrderStep(nextStep); showToast(`Order moved to ${orderSteps[nextStep].label}`); }}>Approve Draft Order</button>
                </aside>
              </div>
            </section>
          )}

          {view === "supplier" && (
            <section className="view active" aria-labelledby="supplierHeading">
              <div className="supplier-landing">
                <p className="pill">For Suppliers</p>
                <h2 id="supplierHeading">Sell into PT, chiro, and rehab clinics through MedMKP.</h2>
                <p>
                  Supplier onboarding is coming next. For now, this portal will support catalog uploads,
                  compliance review, storefront setup, inventory updates, and order fulfillment.
                </p>
                <div className="supplier-actions">
                  <button className="primary-action compact" onClick={() => showToast("Supplier login coming soon")}>
                    Supplier Login
                  </button>
                  <button className="secondary-action compact" onClick={() => setView("landing")}>
                    Back to Buyer Portal
                  </button>
                </div>
                <div className="supplier-feature-grid">
                  <div><Icon name="icon-cloud-upload" className="button-icon" /><strong>Catalog upload</strong><span>CSV, PDF, or portal-assisted SKU intake.</span></div>
                  <div><Icon name="icon-package" className="button-icon" /><strong>Storefront setup</strong><span>Supplier profile, EIN, certifications, and service lanes.</span></div>
                  <div><Icon name="icon-clipboard" className="button-icon" /><strong>Order fulfillment</strong><span>Receive confirmed clinic orders after buyer approval.</span></div>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">{toast}</div>
      <IconSprite />
    </>
  );
}

function RequestPicker({ requests, selectedRequestId, onSelect }) {
  if (!requests.length) return null;

  return (
    <div className="request-picker">
              <label>
        Active request
        <select data-testid="active-request-picker" value={selectedRequestId || ""} onChange={(event) => onSelect(event.target.value)}>
          {requests.map((request) => (
            <option key={request.id} value={request.id}>
              {request.clinic} · {request.sourceFileName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function CatalogExplorer({ catalog, source, hasSearch, titleId = "catalogHeading" }) {
  return (
    <section className="catalog-panel" aria-labelledby={titleId}>
      <div className="section-heading">
        <div>
          <p className="eyebrow">Canonical Catalog</p>
          <h2 id={titleId}>{hasSearch ? "Search results" : "PT/Rehab reorder categories"}</h2>
          <p>Buyer-facing products are canonical. Supplier-specific SKUs sit underneath as best-value offers.</p>
        </div>
        <span className={`status-chip ${source === "medusa" ? "success" : "warning"}`}>
          {source === "medusa" ? "Medusa live" : "Fallback catalog"}
        </span>
      </div>

      <div className="catalog-grid">
        {catalog.map((category) => {
          const item = category.best_value_item || {};
          const price = typeof item.unit_price_cents === "number"
            ? money.format(item.unit_price_cents / 100)
            : "Price pending";

          return (
            <article className="catalog-card" key={category.id}>
              <div>
                <span className="catalog-category">{category.name}</span>
                <h3>{item.name || category.name}</h3>
              </div>
              <div className="catalog-meta">
                <span>{category.supplier_count || 0} supplier{category.supplier_count === 1 ? "" : "s"}</span>
                <span>{item.inventory_status?.replace("_", " ") || "stock unknown"}</span>
                <span>{item.lead_time_days ? `${item.lead_time_days} days` : "lead time pending"}</span>
              </div>
              <div className="catalog-offer">
                <span>Best value</span>
                <strong>{price}</strong>
              </div>
              <p>{item.supplier_name || "Supplier pending"}</p>
            </article>
          );
        })}
      </div>

      {!catalog.length && (
        <div className="empty-state">
          <strong>No matching products</strong>
          <span>Try therapy bands, gloves, tape, electrodes, or foam rollers.</span>
        </div>
      )}
    </section>
  );
}

function SearchResults({ results, onViewCatalog }) {
  return (
    <div className="search-results" role="region" aria-label="Catalog search results">
      <div className="search-results-header">
        <strong>{results.length ? "Matching catalog products" : "No catalog matches"}</strong>
        <button type="button" onClick={onViewCatalog}>View catalog</button>
      </div>
      {results.slice(0, 5).map((category) => {
        const item = category.best_value_item || {};
        const price = typeof item.unit_price_cents === "number"
          ? money.format(item.unit_price_cents / 100)
          : "Price pending";

        return (
          <button className="search-result" type="button" key={category.id} onClick={onViewCatalog}>
            <span>
              <strong>{item.name || category.name}</strong>
              <small>{category.name} · {item.supplier_name || "Supplier pending"}</small>
            </span>
            <em>{price}</em>
          </button>
        );
      })}
      {!results.length && (
        <p>Try therapy bands, gloves, tape, electrodes, or foam rollers.</p>
      )}
    </div>
  );
}

function ExtractedTable({ lineItems }) {
  return (
    <div className="table-wrap extracted-preview">
      <table>
        <thead>
          <tr>
            <th>Extracted Item</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Old Vendor</th>
            <th>Old Unit Price</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <tr key={item.product}>
              <td><strong>{item.product}</strong><br /><span>{item.extractedFrom}</span></td>
              <td>{item.qty}</td>
              <td>{item.unit}</td>
              <td>{item.oldVendor}</td>
              <td>{money.format(item.oldUnitPrice)}</td>
              <td><span className={`status-chip ${statusClass(item.status)}`}>{item.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
