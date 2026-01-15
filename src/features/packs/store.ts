import { create } from 'zustand'

type PacksState = {
  selectedRepos: string[]
  toggleRepo: (fullName: string) => void
  clearRepos: () => void
}

export const usePacksStore = create<PacksState>(set => ({
  selectedRepos: [],
  toggleRepo: (fullName: string) =>
    set(curr => {
      const has = curr.selectedRepos.includes(fullName)
      return { selectedRepos: has ? curr.selectedRepos.filter(r => r !== fullName) : [...curr.selectedRepos, fullName] }
    }),
  clearRepos: () => set({ selectedRepos: [] })
}))

