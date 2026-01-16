export type GithubRepo = {
  id: number
  full_name: string
  private: boolean
  updated_at: string
}

export type GithubCommit = {
  sha: string
  html_url: string
  commit: {
    message: string
    author: { name: string; date: string } | null
  }
}

async function githubFetch<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API error ${res.status}: ${text}`)
  }
  return (await res.json()) as T
}

export async function listPublicRepos(token: string): Promise<GithubRepo[]> {
  const repos = await githubFetch<GithubRepo[]>('/user/repos?per_page=100&sort=updated', token)
  return repos.filter(r => !r.private)
}

export async function listCommitsForRepo(
  token: string,
  fullName: string,
  perPage: number
): Promise<GithubCommit[]> {
  const [owner, repo] = fullName.split('/')
  if (!owner || !repo) throw new Error(`Invalid repo full name: ${fullName}`)
  return githubFetch<GithubCommit[]>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?per_page=${perPage}`,
    token
  )
}
