"use client";

import { useState } from "react";
import {
  DoorOpen,
  User,
  Stethoscope,
  Clock,
  Wrench,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Card,
  Badge,
  StatCard,
  Avatar,
} from "@/components/ui";
import { RoomStatus, RoomType } from "@/types";
import { formatTime } from "@/lib/utils";
import { useModuleAccess } from "@/modules/core/hooks";
import { useRooms, useBranches, useDeleteRoom } from "@/hooks/use-queries";
import { useAuth } from "@/lib/auth-context";
import { LoadingSpinner } from "@/components/ui/loading";

const statusConfig: Record<string, { label: string; dotColor: string; bgColor: string; variant: "success" | "danger" | "warning" | "default" }> = {
  [RoomStatus.AVAILABLE]: { label: "Available", dotColor: "bg-emerald-400", bgColor: "bg-emerald-50 border-emerald-100", variant: "success" },
  [RoomStatus.OCCUPIED]: { label: "Occupied", dotColor: "bg-red-400", bgColor: "bg-red-50 border-red-100", variant: "danger" },
  [RoomStatus.CLEANING]: { label: "Cleaning", dotColor: "bg-amber-400", bgColor: "bg-amber-50 border-amber-100", variant: "warning" },
  [RoomStatus.MAINTENANCE]: { label: "Maintenance", dotColor: "bg-stone-400", bgColor: "bg-stone-50 border-stone-200", variant: "default" },
};

const typeIcons: Record<string, React.ReactNode> = {
  [RoomType.CONSULTATION]: <Stethoscope className="w-5 h-5" />,
  [RoomType.PROCEDURE]: <Sparkles className="w-5 h-5" />,
  [RoomType.WAITING]: <Clock className="w-5 h-5" />,
  [RoomType.RECOVERY]: <User className="w-5 h-5" />,
};

