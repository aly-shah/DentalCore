"use client";

import { useModuleAccess } from "@/modules/core/hooks";
import {
  Package as PackageIcon,
  Plus,
  Clock,
  Users,
  Sparkles,
} from "lucide-react";
import {
  Button,
  Card,
  Badge,
  StatCard,
} from "@/components/ui";
import { usePackages } from "@/hooks/use-queries";
import type { Package } from "@/types";
import { formatCurrency } from "@/lib/utils";

export default function PackagesPage() {
  const access = useModuleAccess("MOD-BILLING");
  const { data: packagesResponse, isLoading } = usePackages();
  const packages = (packagesResponse?.data || []) as Package[];

  if (!access.canView) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        You don&apos;t have access to this module.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-stone-500">
        Loading packages...
      </div>
    );
  }

  const totalSubscribers = packages.reduce((sum, p) => sum + (p.subscriberCount || 0), 0);
  const activePackages = packages.filter((p) => p.isActive).length;

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="ADMIN-PACKAGES">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Packages</h1>
          <p className="text-sm text-stone-500 mt-1">Treatment bundles for your patients</p>
        </div>
        <Button iconLeft={<Plus className="w-4 h-4" />}>Add Package</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Total Packages" value={packages.length} icon={<PackageIcon className="w-6 h-6" />} color="primary" />
        <StatCard label="Active" value={activePackages} icon={<Sparkles className="w-6 h-6" />} color="success" />
        <StatCard label="Subscribers" value={totalSubscribers} icon={<Users className="w-6 h-6" />} color="info" />
      </div>

      {/* Package Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        {packages.map((pkg) => (
          <Card key={pkg.id} hover padding="lg" className="animate-fade-in">
            <div className="flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-stone-800 text-lg truncate min-w-0">{pkg.name}</p>
                  <Badge variant={pkg.isActive ? "success" : "danger"} dot className="mt-1">
                    {pkg.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(pkg.price)}</p>
              </div>

              {/* Description */}
              <p className="text-sm text-stone-500">{pkg.description}</p>

              {/* Treatments list */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Includes</p>
                {(pkg.treatments ?? []).map((t) => (
                  <div key={t.treatmentId} className="flex items-center justify-between text-sm">
                    <span className="text-stone-600 truncate min-w-0">{t.treatmentName}</span>
                    <Badge variant="default">{t.sessions} sessions</Badge>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-stone-100">
                <div className="flex items-center gap-1.5 text-sm text-stone-500">
                  <Clock className="w-4 h-4" />
                  <span>{pkg.validityDays} days</span>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-stone-500">
                  <Users className="w-4 h-4" />
                  <span>{pkg.subscriberCount} subscribers</span>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
