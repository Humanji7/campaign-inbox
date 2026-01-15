function mustGetEnv(name: string): string {
  const value = import.meta.env[name] as string | undefined
  if (!value) throw new Error(`Missing env var: ${name}`)
  return value
}

export const env = {
  supabaseUrl: () => mustGetEnv('VITE_SUPABASE_URL'),
  supabaseAnonKey: () => mustGetEnv('VITE_SUPABASE_ANON_KEY')
}

