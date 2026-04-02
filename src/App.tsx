import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './App.css'
const BASE_URL = import.meta.env.VITE_API_URL as string;

interface AuditLog {
  id: number
  timestamp: string
  event_type: string
  workspace_name: string
  workspace_environment: string
  user_name: string
  user_email: string
  resource_name: string
  resource_type: string
  resource_path: string
  details: Record<string, unknown>
}

interface RecipeConnection {
  recipe_id: number
  recipe_name: string
  connection_id: number
  connection_name: string
  application: string
}

interface Connection {
  application: string
  name: string
  authorization_status: string
}

interface Job {
  status: string
  is_error: string
  completed_at: string
  started_at: string
  recipe_id: string
}

interface Project {
  name: string
  id: string
  folder_id: string
}

interface Folder {
  id: number
  name: string
  parent_id: number | null
  project_id: number
  is_project: boolean
  created_at: string
  updated_at: string
}

interface Recipe {
  id: number
  name: string
  running: boolean
  job_succeeded_count: number
  job_failed_count: number
  project_id: number
  folder_id: number
}

function App() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [recipeConnections, setRecipeConnections] = useState<RecipeConnection[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditUserFilter, setAuditUserFilter] = useState('all')
  const [auditEventFilter, setAuditEventFilter] = useState('all')
  const [auditExpanded, setAuditExpanded] = useState<Set<number>>(new Set())
  const [activeTab, setActiveTab] = useState<'dashboard' | 'dependency' | 'audit'>('dashboard')
  const [loading, setLoading] = useState(true)
  const [selectedRecipe, setSelectedRecipe] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [selectedNode, setSelectedNode] = useState<{ type: 'project' | 'folder'; id: number } | null>(null)
  const [lastSynced, setLastSynced] = useState<string | null>(null)
  const [expandedApps, setExpandedApps] = useState<Set<string>>(new Set())
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set())
  const [expandedProjects, setExpandedProjects] = useState<Set<number>>(new Set())
  const [folderSearch, setFolderSearch] = useState('')
  const [isFolderTreeExpanded, setIsFolderTreeExpanded] = useState(false)
  const [selectedApp, setSelectedApp] = useState<string | null>(null)
  const [appSearch, setAppSearch] = useState('')
  const [appSearchOpen, setAppSearchOpen] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const folderDropdownRef = useRef<HTMLDivElement>(null)
  const appSearchRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setFetchError(null)

      const safeJson = async (url: string) => {
        try {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
          return await res.json()
        } catch (e) {
          console.error(`Failed to fetch ${url}:`, e)
          return []
        }
      }

      const [proj, conns, jobsData, recs, fols, rcs, audit] = await Promise.all([
        safeJson(`${BASE_URL}/api/projects`),
        safeJson(`${BASE_URL}/api/connections`),
        safeJson(`${BASE_URL}/api/jobs`),
        safeJson(`${BASE_URL}/api/recipes`),
        safeJson(`${BASE_URL}/api/folders`),
        safeJson(`${BASE_URL}/api/recipe_connections`),
        safeJson(`${BASE_URL}/api/audit_logs`),
      ])

      setProjects(Array.isArray(proj) ? proj : [])
      setConnections(Array.isArray(conns) ? conns : [])
      setJobs(Array.isArray(jobsData) ? jobsData : [])
      setRecipes(Array.isArray(recs) ? recs : [])
      setFolders(Array.isArray(fols) ? fols : [])
      setRecipeConnections(Array.isArray(rcs) ? rcs : [])
      setAuditLogs(Array.isArray(audit) ? audit : [])
      setLastSynced(new Date().toLocaleString())
    } catch (error) {
      console.error('Error fetching data:', error)
      setFetchError(String(error))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (folderDropdownRef.current && !folderDropdownRef.current.contains(event.target as Node)) {
        setIsFolderTreeExpanded(false)
      }
      if (appSearchRef.current && !appSearchRef.current.contains(event.target as Node)) {
        setAppSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // ── Dashboard logic ──────────────────────────────────────────
  const connectionStats = {
    total: connections.length,
    active: connections.filter(c => c.authorization_status === 'success').length,
    failed: connections.filter(c => c.authorization_status !== 'success' && c.authorization_status).length
  }

  const filteredJobs = jobs.filter(job => {
    let match = true
    if (selectedRecipe !== 'all' && job.recipe_id !== selectedRecipe) match = false
    if (startDate && job.completed_at && new Date(job.completed_at) < new Date(startDate)) match = false
    if (endDate && job.completed_at && new Date(job.completed_at) > new Date(endDate)) match = false
    return match
  })

  const jobStats = {
    total: filteredJobs.length,
    succeeded: filteredJobs.filter(j => j.status === 'succeeded').length,
    failed: filteredJobs.filter(j => j.status === 'failed').length
  }

  const filteredRecipesByNode = recipes.filter(r => {
    if (!selectedNode) return true
    if (selectedNode.type === 'project') return r.project_id === selectedNode.id
    if (selectedNode.type === 'folder') {
      const folder = folders.find(f => f.id === selectedNode.id)
      if (!folder) return false
      if (folder.is_project) return r.project_id === folder.project_id
      return r.folder_id === selectedNode.id
    }
    return true
  })

  const connectionByApp = connections.reduce((acc, conn) => {
    if (!acc[conn.application]) acc[conn.application] = []
    acc[conn.application].push(conn)
    return acc
  }, {} as Record<string, Connection[]>)

  const toggleApp = (app: string) => setExpandedApps(prev => {
    const next = new Set(prev); next.has(app) ? next.delete(app) : next.add(app); return next
  })
  const toggleProject = (id: number) => setExpandedProjects(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const toggleFolder = (id: number) => setExpandedFolders(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const projectFolders = folders.filter(f => f.is_project)

  const getMatchingFolders = () => {
    if (!folderSearch) return []
    const searchLower = folderSearch.toLowerCase()
    const matchingFolders = folders.filter(f => f.name.toLowerCase().includes(searchLower))
    const parentIds = new Set<number>()
    matchingFolders.forEach(folder => {
      let cur = folder
      while (cur.parent_id) {
        parentIds.add(cur.parent_id)
        cur = folders.find(f => f.id === cur.parent_id)!
        if (!cur) break
      }
    })
    return folders.filter(f => matchingFolders.includes(f) || parentIds.has(f.id))
  }

  const recipeStats = filteredRecipesByNode.map(r => ({
    name: r.name.length > 20 ? r.name.substring(0, 20) + '...' : r.name,
    succeeded: r.job_succeeded_count || 0,
    failed: r.job_failed_count || 0
  })).slice(0, 5)

  const jobsByDate = filteredJobs.reduce((acc, job) => {
    if (job.completed_at) {
      const date = new Date(job.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      if (!acc[date]) acc[date] = { date, succeeded: 0, failed: 0 }
      if (job.status === 'succeeded') acc[date].succeeded++
      else if (job.status === 'failed') acc[date].failed++
    }
    return acc
  }, {} as Record<string, { date: string; succeeded: number; failed: number }>)

  const dailyJobData = Object.values(jobsByDate).slice(-7)

  const renderFolders = (parentId: number, level = 1): JSX.Element[] => {
    return folders.filter(f => f.parent_id === parentId).map(folder => {
      const isExpanded = expandedFolders.has(folder.id)
      const isMatching = !!(folderSearch && folder.name.toLowerCase().includes(folderSearch.toLowerCase()))
      // auto-expand if a child matches
      const hasMatchingChild = !!(folderSearch && folders.some(f => {
        let cur: typeof f | undefined = f
        while (cur) {
          if (cur.id === folder.id) return f.name.toLowerCase().includes(folderSearch.toLowerCase())
          cur = folders.find(p => p.id === cur!.parent_id)
        }
        return false
      }))
      return (
        <div key={folder.id}>
          <div
            className="connection-item"
            style={{ paddingLeft: `${level * 18}px`, cursor: 'pointer', backgroundColor: isMatching ? '#e6fff8' : 'transparent', fontWeight: isMatching ? '700' : 'normal' }}
            onClick={() => { toggleFolder(folder.id); setSelectedNode({ type: 'folder', id: folder.id }) }}
          >
            {(isExpanded || hasMatchingChild) ? '▼' : '▶'} 📂 {folder.name}
          </div>
          {(isExpanded || hasMatchingChild) && renderFolders(folder.id, level + 1)}
        </div>
      )
    })
  }

  // ── Dependency graph logic ───────────────────────────────────
  // Derive unique apps solely from recipe_connections.application
  const uniqueApps = [...new Set(recipeConnections.map(rc => rc.application).filter(Boolean))]
  const filteredApps = uniqueApps.filter(app => app.toLowerCase().includes(appSearch.toLowerCase()))
  const getConnectionsForApp = (app: string) =>
    [...new Map(
      recipeConnections.filter(rc => rc.application === app).map(rc => [rc.connection_name, rc])
    ).values()]

  const renderDependencyGraph = () => {
    // ── Overview: search box + app cards grid ──
    if (!selectedApp) {
      return (
        <div className="dep-container">
          <div className="dep-header-row" ref={appSearchRef}>
            <div className="dep-search-wrap">
              <span className="dep-search-icon">🔍</span>
              <input
                className="dep-search-input"
                placeholder="Search application (e.g. salesforce, snowflake, rest)..."
                value={appSearch}
                onChange={e => { setAppSearch(e.target.value); setAppSearchOpen(true) }}
                onFocus={() => setAppSearchOpen(true)}
              />
              {appSearch && (
                <button className="dep-search-clear" onClick={() => { setAppSearch(''); setAppSearchOpen(false) }}>✕</button>
              )}
              {appSearchOpen && filteredApps.length > 0 && (
                <div className="dep-search-dropdown">
                  {filteredApps.slice(0, 8).map(app => (
                    <div key={app} className="dep-search-item" onClick={() => { setSelectedApp(app); setAppSearch(''); setAppSearchOpen(false) }}>
                      <span className="dep-search-item-icon">🔌</span>
                      <span className="dep-search-item-name">{app}</span>
                      <span className="dep-search-item-count">{getConnectionsForApp(app).length} conn</span>
                    </div>
                  ))}
                  {filteredApps.length > 8 && (
                    <div className="dep-search-more">+{filteredApps.length - 8} more — keep typing to narrow</div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="dep-apps-grid">
            {uniqueApps.map(app => (
              <div key={app} className="dep-app-card" onClick={() => setSelectedApp(app)}>
                <div className="dep-app-icon">🔌</div>
                <div className="dep-app-name">{app}</div>
                <div className="dep-app-count">
                  {getConnectionsForApp(app).length} connection{getConnectionsForApp(app).length !== 1 ? 's' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )
    }

    // ── Drill-down: tree layout ──
    const appConnections = getConnectionsForApp(selectedApp)

    return (
      <div className="dep-container">
        {/* toolbar */}
        <div className="dep-toolbar">
          <button className="dep-back-btn" onClick={() => setSelectedApp(null)}>← Back</button>
          <div className="dep-breadcrumb">
            <span className="dep-breadcrumb-root" onClick={() => setSelectedApp(null)}>All Apps</span>
            <span className="dep-breadcrumb-sep">›</span>
            <span className="dep-breadcrumb-current">🔌 {selectedApp}</span>
          </div>
        </div>

        {/* tree */}
        <div className="dep-tree">
          {/* root node */}
          <div className="dep-tree-root">
            <div className="dep-node dep-node-app">
              <span className="dep-node-icon">🔌</span>
              <span className="dep-node-label">{selectedApp}</span>
              <span className="dep-node-badge">{appConnections.length}</span>
            </div>
          </div>

          {/* connector line root → connections */}
          {appConnections.length > 0 && <div className="dep-vline dep-vline-root"></div>}

          {/* horizontal spread line */}
          {appConnections.length > 1 && (
            <div className="dep-hline-wrap">
              <div className="dep-hline"></div>
            </div>
          )}

          {/* connection columns */}
          <div className="dep-conn-row">
            {appConnections.map(conn => {
              const connRecipes = [...new Set(
                recipeConnections.filter(rc => rc.connection_name === conn.connection_name).map(rc => rc.recipe_name)
              )]
              // look up auth status from connections table if available
              const connDetail = connections.find(c => c.name === conn.connection_name)
              const isOk = connDetail?.authorization_status === 'success'
              return (
                <div key={conn.connection_name} className="dep-conn-col">
                  {/* vertical line from hline to conn node */}
                  <div className="dep-vline dep-vline-conn"></div>

                  {/* connection node */}
                  <div className={`dep-node dep-node-conn ${connDetail ? (isOk ? 'dep-conn-ok' : 'dep-conn-fail') : ''}`}>
                    {connDetail && <span className={`dep-status-dot ${isOk ? 'dot-ok' : 'dot-fail'}`}></span>}
                    <span className="dep-node-label">{conn.connection_name}</span>
                  </div>

                  {/* recipes sub-tree */}
                  {connRecipes.length > 0 && (
                    <>
                      <div className="dep-vline dep-vline-recipe"></div>
                      <div className="dep-recipes-col">
                        {connRecipes.map(rname => (
                          <div key={rname} className="dep-node dep-node-recipe">
                            <span className="dep-node-icon">📋</span>
                            <span className="dep-node-label">{rname}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  {connRecipes.length === 0 && (
                    <div className="dep-no-recipes">no recipes</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
        <p>Loading Dashboard...</p>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <header className="header">
        <h1>Workato Observability & Performance Analytics</h1>
        <p>Track automation performance</p>
      </header>

      {/* TABS */}
      <div className="tabs-bar">
        <button className={`tab-btn ${activeTab === 'dashboard' ? 'tab-active' : ''}`} onClick={() => setActiveTab('dashboard')}>
          Dashboard
        </button>
        <button className={`tab-btn ${activeTab === 'dependency' ? 'tab-active' : ''}`} onClick={() => setActiveTab('dependency')}>
          Dependency Graph
        </button>
        <button className={`tab-btn ${activeTab === 'audit' ? 'tab-active' : ''}`} onClick={() => setActiveTab('audit')}>
          Audit Logs
        </button>
        <div className="tab-actions">
          <button onClick={fetchData} className="refresh-btn">🔄 Refresh</button>
          <span className="last-synced">{lastSynced ? `Last synced: ${lastSynced}` : 'Not synced yet'}</span>
        </div>
      </div>

      {/* ERROR BANNER */}
      {fetchError && (
        <div className="fetch-error">
          ⚠️ Could not reach backend: <strong>{fetchError}</strong> — check that <code>{BASE_URL}</code> is correct and the server is running.
        </div>
      )}

      {/* DASHBOARD TAB */}
      {activeTab === 'dashboard' && (
        <div>
          <div className="filters">

            {/* PROJECT + FOLDER TREE */}
            <div className="filter-group" style={{ minWidth: '260px', position: 'relative' }} ref={folderDropdownRef}>
              <label>Projects / Folders:</label>
              <input
                type="text"
                placeholder="Search project or folder..."
                value={folderSearch}
                onChange={e => { setFolderSearch(e.target.value); setIsFolderTreeExpanded(true) }}
                onFocus={() => setIsFolderTreeExpanded(true)}
              />
              {isFolderTreeExpanded && (
                <div className="folder-tree-dropdown">
                  {(() => {
                    // build list: matching folders first (with parent chain), then rest
                    const searchLower = folderSearch.toLowerCase()
                    if (!folderSearch) {
                      return projectFolders.map(project => {
                        const isExpanded = expandedProjects.has(project.id)
                        return (
                          <div key={project.id}>
                            <div
                              className="connection-item"
                              style={{ cursor: 'pointer', fontWeight: 'bold' }}
                              onClick={() => { toggleProject(project.id); setSelectedNode({ type: 'project', id: project.id }) }}
                            >
                              {isExpanded ? '▼' : '▶'} 📁 {project.name}
                            </div>
                            {isExpanded && renderFolders(project.id)}
                          </div>
                        )
                      })
                    }
                    // matching folders
                    const matchingFolders = folders.filter(f => f.name.toLowerCase().includes(searchLower))
                    // collect their parent project ids
                    const matchingProjectIds = new Set<number>()
                    matchingFolders.forEach(f => {
                      // walk up to find root project
                      let cur: typeof f | undefined = f
                      while (cur) {
                        if (cur.is_project) { matchingProjectIds.add(cur.id); break }
                        cur = folders.find(p => p.id === cur!.parent_id)
                      }
                    })
                    // projects that have matches come first
                    const sortedProjects = [
                      ...projectFolders.filter(p => matchingProjectIds.has(p.id)),
                      ...projectFolders.filter(p => !matchingProjectIds.has(p.id))
                    ]
                    return sortedProjects.map(project => {
                      const isExpanded = expandedProjects.has(project.id) || matchingProjectIds.has(project.id)
                      const isMatching = project.name.toLowerCase().includes(searchLower)
                      return (
                        <div key={project.id}>
                          <div
                            className="connection-item"
                            style={{ cursor: 'pointer', fontWeight: 'bold', backgroundColor: isMatching ? '#e6fff8' : 'transparent' }}
                            onClick={() => { toggleProject(project.id); setSelectedNode({ type: 'project', id: project.id }) }}
                          >
                            {isExpanded ? '▼' : '▶'} 📁 {project.name}
                          </div>
                          {isExpanded && renderFolders(project.id)}
                        </div>
                      )
                    })
                  })()}
                </div>
              )}
            </div>

            {/* RECIPE FILTER */}
            <div className="filter-group">
              <label>Recipe:</label>
              <select value={selectedRecipe} onChange={e => setSelectedRecipe(e.target.value)}>
                <option value="all">All Recipes</option>
                {filteredRecipesByNode.map(recipe => (
                  <option key={recipe.id} value={String(recipe.id)}>{recipe.name}</option>
                ))}
              </select>
            </div>

            {/* START DATE */}
            <div className="filter-group">
              <label>Start Date:</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>

            {/* END DATE */}
            <div className="filter-group">
              <label>End Date:</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>

            <button className="reset-btn" onClick={() => {
              setSelectedRecipe('all'); setSelectedNode(null)
              setStartDate(''); setEndDate('')
              setIsFolderTreeExpanded(false); setFolderSearch('')
            }}>
              Reset Filters
            </button>
          </div>

          {/* STAT CARDS */}
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-content">
                <h3>Connections</h3>
                <div className="stat-number">{connectionStats.total}</div>
                <div className="stat-detail">
                  <span className="success">{connectionStats.active} Active</span>
                  <span className="error">{connectionStats.failed} Failed</span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <h3>Jobs</h3>
                <div className="stat-number">{jobStats.total}</div>
                <div className="stat-detail">
                  <span className="success">{jobStats.succeeded} Success</span>
                  <span className="error">{jobStats.failed} Failed</span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <h3>Projects</h3>
                <div className="stat-number">{projects.length}</div>
                <div className="stat-detail">Active Projects</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-content">
                <h3>Recipes</h3>
                <div className="stat-number">{recipes.length}</div>
                <div className="stat-detail">
                  <span className="success">{recipes.filter(r => r.running === true).length} Running</span>
                </div>
              </div>
            </div>
          </div>

          {/* CHARTS */}
          <div className="charts-grid">
            <div className="chart-card">
              <h3>Connections by Application</h3>
              <div className="connections-menu">
                {Object.entries(connectionByApp).map(([app, conns]) => (
                  <div key={app} className="app-group">
                    <div className="app-header" onClick={() => toggleApp(app)}>
                      <span className="app-toggle">{expandedApps.has(app) ? '▼' : '▶'}</span>
                      <span className="app-name">{app}</span>
                      <span className="app-count">{conns.length}</span>
                    </div>
                    {expandedApps.has(app) && (
                      <div className="connections-list">
                        {conns.map((conn, idx) => (
                          <div key={idx} className="connection-item">
                            <span className="connection-name">{conn.name}</span>
                            <span className={`connection-status ${conn.authorization_status === 'success' ? 'status-success' : 'status-failed'}`}>
                              {conn.authorization_status === 'success' ? '✓' : '✗'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="chart-card">
              <h3>Job Status Overview</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dailyJobData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="succeeded" stackId="a" fill="#43e97b" name="Succeeded" />
                  <Bar dataKey="failed" stackId="a" fill="#fa709a" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card full-width">
              <h3>Top 5 Recipes Performance</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={recipeStats}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="succeeded" fill="#43e97b" name="Succeeded" />
                  <Bar dataKey="failed" fill="#fa709a" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* DEPENDENCY GRAPH TAB */}
      {activeTab === 'dependency' && renderDependencyGraph()}

      {/* AUDIT LOGS TAB */}
      {activeTab === 'audit' && (() => {
        const eventMeta: Record<string, { icon: string; color: string; label: string }> = {
          recipe_started:   { icon: '▶️', color: '#22c55e', label: 'started' },
          recipe_stopped:   { icon: '⏹️', color: '#f97316', label: 'stopped' },
          recipe_created:   { icon: '✨', color: '#6366f1', label: 'created' },
          recipe_updated:   { icon: '✏️', color: '#3b82f6', label: 'edited' },
          recipe_deleted:   { icon: '🗑️', color: '#ef4444', label: 'deleted' },
          recipe_moved:     { icon: '📦', color: '#8b5cf6', label: 'moved' },
          user_login:       { icon: '👤', color: '#11998e', label: 'login' },
          api_privilege_group_updated: { icon: '🔐', color: '#f59e0b', label: 'updated' },
        }
        const getMeta = (et: string) => eventMeta[et] || { icon: '🔔', color: '#888', label: et.replace(/_/g, ' ') }

        const uniqueUsers = ['all', ...Array.from(new Set(auditLogs.map(l => l.user_name).filter(Boolean)))]
        const uniqueEvents = ['all', ...Array.from(new Set(auditLogs.map(l => l.event_type).filter(Boolean)))]

        const filtered = auditLogs
          .filter(l => auditUserFilter === 'all' || l.user_name === auditUserFilter)
          .filter(l => auditEventFilter === 'all' || l.event_type === auditEventFilter)
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        // group by date label
        const groups: Record<string, AuditLog[]> = {}
        filtered.forEach(log => {
          const d = new Date(log.timestamp)
          const today = new Date()
          const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
          let label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          if (d.toDateString() === today.toDateString()) label = 'Today'
          else if (d.toDateString() === yesterday.toDateString()) label = 'Yesterday'
          if (!groups[label]) groups[label] = []
          groups[label].push(log)
        })

        const formatTime = (ts: string) => {
          const d = new Date(ts)
          const now = new Date()
          const diffMin = Math.round((now.getTime() - d.getTime()) / 60000)
          if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`
          return `at ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
        }

        const buildSummary = (log: AuditLog) => {
          const m = getMeta(log.event_type)
          const rname = log.resource_name || ''
          const rpath = log.resource_path || ''
          const pathParts = rpath.split('/').filter(Boolean).slice(1) // strip 'Home'
          if (log.event_type === 'user_login') return <span>User login.</span>
          if (log.event_type === 'api_privilege_group_updated')
            return <span>Developer API client role <strong>{rname}</strong> was updated.</span>
          return (
            <span>
              Recipe <strong className="audit-link">{rname}</strong>
              {pathParts.length > 0 && <> in <strong className="audit-link">{pathParts.join('/')}</strong></>}
              {' '}was {m.label}.
            </span>
          )
        }

        const buildDetails = (log: AuditLog) => {
          const d = log.details as Record<string, unknown>
          const rows: { k: string; v: string }[] = []
          if (d?.error !== undefined) rows.push({ k: 'Error', v: String(d.error) })
          if (d?.stop_reason) rows.push({ k: 'Stop reason', v: String(d.stop_reason) })
          if (d?.activity) rows.push({ k: 'Activity', v: String(d.activity) })
          if (d?.run_once !== undefined) rows.push({ k: 'Run once', v: String(d.run_once) })
          const req = d?.request as Record<string, unknown> | undefined
          if (req?.ip_address) rows.push({ k: 'IP address', v: String(req.ip_address) })
          return rows
        }

        return (
          <div className="audit-container">
            {/* filters */}
            <div className="audit-filters">
              <select className="audit-select" value={auditUserFilter} onChange={e => setAuditUserFilter(e.target.value)}>
                {uniqueUsers.map(u => <option key={u} value={u}>{u === 'all' ? 'All collaborators' : u}</option>)}
              </select>
              <select className="audit-select" value={auditEventFilter} onChange={e => setAuditEventFilter(e.target.value)}>
                {uniqueEvents.map(e => <option key={e} value={e}>{e === 'all' ? 'All event types' : e.replace(/_/g, ' ')}</option>)}
              </select>
              <span className="audit-count">{filtered.length} events</span>
            </div>

            {filtered.length === 0 && (
              <div className="audit-empty">No audit logs found. Sync data from Workato to populate.</div>
            )}

            {Object.entries(groups).map(([dateLabel, logs]) => (
              <div key={dateLabel} className="audit-group">
                <div className="audit-date-header">{dateLabel}</div>
                <div className="audit-timeline">
                  {logs.map((log, idx) => {
                    const m = getMeta(log.event_type)
                    const isExp = auditExpanded.has(log.id)
                    const details = buildDetails(log)
                    return (
                      <div key={`${log.id}-${idx}`} className="audit-row">
                        <div className="audit-icon-col">
                          <div className="audit-icon" style={{ background: m.color + '22', border: `2px solid ${m.color}` }}>
                            <span>{m.icon}</span>
                          </div>
                          <div className="audit-vline"></div>
                        </div>
                        <div className="audit-content">
                          <div className="audit-summary">{buildSummary(log)}</div>
                          <div className="audit-meta">
                            <span className="audit-user">{log.user_name}</span>
                            <span className="audit-sep">|</span>
                            <span className="audit-time">{formatTime(log.timestamp)}</span>
                            {log.workspace_environment && (
                              <span className="audit-env">{log.workspace_environment}</span>
                            )}
                          </div>
                          {details.length > 0 && (
                            <button className="audit-expand-btn" onClick={() => setAuditExpanded(prev => {
                              const n = new Set(prev); n.has(log.id) ? n.delete(log.id) : n.add(log.id); return n
                            })}>{isExp ? '▲ Hide' : '▼ Details'}</button>
                          )}
                          {isExp && details.length > 0 && (
                            <div className="audit-details">
                              {details.map(r => (
                                <div key={r.k} className="audit-detail-row">
                                  <span className="audit-detail-key">{r.k}</span>
                                  <span className="audit-detail-val">{r.v}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="audit-chevron" onClick={() => setAuditExpanded(prev => {
                          const n = new Set(prev); n.has(log.id) ? n.delete(log.id) : n.add(log.id); return n
                        })}>{isExp ? '▲' : '▼'}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}

export default App
