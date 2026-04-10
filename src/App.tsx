import { useState, useEffect, useRef, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './App.css'
import Login from './Login'
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
  const [isAuth, setIsAuth] = useState(false)
  const [connections, setConnections] = useState<Connection[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [recipeConnections, setRecipeConnections] = useState<RecipeConnection[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditUserFilter, setAuditUserFilter] = useState('all')
  const [auditEventFilter, setAuditEventFilter] = useState('all')
  const [auditExpanded, setAuditExpanded] = useState<Set<number>>(new Set())
  const [dailyJobData, setDailyJobData] = useState<{date: string; succeeded: number; failed: number}[]>([])
  const [jobTotals, setJobTotals] = useState<{total: number; succeeded: number; failed: number}>({total: 0, succeeded: 0, failed: 0})
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
  const [debouncedFolderSearch, setDebouncedFolderSearch] = useState('')
  const [auditPage, setAuditPage] = useState(0)
  const AUDIT_LIMIT = 100
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

      async function safeJson(url: string, options: RequestInit = {}) {
  const res = await fetch(url, options)

  if (!res.ok) {
    throw new Error(`Error: ${res.status}`)
  }

  return res.json()
}

      const token = localStorage.getItem("token")

const data = await safeJson(
  `${BASE_URL}/api/dashboard?auditLimit=${AUDIT_LIMIT}&auditOffset=${auditPage * AUDIT_LIMIT}`,
  {
    headers: {
      Authorization: `Bearer ${token}`
    }
  }
)
      setConnections(data.connections || []);
      setRecipes(data.recipes || []);
      setFolders(data.folders || []);
      setRecipeConnections(data.recipeConnections || []);
      setAuditLogs(data.auditLogs || []);
      if (data.jobTotals) setJobTotals({ total: Number(data.jobTotals.total), succeeded: Number(data.jobTotals.succeeded), failed: Number(data.jobTotals.failed) });
      const stats = await safeJson(`${BASE_URL}/api/job-stats`);
      setDailyJobData(Array.isArray(stats) ? stats : []);
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
    const token = localStorage.getItem('token')
    if (token) setIsAuth(true)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFolderSearch(folderSearch), 300)
    return () => clearTimeout(t)
  }, [folderSearch])

  useEffect(() => {
    const fetchJobStats = async () => {
      try {
        const url = selectedRecipe !== 'all'
          ? `${BASE_URL}/api/job-stats?recipe_id=${selectedRecipe}`
          : `${BASE_URL}/api/job-stats`
        const res = await fetch(url)
        if (!res.ok) return
        const stats = await res.json()
        setDailyJobData(Array.isArray(stats) ? stats : [])
      } catch (e) {
        console.error('job-stats fetch failed', e)
      }
    }
    fetchJobStats()
  }, [selectedRecipe])

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
  const connectionStats = useMemo(() => ({
    total: connections.length,
    active: connections.filter(c => c.authorization_status === 'success').length,
    failed: connections.filter(c => c.authorization_status !== 'success' && c.authorization_status).length
  }), [connections])

  const filteredRecipesByNode = useMemo(() => recipes.filter(r => {
    if (!selectedNode) return true
    if (selectedNode.type === 'project') return r.project_id === selectedNode.id
    if (selectedNode.type === 'folder') {
      const folder = folders.find(f => f.id === selectedNode.id)
      if (!folder) return false
      if (folder.is_project) return r.project_id === folder.project_id
      return r.folder_id === selectedNode.id
    }
    return true
  }), [recipes, selectedNode, folders])

  const connectionByApp = useMemo(() => connections.reduce((acc, conn) => {
    if (!acc[conn.application]) acc[conn.application] = []
    acc[conn.application].push(conn)
    return acc
  }, {} as Record<string, Connection[]>), [connections])

  const recipeStats = useMemo(() => [...filteredRecipesByNode]
    .sort((a, b) => (b.job_succeeded_count + b.job_failed_count) - (a.job_succeeded_count + a.job_failed_count))
    .slice(0, 5)
    .map(r => ({
      name: r.name.length > 20 ? r.name.substring(0, 20) + '...' : r.name,
      succeeded: r.job_succeeded_count || 0,
      failed: r.job_failed_count || 0
    })), [filteredRecipesByNode])

  const uniqueApps = useMemo(() =>
    [...new Set(recipeConnections.map(rc => rc.application).filter(Boolean))]
  , [recipeConnections])

  const filteredApps = useMemo(() =>
    uniqueApps.filter(app => app.toLowerCase().includes(appSearch.toLowerCase()))
  , [uniqueApps, appSearch])

  const toggleApp = (app: string) => setExpandedApps(prev => {
    const next = new Set(prev); next.has(app) ? next.delete(app) : next.add(app); return next
  })
  const toggleProject = (id: number) => setExpandedProjects(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })
  const toggleFolder = (id: number) => setExpandedFolders(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next
  })

  const projectFolders = useMemo(() => folders.filter(f => f.is_project), [folders])

  const chartJobData = dailyJobData

  const renderFolders = (parentId: number, level = 1): JSX.Element[] => {
    return folders.filter(f => f.parent_id === parentId).map(folder => {
      const isExpanded = expandedFolders.has(folder.id)
      const isMatching = !!(debouncedFolderSearch && folder.name.toLowerCase().includes(debouncedFolderSearch.toLowerCase()))
      const hasMatchingChild = !!(debouncedFolderSearch && folders.some(f => {
        let cur: typeof f | undefined = f
        while (cur) {
          if (cur.id === folder.id) return f.name.toLowerCase().includes(debouncedFolderSearch.toLowerCase())
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
                  {filteredApps.map(app => (
                    <div key={app} className="dep-search-item" onClick={() => { setSelectedApp(app); setAppSearch(''); setAppSearchOpen(false) }}>
                      <span className="dep-search-item-icon">🔌</span>
                      <span className="dep-search-item-name">{app}</span>
                      <span className="dep-search-item-count">{getConnectionsForApp(app).length} conn</span>
                    </div>
                  ))}
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

  if (!isAuth) return <Login onLogin={() => setIsAuth(true)} />

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
        <div className="dash-layout">

          {/* LEFT PANEL */}
          <div className="dash-main">

            {/* FILTERS ROW */}
            <div className="dash-filters">
              <div className="filter-group" style={{ position: 'relative', minWidth: '220px' }} ref={folderDropdownRef}>
                <input
                  type="text"
                  className="dash-filter-input"
                  placeholder="📁 All projects..."
                  value={folderSearch}
                  onChange={e => { setFolderSearch(e.target.value); setIsFolderTreeExpanded(true) }}
                  onFocus={() => setIsFolderTreeExpanded(true)}
                />
                {isFolderTreeExpanded && (
                  <div className="folder-tree-dropdown">
                    {(() => {
                      const searchLower = debouncedFolderSearch.toLowerCase()
                      if (!debouncedFolderSearch) {
                        return projectFolders.map(project => {
                          const isExpanded = expandedProjects.has(project.id)
                          return (
                            <div key={project.id}>
                              <div className="connection-item" style={{ cursor: 'pointer', fontWeight: 'bold' }}
                                onClick={() => { toggleProject(project.id); setSelectedNode({ type: 'project', id: project.id }) }}>
                                {isExpanded ? '▼' : '▶'} 📁 {project.name}
                              </div>
                              {isExpanded && renderFolders(project.id)}
                            </div>
                          )
                        })
                      }
                      const matchingFolders = folders.filter(f => f.name.toLowerCase().includes(searchLower))
                      const matchingProjectIds = new Set<number>()
                      matchingFolders.forEach(f => {
                        let cur: typeof f | undefined = f
                        while (cur) {
                          if (cur.is_project) { matchingProjectIds.add(cur.id); break }
                          cur = folders.find(p => p.id === cur!.parent_id)
                        }
                      })
                      const sortedProjects = [
                        ...projectFolders.filter(p => matchingProjectIds.has(p.id)),
                        ...projectFolders.filter(p => !matchingProjectIds.has(p.id))
                      ]
                      return sortedProjects.map(project => {
                        const isExpanded = expandedProjects.has(project.id) || matchingProjectIds.has(project.id)
                        const isMatching = project.name.toLowerCase().includes(searchLower)
                        return (
                          <div key={project.id}>
                            <div className="connection-item"
                              style={{ cursor: 'pointer', fontWeight: 'bold', backgroundColor: isMatching ? '#e6fff8' : 'transparent' }}
                              onClick={() => { toggleProject(project.id); setSelectedNode({ type: 'project', id: project.id }) }}>
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

              <select className="dash-filter-input" value={selectedRecipe} onChange={e => setSelectedRecipe(e.target.value)}>
                <option value="all">📋 All recipes</option>
                {filteredRecipesByNode.map(r => <option key={r.id} value={String(r.id)}>{r.name}</option>)}
              </select>

              <input type="date" className="dash-filter-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <input type="date" className="dash-filter-input" value={endDate} onChange={e => setEndDate(e.target.value)} />

              <button className="reset-btn" onClick={() => {
                setSelectedRecipe('all'); setSelectedNode(null)
                setStartDate(''); setEndDate('')
                setIsFolderTreeExpanded(false); setFolderSearch('')
              }}>Reset</button>
            </div>

            {/* STAT NUMBERS ROW */}
            <div className="dash-stat-row">
              <div className="dash-stat-item">
                <div className="dash-stat-num">{recipes.length.toLocaleString()}</div>
                <div className="dash-stat-label">Recipes</div>
              </div>
              <div className="dash-stat-divider"></div>
              <div className="dash-stat-item">
                <div className="dash-stat-num success">{jobTotals.succeeded.toLocaleString()}</div>
                <div className="dash-stat-label">✅ Successful jobs</div>
              </div>
              <div className="dash-stat-divider"></div>
              <div className="dash-stat-item">
                <div className="dash-stat-num error">{jobTotals.failed.toLocaleString()}</div>
                <div className="dash-stat-label">❌ Failed jobs</div>
              </div>
              <div className="dash-stat-divider"></div>
              <div className="dash-stat-item">
                <div className="dash-stat-num">{jobTotals.total.toLocaleString()}</div>
                <div className="dash-stat-label">Total jobs</div>
              </div>
            </div>

            {/* JOB CHART */}
            <div className="dash-chart-card">
              <div className="dash-chart-title">Job Status {selectedRecipe !== 'all' ? '— Filtered by Recipe' : selectedNode ? '— Filtered by Folder' : '(Last 7 Days)'}</div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartJobData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="succeeded" stackId="a" fill="#43e97b" name="Succeeded" radius={[3,3,0,0]} />
                  <Bar dataKey="failed" stackId="a" fill="#fa709a" name="Failed" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* RECIPE ACTIVITY */}
            <div className="dash-chart-card">
              <div className="dash-chart-title">Recipe Activity — Top 5</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={recipeStats} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="succeeded" fill="#43e97b" name="Succeeded" stackId="a" />
                  <Bar dataKey="failed" fill="#fa709a" name="Failed" stackId="a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* RIGHT PANEL — CONNECTIONS */}
          <div className="dash-sidebar">
            <div className="dash-sidebar-title">Connections</div>

            {/* summary numbers */}
            <div className="dash-conn-summary">
              <div className="dash-conn-stat">
                <div className="dash-conn-num">{connectionStats.total}</div>
                <div className="dash-conn-lbl">App connections</div>
              </div>
              <div className="dash-conn-stat">
                <div className="dash-conn-num success">{connectionStats.active}</div>
                <div className="dash-conn-lbl">Active</div>
              </div>
              <div className="dash-conn-stat">
                <div className="dash-conn-num error">{connectionStats.failed}</div>
                <div className="dash-conn-lbl">Failed</div>
              </div>
            </div>

            <div className="dash-sidebar-sub">Connections by application</div>

            {/* expandable app list */}
            <div className="dash-conn-list">
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
              <div className="audit-pagination">
                <button className="audit-page-btn" disabled={auditPage === 0} onClick={() => { setAuditPage(p => p - 1); fetchData() }}>← Prev</button>
                <span className="audit-page-info">Page {auditPage + 1}</span>
                <button className="audit-page-btn" disabled={auditLogs.length < AUDIT_LIMIT} onClick={() => { setAuditPage(p => p + 1); fetchData() }}>Next →</button>
              </div>
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
}

export default App