export default function RoomsPage() {
  const access = useModuleAccess("MOD-ROOMS");
  const [activeBranch, setActiveBranch] = useState("all");

  const { data: roomsResponse, isLoading: isLoadingRooms } = useRooms();
  const rooms = (roomsResponse?.data || []) as Array<{ id: string; name: string; branchId: string; status: string; type: string; capacity: number; currentPatientName?: string; currentDoctorName?: string; occupiedSince?: string }>;

  const { data: branchesResponse, isLoading: isLoadingBranches } = useBranches();
  const branches = (branchesResponse?.data || []) as Array<{ id: string; name: string; isActive: boolean }>;

  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const deleteRoom = useDeleteRoom();

  function handleDeleteRoom(room: { id: string; name: string; status: string }) {
    if (room.status === RoomStatus.OCCUPIED) {
      window.alert(`${room.name} is currently occupied. Free it before deleting.`);
      return;
    }
    if (!window.confirm(`Delete ${room.name}? This permanently removes the room. Appointments keep their history but lose the room link.`)) return;
    deleteRoom.mutate(room.id, {
      onError: () => window.alert(`Could not delete ${room.name}. Please try again.`),
    });
  }

  const filteredRooms = activeBranch === "all"
    ? rooms
    : rooms.filter((r) => r.branchId === activeBranch);

  const available = rooms.filter((r) => r.status === RoomStatus.AVAILABLE).length;
  const occupied = rooms.filter((r) => r.status === RoomStatus.OCCUPIED).length;

  if (isLoadingRooms || isLoadingBranches) {
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
    <div className="space-y-4 sm:space-y-6 animate-fade-in" data-id="APPT-ROOM-ALLOCATE">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center">
          <DoorOpen className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-stone-900">Rooms</h1>
          <p className="text-sm text-stone-400 mt-0.5">Manage clinic rooms, availability, and assignments</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard label="Total Rooms" value={rooms.length} icon={<DoorOpen className="w-6 h-6" />} color="primary" />
        <StatCard label="Available" value={available} icon={<DoorOpen className="w-6 h-6" />} color="success" />
        <StatCard label="Occupied" value={occupied} icon={<DoorOpen className="w-6 h-6" />} color="danger" />
      </div>

      {/* Branch Filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveBranch("all")}
          className={`px-4 py-2 text-sm font-medium rounded-full transition-all cursor-pointer ${
            activeBranch === "all"
              ? "bg-blue-600 text-white shadow-sm"
              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
          }`}
        >
          All Branches
        </button>
        {branches.filter((b) => b.isActive).map((branch) => (
          <button
            key={branch.id}
            onClick={() => setActiveBranch(branch.id)}
            className={`px-4 py-2 text-sm font-medium rounded-full transition-all cursor-pointer ${
              activeBranch === branch.id
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
            }`}
          >
            {branch.name.replace("DentaCore ", "")}
          </button>
        ))}
      </div>

      {/* Room Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
        {filteredRooms.map((room) => {
          const config = statusConfig[room.status];
          const branch = branches.find((b) => b.id === room.branchId);

          return (
            <Card
              key={room.id}
              hover
              padding="md"
              className={`animate-fade-in border ${config.bgColor} p-3 sm:p-4`}
            >
              <div className="flex flex-col gap-2.5 sm:gap-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/80 flex items-center justify-center text-stone-600 shrink-0">
                      {typeIcons[room.type] || <DoorOpen className="w-5 h-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-stone-800 text-sm truncate" title={room.name}>{room.name}</p>
                      <p className="text-[11px] sm:text-xs text-stone-400 truncate" title={branch?.name}>{branch?.name.replace("DentaCore ", "") || "Unknown"}</p>
                    </div>
                  </div>
                  {/* Status Dot */}
                  <span className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${config.dotColor} animate-pulse shrink-0 mt-1`} />
                </div>

                {/* Status Badge */}
                <Badge variant={config.variant} dot>{config.label}</Badge>

                {/* Occupied Info */}
                {room.status === RoomStatus.OCCUPIED && room.currentPatientName && (
                  <div className="space-y-2 pt-2.5 sm:pt-3 border-t border-stone-200/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <Avatar name={room.currentPatientName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-medium text-stone-700 truncate" title={room.currentPatientName}>{room.currentPatientName}</p>
                        <p className="text-[10px] sm:text-xs text-stone-400">Patient</p>
                      </div>
                    </div>
                    {room.currentDoctorName && (
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar name={room.currentDoctorName} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium text-stone-700 truncate" title={room.currentDoctorName}>{room.currentDoctorName}</p>
                          <p className="text-[10px] sm:text-xs text-stone-400">Dentist</p>
                        </div>
                      </div>
                    )}
                    {room.occupiedSince && (
                      <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-stone-400">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">Since {formatTime(room.occupiedSince)}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Maintenance info */}
                {room.status === RoomStatus.MAINTENANCE && (
                  <div className="flex items-center gap-2 pt-2.5 sm:pt-3 border-t border-stone-200/50 text-xs sm:text-sm text-stone-500">
                    <Wrench className="w-4 h-4 shrink-0" />
                    <span>Under maintenance</span>
                  </div>
                )}

                {/* Cleaning info */}
                {room.status === RoomStatus.CLEANING && (
                  <div className="flex items-center gap-2 pt-2.5 sm:pt-3 border-t border-stone-200/50 text-xs sm:text-sm text-stone-500">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Being cleaned</span>
                  </div>
                )}

                {/* Capacity */}
                <div className="text-[11px] sm:text-xs text-stone-400">
                  Capacity: {room.capacity} {room.capacity === 1 ? "person" : "people"}
                </div>

                {canManage && (
                  <button
                    onClick={() => handleDeleteRoom(room)}
                    disabled={deleteRoom.isPending}
                    className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] sm:text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg py-1.5 transition-colors disabled:opacity-50"
                    aria-label={`Delete ${room.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
