'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Layout } from 'react-grid-layout';
import DashboardGrid from '@/components/dashboard/DashboardGrid';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import {
  updateDashboardLayout,
  addKlipToDashboard,
  removeKlipFromDashboard,
  deleteDashboard,
} from '@/lib/actions/dashboard';
import EditDashboardModal from './EditDashboardModal';

interface KlipConfig {
  x_field?: string;
  y_field?: string;
  colors?: string[];
  show_legend?: boolean;
  show_grid?: boolean;
  prefix?: string;
  suffix?: string;
  columns?: { key: string; label: string }[];
}

interface Klip {
  id: string;
  title: string;
  type: 'bar' | 'line' | 'pie' | 'area' | 'number' | 'table';
  description?: string;
  cached_data?: Record<string, unknown>[] | null;
  config: KlipConfig;
}

interface DashboardKlip {
  id: string;
  klip_id: string;
  dashboard_id: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  klip: Klip;
}

interface Dashboard {
  id: string;
  title: string;
  description?: string;
  is_public: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  dashboard_klips: DashboardKlip[];
}

interface DashboardEditorProps {
  dashboard: Dashboard;
  allKlips: Klip[];
}

export default function DashboardEditor({
  dashboard,
  allKlips,
}: DashboardEditorProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [showAddKlip, setShowAddKlip] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [currentLayout, setCurrentLayout] = useState<Layout | null>(null);

  // Klips already on this dashboard
  const dashboardKlipIds = new Set(
    dashboard.dashboard_klips.map((dk) => dk.klip_id)
  );

  // Available klips (not yet on this dashboard)
  const availableKlips = allKlips.filter(
    (klip) => !dashboardKlipIds.has(klip.id)
  );

  // Build grid items from dashboard_klips
  const gridItems = dashboard.dashboard_klips.map((dk) => ({
    id: dk.klip_id,
    klip: dk.klip,
    layout: {
      x: dk.position_x,
      y: dk.position_y,
      w: dk.width,
      h: dk.height,
    },
  }));

  const handleLayoutChange = useCallback((layout: Layout) => {
    setCurrentLayout(layout);
  }, []);

  const handleSaveLayout = () => {
    if (!currentLayout || !Array.isArray(currentLayout)) return;

    const layouts = (currentLayout as unknown as { i: string; x: number; y: number; w: number; h: number }[]).map(
      (item) => ({
        klip_id: item.i,
        layout: { x: item.x, y: item.y, w: item.w, h: item.h },
      })
    );

    startTransition(async () => {
      await updateDashboardLayout(dashboard.id, layouts);
      setEditing(false);
      router.refresh();
    });
  };

  const handleAddKlip = (klipId: string) => {
    startTransition(async () => {
      await addKlipToDashboard(dashboard.id, klipId);
      setShowAddKlip(false);
      router.refresh();
    });
  };

  const handleRemoveKlip = (klipId: string) => {
    startTransition(async () => {
      await removeKlipFromDashboard(dashboard.id, klipId);
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteDashboard(dashboard.id);
    });
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-hero-grey-black truncate">
              {dashboard.title}
            </h1>
            {dashboard.is_public && <Badge variant="success">Publiek</Badge>}
          </div>
          {dashboard.description && (
            <p className="mt-1 text-sm text-hero-grey-regular">
              {dashboard.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
              >
                Annuleren
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon="save"
                loading={isPending}
                onClick={handleSaveLayout}
              >
                Layout opslaan
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon="edit"
                onClick={() => setShowEditModal(true)}
              >
                Bewerken
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="tune"
                onClick={() => setEditing(true)}
              >
                Layout aanpassen
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon="add"
                onClick={() => setShowAddKlip(true)}
              >
                Klip toevoegen
              </Button>
              <Button
                variant="danger"
                size="sm"
                icon="delete"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Verwijderen
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Dashboard grid */}
      {gridItems.length === 0 ? (
        <Card>
          <EmptyState
            icon="widgets"
            title="Geen klips"
            description="Dit dashboard heeft nog geen klips. Voeg een klip toe om te beginnen."
            action={
              <Button
                variant="primary"
                size="sm"
                icon="add"
                onClick={() => setShowAddKlip(true)}
              >
                Klip toevoegen
              </Button>
            }
          />
        </Card>
      ) : (
        <DashboardGrid
          items={gridItems}
          editable={editing}
          onLayoutChange={handleLayoutChange}
        />
      )}

      {/* Remove klip buttons when editing */}
      {editing && gridItems.length > 0 && (
        <div className="mt-4">
          <Card title="Klips op dit dashboard">
            <div className="flex flex-wrap gap-2">
              {dashboard.dashboard_klips.map((dk) => (
                <div
                  key={dk.klip_id}
                  className="inline-flex items-center gap-2 rounded-full bg-hero-blue-hairline px-3 py-1.5 text-xs text-hero-grey-black"
                >
                  <span>{dk.klip.title}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveKlip(dk.klip_id)}
                    className="text-hero-grey-regular hover:text-red-500 transition-colors cursor-pointer"
                    title="Verwijder klip"
                  >
                    <span className="material-symbols-rounded text-[16px]">
                      close
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Add klip modal */}
      <Modal
        open={showAddKlip}
        onClose={() => setShowAddKlip(false)}
        title="Klip toevoegen"
        size="lg"
      >
        {availableKlips.length === 0 ? (
          <EmptyState
            icon="search_off"
            title="Geen klips beschikbaar"
            description="Alle klips zijn al aan dit dashboard toegevoegd, of je hebt nog geen klips aangemaakt."
          />
        ) : (
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
            {availableKlips.map((klip) => (
              <div
                key={klip.id}
                className="flex items-center justify-between rounded-lg border border-hero-grey-light p-3 hover:bg-hero-blue-hairline transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-hero-grey-black truncate">
                      {klip.title}
                    </span>
                    <Badge variant="info">{klip.type}</Badge>
                  </div>
                  {klip.description && (
                    <p className="mt-0.5 text-xs text-hero-grey-regular truncate">
                      {klip.description}
                    </p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="add"
                  loading={isPending}
                  onClick={() => handleAddKlip(klip.id)}
                >
                  Toevoegen
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Edit dashboard modal */}
      <EditDashboardModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        dashboard={dashboard}
      />

      {/* Delete confirmation modal */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Dashboard verwijderen"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-hero-grey-regular">
            Weet je zeker dat je het dashboard &ldquo;{dashboard.title}&rdquo;
            wilt verwijderen? Dit kan niet ongedaan worden gemaakt.
          </p>
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Annuleren
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="delete"
              loading={isPending}
              onClick={handleDelete}
            >
              Verwijderen
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
