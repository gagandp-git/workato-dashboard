import { useState, useEffect, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import './App.css'
const BASE_URL = import.meta.env.VITE_API_URL as string;

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'dependency'>('dashboard')
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
  const folderDropdownRef = useRef<HTMLDivElement>(null)
  const appSearchRef = useRef<HTMLDivElement>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      const [projectsRes, connectionsRes, jobsRes, recipesRes, foldersRes, rcRes] = await Promise.all([
        fetch(`${BASE_URL}/api/projects`),
        fetch(`${BASE_URL}/api/connections`),
        fetch(`${BASE_URL}/api/jobs`),
        fetch(`${BASE_URL}/api/recipes`),
        fetch(`${BASE_URL}/api/folders`),
        fetch(`${BASE_URL}/api/recipe_connections`)
      ])
      setProjects(await projectsRes.json())
      setConnections(await connectionsRes.json())
      setJobs(await jobsRes.json())
      setRecipes(await recipesRes.json())
      setFolders(await foldersRes.json())
      setRecipeConnections(await rcRes.json())
      setLastSynced(new Date().toLocaleString())
    } catch (error) {
      console.error('Error fetching data:', error)
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
      return (
        <div key={folder.id}>
          <div
            className="connection-item"
            style={{ paddingLeft: `${level * 18}px`, cursor: 'pointer', backgroundColor: isMatching ? '#fffacd' : 'transparent' }}
            onClick={() => { toggleFolder(folder.id); setSelectedNode({ type: 'folder', id: folder.id }) }}
          >
            {isExpanded ? '▼' : '▶'} 📂 {folder.name}
          </div>
          {isExpanded && renderFolders(folder.id, level + 1)}
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
        <div className="tab-actions">
          <button onClick={fetchData} className="refresh-btn">🔄 Refresh</button>
          <span className="last-synced">{lastSynced ? `Last synced: ${lastSynced}` : 'Not synced yet'}</span>
        </div>
      </div>

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
                onChange={e => setFolderSearch(e.target.value)}
                onFocus={() => setIsFolderTreeExpanded(true)}
              />
              {isFolderTreeExpanded && (
                <div className="folder-tree-dropdown">
                  {folderSearch ? (
                    (() => {
                      const matchingFolders = getMatchingFolders()
                      const projectsWithMatches = projectFolders.filter(p =>
                        matchingFolders.some(f => f.id === p.id || f.project_id === p.project_id)
                      )
                      return projectsWithMatches.map(project => {
                        const isExpanded = expandedProjects.has(project.id)
                        const isMatching = project.name.toLowerCase().includes(folderSearch.toLowerCase())
                        return (
                          <div key={project.id}>
                            <div
                              className="connection-item"
                              style={{ cursor: 'pointer', fontWeight: 'bold', backgroundColor: isMatching ? '#fffacd' : 'transparent' }}
                              onClick={() => { toggleProject(project.id); setSelectedNode({ type: 'project', id: project.id }) }}
                            >
                              {isExpanded ? '▼' : '▶'} 📁 {project.name}
                            </div>
                            {isExpanded && renderFolders(project.id)}
                          </div>
                        )
                      })
                    })()
                  ) : (
                    projectFolders.map(project => {
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
                  )}
                </div>
              )}
              {!isFolderTreeExpanded && (
                <div className="folder-tree-collapsed" onClick={() => setIsFolderTreeExpanded(true)}>
                  {selectedNode ? folders.find(f => f.id === selectedNode.id)?.name || 'Select...' : 'Click to select...'}
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
    </div>
  )
}

export default App
