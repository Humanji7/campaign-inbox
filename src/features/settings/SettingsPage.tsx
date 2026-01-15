import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  return (
    <div>
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="mt-6 rounded-2xl border border-zinc-800 p-4">
        <div className="text-sm text-zinc-400">Signed in</div>
        <div className="mt-1 text-sm">{email ?? '—'}</div>
        <button
          className="mt-4 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
          onClick={signOut}
          type="button"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

