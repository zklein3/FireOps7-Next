'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import StationsStep from './StationsStep'
import ApparatusStep from './ApparatusStep'
import CompartmentsStep from './CompartmentsStep'
import ItemsStep from './ItemsStep'
import InventoryStep from './InventoryStep'
import MedicalAdminClient from '../medical/MedicalAdminClient'
import HelpText from '@/components/HelpText'

const DEPT_SETUP_TABS = [
  { id: 'stations',     label: 'Stations'      },
  { id: 'apparatus',    label: 'Apparatus'     },
  { id: 'compartments', label: 'Compartments'  },
  { id: 'items',        label: 'Items'         },
  { id: 'inventory',    label: 'Inventory'     },
]


export default function SetupFlowClient({
  department,
  stations,
  apparatus,
  apparatusTypes,
  personnel,
  roles,
  compartments,
  usageMap,
  assignmentMap,
  apparatusForCompartments,
  categories,
  items,
  assets,
  templates,
  steps,
  departmentId,
  moduleIso,
  customFieldDefs,
  medicalSupplyTypes,
  canManageDeptSetup,
  canManageMedical,
  moduleMedical,
  medicalAdminData,
}: {
  department: { id: string; name: string }
  stations: any[]
  apparatus: any[]
  apparatusTypes: any[]
  personnel: any[]
  roles: any[]
  compartments: any[]
  usageMap: Record<string, number>
  assignmentMap: Record<string, string[]>
  apparatusForCompartments: any[]
  categories: any[]
  items: any[]
  assets: any[]
  templates: any[]
  steps: any[]
  departmentId: string
  moduleIso: boolean
  customFieldDefs: Record<string, { id: string; item_id: string; field_label: string; field_order: number }[]>
  medicalSupplyTypes: { id: string; name: string; category: string; unit_of_measure: string }[]
  canManageDeptSetup: boolean
  canManageMedical: boolean
  moduleMedical: boolean
  medicalAdminData: {
    supplyTypes: any[]
    storerooms: any[]
    stations: any[]
    apparatus: any[]
    apparatusCompartments: any[]
    storeroomInventory: any[]
    lots: any[]
    bagTemplates: any[]
    templateItems: any[]
    bagDeployments: any[]
    moduleMedicalControlled: boolean
  }
}) {
  const searchParams = useSearchParams()

  const TABS = [
    ...(canManageDeptSetup ? DEPT_SETUP_TABS : []),
    ...(moduleMedical && canManageMedical ? [{ id: 'medical', label: 'Medical' }] : []),
  ]

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') ?? TABS[0]?.id ?? 'stations')
  const effectiveTab = TABS.some(t => t.id === activeTab) ? activeTab : (TABS[0]?.id ?? 'stations')

  const helpProps = { showHelp: false, helpResetKey: 0 }

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Equipment</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{department.name}</p>
        </div>
      </div>

      <HelpText className="mb-4">
        Set these up roughly in order: Stations, then Apparatus (assigned to a station), then Compartments (on an
        apparatus), then Items — each step depends on the one before it existing first.
      </HelpText>

      {/* Tabs — mobile: horizontal scroll, desktop: left rail */}
      <div className="md:hidden flex gap-2 overflow-x-auto pb-2 mb-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              effectiveTab === tab.id
                ? 'bg-red-700 text-white'
                : 'bg-white border border-zinc-200 text-zinc-600 hover:border-red-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-6 items-start">
        {/* Left tab rail — desktop */}
        <div className="hidden md:flex flex-col w-44 shrink-0 gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                effectiveTab === tab.id
                  ? 'bg-red-700 text-white'
                  : 'text-zinc-600 hover:bg-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {effectiveTab === 'stations' && (
            <StationsStep stations={stations} departmentId={departmentId} {...helpProps} />
          )}
          {effectiveTab === 'apparatus' && (
            <ApparatusStep
              apparatus={apparatus}
              stations={stations}
              apparatusTypes={apparatusTypes}
              departmentId={departmentId}
              {...helpProps}
            />
          )}
          {effectiveTab === 'compartments' && (
            <CompartmentsStep
              compartments={compartments}
              usageMap={usageMap}
              assignmentMap={assignmentMap}
              apparatus={apparatusForCompartments}
              departmentId={departmentId}
              {...helpProps}
            />
          )}
          {effectiveTab === 'items' && (
            <ItemsStep
              categories={categories}
              items={items}
              assets={assets}
              templates={templates}
              steps={steps}
              departmentId={departmentId}
              apparatusOptions={apparatusForCompartments.map(a => ({
                id: a.id,
                label: a.unit_number + (a.apparatus_name ? ` — ${a.apparatus_name}` : ''),
              }))}
              customFieldDefs={customFieldDefs}
              initialSubTab={searchParams.get('sub') ?? undefined}
              {...helpProps}
            />
          )}
          {effectiveTab === 'inventory' && (
            <InventoryStep
              apparatus={apparatus}
              allItems={items}
              allCategories={categories}
              medicalSupplyTypes={medicalSupplyTypes}
            />
          )}
          {effectiveTab === 'medical' && (
            <MedicalAdminClient
              supplyTypes={medicalAdminData.supplyTypes}
              storerooms={medicalAdminData.storerooms}
              stations={medicalAdminData.stations}
              apparatus={medicalAdminData.apparatus}
              apparatusCompartments={medicalAdminData.apparatusCompartments}
              storeroomInventory={medicalAdminData.storeroomInventory}
              lots={medicalAdminData.lots}
              bagTemplates={medicalAdminData.bagTemplates}
              templateItems={medicalAdminData.templateItems}
              bagDeployments={medicalAdminData.bagDeployments}
              departmentId={departmentId}
              moduleMedicalControlled={medicalAdminData.moduleMedicalControlled}
            />
          )}
        </div>
      </div>
    </div>
  )
}
