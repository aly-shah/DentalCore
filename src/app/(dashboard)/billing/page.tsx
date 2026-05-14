"use client";

import { useState } from "react";
import {
  DollarSign,
  Clock,
  CheckCircle,
  AlertTriangle,
  Plus,
  CreditCard,
  FileText,
  User,
  Download,
  Printer,
} from "lucide-react";
import {
  Button,
  Badge,
  Card,
  StatCard,
  SearchInput,
} from "@/components/ui";
import { invoiceStatusColors } from "@/lib/constants";
import { useInvoices } from "@/hooks/use-queries";
import { LoadingSpinner } from "@/components/ui/loading";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import { CreateInvoiceModal } from "@/components/billing/create-invoice-modal";
import { PaymentModal } from "@/components/billing/payment-modal";
import { useModuleAccess } from "@/modules/core/hooks";
import type { Invoice } from "@/types";

const statusBadgeVariant = (status: string) =>
  (invoiceStatusColors[status] || "default") as
    | "success"
    | "warning"
    | "danger"
    | "info"
    | "default";

export default function BillingPage() {
  const access = useModuleAccess("MOD-BILLING");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const { data: invoicesResponse, isLoading } = useInvoices();
  const invoices = (invoicesResponse?.data || []) as Invoice[];

  const filters = ["ALL", "PENDING", "PAID", "PARTIAL", "OVERDUE", "DRAFT"];

  const filtered = invoices.filter((inv) => {
    const matchesSearch =
      inv.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
      inv.patientName.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = activeFilter === "ALL" || inv.status === activeFilter;
    return matchesSearch && matchesStatus;
  });

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const pending = invoices
    .filter((inv) => inv.status === "PENDING")
    .reduce((sum, inv) => sum + inv.total, 0);
  const collected = invoices
    .filter((inv) => inv.status === "PAID")
    .reduce((sum, inv) => sum + inv.total, 0);
  const overdue = invoices
    .filter((inv) => inv.status === "OVERDUE")
    .reduce((sum, inv) => sum + inv.total, 0);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><LoadingSpinner size="lg" /></div>;
  }

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  return (
    <div data-id="BILL-INVOICE" className="animate-fade-in space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Billing</h1>
          <p className="text-sm text-stone-500 mt-1">
            Manage invoices and collect payments
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" iconLeft={<Download className="w-3.5 h-3.5" />} onClick={() => downloadCSV(filtered.map(inv => ({ Invoice: inv.invoiceNumber, Patient: inv.patientName, Status: inv.status, Total: inv.total, Date: formatDate(inv.createdAt) })), "invoices")}>Export</Button>
          <Button
            iconLeft={<Plus className="w-4 h-4" />}
            onClick={() => setShowCreateModal(true)}
          >
            New Invoice
          </Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(totalRevenue)}
          icon={<DollarSign className="w-5 h-5" />}
          color="primary"
          trend={12}
          trendLabel="vs last month"
        />
        <StatCard
          label="Pending"
          value={formatCurrency(pending)}
          icon={<Clock className="w-5 h-5" />}
          color="warning"
        />
        <StatCard
          label="Collected"
          value={formatCurrency(collected)}
          icon={<CheckCircle className="w-5 h-5" />}
          color="success"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(overdue)}
          icon={<AlertTriangle className="w-5 h-5" />}
          color="danger"
        />
      </div>

      {/* Search + Filter Chips */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
        <SearchInput
          placeholder="Search invoices or patients..."
          value={search}
          onChange={setSearch}
          className="w-full sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {filters.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-all cursor-pointer ${
                activeFilter === f
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-stone-100 text-stone-500 hover:bg-stone-200"
              }`}
            >
              {f === "ALL" ? "All" : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Invoice Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {filtered.map((invoice) => (
          <Card
            key={invoice.id}
            padding="lg"
            hover
            className="animate-fade-in"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-stone-900">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-stone-400">
                    {formatDate(invoice.createdAt)}
                  </p>
                </div>
              </div>
              <Badge variant={statusBadgeVariant(invoice.status)} dot>
                {invoice.status}
              </Badge>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-stone-500" />
              </div>
              <span className="text-sm text-stone-700">
                {invoice.patientName}
              </span>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-stone-100">
              <p className="text-xl font-semibold text-stone-900">
                {formatCurrency(invoice.total)}
              </p>
              <div className="flex gap-2">
                {invoice.status !== "PAID" && invoice.status !== "DRAFT" && (
                  <Button
                    size="sm"
                    variant="primary"
                    iconLeft={<CreditCard className="w-3.5 h-3.5" />}
                    onClick={() => {
                      setSelectedInvoice(invoice);
                      setShowPaymentModal(true);
                    }}
                  >
                    Collect
                  </Button>
                )}
                {(invoice.status === "PAID" || invoice.status === "DRAFT") && (
                  <Button
                    size="sm"
                    variant="outline"
                    iconLeft={<FileText className="w-3.5 h-3.5" />}
                    onClick={() => setSelectedInvoice(invoice)}
                  >
                    View
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(`/api/billing/invoices/${invoice.id}/print`, "_blank")}
                  title="Print / Save as PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-stone-200 mx-auto mb-3" />
          <p className="text-sm text-stone-400">No invoices found</p>
        </div>
      )}

      {/* Modals */}
      <CreateInvoiceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      {selectedInvoice && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedInvoice(null);
          }}
          invoice={selectedInvoice}
        />
      )}
    </div>
  );
}
