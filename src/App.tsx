import { useMemo, useState } from 'react'
import InboxPage from './features/inbox/InboxPage'
import HistoryPage from './features/history/HistoryPage'
import CockpitPage from './features/cockpit/CockpitPage'
import PacksPage from './features/packs/PacksPage'
import SettingsPage from './features/settings/SettingsPage'
import useCardsHydration from './features/cards/useCardsHydration'

type TabKey = 'cockpit' | 'inbox' | 'history' | 'packs' | 'settings'

export default function App() {
  const [tab, setTab] = useState<TabKey>('cockpit')
  useCardsHydration()

  const content = useMemo(() => {
    switch (tab) {
      case 'cockpit':
        return <CockpitPage />
      case 'inbox':
        return <InboxPage />
      case 'history':
        return <HistoryPage />
      case 'packs':
        return <PacksPage />
      case 'settings':
        return <SettingsPage />
      default:
        return null
    }
  }, [tab])

  return (
    <div className="min-h-dvh">
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-6">{content}</div>
      <BottomTabs tab={tab} onChange={setTab} />
    </div>
  )
}

function BottomTabs({ tab, onChange }: { tab: TabKey; onChange: (t: TabKey) => void }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-zinc-800 bg-zinc-950/90 backdrop-blur">
      <div className="mx-auto grid max-w-5xl grid-cols-5 px-2 py-2 text-xs">
        <TabButton active={tab === 'cockpit'} onClick={() => onChange('cockpit')}>
          Cockpit
        </TabButton>
        <TabButton active={tab === 'inbox'} onClick={() => onChange('inbox')}>
          Inbox
        </TabButton>
        <TabButton active={tab === 'history'} onClick={() => onChange('history')}>
          History
        </TabButton>
        <TabButton active={tab === 'packs'} onClick={() => onChange('packs')}>
          Packs
        </TabButton>
        <TabButton active={tab === 'settings'} onClick={() => onChange('settings')}>
          Settings
        </TabButton>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      className={[
        'rounded-xl px-2 py-3 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500',
        active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
      ].join(' ')}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}
